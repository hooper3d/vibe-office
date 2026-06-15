import { getOfficeTemplate } from "@/lib/office-templates";
import { getProviderTemplate } from "@/lib/provider-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REQUEST_TIMEOUT_MS = 30_000;

type SetupAssistantRequest = {
  providerId?: string;
  apiKey?: string;
  apiBaseUrl?: string;
  model?: string;
  message?: string;
  officeTemplateId?: string;
  userPath?: "model_key_only" | "existing_hermes";
  status?: "empty" | "model_ready" | "office_previewed" | "hermes_ready" | "activation_review" | "office_active";
  hermesBaseUrl?: string;
  chiefAgentName?: string;
  allowProfileCreation?: boolean;
  allowContextSharing?: boolean;
};

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.trim().replace(/\/+$/, "");
}

function fallbackReply(message: string, context: SetupAssistantRequest) {
  const normalized = message.toLowerCase();
  const chiefAgentName = context.chiefAgentName || "Chief";

  if (context.status === "activation_review" || context.status === "hermes_ready") {
    return [
      "You are in the activation review stage.",
      "",
      `Chief Agent: ${chiefAgentName}`,
      context.hermesBaseUrl ? `Hermes address: ${context.hermesBaseUrl}` : null,
      `Profile creation allowed: ${context.allowProfileCreation ? "yes" : "not yet"}`,
      `Project Context Hub sharing: ${context.allowContextSharing ? "allowed" : "not yet"}`,
      "",
      "Before activation, confirm:",
      "1. this is the Hermes instance you want to use",
      "2. this Chief Agent name is correct",
      "3. these permissions match what Vibe Office may do",
      "",
      "Nothing should be activated until you approve those choices."
    ]
      .filter(Boolean)
      .join("\n");
  }

  if (context.status === "office_active") {
    return [
      `${chiefAgentName} is active now.`,
      "",
      "Next useful options:",
      "1. review whether more office members should be added",
      "2. decide which project context files should be shared",
      "3. keep refining the office workflow before any new profile changes",
      "",
      "Vibe Office should still ask before creating new profiles or sharing more files."
    ].join("\n");
  }

  if ((normalized.includes("access key") || normalized.includes("api key")) && normalized.includes("hermes")) {
    return [
      "No problem. I will help you diagnose local Hermes before we connect anything.",
      "",
      "If Hermes is open, ask Hermes to enable its API server and give you the API_SERVER_KEY.",
      "",
      "Send Hermes this:",
      "\"Please enable your API server, generate API_SERVER_KEY if needed, restart the gateway, and give me the key.\"",
      "",
      "Hermes may disconnect for about 10 seconds while the gateway restarts. When it gives you the key, paste it here."
    ].join("\n");
  }

  if (normalized.includes("api") && (normalized.includes("off") || normalized.includes("unreachable") || normalized.includes("not running"))) {
    return [
      "Let's ask Hermes to turn on its own API server.",
      "",
      "Open Hermes and send:",
      "\"Please enable your API server, generate API_SERVER_KEY if needed, restart the gateway, and give me the key.\"",
      "",
      "Hermes may disconnect for about 10 seconds while the gateway restarts. Come back here when it gives you the key."
    ].join("\n");
  }

  if (normalized.includes("install") || normalized.includes("local")) {
    return [
      "This setup assumes Hermes framework is already on this computer.",
      "",
      "Next:",
      "1. open Hermes",
      "2. ask Hermes to enable its API server",
      "3. ask Hermes to generate or return API_SERVER_KEY",
      "4. paste the key here",
      "",
      "Vibe Office will not modify Hermes config directly. Hermes performs the Hermes-side setup."
    ].join("\n");
  }

  if (normalized.includes("connect") || normalized.includes("hermes") || normalized.includes("already")) {
    return [
      "Great. We will connect local Hermes only after real endpoint checks succeed.",
      "",
      "Next:",
      "1. open Hermes",
      "2. ask Hermes to enable API and give you API_SERVER_KEY",
      "3. paste the key here",
      "4. run Check Hermes Agent",
      "",
      "Both /models and /responses must pass before activation review. The Chief Agent stays offline until you approve activation."
    ].join("\n");
  }

  return [
    context.userPath === "existing_hermes"
      ? "Hermes is connected, so I can help you review activation from here."
      : "Your model provider is ready, so I can guide the rest of setup from here.",
    "",
    "Use the local Hermes path:",
    "1. diagnose the local API",
    "2. enable the Hermes API server if needed",
    "3. paste the Hermes access key",
    "4. review activation only after both endpoint checks pass",
    "",
    "Vibe Office will not install Hermes, write config, or activate the Chief Agent from this step."
  ].join("\n");
}

function extractAssistantText(data: unknown) {
  if (!data || typeof data !== "object") return null;
  const choices = (data as { choices?: unknown }).choices;
  if (!Array.isArray(choices)) return null;
  const first = choices[0];
  if (!first || typeof first !== "object") return null;
  const message = (first as { message?: unknown }).message;
  if (!message || typeof message !== "object") return null;
  const content = (message as { content?: unknown }).content;
  return typeof content === "string" && content.trim() ? content.trim() : null;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SetupAssistantRequest;
    const provider = body.providerId ? getProviderTemplate(body.providerId) : undefined;
    const officeTemplate = getOfficeTemplate(body.officeTemplateId || "");
    const userMessage = body.message?.trim() || "Help me continue Vibe Office setup.";

    if (!provider || !body.apiKey || body.apiKey.trim().length < 8) {
      return Response.json(
        {
          ok: true,
          source: "local",
          message: fallbackReply(userMessage, body)
        },
        { headers: { "cache-control": "no-store" } }
      );
    }

    const baseUrl = normalizeBaseUrl(body.apiBaseUrl || provider.apiBaseUrl || "");
    if (!baseUrl) {
      return Response.json(
        {
          ok: true,
          source: "local",
          message: fallbackReply(userMessage, body)
        },
        { headers: { "cache-control": "no-store" } }
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${body.apiKey.trim()}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          model: body.model || provider.defaultModel,
          temperature: 0.2,
          max_tokens: 520,
          messages: [
            {
              role: "system",
              content: [
                "You are the Vibe Office Setup Agent.",
                "Guide a non-technical customer through creating an AI office.",
                "The customer has a model provider key and a local Hermes framework.",
                "This MVP only supports local Hermes at http://127.0.0.1:8642/v1 or http://localhost:8642/v1.",
                "Do not suggest cloud Hermes or installing Hermes in this flow.",
                "Do not claim Hermes is installed unless the customer says it is connected.",
                "Do not perform or suggest hidden installation. Always say Vibe Office will ask for permission before installing Hermes, creating profiles, or writing files.",
                "If the flow is in activation review, stay focused on what will be activated, what permissions are granted, and what still needs confirmation.",
                "Use plain English. Give the next 1-3 choices. Keep the answer concise."
              ].join(" ")
            },
            {
              role: "user",
              content: [
                `Setup status: ${body.status || "model_ready"}.`,
                `Access path: ${body.userPath || "model_key_only"}.`,
                `Office style: ${officeTemplate?.name || "Product Development Team"}.`,
                `Office goal: ${officeTemplate?.description || "Prepare a practical starter team."}`,
                body.hermesBaseUrl ? `Hermes address: ${body.hermesBaseUrl}.` : null,
                body.chiefAgentName ? `Chief Agent name: ${body.chiefAgentName}.` : null,
                typeof body.allowProfileCreation === "boolean"
                  ? `Profile creation allowed: ${body.allowProfileCreation ? "yes" : "no"}.`
                  : null,
                typeof body.allowContextSharing === "boolean"
                  ? `Project Context Hub sharing allowed: ${body.allowContextSharing ? "yes" : "no"}.`
                  : null,
                `Customer message: ${userMessage}`
              ]
                .filter(Boolean)
                .join("\n")
            }
          ]
        }),
        signal: controller.signal
      });

      const data = (await response.json()) as unknown;
      const assistantText = extractAssistantText(data);

      return Response.json(
        {
          ok: Boolean(response.ok && assistantText),
          source: response.ok && assistantText ? "provider" : "local",
          message: assistantText || fallbackReply(userMessage, body)
        },
        { status: response.ok ? 200 : 200, headers: { "cache-control": "no-store" } }
      );
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    return Response.json(
      {
        ok: true,
        source: "local",
        message: fallbackReply(error instanceof Error ? error.message : "", {})
      },
      { headers: { "cache-control": "no-store" } }
    );
  }
}
