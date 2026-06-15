import { readHermesApiServerKey } from "@/lib/hermes-api-key";
import { getHermesProfileRuntimeState, readHermesProfileApiServerKey } from "@/lib/hermes-runtime";
import { readArtifactContent } from "@/lib/artifacts";
import type { AguiIntent } from "@/types/agent";
import type { Artifact } from "@/types/artifact";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type HermesChatRequest = {
  baseUrl?: string;
  apiKey?: string;
  message?: string;
  conversation?: string;
  chiefAgentName?: string;
  displayName?: string;
  role?: string;
  profileName?: string;
  officeContext?: {
    templateName?: string;
    projectName?: string;
    projectDescription?: string;
    allowContextSharing?: boolean;
    contextHubFiles?: string[];
    selectedAgent?: OfficeContextAgent;
    agents?: OfficeContextAgent[];
  };
  officeEvidence?: OfficeEvidenceLedger;
  history?: Array<{
    role?: string;
    content?: string;
  }>;
  attachments?: AguiIntent["attachments"];
};

type OfficeContextAgent = {
  displayName?: string;
  role?: string;
  profileName?: string;
  isChief?: boolean;
  contextFiles?: string[];
};

type OfficeEvidenceLedger = {
  profileRuntimes?: Array<{
    profileName?: string;
    displayName?: string;
    gatewayStatus?: string;
    chatAvailable?: boolean;
    message?: string;
  }>;
  workerRuns?: Array<{
    id?: string;
    agentName?: string;
    profileName?: string;
    task?: string;
    status?: string;
    startedAt?: string;
    completedAt?: string;
    durationMs?: number;
    summary?: string;
    artifactIds?: string[];
  }>;
  artifacts?: Array<{
    id?: string;
    title?: string;
    type?: string;
    owner?: string;
    createdAt?: string;
    description?: string;
  }>;
};

type HermesChatMessageContent =
  | string
  | Array<
      | {
          type: "text";
          text: string;
        }
      | {
          type: "image_url";
          image_url: {
            url: string;
            detail?: "auto" | "low" | "high";
          };
        }
    >;

const DEFAULT_HERMES_BASE_URL = process.env.VIBE_OFFICE_EMBEDDED_HERMES_BASE_URL || "http://127.0.0.1:8642/v1";

function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}

function extractText(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const response = value as {
    output_text?: unknown;
    text?: unknown;
    message?: { content?: unknown };
    choices?: Array<{ message?: { content?: unknown }; text?: unknown }>;
    output?: Array<{ content?: Array<{ text?: unknown; value?: unknown }> }>;
  };

  if (typeof response.output_text === "string") return response.output_text;
  if (typeof response.text === "string") return response.text;
  if (typeof response.message?.content === "string") return response.message.content;

  const choice = response.choices?.[0];
  if (typeof choice?.message?.content === "string") return choice.message.content;
  if (typeof choice?.text === "string") return choice.text;

  return (
    response.output
      ?.flatMap((item) => item.content || [])
      .map((content) => (typeof content.text === "string" ? content.text : typeof content.value === "string" ? content.value : ""))
      .filter(Boolean)
      .join("\n") || ""
  );
}

function attachmentToArtifact(attachment: NonNullable<AguiIntent["attachments"]>[number]): Artifact {
  return {
    id: attachment.id,
    type: attachment.type,
    title: attachment.title,
    owner: "User",
    projectId: "office-provisioning-empty",
    createdAt: new Date().toISOString(),
    sourceUrl: attachment.sourceUrl,
    path: attachment.path,
    accessUrl: attachment.accessUrl,
    mimeType: attachment.mimeType,
    description: attachment.description
  };
}

function cleanPromptValue(value?: string) {
  return value?.replace(/\s+/g, " ").trim() || "";
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values.map(cleanPromptValue).filter(Boolean)));
}

function buildOfficeContextPrompt(body: HermesChatRequest, displayName: string, profileName: string) {
  const context = body.officeContext;
  if (!context) return "";

  const agents = (context.agents || []).filter((agent) => cleanPromptValue(agent.displayName));
  const roster = agents
    .map((agent) => {
      const name = cleanPromptValue(agent.displayName);
      const role = cleanPromptValue(agent.role) || (agent.isChief ? "Coordinates agents and context" : "Worker Agent");
      const profile = cleanPromptValue(agent.profileName) || "default";
      const chiefLabel = agent.isChief || profile === "default" ? "Chief" : "Teammate";
      const fileList = uniqueValues(agent.contextFiles || []);
      return `- ${name} (${chiefLabel}, profile ${profile}): ${role}${fileList.length ? `. Context files: ${fileList.join(", ")}` : ""}`;
    })
    .join("\n");

  const hubFiles = uniqueValues(context.contextHubFiles || agents.flatMap((agent) => agent.contextFiles || []));
  const selectedAgentName = cleanPromptValue(context.selectedAgent?.displayName) || displayName;
  const selectedAgentRole = cleanPromptValue(context.selectedAgent?.role) || cleanPromptValue(body.role) || "Office Agent";
  const templateName = cleanPromptValue(context.templateName) || "Product Team";
  const projectName = cleanPromptValue(context.projectName) || "Default Project";
  const projectDescription = cleanPromptValue(context.projectDescription);
  const contextSharing = context.allowContextSharing === false ? "disabled until the user approves it" : "enabled for approved Project Context Hub files";

  return [
    "Current Vibe Office context:",
    `- Office template: ${templateName}.`,
    `- Current project: ${projectName}${projectDescription ? ` - ${projectDescription}` : ""}.`,
    `- Selected agent for this conversation: ${selectedAgentName} (${selectedAgentRole}, profile ${profileName}).`,
    `- Project Context Hub sharing is ${contextSharing}.`,
    hubFiles.length ? `- Project Context Hub files: ${hubFiles.join(", ")}.` : "- Project Context Hub is the shared memory between agents.",
    roster ? `Team roster:\n${roster}` : "",
    "Collaboration rules:",
    "- Chief coordinates Builder, Writer, and Operator and should know they are available teammates.",
    "- Do not say you cannot see the team structure when asked about the office or Product Team; use the roster above.",
    "- If the user asks to assign or coordinate work, describe which teammate should handle it and what context or artifacts should be shared.",
    "- Do not claim another teammate has executed work unless the runtime or user confirms it.",
    "- Workers should understand that Chief coordinates the team and should return concise results for Chief and the user to review."
  ]
    .filter(Boolean)
    .join("\n");
}

function buildOfficeEvidencePrompt(body: HermesChatRequest) {
  const evidence = body.officeEvidence;
  const runtimes = evidence?.profileRuntimes || [];
  const workerRuns = evidence?.workerRuns || [];
  const artifacts = evidence?.artifacts || [];
  const runtimeLines = runtimes
    .map((runtime) => {
      const name = cleanPromptValue(runtime.displayName) || cleanPromptValue(runtime.profileName) || "Unknown";
      const profile = cleanPromptValue(runtime.profileName) || "unknown";
      const status = runtime.chatAvailable ? "chat available" : "chat unavailable";
      const gateway = cleanPromptValue(runtime.gatewayStatus) || "unknown gateway";
      return `- ${name} (${profile}): ${status}, ${gateway}.`;
    })
    .join("\n");
  const workerRunLines = workerRuns
    .map((run) => {
      const name = cleanPromptValue(run.agentName) || cleanPromptValue(run.profileName) || "Unknown worker";
      const status = cleanPromptValue(run.status) || "unknown";
      const task = cleanPromptValue(run.task) || "unspecified task";
      const duration = typeof run.durationMs === "number" ? `, duration ${run.durationMs}ms` : "";
      const artifactsText = run.artifactIds?.length ? `, artifacts ${run.artifactIds.join(", ")}` : "";
      return `- ${name}: ${status} - ${task}${duration}${artifactsText}.`;
    })
    .join("\n");
  const artifactLines = artifacts
    .slice(0, 8)
    .map((artifact) => {
      const title = cleanPromptValue(artifact.title) || cleanPromptValue(artifact.id) || "Untitled artifact";
      const owner = cleanPromptValue(artifact.owner) || "Unknown owner";
      const type = cleanPromptValue(artifact.type) || "artifact";
      return `- ${title} (${type}, owner ${owner})`;
    })
    .join("\n");

  return [
    "Evidence ledger for this request:",
    runtimeLines ? `Runtime availability:\n${runtimeLines}` : "- Runtime availability: no runtime evidence provided.",
    workerRunLines ? `Worker run records:\n${workerRunLines}` : "- Worker run records: none provided for this request.",
    artifactLines ? `Recent registered artifacts:\n${artifactLines}` : "- Recent registered artifacts: none provided.",
    "Evidence rules:",
    "- Runtime availability only proves a profile can chat; it does not prove a teammate executed this task.",
    "- Only worker run records can prove that Builder, Writer, or Operator started, completed, failed, used tools, used a model, or took a duration.",
    "- Only registered artifacts can prove that a file or deliverable exists in Vibe Office.",
    "- Do not invent curl results, service status, file existence, file size, model call counts, tool usage, durations, exit status, or completed teammate names.",
    "- If evidence is missing, say what is unverified and offer the next concrete check instead of presenting it as fact."
  ].join("\n");
}

async function imageAttachmentToDataUrl(attachment: NonNullable<AguiIntent["attachments"]>[number]) {
  if (attachment.type !== "image" && !attachment.mimeType?.startsWith("image/")) return null;

  const content = await readArtifactContent(attachmentToArtifact(attachment));
  const contentType = content.contentType || attachment.mimeType || "image/png";
  if (!contentType.startsWith("image/")) return null;

  const bytes = content.body instanceof ArrayBuffer ? new Uint8Array(content.body) : content.body;
  return `data:${contentType};base64,${Buffer.from(bytes).toString("base64")}`;
}

async function buildChatUserContent(message: string, attachments?: AguiIntent["attachments"]): Promise<HermesChatMessageContent> {
  const imageParts: Exclude<HermesChatMessageContent, string> = [];

  for (const attachment of attachments || []) {
    const imageUrl = await imageAttachmentToDataUrl(attachment).catch(() => null);
    if (!imageUrl) continue;
    imageParts.push({
      type: "image_url",
      image_url: {
        url: imageUrl,
        detail: "auto"
      }
    });
  }

  if (!imageParts.length) return message;

  return [
    {
      type: "text",
      text: message
    },
    ...imageParts
  ];
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as HermesChatRequest;
    const profileName = body.profileName?.trim() || "default";
    const profileRuntime = await getHermesProfileRuntimeState(profileName);
    const baseUrl = normalizeBaseUrl(profileRuntime.baseUrl || (profileName === "default" ? body.baseUrl || DEFAULT_HERMES_BASE_URL : ""));
    const profileApiKey = profileName === "default" ? "" : await readHermesProfileApiServerKey(profileName);
    const apiKey = profileApiKey || body.apiKey?.trim() || (await readHermesApiServerKey());
    const message = body.message?.trim() || "";

    if (!baseUrl) {
      return Response.json(
        {
          ok: false,
          diagnosticCode: profileName === "default" ? "missing_base_url" : "profile_runtime_unavailable",
          message:
            profileName === "default"
              ? "Hermes address is missing."
              : `${profileRuntime.message} Worker chat is disabled until this profile has its own running Hermes runtime.`
        },
        { status: profileName === "default" ? 400 : 409 }
      );
    }
    if (profileName !== "default" && !profileRuntime.chatAvailable) {
      return Response.json(
        {
          ok: false,
          diagnosticCode: "profile_runtime_unavailable",
          profileRuntime,
          message: `${profileRuntime.message} Worker chat is disabled to avoid sending this message to the default Hermes Agent.`
        },
        { status: 409 }
      );
    }
    if (apiKey.length < 8) {
      return Response.json({ ok: false, message: "Hermes access key is missing." }, { status: 400 });
    }
    if (!message) {
      return Response.json({ ok: false, message: "Message is empty." }, { status: 400 });
    }
    const history = Array.isArray(body.history)
      ? body.history
          .filter((item) => (item.role === "user" || item.role === "assistant") && item.content?.trim())
          .slice(-12)
          .map((item) => ({
            role: item.role as "user" | "assistant",
            content: item.content?.trim() || ""
          }))
      : [];
    const chiefAgentName = body.chiefAgentName?.trim() || "Chief";
    const displayName = body.displayName?.trim() || chiefAgentName;
    const role = body.role?.trim() || (displayName === chiefAgentName ? "Chief Agent" : "Worker Agent");
    const officeContextPrompt = buildOfficeContextPrompt(body, displayName, profileName);
    const officeEvidencePrompt = buildOfficeEvidencePrompt(body);
    const userContent = await buildChatUserContent(message, body.attachments);
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: "hermes-agent",
        stream: false,
        messages: [
          {
            role: "system",
            content: [
              `You are ${displayName}, a Vibe Office Agent connected through Hermes.`,
              `Your role is: ${role}.`,
              `Your Hermes profile is: ${profileName}.`,
              `The user's main/default Hermes Agent is ${chiefAgentName}; do not pretend to be the Chief unless your profile is default.`,
              "Answer as the currently selected office Agent.",
              "Be concise, practical, and do not claim actions were completed unless Hermes actually performed them.",
              "When the user asks about project work, first orient around Vibe Office and Project Context Hub.",
              officeContextPrompt,
              officeEvidencePrompt,
              "You cannot save files to the user's Desktop or local filesystem through this chat.",
              "Never say a document was saved to Desktop or to a local path unless Vibe Office explicitly provided an artifact confirmation.",
              [
                "If the user asks for a Markdown report, document, file, summary, or deliverable, put the complete content in your reply and include this exact artifact envelope:",
                "Save this as a Vibe Office project file: short-filename.md",
                "Content:",
                "<full Markdown content>",
                "End of file."
              ].join("\n")
            ].join("\n")
          },
          ...history,
          {
            role: "user",
            content: userContent
          }
        ],
        metadata: {
          conversation: body.conversation || `vibe-office-${profileName}`,
          profileName,
          profileBaseUrl: profileName === "default" ? "default" : baseUrl,
          displayName,
          role
        }
      }),
      cache: "no-store"
    });

    if (response.status === 401 || response.status === 403) {
      return Response.json({ ok: false, message: "Hermes rejected the access key." }, { status: response.status });
    }

    if (!response.ok) {
      const details = await response.text().catch(() => "");
      return Response.json(
        {
          ok: false,
          message: `Hermes /chat/completions returned ${response.status}${details ? `: ${details.slice(0, 240)}` : ""}`
        },
        { status: response.status }
      );
    }

    const raw = (await response.json().catch(() => null)) as unknown;
    const text = extractText(raw).trim();

    if (!text) {
      return Response.json({ ok: false, message: "Hermes returned an empty response." }, { status: 502 });
    }

    return Response.json(
      {
        ok: true,
        message: text,
        source: "hermes",
        raw
      },
      { headers: { "cache-control": "no-store" } }
    );
  } catch (error) {
    return Response.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Could not reach Hermes."
      },
      { status: 500 }
    );
  }
}
