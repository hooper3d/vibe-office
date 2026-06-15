"use client";

import { EventType, type AGUIEvent } from "@ag-ui/core";
import {
  Bot,
  Check,
  CheckSquare,
  ChevronDown,
  Copy,
  Database,
  FolderKanban,
  History,
  PackageOpen,
  Plus,
  Settings,
  X
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AgentStatus } from "@/components/AgentStatus";
import { ArtifactCard } from "@/components/ArtifactCard";
import { ContextHubPanel } from "@/components/ContextHubPanel";
import { EventStream } from "@/components/EventStream";
import { Header } from "@/components/Header";
import { AgentConversationPanel, type AgentConversationMessage } from "@/components/AgentConversationPanel";
import { ProvisioningOnboarding } from "@/components/onboarding/ProvisioningOnboarding";
import { RequirementComposer } from "@/components/RequirementComposer";
import { RuntimeQuickStart } from "@/components/RuntimeQuickStart";
import { TaskList } from "@/components/TaskList";
import { sendAguiInput } from "@/lib/agui-client";
import { localWriteHeaders } from "@/lib/local-action-guard";
import { contextHubOverview, initialAgents, initialTasks, projects as initialProjects } from "@/lib/mock-data";
import { officeTemplates } from "@/lib/office-templates";
import { providerTemplates } from "@/lib/provider-config";
import type {
  AgentAction,
  AgentProfile,
  AgentName,
  AgentStatus as AgentStatusValue,
  ProjectId,
  ProjectProfile
} from "@/types/agent";
import type { Artifact } from "@/types/artifact";
import type { ConsoleEvent } from "@/types/event";
import type { HermesTestResult, OfficeSetupAgent, OfficeSetupSession, OfficeSetupStatus, ProviderTestResult, ProvisioningUserPath } from "@/types/provisioning";
import type { PlanWorkflow, TaskItem, TaskPlanStatus, TaskPriority } from "@/types/task";
import type { LocalRuntimeHealth, RuntimeQuickStartState } from "@/types/workspace";

type HistoryResponse = {
  events?: ConsoleEvent[];
  lastResult?: {
    command?: string;
    outputText?: string;
    status?: string;
  } | null;
  planWorkflow?: PlanWorkflow | null;
  runnerStatus?: RunnerStatus;
};

type RuntimeHealthResponse = {
  ok: boolean;
  health?: LocalRuntimeHealth;
  quickStart?: RuntimeQuickStartState;
  error?: string;
};

type RuntimePrepareResponse = RuntimeHealthResponse;

type RunnerStatus = {
  enabled: boolean;
  rayWorkspaceWriteEnabled: boolean;
};

type OfficeProfileRuntime = {
  profileName: string;
  gatewayStatus: "running" | "stopped" | "unknown";
  current: boolean;
  baseUrl?: string;
  chatAvailable: boolean;
  message: string;
};

type RuntimeProfilesResponse = {
  ok: boolean;
  profiles?: OfficeProfileRuntime[];
  message?: string;
};

type Notice = {
  message: string;
  tone: "success" | "attention";
};

type SavedOfficeSetupInputs = {
  userPath?: ProvisioningUserPath;
  providerId?: string;
  officeTemplateId?: string;
  customBaseUrl?: string;
  hermesBaseUrl?: string;
  chiefAgentName?: string;
};

type SavedOfficeSetupSecrets = {
  apiKey?: string;
  hermesApiKey?: string;
};

type LegacyOfficeSetupDraft = {
  savedAt: string;
  userPath: ProvisioningUserPath;
  mode: string;
  providerId?: string;
  hermesBaseUrl?: string;
  officeTemplateId: string;
  agents: Array<{
    displayName: string;
    role: string;
    profileName: string;
    isChief: boolean;
  }>;
};

type SetupAssistantResponse = {
  ok: boolean;
  source?: "provider" | "local";
  message: string;
};

type HermesChatResponse = {
  ok: boolean;
  source?: "hermes";
  message: string;
};

type OfficeChatContext = {
  templateName: string;
  projectName: string;
  projectDescription?: string;
  allowContextSharing: boolean;
  contextHubFiles: string[];
  selectedAgent: OfficeChatContextAgent;
  agents: OfficeChatContextAgent[];
};

type OfficeChatContextAgent = {
  displayName: string;
  role: string;
  profileName: string;
  isChief: boolean;
  contextFiles: string[];
};

type ArtifactsFromTextResponse = {
  ok: boolean;
  artifacts?: Artifact[];
  error?: string;
};

type OfficePanel = "tasks" | "archive" | "outputs" | "history" | null;
type ArtifactOwnerFilter = "all" | "materials" | `agent:${string}` | `owner:${string}`;
type SystemView = "office_setup" | "developer_setup" | null;
type VirtualOfficeAgent = "setup" | "hermes" | `profile:${string}`;
type LocalHermesGuideStep =
  | "intro"
  | "open_hermes"
  | "ask_hermes_enable_api"
  | "wait_for_hermes_key"
  | "api_unreachable_help"
  | "responses_help"
  | "ready";

type ComposerRoute = {
  target: AgentName;
  message: string;
};

type AgentConversations = Record<AgentName, AgentConversationMessage[]>;

type ProjectRuntimeState = {
  projectId: ProjectId;
  tasks: TaskItem[];
  agents: AgentProfile[];
  events: ConsoleEvent[];
  requirement: string;
  planWorkflow: PlanWorkflow | null;
  conversations: AgentConversations;
  activeConversationAgent: AgentName;
  planningConversationActive: boolean;
  pendingArtifacts: Artifact[];
};

const PLANNING_AGENT_SYSTEM_PREFIXES = [
  "Lucy readonly review:",
  "Lucy daily summary:",
  "Lucy risk notes:",
  "Planning agent readonly review:",
  "Planning agent daily summary:",
  "Planning agent risk notes:"
];
const EMPTY_PROJECT_ID = "office-provisioning-empty";
const OFFICE_SETUP_PROJECT_ID = "office-provisioning-setup-your-office";
const DEFAULT_PROJECT_ID = "office-default-project";
const PROJECTS_STORAGE_KEY = "vibe-office-provisioning-projects-v1";
const PROJECT_RUNTIME_STORAGE_KEY = "vibe-office-provisioning-project-runtime-v1";
const ACTIVE_PROJECT_STORAGE_KEY = "vibe-office-provisioning-active-project-v1";
const OFFICE_SETUP_INPUTS_STORAGE_KEY = "vibe-office-provisioning-setup-inputs-v1";
const OFFICE_SETUP_SECRETS_STORAGE_KEY = "vibe-office-provisioning-setup-secrets-v1";
const OFFICE_SETUP_SESSION_STORAGE_KEY = "vibe-office-provisioning-setup-session-v1";
const OFFICE_CHAT_MESSAGES_STORAGE_KEY = "vibe-office-provisioning-chat-messages-v1";
const OFFICE_CHAT_EVENTS_STORAGE_KEY = "vibe-office-provisioning-chat-events-v1";
const LEGACY_OFFICE_DRAFT_STORAGE_KEY = "vibe-office-provisioning-office-draft-v1";
const RUNTIME_GUIDE_COMPLETED_STORAGE_KEY = "vibe-office-runtime-guide-completed-v1";
const MODEL_KEY_VERIFIED_STORAGE_KEY = "vibe-office-model-key-verified-v1";
const LOCAL_HERMES_PRIMARY_URL = "http://127.0.0.1:8642/v1";
const LOCAL_HERMES_BACKUP_URL = "http://localhost:8642/v1";
const CHIEF_ROLE_DESCRIPTION = "Coordinates agents and context";
const HERMES_ENABLE_API_PROMPT = [
  "Prepare Hermes API access for Vibe Office.",
  "If needed, enable the API server, create API_SERVER_KEY, and restart the gateway.",
  "Reply with the Base URL, API_SERVER_KEY, and any network step Vibe Office must do.",
  "If this is a remote machine, give me a reachable URL or an SSH tunnel command.",
  "Do not send SSH private keys."
].join("\n");
const SYSTEM_ASSISTANT_AVATAR_CLASS = "bg-cyan-200 text-cyan-800 shadow-[0_0_0_5px_rgba(34,211,238,0.16)]";
const OFFICE_AGENT_TONE_PALETTE: AgentProfile["tone"][] = ["amber", "blue", "violet", "slate"];
const OFFICE_AGENT_AVATAR_CLASS: Record<AgentProfile["tone"], string> = {
  violet: "bg-violet-200 text-violet-700 shadow-[0_0_0_5px_rgba(167,139,250,0.16)]",
  blue: "bg-blue-100 text-blue-700 shadow-[0_0_0_5px_rgba(96,165,250,0.16)]",
  amber: "bg-amber-100 text-amber-700 shadow-[0_0_0_5px_rgba(251,191,36,0.18)]",
  slate: "bg-slate-200 text-slate-700 shadow-[0_0_0_5px_rgba(148,163,184,0.14)]"
};

type ParsedHermesProvisioningReply = {
  apiKey?: string;
  baseUrl?: string;
  remoteBaseUrl?: string;
  sshCommand?: string;
  localOnly: boolean;
};

function parseUnsafeRemoteAccessReply(message: string) {
  const containsPrivateKey =
    /OPENSSH PRIVATE KEY|PRIVATE KEY|xxd\s+-r\s+-p|~\/\.ssh|vibe-office-key/i.test(message) &&
    /ssh\s+-L|Base URL|API Key|security group|firewall/i.test(message);
  const containsCloudBlock =
    /security group|cloud firewall|inbound TCP|ports?\s+\(?22|port\s+8642|blocked from the public internet/i.test(message);

  if (!containsPrivateKey && !containsCloudBlock) return null;

  const baseUrl = message.match(/Base URL:\s*(https?:\/\/[^\s`'"<>]+)/i)?.[1]?.replace(/[),.;]+$/g, "");
  const apiPort = baseUrl?.match(/:(\d+)\/v1/i)?.[1] || "8642";
  return {
    containsPrivateKey,
    containsCloudBlock,
    baseUrl,
    apiPort
  };
}

function parseSshTunnelError(message: string) {
  const match = message.match(/ssh:\s+connect to host\s+([^\s]+)\s+port\s+(\d+):\s+(.+)/i);
  if (!match) return null;
  return {
    host: match[1],
    port: match[2],
    reason: match[3].trim()
  };
}

function extractHermesApiKey(message: string) {
  const lines = message.split(/\r?\n/);
  const stopLine = /Base URL|Listen address|Gateway|Model|Option|Then|Note|ssh\s+-L|https?:\/\/|API_SERVER_HOST|Restart/i;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!/API_SERVER_KEY|API Key/i.test(line)) continue;

    const afterLabel = line
      .replace(/.*?(?:API_SERVER_KEY|API Key)\s*(?:\||:)?/i, "")
      .replace(/[`|]/g, " ");
    const parts = [afterLabel];

    for (let offset = 1; offset <= 3; offset += 1) {
      const nextLine = lines[index + offset] || "";
      const compactNext = nextLine.replace(/[^A-Za-z0-9._-]/g, "");
      if (!compactNext) continue;
      if (stopLine.test(nextLine)) break;
      if (compactNext.length < 8) break;
      parts.push(nextLine);
    }

    const compact = parts.join("").replace(/[^A-Za-z0-9._-]/g, "");
    const hexKey = compact.match(/[a-f0-9]{64,128}/i)?.[0];
    const genericKey = compact.match(/[A-Za-z0-9._-]{32,128}/)?.[0];
    if (hexKey || genericKey) return hexKey || genericKey;
  }

  const compactMessage = message.replace(/[\s`|]/g, "");
  return compactMessage.match(/[a-f0-9]{64,128}/i)?.[0] || message.match(/\b([A-Za-z0-9._-]{32,128})\b/)?.[1];
}

function extractKeyOnlyMessage(message: string) {
  const compact = message.replace(/[^A-Za-z0-9._-]/g, "");
  if (compact.length < 32 || compact.length > 160) return undefined;
  if (/\s/.test(message.trim()) && !/^[A-Za-z0-9._\-\s]+$/.test(message.trim())) return undefined;
  return compact;
}

function parseHermesProvisioningReply(message: string): ParsedHermesProvisioningReply | null {
  const looksLikeHermesReply = /API_SERVER|Base URL|API Key|ssh\s+-L|gateway|localhost only|127\.0\.0\.1/i.test(message);
  if (!looksLikeHermesReply) return null;

  const apiKey = extractHermesApiKey(message);
  const sshCommand = message.match(/ssh\s+-L\s+\d+:[^\r\n]+\S/i)?.[0]?.trim();
  const localOnly = /localhost only|bound to\s+127\.0\.0\.1|127\.0\.0\.1:\d+|listens?\s+on\s+localhost/i.test(message);
  const urls = Array.from(message.matchAll(/https?:\/\/[^\s`'"<>]+/gi), (match) =>
    match[0].replace(/[),.;]+$/g, "")
  );
  const v1Urls = urls.filter((url) => /\/v1\/?$/i.test(url));
  const usableUrls = v1Urls.length ? v1Urls : urls;
  const localUrls = usableUrls.filter((url) => /\/\/(?:localhost|127\.0\.0\.1)(?::|\/)/i.test(url));
  const remoteUrls = usableUrls.filter((url) => !/\/\/(?:localhost|127\.0\.0\.1)(?::|\/)/i.test(url));
  const tunnelPort = sshCommand?.match(/ssh\s+-L\s+(\d+):/i)?.[1];
  const baseUrl = sshCommand
    ? localUrls.find((url) => /\/\/localhost(?::|\/)/i.test(url)) || localUrls[0] || (tunnelPort ? `http://localhost:${tunnelPort}/v1` : undefined)
    : usableUrls[0];

  if (!apiKey && !baseUrl && !sshCommand && !localOnly) return null;

  return {
    apiKey,
    baseUrl,
    remoteBaseUrl: remoteUrls[0],
    sshCommand,
    localOnly
  };
}

function compactHermesReplyMessage(content: string) {
  if (/^Connection details saved\./i.test(content)) {
    return content.includes("Testing now")
      ? "Hermes reply received.\nTesting Hermes now."
      : content.replace(/^Connection details saved\./i, "Hermes reply received.");
  }
  if (/Hermes Agent is connected\.[\s\S]*Nothing has been activated yet\./i.test(content)) {
    return "Hermes is connected. Name your Chief Agent next.";
  }
  if (!content.startsWith("I read Hermes' reply.")) return content;

  const sshCommand = content.match(/ssh\s+-L\s+\d+:[^\r\n]+\S/i)?.[0]?.trim();
  const urls = Array.from(content.matchAll(/https?:\/\/[^\s`'"<>]+/gi), (match) =>
    match[0].replace(/[),.;]+$/g, "")
  );
  const baseUrl = urls.find((url) => /\/\/localhost(?::|\/)/i.test(url)) || urls[0];
  const keySaved = /key saved|access key:\s*saved/i.test(content);

  if (sshCommand) {
    return [
      "Tunnel required.",
      sshCommand,
      baseUrl ? `Using: ${baseUrl}` : null,
      keySaved ? "Key saved. I will test it." : "Paste the Hermes key next."
    ]
      .filter(Boolean)
      .join("\n");
  }

  return [
    keySaved ? "Connection details saved." : "Connection details found.",
    baseUrl ? `Using: ${baseUrl}` : null,
    keySaved ? "Key saved. I will test it." : "Paste the Hermes key next."
  ]
    .filter(Boolean)
    .join("\n");
}

function cleanPlanningAgentDelta(delta: string) {
  return PLANNING_AGENT_SYSTEM_PREFIXES.reduce((current, prefix) => current.replace(prefix, ""), delta);
}

function isOfficeSetupStatus(value: unknown): value is OfficeSetupStatus {
  return (
    value === "empty" ||
    value === "model_ready" ||
    value === "office_previewed" ||
    value === "hermes_ready" ||
    value === "activation_review" ||
    value === "office_active"
  );
}

function normalizeStoredOfficeMessages(value: unknown): AgentConversationMessage[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((message): message is Partial<AgentConversationMessage> => Boolean(message) && typeof message === "object")
    .filter((message) => (message.role === "user" || message.role === "agent") && typeof message.id === "string")
    .map((message): AgentConversationMessage => ({
      id: message.id || `office-message-${Date.now()}`,
      role: message.role === "user" ? "user" : "agent",
      agentName: message.agentName,
      content: typeof message.content === "string" ? message.content : "",
      artifacts: Array.isArray(message.artifacts) ? (message.artifacts as Artifact[]) : undefined
    }))
    .filter((message) => message.content.trim() || message.artifacts?.length);
}

function isOfficeChatEvent(event: AGUIEvent | ConsoleEvent) {
  if (event.type === EventType.CUSTOM) {
    return event.name === "office_agent_message" || event.name === "office_agent_response" || event.name === "office_agent_error";
  }

  if (event.type === EventType.TEXT_MESSAGE_CONTENT) {
    return typeof event.messageId === "string" && event.messageId.startsWith("office-chat-");
  }

  if (event.type === EventType.RUN_ERROR) {
    return typeof event.message === "string" && (event.message.includes("through Hermes") || event.message.includes("Hermes chat failed"));
  }

  return false;
}

function normalizeStoredOfficeEvents(value: unknown): ConsoleEvent[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((event): event is Partial<ConsoleEvent> => Boolean(event) && typeof event === "object")
    .filter((event) => typeof event.type === "string" && typeof event.receivedAt === "string")
    .filter((event) => isOfficeChatEvent(event as ConsoleEvent))
    .map((event) => event as ConsoleEvent);
}

function sessionFromLegacyDraft(draft: LegacyOfficeSetupDraft): OfficeSetupSession {
  return {
    savedAt: draft.savedAt,
    status: draft.userPath === "existing_hermes" ? "activation_review" : "office_previewed",
    userPath: draft.userPath,
    mode: draft.mode === "create_profiles_from_existing" ? "create_profiles_from_existing" : draft.userPath === "existing_hermes" ? "connect_existing" : "dry_run",
    providerId: draft.providerId,
    hermesBaseUrl: draft.hermesBaseUrl,
    officeTemplateId: draft.officeTemplateId,
    officeTemplateName: "Product Team",
    agents: draft.agents,
    activation: {
      chiefAgentName: draft.agents.find((agent) => agent.isChief)?.displayName || "Chief Agent",
      allowProfileCreation: draft.mode === "create_profiles_from_existing",
      allowContextSharing: true
    }
  };
}

function officeSetupStatusLabel(session: OfficeSetupSession | null) {
  if (!session || session.status === "empty") return "Not started";
  if (session.status === "model_ready") return "Online";
  if (session.status === "office_previewed") return "Plan ready";
  if (session.status === "hermes_ready") return "Hermes connected";
  if (session.status === "activation_review") return "Needs approval";
  return "Chief Agent online";
}

function officeSetupDisplayName(session: OfficeSetupSession | null) {
  if (!session || session.status === "empty") return "Office Guide";
  if (session.status !== "office_active") return "Office Guide";
  return normalizeHermesAgentName(session.activation.chiefAgentName);
}

function normalizeHermesAgentName(value?: string) {
  const clean = value?.trim();
  if (!clean || clean === "Chief Agent" || clean === "Hermes Agent" || clean === "Manager Agent") return "Chief";
  return clean;
}

function normalizeOfficeAgentDisplayName(agent: Pick<OfficeSetupAgent, "displayName" | "profileName" | "isChief">) {
  const clean = agent.displayName.trim();
  if (agent.isChief || agent.profileName === "default") return normalizeHermesAgentName(clean);
  if (clean === "Engineer Agent") return "Builder";
  if (clean === "Content Agent") return "Writer";
  if (clean === "Tools Agent") return "Operator";
  return clean || "Agent";
}

function normalizeOfficeAgentRole(agent: Pick<OfficeSetupAgent, "role" | "profileName" | "isChief">) {
  const clean = agent.role.trim();
  if (agent.isChief || agent.profileName === "default") {
    if (
      !clean ||
      clean === "Chief Agent" ||
      clean === "Chief / default Hermes" ||
      clean === "Chief Agent / project lead" ||
      clean === "Existing main Hermes Chief Agent" ||
      clean === "Connected Hermes Agent"
    ) {
      return CHIEF_ROLE_DESCRIPTION;
    }
  }
  return clean || "Worker Agent";
}

function artifactMatchesOwnerFilter(artifact: Artifact, filter: ArtifactOwnerFilter, agents: OfficeSetupAgent[]) {
  if (filter === "all") return true;
  if (filter === "materials") return artifact.owner === "User";
  if (filter.startsWith("agent:")) {
    const key = filter.slice("agent:".length);
    const agent = agents.find((item) => item.profileName === key || item.displayName === key);
    if (!agent) return false;
    return artifact.owner === agent.displayName || artifact.owner === normalizeHermesAgentName(agent.displayName) || artifact.owner === agent.profileName;
  }
  if (filter.startsWith("owner:")) return artifact.owner === filter.slice("owner:".length);
  return false;
}

function artifactOwnerDisplay(artifact: Artifact, agents: OfficeSetupAgent[]) {
  if (artifact.owner === "User") return "Material input";
  const agent = agents.find(
    (item) => artifact.owner === item.displayName || artifact.owner === normalizeHermesAgentName(item.displayName) || artifact.owner === item.profileName
  );
  return agent?.displayName || artifact.owner;
}

function officeAgentOwnerFromMessageId(messageId: string, session: OfficeSetupSession | null) {
  const fallbackChief = normalizeHermesAgentName(session?.activation.chiefAgentName || "Chief");
  const match = messageId.match(/^office-chat-(.+)-\d+-agent$/);
  const profileName = match?.[1];
  const agent =
    (profileName && session?.agents.find((item) => item.profileName === profileName)) ||
    session?.agents.find((item) => item.isChief || item.profileName === "default");
  return normalizeHermesAgentName(agent?.displayName || fallbackChief);
}

function virtualAgentIdForOfficeAgent(agent: Pick<OfficeSetupAgent, "profileName" | "isChief">): VirtualOfficeAgent {
  return agent.isChief || agent.profileName === "default" ? "hermes" : `profile:${agent.profileName}`;
}

function isOfficeSetupProjectId(projectId: ProjectId) {
  return projectId === EMPTY_PROJECT_ID || projectId === OFFICE_SETUP_PROJECT_ID;
}

function defaultOfficeProject(): ProjectProfile {
  return {
    id: DEFAULT_PROJECT_ID,
    name: "Default Project",
    mode: "Office workspace",
    description: "Default container for this Office's conversations, materials, outputs, tasks, and shared context."
  };
}

function normalizeOfficeProjectId(projectId: ProjectId) {
  return isOfficeSetupProjectId(projectId) ? DEFAULT_PROJECT_ID : projectId;
}

function officeAgentToneSeed(agents: Array<Pick<OfficeSetupAgent, "displayName" | "profileName">>) {
  const source = agents.map((agent) => `${agent.profileName}:${agent.displayName}`).join("|");
  return Array.from(source).reduce((total, char) => total + char.charCodeAt(0), 0);
}

function orderedOfficeSetupAgents(session: OfficeSetupSession | null) {
  if (!session || session.status !== "office_active") return [];

  return [
    ...session.agents.filter((agent) => agent.isChief || agent.profileName === "default"),
    ...session.agents.filter((agent) => !agent.isChief && agent.profileName !== "default")
  ].map((agent) => ({
    ...agent,
    displayName: normalizeOfficeAgentDisplayName(agent),
    role: normalizeOfficeAgentRole(agent)
  }));
}

function officeAgentToneForIndex(orderedAgents: Array<Pick<OfficeSetupAgent, "displayName" | "profileName">>, index: number) {
  const offset = officeAgentToneSeed(orderedAgents) % OFFICE_AGENT_TONE_PALETTE.length;
  return OFFICE_AGENT_TONE_PALETTE[(offset + index) % OFFICE_AGENT_TONE_PALETTE.length];
}

function officeAgentToneForProfile(session: OfficeSetupSession | null, profileName?: string) {
  const orderedAgents = orderedOfficeSetupAgents(session);
  const index = orderedAgents.findIndex((agent) => agent.profileName === profileName);
  return officeAgentToneForIndex(orderedAgents, index >= 0 ? index : 0);
}

function findOfficeAgentByVirtualId(session: OfficeSetupSession | null, activeVirtualAgent: VirtualOfficeAgent) {
  if (!session || session.status !== "office_active") return null;
  const chief = session.agents.find((agent) => agent.isChief) || session.agents[0] || null;
  if (activeVirtualAgent === "hermes") return chief;
  if (!activeVirtualAgent.startsWith("profile:")) return chief;

  const profileName = activeVirtualAgent.slice("profile:".length);
  return session.agents.find((agent) => agent.profileName === profileName) || chief;
}

function officeSetupAgentsForCanvas(session: OfficeSetupSession | null): AgentProfile[] {
  if (!session || session.status !== "office_active") return [];

  const orderedAgents = orderedOfficeSetupAgents(session);

  return orderedAgents.map((agent, index) => ({
    name: normalizeHermesAgentName(agent.displayName) as AgentName,
    role: normalizeOfficeAgentRole(agent),
    status: "ready",
    tone: officeAgentToneForIndex(orderedAgents, index)
  }));
}

function completeOfficeSetupSession(session: OfficeSetupSession | null): OfficeSetupSession | null {
  if (!session || session.status !== "office_active") return session;
  const template = officeTemplates.find((item) => item.id === session.officeTemplateId) || officeTemplates[0];
  if (!template?.agents?.length) {
    return {
      ...session,
      activation: {
        ...session.activation,
        chiefAgentName: normalizeHermesAgentName(session.activation.chiefAgentName)
      },
      agents: session.agents.map((agent) => ({
        ...agent,
        displayName: normalizeOfficeAgentDisplayName(agent),
        role: normalizeOfficeAgentRole(agent)
      }))
    };
  }

  if (session.agents.length >= template.agents.length) {
    return {
      ...session,
      activation: {
        ...session.activation,
        chiefAgentName: normalizeHermesAgentName(session.activation.chiefAgentName)
      },
      agents: session.agents.map((agent) => ({
        ...agent,
        displayName: normalizeOfficeAgentDisplayName(agent),
        role: normalizeOfficeAgentRole(agent)
      }))
    };
  }

  const completedAgents = template.agents.map((templateAgent) => {
    const existing = templateAgent.isChief
      ? session.agents.find((agent) => agent.isChief) || session.agents[0]
      : session.agents.find((agent) => agent.profileName === templateAgent.profileName);

    const candidate = {
      displayName: existing?.displayName || (templateAgent.isChief ? normalizeHermesAgentName(session.activation.chiefAgentName) : templateAgent.displayName),
      role: existing?.role || (templateAgent.isChief ? CHIEF_ROLE_DESCRIPTION : templateAgent.role),
      profileName: templateAgent.profileName,
      isChief: Boolean(templateAgent.isChief)
    };
    return {
      ...candidate,
      displayName: normalizeOfficeAgentDisplayName(candidate),
      role: normalizeOfficeAgentRole(candidate)
    };
  });

  return {
    ...session,
    activation: {
      ...session.activation,
      chiefAgentName: normalizeHermesAgentName(session.activation.chiefAgentName)
    },
    agents: completedAgents
  };
}

function buildOfficeChatContext(
  session: OfficeSetupSession,
  activeAgent: OfficeSetupAgent,
  project: ProjectProfile
): OfficeChatContext {
  const template = officeTemplates.find((item) => item.id === session.officeTemplateId) || officeTemplates[0];
  const agents = orderedOfficeSetupAgents(session).map((agent) => {
    const templateAgent = template?.agents.find((item) => item.profileName === agent.profileName || (item.isChief && agent.isChief));
    return {
      displayName: normalizeOfficeAgentDisplayName(agent),
      role: normalizeOfficeAgentRole(agent),
      profileName: agent.profileName,
      isChief: agent.isChief || agent.profileName === "default",
      contextFiles: templateAgent?.contextFiles || []
    };
  });
  const selectedAgent =
    agents.find((agent) => agent.profileName === activeAgent.profileName) ||
    agents.find((agent) => agent.isChief) ||
    {
      displayName: normalizeOfficeAgentDisplayName(activeAgent),
      role: normalizeOfficeAgentRole(activeAgent),
      profileName: activeAgent.profileName,
      isChief: activeAgent.isChief || activeAgent.profileName === "default",
      contextFiles: []
    };

  return {
    templateName: session.officeTemplateName || template?.name || "Product Team",
    projectName: project.name,
    projectDescription: project.description,
    allowContextSharing: session.activation.allowContextSharing,
    contextHubFiles: Array.from(new Set(agents.flatMap((agent) => agent.contextFiles))),
    selectedAgent,
    agents
  };
}

function officeSetupDotClass(session: OfficeSetupSession | null) {
  if (!session || session.status === "empty") return "bg-slate-500";
  if (session.status === "office_active") return "bg-emerald-400";
  if (session.status === "activation_review" || session.status === "hermes_ready") return "bg-amber-300";
  return "bg-emerald-400";
}

function sidebarAgentStatus(agent: AgentProfile) {
  if (agent.status === "working") return { label: "Working", dot: "bg-sky-400", text: "text-sky-200" };
  if (agent.status === "blocked") return { label: "Blocked", dot: "bg-rose-400", text: "text-rose-200" };
  if (agent.status === "waiting") return { label: "Waiting", dot: "bg-amber-400", text: "text-amber-200" };
  if (agent.status === "offline") return { label: "Offline", dot: "bg-slate-500", text: "text-slate-400" };
  return { label: "Idle", dot: "bg-emerald-400", text: "text-emerald-200" };
}

function isAgentName(value: unknown): value is AgentName {
  return value === "Lucy" || value === "Ray" || value === "Tiger" || value === "Musk";
}

function extractComposerRoute(value: string, fallbackAgent: AgentName = "Lucy"): ComposerRoute {
  const trimmed = value.trim();
  const match = trimmed.match(/^@(Lucy|Ray|Tiger|Musk)\s*/i);
  if (!match) return { target: fallbackAgent, message: trimmed };

  const rawTarget = match[1];
  const normalizedTarget = rawTarget.slice(0, 1).toUpperCase() + rawTarget.slice(1).toLowerCase();
  return {
    target: isAgentName(normalizedTarget) ? normalizedTarget : fallbackAgent,
    message: trimmed.slice(match[0].length).trim()
  };
}

function emptyConversations(): AgentConversations {
  return {
    Lucy: [],
    Ray: [],
    Tiger: [],
    Musk: []
  };
}

function appendConversationMessage(
  conversations: AgentConversations,
  agentName: AgentName,
  message: AgentConversationMessage
): AgentConversations {
  return {
    ...conversations,
    [agentName]: [...conversations[agentName], message]
  };
}

function appendConversationDelta(
  conversations: AgentConversations,
  messageId: string,
  delta: string
): AgentConversations {
  let changed = false;
  const next = { ...conversations };

  for (const agentName of Object.keys(next) as AgentName[]) {
    const messages = next[agentName];
    const messageIndex = messages.findIndex((message) => message.role === "agent" && message.id === messageId);
    if (messageIndex < 0) continue;

    changed = true;
    next[agentName] = messages.map((message, index) =>
      index === messageIndex ? { ...message, content: `${message.content}${delta}` } : message
    );
  }

  return changed ? next : conversations;
}

function appendConversationArtifacts(
  conversations: AgentConversations,
  messageId: string,
  artifacts: Artifact[]
): AgentConversations {
  const cleanArtifacts = artifacts.filter((artifact) => !artifact.sourceUrl || !/[-.,;:!?)\]]$/.test(artifact.sourceUrl));
  if (!cleanArtifacts.length) return conversations;

  let changed = false;
  const next = { ...conversations };

  for (const agentName of Object.keys(next) as AgentName[]) {
    const messages = next[agentName];
    const messageIndex = messages.findIndex((message) => message.role === "agent" && message.id === messageId);
    if (messageIndex < 0) continue;

    changed = true;
    next[agentName] = messages.map((message, index) => {
      if (index !== messageIndex) return message;
      const existingIds = new Set((message.artifacts || []).map((artifact) => artifact.id));
      const newArtifacts = cleanArtifacts.filter((artifact) => !existingIds.has(artifact.id));
      return { ...message, artifacts: [...(message.artifacts || []), ...newArtifacts] };
    });
  }

  return changed ? next : conversations;
}

function appendMessageArtifacts(messages: AgentConversationMessage[], messageId: string, artifacts: Artifact[]) {
  const cleanArtifacts = artifacts.filter((artifact) => !artifact.sourceUrl || !/[-.,;:!?)\]]$/.test(artifact.sourceUrl));
  if (!cleanArtifacts.length) return messages;

  return messages.map((message) => {
    if (message.id !== messageId) return message;
    const existingIds = new Set((message.artifacts || []).map((artifact) => artifact.id));
    const newArtifacts = cleanArtifacts.filter((artifact) => !existingIds.has(artifact.id));
    return newArtifacts.length ? { ...message, artifacts: [...(message.artifacts || []), ...newArtifacts] } : message;
  });
}

function hydrateMessageArtifacts(messages: AgentConversationMessage[], availableArtifacts: Artifact[]) {
  const artifactById = new Map(availableArtifacts.map((artifact) => [artifact.id, artifact]));

  return messages.map((message) => {
    if (!message.artifacts?.length) return message;
    const artifacts = message.artifacts
      .map((artifact) => artifactById.get(artifact.id) || artifact)
      .filter((artifact) => artifactById.has(artifact.id));
    return artifacts.length === message.artifacts.length && artifacts.every((artifact, index) => artifact === message.artifacts?.[index])
      ? message
      : { ...message, artifacts };
  });
}

function looksLikeUnattachedArtifactReply(content: string) {
  const mentionsSupportedFile = /\.(?:md|markdown|txt|json|csv)\b/i.test(content);
  const hasReadableDeliveryLanguage =
    /(desktop|saved|written|created|document|markdown|file|download|artifact)/i.test(content) ||
    /[\u5199\u4fdd\u5b58\u6587\u4ef6\u6863\u684c\u9762\u4e0b\u8f7d\u751f\u6210]/u.test(content);
  if (mentionsSupportedFile && hasReadableDeliveryLanguage) return true;

  return /\.(?:md|markdown|txt|json|csv)\b/i.test(content) && /(desktop|saved|written|created|document|markdown|file|写好了|文件|文档|桌面)/i.test(content);
}

function buildConversationsFromEvents(events: ConsoleEvent[]) {
  let conversations = emptyConversations();

  for (const event of events) {
    if (event.type === EventType.RUN_STARTED) {
      const input = event.input as
        | {
            state?: {
              intent?: {
                action?: string;
                message?: string;
                targetAgent?: string;
                attachments?: Artifact[];
              };
            };
          }
        | undefined;
      const intent = input?.state?.intent;
      if (
        (intent?.action === "submit_requirement_to_planning_agent" || intent?.action === "manual_message") &&
        intent.message
      ) {
        const targetAgent = isAgentName(intent.targetAgent) ? intent.targetAgent : "Lucy";
        conversations = appendConversationMessage(conversations, targetAgent, {
          id: `user-${event.runId || event.timestamp || conversations[targetAgent].length}`,
          role: "user",
          content: intent.message,
          artifacts: intent.attachments
        });
      }
    }

    if (event.type === EventType.TEXT_MESSAGE_START && isAgentName(event.name)) {
      conversations = appendConversationMessage(conversations, event.name, {
        id: event.messageId,
        role: "agent",
        agentName: event.name,
        content: ""
      });
    }

    if (event.type === EventType.TEXT_MESSAGE_CONTENT) {
      conversations = appendConversationDelta(conversations, event.messageId, cleanPlanningAgentDelta(event.delta));
    }

    if (event.type === EventType.CUSTOM && event.name === "artifacts_registered") {
      const value = event.value as { messageId?: string; artifacts?: Artifact[] } | undefined;
      if (value?.messageId && value.artifacts?.length) {
        conversations = appendConversationArtifacts(conversations, value.messageId, value.artifacts);
      }
    }
  }

  return Object.fromEntries(
    (Object.keys(conversations) as AgentName[]).map((agentName) => [
      agentName,
      conversations[agentName].filter((message) => message.content.trim() || message.artifacts?.length)
    ])
  ) as AgentConversations;
}

function hasConversationMessages(conversations: AgentConversations) {
  return (Object.keys(conversations) as AgentName[]).some((agentName) => conversations[agentName].length > 0);
}

function latestConversationAgentFromEvents(events: ConsoleEvent[]): AgentName | undefined {
  for (const event of [...events].reverse()) {
    if (event.type === EventType.TEXT_MESSAGE_START && isAgentName(event.name)) return event.name;
    if (event.type === EventType.RUN_STARTED) {
      const input = event.input as
        | {
            state?: {
              intent?: {
                action?: string;
                targetAgent?: string;
              };
            };
          }
        | undefined;
      const intent = input?.state?.intent;
      if (
        (intent?.action === "submit_requirement_to_planning_agent" || intent?.action === "manual_message") &&
        isAgentName(intent.targetAgent)
      ) {
        return intent.targetAgent;
      }
    }
  }
  return undefined;
}

function OutputsCabinetPanel({
  owner,
  artifacts,
  allArtifacts,
  agents,
  onOwnerChange
}: {
  owner: ArtifactOwnerFilter;
  artifacts: Artifact[];
  allArtifacts: Artifact[];
  agents: OfficeSetupAgent[];
  onOwnerChange: (owner: ArtifactOwnerFilter) => void;
}) {
  const materialCount = allArtifacts.filter((artifact) => artifact.owner === "User").length;
  const agentFilters =
    agents.length > 0
      ? agents.map((agent) => ({
          id: `agent:${agent.profileName}` as ArtifactOwnerFilter,
          label: agent.displayName,
          count: allArtifacts.filter((artifact) => artifactMatchesOwnerFilter(artifact, `agent:${agent.profileName}`, agents)).length
        }))
      : Array.from(new Set(allArtifacts.filter((artifact) => artifact.owner !== "User").map((artifact) => artifact.owner))).map((artifactOwner) => ({
          id: `owner:${artifactOwner}` as ArtifactOwnerFilter,
          label: artifactOwner,
          count: allArtifacts.filter((artifact) => artifact.owner === artifactOwner).length
        }));
  const activeFilterLabel =
    owner === "materials"
      ? "Materials"
      : owner.startsWith("agent:")
        ? agentFilters.find((filter) => filter.id === owner)?.label || "Agent"
        : owner.startsWith("owner:")
          ? owner.slice("owner:".length)
          : "All";
  const emptyTitle =
    owner === "all" ? "No files yet" : owner === "materials" ? "No materials yet" : `${activeFilterLabel} has no outputs yet`;
  const emptyHelp =
    owner === "all"
      ? "User materials and Agent outputs will appear here."
      : owner === "materials"
        ? "Paste or attach source material in the composer, then it will appear here."
        : "Ask this Agent to create something, then it will appear here.";

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onOwnerChange("all")}
          className={`rounded-lg border px-3 py-1.5 text-left text-xs transition ${
            owner === "all"
              ? "border-emerald-300/45 bg-emerald-400/14 text-emerald-100"
              : "border-slate-800/80 bg-slate-900/42 text-slate-300 hover:border-emerald-400/30 hover:text-slate-100"
          }`}
        >
          <span className="font-semibold">All</span>
          <span className="ml-2 text-slate-500">{allArtifacts.length}</span>
        </button>
        <button
          type="button"
          onClick={() => onOwnerChange("materials")}
          className={`rounded-lg border px-3 py-1.5 text-left text-xs transition ${
            owner === "materials"
              ? "border-sky-300/45 bg-sky-400/14 text-sky-100"
              : "border-slate-800/80 bg-slate-900/42 text-slate-300 hover:border-sky-400/30 hover:text-slate-100"
          }`}
        >
          <span className="font-semibold">Materials</span>
          <span className="ml-2 text-slate-500">{materialCount}</span>
        </button>
        {agentFilters.map((filter) => (
          <button
            key={filter.id}
            type="button"
            onClick={() => onOwnerChange(filter.id)}
            className={`rounded-lg border px-3 py-1.5 text-left text-xs transition ${
              owner === filter.id
                ? "border-emerald-300/45 bg-emerald-400/14 text-emerald-100"
                : "border-slate-800/80 bg-slate-900/42 text-slate-300 hover:border-emerald-400/30 hover:text-slate-100"
            }`}
          >
            <span className="font-semibold">{filter.label}</span>
            <span className="ml-2 text-slate-500">{filter.count}</span>
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-auto pr-1 scrollbar-thin">
        {artifacts.length ? (
          <div className="grid gap-2">
            {artifacts.map((artifact) => (
              <ArtifactCard
                key={artifact.id}
                artifact={artifact}
                ownerLabel={artifactOwnerDisplay(artifact, agents)}
                className="mt-0 bg-slate-950/42"
              />
            ))}
          </div>
        ) : (
          <div className="grid h-full min-h-[180px] place-items-center text-center">
            <div>
              <p className="text-sm font-semibold text-slate-200">{emptyTitle}</p>
              <p className="mt-2 text-xs text-slate-500">{emptyHelp}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function OfficeSidebar({
  agents,
  projects,
  officeSetupSession,
  activeProjectId,
  activeAgent,
  activeVirtualAgent,
  running,
  connection,
  setupActive,
  onSelectAgent,
  onSelectVirtualAgent,
  onProjectChange,
  onCreateProject,
  onOpenSetup
}: {
  agents: AgentProfile[];
  projects: ProjectProfile[];
  officeSetupSession: OfficeSetupSession | null;
  activeProjectId: ProjectId;
  activeAgent: AgentName;
  activeVirtualAgent: VirtualOfficeAgent;
  running: boolean;
  connection: "Local Connected" | "Streaming" | "Error";
  setupActive: boolean;
  onSelectAgent: (agentName: AgentName) => void;
  onSelectVirtualAgent: (agentName: VirtualOfficeAgent) => void;
  onProjectChange: (projectId: ProjectId) => void;
  onCreateProject: (name: string) => void;
  onOpenSetup: () => void;
}) {
  const [creatingProject, setCreatingProject] = useState(false);
  const [projectDraft, setProjectDraft] = useState("");
  const chiefAgentActive = officeSetupSession?.status === "office_active";
  const activeOfficeAgents = chiefAgentActive ? orderedOfficeSetupAgents(officeSetupSession) : [];
  const virtualAgentCount = chiefAgentActive ? Math.max(activeOfficeAgents.length, 1) : 0;
  const onlineAgents = chiefAgentActive ? virtualAgentCount : agents.filter((agent) => agent.status !== "offline").length;
  const totalAgents = chiefAgentActive ? virtualAgentCount : agents.length;
  void connection;

  function submitProjectDraft() {
    const name = projectDraft.trim();
    if (!name) return;
    onCreateProject(name);
    setProjectDraft("");
    setCreatingProject(false);
  }

  return (
    <aside className="frost flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl p-4">
      <section className="shrink-0">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <Bot className="h-4 w-4 text-slate-300" />
            <p className="text-xs font-semibold uppercase text-slate-500">Agent</p>
          </div>
          {totalAgents ? (
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                running ? "bg-sky-400/10 text-sky-200" : "bg-emerald-400/10 text-emerald-200"
              }`}
            >
              {onlineAgents}/{totalAgents}
            </span>
          ) : null}
        </div>
        <div className="space-y-1.5">
          {!chiefAgentActive && agents.length ? agents.map((agent) => {
            const status = sidebarAgentStatus(agent);
            return (
              <button
                key={agent.name}
                type="button"
                onClick={() => onSelectAgent(agent.name)}
                className={`grid w-full min-w-0 grid-cols-[32px_minmax(0,1fr)] items-center gap-2 rounded-lg border px-2 py-2 text-left transition ${
                  activeAgent === agent.name
                    ? "border-sky-300/35 bg-sky-400/10"
                    : "border-transparent bg-slate-950/16 hover:border-slate-800 hover:bg-slate-900/38"
                }`}
              >
                <span className={`grid h-8 w-8 place-items-center rounded-full text-xs font-semibold ${OFFICE_AGENT_AVATAR_CLASS[agent.tone]}`}>
                  {agent.name.slice(0, 1)}
                </span>
                <span className="min-w-0">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-sm font-semibold text-slate-100">{agent.name}</span>
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${status.dot}`} />
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] text-slate-500">{agent.role}</span>
                </span>
              </button>
            );
          }) : (
            <>
              {chiefAgentActive
                ? (activeOfficeAgents.length
                    ? activeOfficeAgents
                    : [
                        {
                          displayName: normalizeHermesAgentName(officeSetupSession.activation.chiefAgentName),
                          role: CHIEF_ROLE_DESCRIPTION,
                          profileName: "default",
                          isChief: true
                        }
                      ]
                  ).map((agent, index) => {
                    const virtualAgentId = virtualAgentIdForOfficeAgent(agent);
                    const tone = officeAgentToneForIndex(activeOfficeAgents.length ? activeOfficeAgents : [agent], index);
                    const agentWorking = running && activeVirtualAgent === virtualAgentId;
                    return (
                      <button
                        key={agent.profileName}
                        type="button"
                        onClick={() => onSelectVirtualAgent(virtualAgentId)}
                        className={`grid w-full min-w-0 grid-cols-[32px_minmax(0,1fr)] items-center gap-2 rounded-lg border px-2 py-2 text-left transition ${
                          activeVirtualAgent === virtualAgentId
                            ? "border-sky-300/35 bg-sky-400/10"
                            : "border-transparent bg-slate-950/16 hover:border-slate-800 hover:bg-slate-900/38"
                        }`}
                        title={agent.isChief ? "Open Chief Agent" : `Open ${agent.displayName}`}
                      >
                        <span className={`grid h-8 w-8 place-items-center rounded-full text-xs font-semibold ${OFFICE_AGENT_AVATAR_CLASS[tone]}`}>
                          {agent.displayName.slice(0, 1).toUpperCase()}
                        </span>
                        <span className="min-w-0">
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="truncate text-sm font-semibold text-slate-100">{agent.displayName}</span>
                            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${agentWorking ? "bg-sky-400" : "bg-emerald-400"}`} />
                          </span>
                          <span className="mt-0.5 block truncate text-[11px] text-slate-500">
                            {normalizeOfficeAgentRole(agent)}
                          </span>
                        </span>
                      </button>
                    );
                  })
                : null}
            </>
          )}
        </div>
      </section>

      <section className="mt-5 flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="mb-2 flex shrink-0 items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <FolderKanban className="h-4 w-4 text-slate-300" />
            <p className="text-xs font-semibold uppercase text-slate-500">Projects</p>
          </div>
        </div>

        <div className="scrollbar-thin min-h-0 flex-1 space-y-0.5 overflow-auto pr-1">
          {creatingProject ? (
            <div className="flex h-8 min-w-0 items-center gap-1 rounded-md bg-slate-950/18 px-2">
              <FolderKanban className="h-4 w-4 shrink-0 text-slate-400" />
              <input
                value={projectDraft}
                onChange={(event) => setProjectDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") submitProjectDraft();
                  if (event.key === "Escape") {
                    setProjectDraft("");
                    setCreatingProject(false);
                  }
                }}
                autoFocus
                placeholder="Project name"
                className="h-7 min-w-0 flex-1 bg-transparent px-1 text-xs font-medium text-slate-100 outline-none placeholder:text-slate-500"
              />
              <button
                type="button"
                onClick={() => {
                  setProjectDraft("");
                  setCreatingProject(false);
                }}
                className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-slate-500 transition hover:bg-slate-900/70 hover:text-slate-100"
                title="Cancel"
              >
                <X className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={submitProjectDraft}
                disabled={!projectDraft.trim()}
                className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-emerald-300 transition hover:bg-emerald-400/12 disabled:cursor-not-allowed disabled:opacity-35"
                title="Create"
              >
                <Check className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setCreatingProject(true)}
              className="flex h-8 w-full min-w-0 items-center gap-2 rounded-md px-2 text-left text-xs font-medium text-slate-300 transition hover:bg-slate-900/45 hover:text-slate-100"
            >
              <Plus className="h-4 w-4 shrink-0 text-slate-400" />
              <span className="truncate">{"\u65B0\u5EFA\u9879\u76EE"}</span>
            </button>
          )}
          {projects.map((project) => (
            <button
              key={project.id}
              type="button"
              onClick={() => onProjectChange(project.id)}
              className={`flex h-9 w-full min-w-0 items-center gap-2 rounded-lg border px-2 text-left text-xs font-medium transition ${
                activeProjectId === project.id
                  ? "border-sky-300/35 bg-sky-400/10 text-slate-100"
                  : "border-transparent text-slate-300 hover:border-slate-800 hover:bg-slate-900/45 hover:text-slate-100"
              }`}
            >
              <FolderKanban className={`h-4 w-4 shrink-0 ${activeProjectId === project.id ? "text-sky-300" : "text-slate-400"}`} />
              <span className="truncate">{project.name}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="mt-4 shrink-0 border-t border-slate-800/80 pt-3">
        <button
          type="button"
          onClick={onOpenSetup}
          className={`grid w-full min-w-0 grid-cols-[28px_minmax(0,1fr)] items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition ${
            setupActive
              ? "border-emerald-300/35 bg-emerald-400/10"
              : "border-transparent bg-slate-950/16 hover:border-slate-800 hover:bg-slate-900/38"
          }`}
        >
          <span className="grid h-7 w-7 place-items-center rounded-md bg-slate-900/70">
            <Settings className="h-3.5 w-3.5 text-slate-400" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-xs font-semibold text-slate-200">Office Setup</span>
            <span className="mt-0.5 block truncate text-[11px] text-slate-500">Providers / Hermes</span>
          </span>
        </button>
      </section>
    </aside>
  );
}

function createEmptyProjectRuntime(projectId: ProjectId): ProjectRuntimeState {
  const setupOnly = isOfficeSetupProjectId(projectId);
  return {
    projectId,
    tasks: projectId === "demo-project" ? initialTasks : [],
    agents: setupOnly ? [] : initialAgents,
    events: [],
    requirement: "",
    planWorkflow: null,
    conversations: emptyConversations(),
    activeConversationAgent: "Lucy",
    planningConversationActive: false,
    pendingArtifacts: []
  };
}

function normalizeProjectRuntime(runtime: ProjectRuntimeState, projectId: ProjectId): ProjectRuntimeState {
  const setupOnly = isOfficeSetupProjectId(projectId);
  if (setupOnly || runtime.agents.length > 0) return runtime;
  return { ...runtime, agents: initialAgents };
}

function createDemoProjectRuntime(): ProjectRuntimeState {
  return {
    projectId: "demo-project",
    tasks: initialTasks,
    agents: initialAgents,
    events: [],
    requirement: "",
    planWorkflow: null,
    conversations: emptyConversations(),
    activeConversationAgent: "Lucy",
    planningConversationActive: false,
    pendingArtifacts: []
  };
}

function clock() {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
    hour12: false
  }).format(new Date());
}

function targetForAction(action: AgentAction): AgentName {
  if (
    action === "submit_requirement_to_planning_agent" ||
    action === "generate_plan_workflow" ||
    action === "execute_selected_tasks" ||
    action === "ask_planning_agent_review" ||
    action === "daily_report"
  ) {
    return "Lucy";
  }
  if (action === "ask_tiger_blog" || action === "ask_tiger_publish") return "Tiger";
  return "Ray";
}

function isStatusPatch(
  item: unknown,
  path: string
): item is { op: string; path: string; value: AgentStatusValue } {
  return (
    typeof item === "object" &&
    item !== null &&
    "path" in item &&
    (item as { path: string }).path === path
  );
}

function isTaskPriority(value: unknown): value is TaskPriority {
  return value === "P0" || value === "P1" || value === "P2" || value === "P3" || value === "P4" || value === "P5" || value === "P6";
}

function isTaskPlanStatus(value: unknown): value is TaskPlanStatus {
  return value === "planned" || value === "selected" || value === "executing" || value === "reviewing" || value === "completed" || value === "blocked" || value === "deferred";
}

function isPatch(item: unknown, path: string): item is { op: string; path: string; value: unknown } {
  return (
    typeof item === "object" &&
    item !== null &&
    "path" in item &&
    (item as { path: string }).path === path
  );
}

function applyStateDelta(tasks: TaskItem[], event: AGUIEvent) {
  if (event.type !== EventType.STATE_DELTA) return tasks;

  return tasks.map((task) => {
    const statusPatch = event.delta.find((item) => isStatusPatch(item, `/tasks/${task.id}/status`));
    const priorityPatch = event.delta.find((item) => isPatch(item, `/tasks/${task.id}/priority`));
    const planStatusPatch = event.delta.find((item) => isPatch(item, `/tasks/${task.id}/planStatus`));
    const priority = priorityPatch && isTaskPriority(priorityPatch.value) ? priorityPatch.value : task.priority;
    const planStatus = planStatusPatch && isTaskPlanStatus(planStatusPatch.value) ? planStatusPatch.value : task.planStatus;

    if (statusPatch) return { ...task, status: statusPatch.value, priority, planStatus };
    if (priority !== task.priority || planStatus !== task.planStatus) return { ...task, priority, planStatus };
    return task;
  });
}

function applyAgentStateDelta(agents: AgentProfile[], event: AGUIEvent) {
  if (event.type !== EventType.STATE_DELTA) return agents;

  return agents.map((agent) => {
    const patch = event.delta.find((item) => isStatusPatch(item, `/agents/${agent.name}/status`));

    return patch ? { ...agent, status: patch.value } : agent;
  });
}

function agentStatusFromPlan(agentName: AgentName, tasks: TaskItem[]): AgentStatusValue | undefined {
  const ownedTasks = tasks.filter((task) => task.owner === agentName);
  if (!ownedTasks.length) return undefined;
  if (ownedTasks.some((task) => task.planStatus === "executing")) {
    if (agentName === "Ray") return "coding";
    if (agentName === "Lucy") return "reviewing";
    return "working";
  }
  return "ready";
}

function applyAgentStatusesFromPlan(agents: AgentProfile[], plan: PlanWorkflow) {
  return agents.map((agent) => {
    const status = agentStatusFromPlan(agent.name, plan.tasks);
    return status ? { ...agent, status } : agent;
  });
}

function replayStateDeltas<T>(items: T, events: ConsoleEvent[] | undefined, apply: (current: T, event: AGUIEvent) => T) {
  if (!events?.length) return items;
  return events.reduce<T>((current, event) => apply(current, event), items);
}

export default function Home() {
  const [projects, setProjects] = useState<ProjectProfile[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [agents, setAgents] = useState<AgentProfile[]>([]);
  const [events, setEvents] = useState<ConsoleEvent[]>([]);
  const [requirement, setRequirement] = useState("");
  const [running, setRunning] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [activeOfficePanel, setActiveOfficePanel] = useState<OfficePanel>(null);
  const [activeSystemView, setActiveSystemView] = useState<SystemView>(null);
  const [officeSetupSession, setOfficeSetupSession] = useState<OfficeSetupSession | null>(null);
  const [setupAssistantMessages, setSetupAssistantMessages] = useState<AgentConversationMessage[]>([]);
  const artifactBackfillAttemptedIdsRef = useRef<Set<string>>(new Set());
  const [setupProviderId, setSetupProviderId] = useState(providerTemplates[1]?.id || providerTemplates[0]?.id || "openai");
  const [providerMenuOpen, setProviderMenuOpen] = useState(false);
  const [setupApiKey, setSetupApiKey] = useState("");
  const [setupCustomBaseUrl, setSetupCustomBaseUrl] = useState("");
  const [setupKeyResult, setSetupKeyResult] = useState<ProviderTestResult | null>(null);
  const [setupKeyChecking, setSetupKeyChecking] = useState(false);
  const [setupHermesBaseUrl, setSetupHermesBaseUrl] = useState(LOCAL_HERMES_PRIMARY_URL);
  const [setupHermesApiKey, setSetupHermesApiKey] = useState("");
  const [setupChiefAgentName, setSetupChiefAgentName] = useState("");
  const activationAgentName = normalizeHermesAgentName(setupChiefAgentName);
  const [setupHermesResult, setSetupHermesResult] = useState<HermesTestResult | null>(null);
  const [setupHermesChecking, setSetupHermesChecking] = useState(false);
  const [localHermesGuideStep, setLocalHermesGuideStep] = useState<LocalHermesGuideStep>("intro");
  const [hermesPromptCopied, setHermesPromptCopied] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [connection, setConnection] = useState<"Local Connected" | "Streaming" | "Error">("Local Connected");
  const [planWorkflow, setPlanWorkflow] = useState<PlanWorkflow | null>(null);
  const [planningConversationActive, setPlanningConversationActive] = useState(false);
  const [conversations, setConversations] = useState<AgentConversations>(() => emptyConversations());
  const [activeProjectId, setActiveProjectId] = useState<ProjectId>(EMPTY_PROJECT_ID);
  const [activeConversationAgent, setActiveConversationAgent] = useState<AgentName>("Lucy");
  const [activeVirtualAgent, setActiveVirtualAgent] = useState<VirtualOfficeAgent>("setup");
  const [pendingArtifacts, setPendingArtifacts] = useState<Artifact[]>([]);
  const [officeArtifacts, setOfficeArtifacts] = useState<Artifact[]>([]);
  const [selectedArtifactOwner, setSelectedArtifactOwner] = useState<ArtifactOwnerFilter>("all");
  const [artifactUploadBusy, setArtifactUploadBusy] = useState(false);
  const [runnerStatus, setRunnerStatus] = useState<RunnerStatus>({ enabled: false, rayWorkspaceWriteEnabled: false });
  const [runtimeHealth, setRuntimeHealth] = useState<LocalRuntimeHealth | null>(null);
  const [runtimeQuickStart, setRuntimeQuickStart] = useState<RuntimeQuickStartState | null>(null);
  const [runtimePreparing, setRuntimePreparing] = useState(false);
  const [officeProfileRuntimes, setOfficeProfileRuntimes] = useState<OfficeProfileRuntime[]>([]);
  const [setupTestMode, setSetupTestMode] = useState(false);
  const [runtimeGuideCompleted, setRuntimeGuideCompleted] = useState(false);
  const [projectRuntimeById, setProjectRuntimeById] = useState<Record<ProjectId, ProjectRuntimeState>>({});
  const [projectStorageLoaded, setProjectStorageLoaded] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  const activeTask = useMemo(() => tasks.find((task) => task.status === "ready") || tasks[0] || null, [tasks]);
  const selectedExecutableTasks = useMemo(
    () => tasks.filter((task) => task.selected && task.planStatus !== "completed" && task.planStatus !== "executing" && task.planStatus !== "reviewing"),
    [tasks]
  );
  const executionDisabledReason = useMemo(() => {
    const hasRayTask = selectedExecutableTasks.some((task) => task.owner === "Ray");
    if (!hasRayTask) return null;
    if (!runnerStatus.enabled) return "Ray runner is disabled. Set AG_UI_ENABLE_CODEX_EXEC=1 and restart the dev server.";
    if (!runnerStatus.rayWorkspaceWriteEnabled) return "Ray write mode is disabled. Set AG_UI_CODEX_WRITE_ACTIONS=1 and restart the dev server.";
    return null;
  }, [runnerStatus.enabled, runnerStatus.rayWorkspaceWriteEnabled, selectedExecutableTasks]);
  const composerRoute = useMemo(() => extractComposerRoute(requirement, activeConversationAgent), [requirement, activeConversationAgent]);
  const officeSetupSummary = useMemo(() => {
    if (!officeSetupSession || officeSetupSession.status === "empty") return null;
    if (officeSetupSession.status === "model_ready") {
      return ["Access: Model provider", "Guide: Vibe Office", "Next: diagnose local Hermes API and access key"].join("\n");
    }
    const chief = officeSetupSession.agents.find((agent) => agent.isChief) || officeSetupSession.agents[0];
    const chiefDisplayName =
      officeSetupSession.status === "activation_review"
        ? activationAgentName || "Unnamed Agent"
        : normalizeHermesAgentName(chief?.displayName || officeSetupSession.activation.chiefAgentName);
    if (officeSetupSession.status === "hermes_ready") {
      return [
        "Hermes connected",
        officeSetupSession.hermesBaseUrl ? `Using: ${officeSetupSession.hermesBaseUrl}` : null,
        "Next: name your Chief Agent"
      ]
        .filter(Boolean)
        .join("\n");
    }

    return [
      "Hermes connected",
      `Chief Agent: ${chiefDisplayName}`,
      officeSetupSession.status === "activation_review" ? "Next: approve activation" : null
    ]
      .filter(Boolean)
      .join("\n");
  }, [activationAgentName, officeSetupSession]);
  const setupIntroMessages = useMemo<AgentConversationMessage[]>(
    () => [
      {
        id: "office-setup-intro",
        role: "agent",
        agentName: "Lucy",
        content: officeSetupSession && officeSetupSession.status !== "empty"
          ? officeSetupSession.status === "office_active"
            ? `Chief Agent is online.\n\n${officeSetupSummary}\n\nYou can now use your office. Vibe Office will still ask before adding more Agents or sharing more files.`
            : officeSetupSession.status === "activation_review" ||
              officeSetupSession.status === "hermes_ready" ||
              (officeSetupSession.status === "office_previewed" && officeSetupSession.userPath === "existing_hermes")
              ? officeSetupSession.status === "hermes_ready"
                ? `Hermes is connected.\n\n${officeSetupSummary}\n\nName the Chief Agent, then review activation.`
                : `Ready to activate.\n\n${officeSetupSummary}\n\nNothing goes online until you approve it.`
              : "Model key accepted. Office guide is ready.\n\nNext, I will help Hermes prepare API access for Vibe Office. Nothing goes online until you approve activation."
          : "Start the guide.\n\nUse a model provider key to connect Hermes and bring your first Chief Agent online.\n\nNothing changes until you approve it."
      }
    ],
    [officeSetupSession, officeSetupSummary]
  );
  const visibleSetupMessages = useMemo(
    () => [
      ...setupIntroMessages,
      ...setupAssistantMessages.map((message) => ({
        ...message,
        content: compactHermesReplyMessage(message.content)
      }))
    ],
    [setupAssistantMessages, setupIntroMessages]
  );
  const chiefOnlyMessages = useMemo(
    () => setupAssistantMessages.filter((message) => message.id.startsWith("chief-")),
    [setupAssistantMessages]
  );
  const displayOfficeSetupSession = useMemo(
    () => completeOfficeSetupSession(officeSetupSession),
    [officeSetupSession]
  );
  const selectedOfficeAgent = useMemo(
    () => findOfficeAgentByVirtualId(displayOfficeSetupSession, activeVirtualAgent),
    [activeVirtualAgent, displayOfficeSetupSession]
  );
  const selectedOfficeProfileName = selectedOfficeAgent?.profileName || "default";
  const selectedOfficeAgentTone = officeAgentToneForProfile(displayOfficeSetupSession, selectedOfficeProfileName);
  const officeProfileRuntimeByName = useMemo(
    () =>
      Object.fromEntries(officeProfileRuntimes.map((profile) => [profile.profileName, profile])) as Record<string, OfficeProfileRuntime | undefined>,
    [officeProfileRuntimes]
  );
  const selectedOfficeProfileRuntime = officeProfileRuntimeByName[selectedOfficeProfileName];
  const selectedOfficeAgentChatDisabledReason = useMemo(() => {
    if (displayOfficeSetupSession?.status !== "office_active") return null;
    if (!selectedOfficeAgent || selectedOfficeAgent.isChief || selectedOfficeAgent.profileName === "default") return null;
    if (!selectedOfficeProfileRuntime) return "Checking this worker profile runtime.";
    if (selectedOfficeProfileRuntime.chatAvailable) return null;
    return selectedOfficeProfileRuntime.message;
  }, [displayOfficeSetupSession?.status, selectedOfficeAgent, selectedOfficeProfileRuntime]);
  const selectedOfficeAgentMessages = useMemo(
    () => setupAssistantMessages.filter((message) => message.id.startsWith(`office-chat-${selectedOfficeProfileName}-`)),
    [selectedOfficeProfileName, setupAssistantMessages]
  );
  const visibleVirtualMessages = useMemo<AgentConversationMessage[]>(() => {
    const hydrate = (messages: AgentConversationMessage[]) => hydrateMessageArtifacts(messages, officeArtifacts);
    if (displayOfficeSetupSession?.status === "office_active") {
      const currentAgent = selectedOfficeAgent || displayOfficeSetupSession.agents.find((agent) => agent.isChief) || displayOfficeSetupSession.agents[0];
      const isChief = currentAgent?.isChief || currentAgent?.profileName === "default";
      return hydrate(isChief && !selectedOfficeAgentMessages.length ? chiefOnlyMessages : selectedOfficeAgentMessages);
    }

    return hydrate(visibleSetupMessages);
  }, [chiefOnlyMessages, displayOfficeSetupSession, officeArtifacts, selectedOfficeAgent, selectedOfficeAgentMessages, visibleSetupMessages]);
  const showingVirtualOfficeConversation = displayOfficeSetupSession?.status === "office_active";
  const phaseOneHermesOnly = displayOfficeSetupSession?.status === "office_active";
  const officeCanvasAgents = useMemo(
    () => officeSetupAgentsForCanvas(displayOfficeSetupSession),
    [displayOfficeSetupSession]
  );
  const outputFilterAgents = useMemo(
    () => (displayOfficeSetupSession?.status === "office_active" ? orderedOfficeSetupAgents(displayOfficeSetupSession) : []),
    [displayOfficeSetupSession]
  );
  const visibleOfficeAgents = phaseOneHermesOnly ? officeCanvasAgents : agents;
  const activeConversationMessages = conversations[activeConversationAgent];
  const hasAnyConversation = hasConversationMessages(conversations);
  const projectOfficeArtifacts = useMemo(
    () =>
      officeArtifacts
        .filter((artifact) => normalizeOfficeProjectId(artifact.projectId) === normalizeOfficeProjectId(activeProjectId) && !artifact.archivedAt)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [activeProjectId, officeArtifacts]
  );
  const visibleActiveConversationMessages = useMemo(() => {
    return hydrateMessageArtifacts(activeConversationMessages, officeArtifacts);
  }, [activeConversationMessages, officeArtifacts]);
  const selectedOwnerArtifacts = useMemo(
    () => projectOfficeArtifacts.filter((artifact) => artifactMatchesOwnerFilter(artifact, selectedArtifactOwner, outputFilterAgents)),
    [outputFilterAgents, projectOfficeArtifacts, selectedArtifactOwner]
  );
  const officeDockCounts = useMemo(
    () => ({
      archive: activeProjectId === "demo-project" ? contextHubOverview.length : 0,
      outputs: projectOfficeArtifacts.length,
      history: events.length
    }),
    [activeProjectId, events.length, projectOfficeArtifacts.length]
  );
  const setupProvider = useMemo(
    () => providerTemplates.find((provider) => provider.id === setupProviderId) || providerTemplates[0],
    [setupProviderId]
  );
  const defaultOfficeTemplate = officeTemplates[0];
  const showInlineModelKeySetup =
    agents.length === 0 && (!officeSetupSession || officeSetupSession.status === "empty");
  const setupAssistantOnline =
    officeSetupSession?.status === "model_ready" ||
    officeSetupSession?.status === "office_previewed" ||
    officeSetupSession?.status === "hermes_ready" ||
    officeSetupSession?.status === "activation_review" ||
    officeSetupSession?.status === "office_active";

  function currentProjectRuntime(): ProjectRuntimeState {
    return {
      projectId: normalizeOfficeProjectId(activeProjectId),
      tasks,
      agents,
      events,
      requirement,
      planWorkflow,
      conversations,
      activeConversationAgent,
      planningConversationActive,
      pendingArtifacts
    };
  }

  function applyProjectRuntime(runtime: ProjectRuntimeState, projectId: ProjectId) {
    const scoped = runtime.projectId === projectId;
    setTasks(runtime.tasks);
    setAgents(runtime.agents);
    setEvents((current) => {
      const restoredOfficeEvents = current.filter(isOfficeChatEvent);
      const runtimeEvents = runtime.events || [];
      if (!officeSetupSession || officeSetupSession.status !== "office_active" || runtimeEvents.length) return runtimeEvents;
      return restoredOfficeEvents;
    });
    setRequirement(runtime.requirement);
    setPlanWorkflow(runtime.planWorkflow);
    setConversations(scoped ? runtime.conversations : emptyConversations());
    setActiveConversationAgent(scoped ? runtime.activeConversationAgent : "Lucy");
    setPlanningConversationActive(scoped ? runtime.planningConversationActive : false);
    setPendingArtifacts(scoped ? runtime.pendingArtifacts : []);
    setConnection("Local Connected");
  }

  function switchProject(nextProjectId: ProjectId) {
    if (nextProjectId === activeProjectId) {
      setActiveSystemView(null);
      setActiveOfficePanel(null);
      return;
    }
    if (running) {
      setNotice({ message: "Wait for the current run to finish before changing projects.", tone: "attention" });
      window.setTimeout(() => setNotice(null), 3600);
      return;
    }

    const currentRuntime = currentProjectRuntime();
    const nextRuntime = normalizeProjectRuntime(
      projectRuntimeById[nextProjectId] || createEmptyProjectRuntime(nextProjectId),
      nextProjectId
    );
    setProjectRuntimeById((current) => ({
      ...current,
      [activeProjectId]: currentRuntime,
      [nextProjectId]: current[nextProjectId] ? normalizeProjectRuntime(current[nextProjectId], nextProjectId) : nextRuntime
    }));
    setActiveProjectId(nextProjectId);
    applyProjectRuntime(nextRuntime, nextProjectId);
    setActiveOfficePanel(null);
    setActiveSystemView(null);
  }

  function createProject(name: string) {
    if (running) {
      setNotice({ message: "Wait for the current run to finish before changing projects.", tone: "attention" });
      window.setTimeout(() => setNotice(null), 3600);
      return;
    }

    const cleanName = name.trim();
    if (!cleanName) return;

    const project: ProjectProfile = {
      id: `project-${Date.now().toString(36)}`,
      name: cleanName,
      mode: "Default Project",
      description: "Project workspace for conversations, materials, and outputs.",
      createdAt: new Date().toISOString()
    };
    const emptyRuntime = createEmptyProjectRuntime(project.id);

    setProjects((current) => [...current, project]);
    setProjectRuntimeById((current) => ({
      ...current,
      [activeProjectId]: currentProjectRuntime(),
      [project.id]: emptyRuntime
    }));
    setActiveProjectId(project.id);
    applyProjectRuntime(emptyRuntime, project.id);
    setActiveOfficePanel(null);
    setActiveSystemView(null);
    setNotice({ message: `Opened project: ${project.name}`, tone: "success" });
    window.setTimeout(() => setNotice(null), 3200);
  }

  function ensureOfficeSetupProject() {
    setProjects((current) => {
      if (current.some((project) => project.id === OFFICE_SETUP_PROJECT_ID)) return current;
      return [
        ...current,
        {
          id: OFFICE_SETUP_PROJECT_ID,
          name: "Setup your office",
          mode: "Onboarding",
          description: "Connect the local Hermes framework, then activate the first Chief Agent.",
          createdAt: new Date().toISOString()
        }
      ];
    });
    setProjectRuntimeById((current) => ({
      ...current,
      [OFFICE_SETUP_PROJECT_ID]: current[OFFICE_SETUP_PROJECT_ID] || createEmptyProjectRuntime(OFFICE_SETUP_PROJECT_ID)
    }));
    setActiveProjectId((current) => (current === EMPTY_PROJECT_ID ? OFFICE_SETUP_PROJECT_ID : current));
  }

  function ensureDefaultProject() {
    const defaultProject = defaultOfficeProject();
    setProjects((current) => {
      if (current.some((project) => project.id === DEFAULT_PROJECT_ID)) return current;
      return [defaultProject, ...current];
    });
    setProjectRuntimeById((current) => {
      if (current[DEFAULT_PROJECT_ID]) return current;
      return {
        ...current,
        [DEFAULT_PROJECT_ID]: createEmptyProjectRuntime(DEFAULT_PROJECT_ID)
      };
    });
    setActiveProjectId((current) => (isOfficeSetupProjectId(current) ? DEFAULT_PROJECT_ID : current));
  }

  function openExistingAgentTeam() {
    const demoRuntime = createDemoProjectRuntime();
    setProjects((current) => {
      const byId = new Map(current.map((project) => [project.id, project]));
      for (const project of initialProjects) {
        byId.set(project.id, byId.get(project.id) || project);
      }
      return Array.from(byId.values());
    });
    setProjectRuntimeById((current) => ({
      ...current,
      [activeProjectId]: currentProjectRuntime(),
      "demo-project": demoRuntime
    }));
    setActiveProjectId("demo-project");
    applyProjectRuntime(demoRuntime, "demo-project");
    setActiveSystemView(null);
    setActiveOfficePanel(null);
    setPlanningConversationActive(true);
    setNotice({ message: "Opened existing Agent team.", tone: "success" });
    window.setTimeout(() => setNotice(null), 3200);
  }

  const handleOfficeSetupSaved = useCallback((session: OfficeSetupSession | null, options?: { close?: boolean }) => {
    setOfficeSetupSession(session);

    if (options?.close) {
      setActiveSystemView(null);
      setActiveOfficePanel(null);
      setPlanningConversationActive(false);
      setRequirement("");
      setPendingArtifacts([]);
    }

    if (!session || session.status === "empty") return;

    if (session.status === "office_active") {
      const defaultProject = defaultOfficeProject();
      setProjects((current) => {
        if (current.some((project) => project.id === DEFAULT_PROJECT_ID)) return current;
        return [defaultProject, ...current];
      });
      setProjectRuntimeById((current) => ({
        ...current,
        [DEFAULT_PROJECT_ID]: current[DEFAULT_PROJECT_ID] || createEmptyProjectRuntime(DEFAULT_PROJECT_ID)
      }));
      setActiveProjectId((current) => (isOfficeSetupProjectId(current) ? DEFAULT_PROJECT_ID : current));
    }

    const message =
      session.status === "office_active"
        ? "Chief Agent is active."
        : session.status === "activation_review"
          ? "Activation review is ready."
          : session.status === "hermes_ready"
            ? "Hermes is connected."
            : session.status === "office_previewed"
              ? session.userPath === "model_key_only"
                ? "Office guide is ready."
                : "Office preview is ready."
              : "Model access is ready.";

    setNotice({ message, tone: "success" });
    window.setTimeout(() => setNotice(null), 3200);
  }, []);

  const handleOfficeTemplateChange = useCallback((templateId: string) => {
    const template = officeTemplates.find((item) => item.id === templateId);
    if (!template) return;

    setOfficeSetupSession((current) => {
      if (!current) return current;
      const nextSession: OfficeSetupSession = {
        ...current,
        officeTemplateId: template.id,
        officeTemplateName: template.name,
        savedAt: new Date().toISOString()
      };
      window.localStorage.setItem(OFFICE_SETUP_SESSION_STORAGE_KEY, JSON.stringify(nextSession));
      return nextSession;
    });
  }, []);

  const openRuntimeChiefAgent = useCallback((sessionOverride?: OfficeSetupSession) => {
    const sourceSession = sessionOverride || officeSetupSession;
    const template = defaultOfficeTemplate || {
      id: "default-product-team",
      name: "Product Team"
    };
    const chiefAgentName = normalizeHermesAgentName(sourceSession?.activation.chiefAgentName || "Chief");
    const existingAgents = sourceSession?.agents?.length
      ? sourceSession.agents
      : [
          {
            displayName: chiefAgentName,
            role: CHIEF_ROLE_DESCRIPTION,
            profileName: "default",
            isChief: true
          }
        ];
    const session: OfficeSetupSession = {
      ...(sourceSession || {}),
      savedAt: new Date().toISOString(),
      status: "office_active",
      userPath: sourceSession?.userPath || "existing_hermes",
      mode: sourceSession?.mode || "connect_existing",
      hermesBaseUrl: sourceSession?.hermesBaseUrl || LOCAL_HERMES_PRIMARY_URL,
      officeTemplateId: sourceSession?.officeTemplateId || template.id,
      officeTemplateName: sourceSession?.officeTemplateName || template.name,
      agents: existingAgents,
      activation: {
        ...(sourceSession?.activation || {}),
        chiefAgentName,
        allowProfileCreation: sourceSession?.activation.allowProfileCreation ?? true,
        allowContextSharing: sourceSession?.activation.allowContextSharing ?? true,
        confirmedAt: new Date().toISOString()
      }
    };

    window.localStorage.setItem(OFFICE_SETUP_SESSION_STORAGE_KEY, JSON.stringify(session));
    window.localStorage.setItem(RUNTIME_GUIDE_COMPLETED_STORAGE_KEY, "1");
    setRuntimeGuideCompleted(true);
    handleOfficeSetupSaved(session);
    setSetupChiefAgentName(chiefAgentName);
    setActiveVirtualAgent("hermes");
    setActiveSystemView(null);
    setActiveOfficePanel(null);
    setPlanningConversationActive(true);
    setRequirement("");
  }, [defaultOfficeTemplate, handleOfficeSetupSaved, officeSetupSession]);

  function buildInlineModelReadySession(result: ProviderTestResult): OfficeSetupSession {
    const template = defaultOfficeTemplate || {
      id: "default-product-team",
      name: "Product Team",
      description: "",
      agents: []
    };

    return {
      savedAt: new Date().toISOString(),
      status: "model_ready",
      userPath: "model_key_only",
      mode: "dry_run",
      providerId: setupProviderId,
      providerName: result.providerName || setupProvider?.name,
      officeTemplateId: template.id,
      officeTemplateName: template.name,
      agents: [
        {
          displayName: "Office Guide",
          role: "Guided onboarding conversation",
          profileName: "setup-assistant",
          isChief: true
        }
      ],
      activation: {
        chiefAgentName: "Chief",
        allowProfileCreation: false,
        allowContextSharing: false
      }
    };
  }

  async function checkModelKeyInConversation() {
    const cleanKey = setupApiKey.trim();
    if (!cleanKey) {
      setSetupKeyResult({
        ok: false,
        providerId: setupProviderId,
        providerName: setupProvider?.name,
        message: "Enter your model API key first."
      });
      return;
    }

    setSetupKeyChecking(true);
    setSetupKeyResult(null);

    try {
      const response = await fetch("/api/provision/provider/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          providerId: setupProviderId,
          apiKey: cleanKey,
          apiBaseUrl: setupProviderId === "custom-openai" ? setupCustomBaseUrl : undefined,
          model: setupProvider?.defaultModel
        })
      });
      const result = (await response.json()) as ProviderTestResult;
      setSetupKeyResult(result);

      if (!response.ok || !result.ok) return;

      const savedInputs: SavedOfficeSetupInputs = {
        userPath: "model_key_only",
        providerId: setupProviderId,
        officeTemplateId: defaultOfficeTemplate?.id || "default-product-team",
        customBaseUrl: setupCustomBaseUrl
      };
      const savedSecrets: SavedOfficeSetupSecrets = {
        apiKey: cleanKey
      };
      const session = buildInlineModelReadySession(result);

      window.localStorage.setItem(OFFICE_SETUP_INPUTS_STORAGE_KEY, JSON.stringify(savedInputs));
      window.sessionStorage.setItem(OFFICE_SETUP_SECRETS_STORAGE_KEY, JSON.stringify(savedSecrets));
      window.localStorage.setItem(OFFICE_SETUP_SESSION_STORAGE_KEY, JSON.stringify(session));
      setSetupHermesBaseUrl(LOCAL_HERMES_PRIMARY_URL);
      setSetupHermesResult(null);
      setLocalHermesGuideStep("ask_hermes_enable_api");
      handleOfficeSetupSaved(session);
      setSetupAssistantMessages((current) => [
        ...current,
        {
          id: `setup-ready-${Date.now()}`,
          role: "agent",
          agentName: "Lucy",
          content:
            "Office guide is ready.\n\nOpen Hermes and send it the message below. Then paste Hermes' reply here. I will read the Base URL, key, and network notes for you."
        }
      ]);
    } catch (error) {
      setSetupKeyResult({
        ok: false,
        providerId: setupProviderId,
        providerName: setupProvider?.name,
        message: error instanceof Error ? error.message : "Could not check this model key."
      });
    } finally {
      setSetupKeyChecking(false);
    }
  }

  function resetModelKeyInConversation() {
    resetOfficeSetupState({ includeProjects: false });
    setNotice({ message: "Model key setup was reset.", tone: "attention" });
    window.setTimeout(() => setNotice(null), 2600);
  }

  function resetOfficeSetupState({ includeProjects }: { includeProjects: boolean }) {
    [
      OFFICE_SETUP_INPUTS_STORAGE_KEY,
      OFFICE_SETUP_SESSION_STORAGE_KEY,
      OFFICE_CHAT_MESSAGES_STORAGE_KEY,
      OFFICE_CHAT_EVENTS_STORAGE_KEY,
      LEGACY_OFFICE_DRAFT_STORAGE_KEY,
      ...(includeProjects
        ? [PROJECTS_STORAGE_KEY, PROJECT_RUNTIME_STORAGE_KEY, ACTIVE_PROJECT_STORAGE_KEY, RUNTIME_GUIDE_COMPLETED_STORAGE_KEY, MODEL_KEY_VERIFIED_STORAGE_KEY]
        : [])
    ].forEach((key) => window.localStorage.removeItem(key));
    window.sessionStorage.removeItem(OFFICE_SETUP_SECRETS_STORAGE_KEY);

    if (includeProjects) {
      setProjects([]);
      setTasks([]);
      setAgents([]);
      setEvents([]);
      setPlanWorkflow(null);
      setConversations(emptyConversations());
      setActiveProjectId(EMPTY_PROJECT_ID);
      setProjectRuntimeById({});
      setPendingArtifacts([]);
      setOfficeArtifacts([]);
      setRuntimeGuideCompleted(false);
    }

    setOfficeSetupSession(null);
    setSetupAssistantMessages([]);
    setSetupKeyResult(null);
    setSetupApiKey("");
    setSetupCustomBaseUrl("");
    setSetupHermesBaseUrl(LOCAL_HERMES_PRIMARY_URL);
    setSetupHermesApiKey("");
    setSetupChiefAgentName("");
    setSetupHermesResult(null);
    setSetupKeyChecking(false);
    setSetupHermesChecking(false);
    setLocalHermesGuideStep("intro");
    setHermesPromptCopied(false);
    setRequirement("");
    setRunning(false);
    setConnection("Local Connected");
    setActiveSystemView(null);
    setActiveOfficePanel(null);
    setActiveConversationAgent("Lucy");
    setActiveVirtualAgent("setup");
    setPlanningConversationActive(false);
  }

  function buildInlineHermesReadySession(result: HermesTestResult): OfficeSetupSession {
    const template = defaultOfficeTemplate || {
      id: "default-product-team",
      name: "Product Team",
      description: "",
      agents: []
    };
    const chiefName = setupChiefAgentName.trim() || "Chief";

    return {
      savedAt: new Date().toISOString(),
      status: "hermes_ready",
      userPath: "existing_hermes",
      mode: result.canCreateProfiles ? "create_profiles_from_existing" : "connect_existing",
      providerId: officeSetupSession?.providerId || setupProviderId,
      providerName: officeSetupSession?.providerName || setupProvider?.name,
      hermesBaseUrl: result.baseUrl || setupHermesBaseUrl.trim(),
      officeTemplateId: officeSetupSession?.officeTemplateId || template.id,
      officeTemplateName: officeSetupSession?.officeTemplateName || template.name,
      agents: [
        {
          displayName: chiefName,
          role: CHIEF_ROLE_DESCRIPTION,
          profileName: "existing-hermes-chief",
          isChief: true
        }
      ],
      activation: {
        chiefAgentName: chiefName,
        allowProfileCreation: result.canCreateProfiles,
        allowContextSharing: false
      }
    };
  }

  async function checkExistingHermesInConversation(options?: {
    baseUrl?: string;
    apiKey?: string;
    keepGuideOnUnreachable?: boolean;
  }) {
    const cleanBaseUrl = (options?.baseUrl || setupHermesBaseUrl).trim();
    const cleanHermesApiKey = options?.apiKey ?? setupHermesApiKey;
    if (!cleanBaseUrl) {
      setSetupHermesResult({
        ok: false,
        baseUrl: "",
        models: [],
        canCreateProfiles: false,
        message: "Enter your Hermes Agent address first.",
        notes: [],
        diagnosticCode: "missing_base_url",
        nextSteps: [
          "Use the default local address: http://127.0.0.1:8642/v1.",
          "If needed, try http://localhost:8642/v1.",
          "Then run Diagnose local Hermes."
        ]
      });
      return;
    }

    setSetupHermesChecking(true);
    setSetupHermesResult(null);

    try {
      const response = await fetch("/api/provision/hermes/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          baseUrl: cleanBaseUrl,
          apiKey: cleanHermesApiKey
        })
      });
      const result = (await response.json()) as HermesTestResult;
      setSetupHermesResult(result);

      if (!response.ok || !result.ok) {
        if (result.diagnosticCode === "api_unreachable") {
          setLocalHermesGuideStep(options?.keepGuideOnUnreachable ? "wait_for_hermes_key" : "ask_hermes_enable_api");
        }
        if (result.diagnosticCode === "api_reachable_key_required" || result.diagnosticCode === "unauthorized_key") {
          setLocalHermesGuideStep("wait_for_hermes_key");
        }
        if (result.diagnosticCode === "responses_unavailable") setLocalHermesGuideStep("responses_help");
        return;
      }

      const savedInputs: SavedOfficeSetupInputs = {
        userPath: "existing_hermes",
        providerId: officeSetupSession?.providerId || setupProviderId,
        officeTemplateId: officeSetupSession?.officeTemplateId || defaultOfficeTemplate?.id || "default-product-team",
        customBaseUrl: setupCustomBaseUrl,
        hermesBaseUrl: result.baseUrl || cleanBaseUrl,
        chiefAgentName: setupChiefAgentName.trim() || "Chief"
      };
      const savedSecrets: SavedOfficeSetupSecrets = {
        apiKey: JSON.parse(window.sessionStorage.getItem(OFFICE_SETUP_SECRETS_STORAGE_KEY) || "null")?.apiKey,
        hermesApiKey: cleanHermesApiKey
      };
      const session = buildInlineHermesReadySession(result);

      setLocalHermesGuideStep("ready");
      window.localStorage.setItem(OFFICE_SETUP_INPUTS_STORAGE_KEY, JSON.stringify(savedInputs));
      window.sessionStorage.setItem(OFFICE_SETUP_SECRETS_STORAGE_KEY, JSON.stringify(savedSecrets));
      window.localStorage.setItem(OFFICE_SETUP_SESSION_STORAGE_KEY, JSON.stringify(session));
      handleOfficeSetupSaved(session);
      setSetupAssistantMessages((current) => [
        ...current,
        {
          id: `hermes-ready-${Date.now()}`,
          role: "agent",
          agentName: "Lucy",
          content: "Hermes is connected. Name your Chief Agent next."
        }
      ]);
    } catch (error) {
      setLocalHermesGuideStep(options?.keepGuideOnUnreachable ? "wait_for_hermes_key" : "ask_hermes_enable_api");
      setSetupHermesResult({
        ok: false,
        baseUrl: cleanBaseUrl,
        models: [],
        canCreateProfiles: false,
        message: error instanceof Error ? error.message : "Could not check this Hermes Agent.",
        diagnosticCode: "api_unreachable",
        notes: ["No Chief Agent was connected."],
        nextSteps: [
          "Open Hermes on this computer.",
          "Ask Hermes to enable its API server.",
          "Ask Hermes to generate API_SERVER_KEY if needed.",
          "Hermes may restart the gateway and disconnect for about 10 seconds.",
          "Return here and run Diagnose local Hermes again."
        ]
      });
    } finally {
      setSetupHermesChecking(false);
    }
  }

  async function diagnoseHermesWithoutKeyInConversation() {
    const cleanBaseUrl = setupHermesBaseUrl.trim() || LOCAL_HERMES_PRIMARY_URL;
    const candidateBaseUrls = Array.from(
      new Set(
        [
          cleanBaseUrl,
          cleanBaseUrl === LOCAL_HERMES_PRIMARY_URL ? LOCAL_HERMES_BACKUP_URL : LOCAL_HERMES_PRIMARY_URL
        ].filter(Boolean)
      )
    );

    setSetupHermesChecking(true);
    setSetupHermesApiKey("");
    setSetupHermesResult(null);

    try {
      const checkedResults: HermesTestResult[] = [];
      for (const baseUrl of candidateBaseUrls) {
        const response = await fetch("/api/provision/hermes/test", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            baseUrl,
            apiKey: ""
          })
        });
        const result = (await response.json()) as HermesTestResult;
        checkedResults.push(result);
        if (result.diagnosticCode !== "api_unreachable") break;
      }

      const reachableResult = checkedResults.find((result) => result.diagnosticCode !== "api_unreachable");
      const result =
        reachableResult ||
        ({
          ...checkedResults[0],
          checkedEndpoints: checkedResults.flatMap((item) => item.checkedEndpoints || []),
          message: "Hermes framework may be installed, but API is not reachable on the default local addresses.",
          nextSteps: [
            "Open Hermes on this computer.",
            "Ask Hermes to enable its API server.",
            "Ask Hermes to generate API_SERVER_KEY if needed.",
            "Hermes may restart the gateway and disconnect for about 10 seconds.",
            "Return here and run Diagnose local Hermes again."
          ]
        } satisfies HermesTestResult);

      setSetupHermesBaseUrl(result.baseUrl || cleanBaseUrl);
      setSetupHermesResult(result);
      setLocalHermesGuideStep(
        result.diagnosticCode === "api_reachable_key_required" ? "wait_for_hermes_key" : "ask_hermes_enable_api"
      );
      setSetupAssistantMessages((current) => [
        ...current,
        {
          id: `hermes-key-help-${Date.now()}`,
          role: "agent",
          agentName: "Lucy",
          content:
            result.diagnosticCode === "api_reachable_key_required"
              ? "Hermes API is running, but an access key is required.\n\nAsk Hermes to give you API_SERVER_KEY, then paste that key here. Do not paste your model provider key."
              : "Hermes framework may be installed, but API is not reachable on the default local addresses.\n\nOpen Hermes and ask it to enable its API server, generate API_SERVER_KEY if needed, restart the gateway, and give you the key.\n\nHermes may disconnect for about 10 seconds during restart."
        }
      ]);
    } catch (error) {
      setLocalHermesGuideStep("ask_hermes_enable_api");
      setSetupHermesResult({
        ok: false,
        baseUrl: cleanBaseUrl,
        models: [],
        canCreateProfiles: false,
        diagnosticCode: "api_unreachable",
        message: "Hermes framework may be installed, but API is not reachable.",
        notes: ["No Chief Agent was connected."],
        nextSteps: [
          "Start Hermes on this computer.",
          "Ask Hermes to enable its API server.",
          "Ask Hermes to generate API_SERVER_KEY if needed.",
          "Hermes may restart the gateway and disconnect for about 10 seconds.",
          "Return here and run Diagnose local Hermes again."
        ]
      });
    } finally {
      setSetupHermesChecking(false);
    }
  }

  async function sendSetupAgentPrompt(message: string) {
    const userMessageId = `setup-user-${Date.now()}`;
    const assistantMessageId = `setup-assistant-${Date.now()}`;
    setSetupAssistantMessages((current) => [
      ...current,
      {
        id: userMessageId,
        role: "user",
        content: message
      },
      {
        id: assistantMessageId,
        role: "agent",
        agentName: "Office Guide",
        content: ""
      }
    ]);
    setRequirement("");
    setRunning(true);
    setNotice(null);
    setConnection("Streaming");

    try {
      const saved = JSON.parse(window.localStorage.getItem(OFFICE_SETUP_INPUTS_STORAGE_KEY) || "null") as SavedOfficeSetupInputs | null;
      const savedSecrets = JSON.parse(window.sessionStorage.getItem(OFFICE_SETUP_SECRETS_STORAGE_KEY) || "null") as SavedOfficeSetupSecrets | null;
      const response = await fetch("/api/provision/setup-assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          providerId: saved?.providerId || officeSetupSession?.providerId,
          apiKey: savedSecrets?.apiKey,
          apiBaseUrl: saved?.customBaseUrl,
          officeTemplateId: saved?.officeTemplateId || officeSetupSession?.officeTemplateId,
          userPath: officeSetupSession?.userPath,
          status: officeSetupSession?.status,
          hermesBaseUrl: officeSetupSession?.hermesBaseUrl || setupHermesBaseUrl.trim(),
          chiefAgentName: officeSetupSession?.activation.chiefAgentName || setupChiefAgentName.trim(),
          allowProfileCreation: officeSetupSession?.activation.allowProfileCreation,
          allowContextSharing: officeSetupSession?.activation.allowContextSharing,
          message
        })
      });
      const result = (await response.json()) as SetupAssistantResponse;
      setSetupAssistantMessages((current) =>
        current.map((item) =>
          item.id === assistantMessageId
            ? {
                ...item,
                content:
                  result.message ||
                  "I can continue setup here. Tell me whether you already have Hermes running, or whether you want Vibe Office to prepare a local installation."
              }
            : item
        )
      );
    } catch (error) {
      setSetupAssistantMessages((current) =>
        current.map((item) =>
          item.id === assistantMessageId
            ? {
                ...item,
                content:
                  error instanceof Error
                    ? `I could not reach the office guide service yet: ${error.message}\n\nYou can still continue by telling me whether you already have Hermes running or want Vibe Office to prepare a local installation.`
                    : "I could not reach the office guide service yet. Tell me whether you already have Hermes running or want Vibe Office to prepare a local installation."
              }
            : item
        )
      );
    } finally {
      setRunning(false);
      setConnection("Local Connected");
    }
  }

  async function submitSetupAssistantMessage() {
    const message = requirement.trim() || "Help me continue setup.";
    if (message && handleUnsafeRemoteAccessReply(message)) return;
    if (message && handleSshTunnelErrorMessage(message)) return;
    if (message && handleHermesProvisioningReply(message)) return;
    if (message && handleHermesKeyOnlyMessage(message)) return;
    await sendSetupAgentPrompt(message);
  }

  function handleUnsafeRemoteAccessReply(message: string) {
    const parsed = parseUnsafeRemoteAccessReply(message);
    if (!parsed) return false;

    setSetupHermesResult(null);
    setSetupAssistantMessages((current) => [
      ...current,
      {
        id: `setup-user-${Date.now()}`,
        role: "user",
        content: "Hermes remote access reply pasted."
      },
      {
        id: `setup-remote-access-${Date.now()}`,
        role: "agent",
        agentName: "Lucy",
        content: [
          parsed.containsPrivateKey ? "Do not paste or decode private keys here." : null,
          parsed.containsCloudBlock ? `Cloud firewall is blocking port ${parsed.apiPort}.` : null,
          parsed.baseUrl ? `Target: ${parsed.baseUrl}` : null,
          `Next: open TCP ${parsed.apiPort} only for this Vibe Office machine, or ask Hermes for a no-private-key tunnel option.`
        ]
          .filter(Boolean)
          .join("\n")
      }
    ]);
    setRequirement("");
    setNotice({ message: "Remote access needs firewall setup.", tone: "attention" });
    window.setTimeout(() => setNotice(null), 4200);
    return true;
  }

  function handleSshTunnelErrorMessage(message: string) {
    const parsed = parseSshTunnelError(message);
    if (!parsed) return false;

    setSetupHermesResult(null);
    setSetupAssistantMessages((current) => [
      ...current,
      {
        id: `setup-user-${Date.now()}`,
        role: "user",
        content: "SSH tunnel failed."
      },
      {
        id: `setup-ssh-error-${Date.now()}`,
        role: "agent",
        agentName: "Lucy",
        content: [
          "SSH tunnel did not start.",
          `${parsed.host}:${parsed.port} - ${parsed.reason}`,
          "Next: check VPN, server address, SSH port, or ask Hermes for a reachable client option."
        ].join("\n")
      }
    ]);
    setRequirement("");
    setNotice({ message: "SSH tunnel failed.", tone: "attention" });
    window.setTimeout(() => setNotice(null), 3600);
    return true;
  }

  function handleHermesKeyOnlyMessage(message: string) {
    const setupHasStarted = Boolean(officeSetupSession && officeSetupSession.status !== "empty");
    const canAcceptHermesKey =
      setupHasStarted &&
      (officeSetupSession?.status === "model_ready" ||
        officeSetupSession?.status === "activation_review" ||
        officeSetupSession?.status === "hermes_ready" ||
        Boolean(setupHermesResult));
    if (!canAcceptHermesKey) return false;
    const key = extractKeyOnlyMessage(message);
    if (!key) return false;

    const baseUrl = setupHermesBaseUrl.trim() || LOCAL_HERMES_PRIMARY_URL;
    setSetupHermesApiKey(key);
    const savedSecrets = JSON.parse(window.sessionStorage.getItem(OFFICE_SETUP_SECRETS_STORAGE_KEY) || "null") as SavedOfficeSetupSecrets | null;
    window.sessionStorage.setItem(
      OFFICE_SETUP_SECRETS_STORAGE_KEY,
      JSON.stringify({
        ...savedSecrets,
        hermesApiKey: key
      })
    );

    setLocalHermesGuideStep("wait_for_hermes_key");
    setSetupHermesResult(null);
    setSetupAssistantMessages((current) => [
      ...current,
      {
        id: `setup-user-${Date.now()}`,
        role: "user",
        content: "Hermes key pasted."
      },
      {
        id: `setup-hermes-key-${Date.now()}`,
        role: "agent",
        agentName: "Lucy",
        content: `Key saved.\nUsing: ${baseUrl}\nTesting now.`
      }
    ]);
    setRequirement("");
    window.setTimeout(() => {
      void checkExistingHermesInConversation({
        baseUrl,
        apiKey: key,
        keepGuideOnUnreachable: true
      });
    }, 100);
    return true;
  }

  function handleHermesProvisioningReply(message: string) {
    const parsed = parseHermesProvisioningReply(message);
    if (!parsed) return false;

    const baseUrl = parsed.baseUrl || setupHermesBaseUrl.trim() || LOCAL_HERMES_PRIMARY_URL;
    if (parsed.apiKey) {
      setSetupHermesApiKey(parsed.apiKey);
      const savedSecrets = JSON.parse(window.sessionStorage.getItem(OFFICE_SETUP_SECRETS_STORAGE_KEY) || "null") as SavedOfficeSetupSecrets | null;
      window.sessionStorage.setItem(
        OFFICE_SETUP_SECRETS_STORAGE_KEY,
        JSON.stringify({
          ...savedSecrets,
          hermesApiKey: parsed.apiKey
        })
      );
    }
    if (baseUrl) {
      setSetupHermesBaseUrl(baseUrl);
      const savedInputs = JSON.parse(window.localStorage.getItem(OFFICE_SETUP_INPUTS_STORAGE_KEY) || "null") as SavedOfficeSetupInputs | null;
      window.localStorage.setItem(
        OFFICE_SETUP_INPUTS_STORAGE_KEY,
        JSON.stringify({
          ...savedInputs,
          hermesBaseUrl: baseUrl
        })
      );
    }

    const nextLines = parsed.apiKey
      ? [
          parsed.sshCommand ? "Tunnel required." : "Hermes reply received.",
          parsed.sshCommand ? parsed.sshCommand : null,
          parsed.sshCommand ? `Using: ${baseUrl}` : null,
          parsed.sshCommand ? "Key saved. Testing after the tunnel is open." : "Testing Hermes now."
        ].filter(Boolean)
      : [
          "Hermes reply received.",
          `Using: ${baseUrl}`,
          "Paste the Hermes key next."
        ];

    setLocalHermesGuideStep(parsed.apiKey ? "wait_for_hermes_key" : "ask_hermes_enable_api");
    setSetupHermesResult(null);
    setSetupAssistantMessages((current) => [
      ...current,
      {
        id: `setup-user-${Date.now()}`,
        role: "user",
        content: "Hermes reply pasted."
      },
      {
        id: `setup-hermes-reply-${Date.now()}`,
        role: "agent",
        agentName: "Lucy",
        content: nextLines.join("\n")
      }
    ]);
    setRequirement("");
    setNotice({ message: "Hermes reply parsed.", tone: "success" });
    window.setTimeout(() => setNotice(null), 2600);
    if (parsed.apiKey) {
      window.setTimeout(() => {
        void checkExistingHermesInConversation({
          baseUrl,
          apiKey: parsed.apiKey,
          keepGuideOnUnreachable: Boolean(parsed.sshCommand)
        });
      }, 100);
    }
    return true;
  }

  async function sendOfficeAgentPrompt(message: string) {
    if (!officeSetupSession || officeSetupSession.status !== "office_active") return;
    const attachments = pendingArtifacts;
    const activeOfficeSession = displayOfficeSetupSession || completeOfficeSetupSession(officeSetupSession) || officeSetupSession;
    const currentOfficeProject =
      projects.find((project) => normalizeOfficeProjectId(project.id) === normalizeOfficeProjectId(activeProjectId)) || defaultOfficeProject();

    const activeAgent =
      selectedOfficeAgent ||
      activeOfficeSession.agents.find((agent) => agent.isChief) ||
      activeOfficeSession.agents[0] || {
        displayName: normalizeHermesAgentName(officeSetupSession.activation.chiefAgentName),
        role: CHIEF_ROLE_DESCRIPTION,
        profileName: "default",
        isChief: true
      };
    const profileName = activeAgent.profileName || "default";
    const displayName = normalizeHermesAgentName(activeAgent.displayName);
    const roleLabel = activeAgent.isChief ? "Chief Agent" : activeAgent.role || "Worker Agent";
    const runtimeState = officeProfileRuntimeByName[profileName];
    if (!activeAgent.isChief && profileName !== "default" && runtimeState && !runtimeState.chatAvailable) {
      setNotice({
        tone: "attention",
        message: runtimeState.message
      });
      window.setTimeout(() => setNotice(null), 4200);
      return;
    }

    const messageBaseId = `office-chat-${profileName}-${Date.now()}`;
    const userMessageId = `${messageBaseId}-user`;
    const assistantMessageId = `${messageBaseId}-agent`;

    addEvent({
      type: EventType.CUSTOM,
      name: "office_agent_message",
      value: {
        phase: "send",
        profileName,
        displayName,
        role: roleLabel,
        message,
        attachments: attachments.map((artifact) => ({
          id: artifact.id,
          title: artifact.title,
          type: artifact.type
        }))
      }
    } as AGUIEvent);

    setSetupAssistantMessages((current) => [
      ...current,
      {
        id: userMessageId,
        role: "user",
        content: message,
        artifacts: attachments
      },
      {
        id: assistantMessageId,
        role: "agent",
        agentName: displayName,
        content: ""
      }
    ]);
    setRequirement("");
    setPendingArtifacts([]);
    setRunning(true);
    setNotice(null);
    setConnection("Streaming");

    try {
      const savedSecrets = JSON.parse(window.sessionStorage.getItem(OFFICE_SETUP_SECRETS_STORAGE_KEY) || "null") as SavedOfficeSetupSecrets | null;
      const response = await fetch("/api/provision/hermes/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          baseUrl: officeSetupSession.hermesBaseUrl || LOCAL_HERMES_PRIMARY_URL,
          apiKey: savedSecrets?.hermesApiKey,
          chiefAgentName: normalizeHermesAgentName(officeSetupSession.activation.chiefAgentName),
          displayName,
          role: roleLabel,
          profileName,
          officeContext: buildOfficeChatContext(activeOfficeSession, activeAgent, currentOfficeProject),
          conversation: `vibe-office-${profileName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
          history: selectedOfficeAgentMessages
            .filter((item) => item.content.trim())
            .slice(-12)
            .map((item) => ({
              role: item.role === "user" ? "user" : "assistant",
              content: item.content
            })),
          attachments: attachments.map((artifact) => ({
            id: artifact.id,
            type: artifact.type,
            title: artifact.title,
            accessUrl: artifact.accessUrl,
            sourceUrl: artifact.sourceUrl,
            path: artifact.path,
            mimeType: artifact.mimeType,
            description: artifact.description
          })),
          message
        })
      });
      const result = (await response.json()) as HermesChatResponse;
      const reply = result.ok
        ? result.message
        : `I could not reach ${displayName} through Hermes yet.\n\n${result.message || `Hermes chat failed (${response.status}).`}`;
      let registeredArtifacts: Artifact[] = [];

      if (result.ok && reply.trim()) {
        try {
          const artifactResponse = await fetch("/api/artifacts", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              text: reply,
              owner: displayName,
              projectId: normalizeOfficeProjectId(activeProjectId),
              runId: messageBaseId,
              messageId: assistantMessageId
            })
          });
          const artifactResult = (await artifactResponse.json()) as ArtifactsFromTextResponse;
          registeredArtifacts = artifactResponse.ok && artifactResult.ok && Array.isArray(artifactResult.artifacts) ? artifactResult.artifacts : [];
        } catch {
          registeredArtifacts = [];
        }
      }

      setSetupAssistantMessages((current) =>
        appendMessageArtifacts(
          current.map((item) =>
            item.id === assistantMessageId
              ? {
                  ...item,
                  content: reply
                }
              : item
          ),
          assistantMessageId,
          registeredArtifacts
        )
      );
      if (registeredArtifacts.length) {
        setOfficeArtifacts((current) => {
          const existingIds = new Set(current.map((artifact) => artifact.id));
          const nextArtifacts = registeredArtifacts.filter((artifact) => !existingIds.has(artifact.id));
          return nextArtifacts.length ? [...current, ...nextArtifacts] : current;
        });
        addEvent({
          type: EventType.CUSTOM,
          name: "artifacts_registered",
          value: {
            messageId: assistantMessageId,
            artifacts: registeredArtifacts
          }
        } as AGUIEvent);
      }
      addEvent({
        type: result.ok ? EventType.TEXT_MESSAGE_CONTENT : EventType.RUN_ERROR,
        ...(result.ok
          ? {
              messageId: assistantMessageId,
              delta: `${displayName}: ${result.message}`
            }
          : {
              message: `${displayName}: ${result.message || `Hermes chat failed (${response.status}).`}`
            })
      } as AGUIEvent);
      addEvent({
        type: EventType.CUSTOM,
        name: result.ok ? "office_agent_response" : "office_agent_error",
        value: {
          profileName,
          displayName,
          role: roleLabel,
          ok: result.ok
        }
      } as AGUIEvent);
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? `I could not reach ${displayName} through Hermes yet.\n\n${error.message}`
          : `I could not reach ${displayName} through Hermes yet.`;
      setSetupAssistantMessages((current) =>
        current.map((item) =>
          item.id === assistantMessageId
            ? {
                ...item,
                content: errorMessage
              }
            : item
        )
      );
      addEvent({
        type: EventType.RUN_ERROR,
        message: errorMessage
      } as AGUIEvent);
      addEvent({
        type: EventType.CUSTOM,
        name: "office_agent_error",
        value: {
          profileName,
          displayName,
          role: roleLabel,
          ok: false
        }
      } as AGUIEvent);
    } finally {
      setRunning(false);
      setConnection("Local Connected");
    }
  }

  function saveInlineOfficeSetupSession(
    status: OfficeSetupStatus,
    activation?: Partial<OfficeSetupSession["activation"]>
  ) {
    if (!officeSetupSession) return;

    const nextSession: OfficeSetupSession = {
      ...officeSetupSession,
      savedAt: new Date().toISOString(),
      status,
      activation: {
        ...officeSetupSession.activation,
        ...activation,
        confirmedAt: status === "office_active" ? new Date().toISOString() : officeSetupSession.activation.confirmedAt
      }
    };

    window.localStorage.setItem(OFFICE_SETUP_SESSION_STORAGE_KEY, JSON.stringify(nextSession));
    handleOfficeSetupSaved(nextSession);
    if (status === "office_active") {
      setActiveVirtualAgent("hermes");
    }
  }

  function openOfficeSetup() {
    setActiveSystemView("office_setup");
    setActiveOfficePanel(null);
  }

  function submitOfficeSetupMessage() {
    if (!officeSetupSession || officeSetupSession.status === "empty") {
      setNotice({ message: "Check your model key first.", tone: "attention" });
      window.setTimeout(() => setNotice(null), 3200);
      return;
    }

    if (officeSetupSession.status === "office_active") {
      const message = requirement.trim() || (pendingArtifacts.length ? "Please review the attached image." : "Hello Chief.");
      void sendOfficeAgentPrompt(message);
      return;
    }

    if (officeSetupSession.userPath === "model_key_only" || officeSetupSession.status === "activation_review") {
      void submitSetupAssistantMessage();
      return;
    }

    void submitSetupAssistantMessage();
  }

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const resetOfficeSetup = params.get("resetOfficeSetup") === "1" || params.get("reset") === "1";
      const setupTest = params.get("setupTest") === "1";
      const guideCompleted = window.localStorage.getItem(RUNTIME_GUIDE_COMPLETED_STORAGE_KEY) === "1";
      setRuntimeGuideCompleted(guideCompleted);
      if (setupTest) {
        setSetupTestMode(true);
        setActiveSystemView("office_setup");
        setActiveVirtualAgent("setup");
      }
      if (resetOfficeSetup) {
        resetOfficeSetupState({ includeProjects: true });
        params.delete("reset");
        params.delete("resetOfficeSetup");
        const nextSearch = params.toString();
        window.history.replaceState(null, "", `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}`);
        return;
      }

      const storedProjects = JSON.parse(window.localStorage.getItem(PROJECTS_STORAGE_KEY) || "null") as ProjectProfile[] | null;
      const storedRuntime = JSON.parse(window.localStorage.getItem(PROJECT_RUNTIME_STORAGE_KEY) || "null") as Record<ProjectId, ProjectRuntimeState> | null;
      const storedActiveProjectId = window.localStorage.getItem(ACTIVE_PROJECT_STORAGE_KEY);
      const storedOfficeSession = JSON.parse(window.localStorage.getItem(OFFICE_SETUP_SESSION_STORAGE_KEY) || "null") as OfficeSetupSession | null;
      const storedOfficeMessages = normalizeStoredOfficeMessages(JSON.parse(window.localStorage.getItem(OFFICE_CHAT_MESSAGES_STORAGE_KEY) || "null"));
      const storedOfficeEvents = normalizeStoredOfficeEvents(JSON.parse(window.localStorage.getItem(OFFICE_CHAT_EVENTS_STORAGE_KEY) || "null"));
      const storedLegacyDraft = JSON.parse(window.localStorage.getItem(LEGACY_OFFICE_DRAFT_STORAGE_KEY) || "null") as LegacyOfficeSetupDraft | null;
      const storedSetupInputs = JSON.parse(window.localStorage.getItem(OFFICE_SETUP_INPUTS_STORAGE_KEY) || "null") as SavedOfficeSetupInputs | null;
      const restoredOfficeSession =
        storedOfficeSession?.savedAt && isOfficeSetupStatus(storedOfficeSession.status) && storedOfficeSession.status !== "empty"
          ? storedOfficeSession
          : storedLegacyDraft?.savedAt && Array.isArray(storedLegacyDraft.agents)
            ? sessionFromLegacyDraft(storedLegacyDraft)
            : null;

      if (restoredOfficeSession && storedSetupInputs?.providerId && providerTemplates.some((provider) => provider.id === storedSetupInputs.providerId)) {
        setSetupProviderId(storedSetupInputs.providerId);
      }
      if (restoredOfficeSession && typeof storedSetupInputs?.customBaseUrl === "string") {
        setSetupCustomBaseUrl(storedSetupInputs.customBaseUrl);
      }

      if (restoredOfficeSession) {
        setOfficeSetupSession(restoredOfficeSession);
        setSetupAssistantMessages(storedOfficeMessages);
        if (storedOfficeEvents.length) {
          setEvents(storedOfficeEvents);
        }
      } else if (!guideCompleted) {
        setActiveSystemView("office_setup");
        setActiveVirtualAgent("setup");
      }
      if (Array.isArray(storedProjects) && storedProjects.length) {
        setProjects(storedProjects);
      }
      if (storedRuntime && typeof storedRuntime === "object") {
        setProjectRuntimeById(storedRuntime);
      }
      if (storedActiveProjectId) {
        const rawNextRuntime =
          storedRuntime?.[storedActiveProjectId] ||
          (storedActiveProjectId === "demo-project" ? null : createEmptyProjectRuntime(storedActiveProjectId));
        const normalizedRuntime = rawNextRuntime ? normalizeProjectRuntime(rawNextRuntime, storedActiveProjectId) : null;
        const nextRuntime =
          normalizedRuntime && restoredOfficeSession?.status === "office_active" && storedOfficeEvents.length && !normalizedRuntime.events.length
            ? { ...normalizedRuntime, events: storedOfficeEvents }
            : normalizedRuntime;
        setActiveProjectId(storedActiveProjectId);
        if (nextRuntime) {
          applyProjectRuntime(nextRuntime, storedActiveProjectId);
        }
      }
    } catch {
      // Local project state is a convenience; ignore corrupted browser storage.
    } finally {
      setProjectStorageLoaded(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!projectStorageLoaded || officeSetupSession?.status !== "office_active") return;

    ensureDefaultProject();
    setActiveProjectId((current) => {
      if (isOfficeSetupProjectId(current)) return DEFAULT_PROJECT_ID;
      if (!projects.some((project) => project.id === current)) return DEFAULT_PROJECT_ID;
      return current;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [officeSetupSession?.status, projectStorageLoaded, projects]);

  useEffect(() => {
    if (!projectStorageLoaded) return;

    const runtimeById = {
      ...projectRuntimeById,
      [activeProjectId]: currentProjectRuntime()
    };

    window.localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(projects));
    window.localStorage.setItem(PROJECT_RUNTIME_STORAGE_KEY, JSON.stringify(runtimeById));
    window.localStorage.setItem(ACTIVE_PROJECT_STORAGE_KEY, activeProjectId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    projectStorageLoaded,
    projects,
    activeProjectId,
    tasks,
    agents,
    events,
    requirement,
    planWorkflow,
    conversations,
    activeConversationAgent,
    planningConversationActive,
    pendingArtifacts,
    projectRuntimeById
  ]);

  useEffect(() => {
    if (!projectStorageLoaded) return;

    const durableMessages = setupAssistantMessages.filter((message) => message.content.trim() || message.artifacts?.length);
    if (durableMessages.length) {
      window.localStorage.setItem(OFFICE_CHAT_MESSAGES_STORAGE_KEY, JSON.stringify(durableMessages));
      return;
    }

    window.localStorage.removeItem(OFFICE_CHAT_MESSAGES_STORAGE_KEY);
  }, [projectStorageLoaded, setupAssistantMessages]);

  useEffect(() => {
    if (!projectStorageLoaded) return;

    const candidates = setupAssistantMessages
      .filter((message) => message.role === "agent" && message.content.trim() && !message.artifacts?.length)
      .filter((message) => looksLikeUnattachedArtifactReply(message.content))
      .filter((message) => !artifactBackfillAttemptedIdsRef.current.has(message.id))
      .slice(0, 3);
    if (!candidates.length) return;

    let cancelled = false;
    candidates.forEach((message) => artifactBackfillAttemptedIdsRef.current.add(message.id));

    async function backfillArtifacts() {
      for (const message of candidates) {
        try {
          const response = await fetch("/api/artifacts", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              text: message.content,
              owner: officeAgentOwnerFromMessageId(message.id, displayOfficeSetupSession),
              projectId: normalizeOfficeProjectId(activeProjectId),
              runId: `backfill-${message.id}`,
              messageId: message.id
            })
          });
          const result = (await response.json()) as ArtifactsFromTextResponse;
          const artifacts = response.ok && result.ok && Array.isArray(result.artifacts) ? result.artifacts : [];
          if (cancelled || !artifacts.length) continue;

          setSetupAssistantMessages((current) => appendMessageArtifacts(current, message.id, artifacts));
          setOfficeArtifacts((current) => {
            const existingIds = new Set(current.map((artifact) => artifact.id));
            const nextArtifacts = artifacts.filter((artifact) => !existingIds.has(artifact.id));
            return nextArtifacts.length ? [...current, ...nextArtifacts] : current;
          });
          addEvent({
            type: EventType.CUSTOM,
            name: "artifacts_registered",
            value: {
              messageId: message.id,
              artifacts
            }
          } as AGUIEvent);
        } catch {
          // Backfill is best-effort; future replies still use the normal artifact path.
        }
      }
    }

    void backfillArtifacts();
    return () => {
      cancelled = true;
    };
  }, [activeProjectId, displayOfficeSetupSession, projectStorageLoaded, setupAssistantMessages]);

  useEffect(() => {
    if (!projectStorageLoaded) return;

    const officeEvents = events.filter(isOfficeChatEvent);
    if (officeEvents.length) {
      window.localStorage.setItem(OFFICE_CHAT_EVENTS_STORAGE_KEY, JSON.stringify(officeEvents.slice(-120)));
      return;
    }

    window.localStorage.removeItem(OFFICE_CHAT_EVENTS_STORAGE_KEY);
  }, [events, projectStorageLoaded]);

  useEffect(() => {
    let active = true;

    async function loadRuntimeHealth() {
      try {
        const response = await fetch("/api/workspace", { cache: "no-store" });
        const data = (await response.json()) as RuntimeHealthResponse;
        if (!active) return;
        setRuntimeHealth(response.ok && data.ok && data.health ? data.health : null);
        setRuntimeQuickStart(response.ok && data.ok && data.quickStart ? data.quickStart : null);
      } catch {
        if (active) {
          setRuntimeHealth(null);
          setRuntimeQuickStart(null);
        }
      }
    }

    void loadRuntimeHealth();
    const timer = window.setInterval(loadRuntimeHealth, 15000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (displayOfficeSetupSession?.status !== "office_active") {
      setOfficeProfileRuntimes([]);
      return;
    }

    let active = true;

    async function loadProfileRuntimes() {
      try {
        const response = await fetch("/api/runtime/profiles", { cache: "no-store" });
        const data = (await response.json()) as RuntimeProfilesResponse;
        if (!active) return;
        setOfficeProfileRuntimes(response.ok && data.ok && Array.isArray(data.profiles) ? data.profiles : []);
      } catch {
        if (active) {
          setOfficeProfileRuntimes([]);
        }
      }
    }

    void loadProfileRuntimes();
    const timer = window.setInterval(loadProfileRuntimes, 12000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [displayOfficeSetupSession?.status]);

  async function prepareRuntime() {
    setRuntimePreparing(true);
    try {
      const response = await fetch("/api/runtime/prepare", {
        method: "POST",
        headers: localWriteHeaders(),
        cache: "no-store"
      });
      const data = (await response.json()) as RuntimePrepareResponse;
      if (response.ok && data.ok) {
        setRuntimeHealth(data.health || null);
        setRuntimeQuickStart(data.quickStart || null);
        setNotice({
          tone: "success",
          message: data.quickStart?.ready ? "Agent Office is ready." : data.quickStart?.title || "Local workspace prepared."
        });
      } else {
        setNotice({
          tone: "attention",
          message: data.error || "Runtime preparation failed."
        });
      }
    } catch (error) {
      setNotice({
        tone: "attention",
        message: error instanceof Error ? error.message : "Runtime preparation failed."
      });
    } finally {
      setRuntimePreparing(false);
    }
  }

  useEffect(() => {
    if (!runtimeQuickStart?.ready) return;
    if (runtimeQuickStart.primaryAction !== "open_office") return;
    if (setupTestMode) return;
    if (!runtimeGuideCompleted) return;
    if (officeSetupSession?.status === "office_active") return;
    if (activeSystemView === "developer_setup") return;
    openRuntimeChiefAgent();
  }, [activeSystemView, officeSetupSession?.status, openRuntimeChiefAgent, runtimeGuideCompleted, runtimeQuickStart, setupTestMode]);

  useEffect(() => {
    if (displayOfficeSetupSession?.status !== "office_active") return;
    const validAgentIds = new Set(displayOfficeSetupSession.agents.map((agent) => virtualAgentIdForOfficeAgent(agent)));
    if (validAgentIds.has(activeVirtualAgent)) return;
    setActiveVirtualAgent("hermes");
  }, [activeVirtualAgent, displayOfficeSetupSession]);

  useEffect(() => {
    if (!projectStorageLoaded || historyLoaded || activeProjectId !== "demo-project" || agents.length === 0) return;

    let active = true;

    async function loadHistory() {
      try {
        const response = await fetch("/api/history", { cache: "no-store" });
        if (!response.ok) return;
        const history = (await response.json()) as HistoryResponse;
        if (!active) return;

        if (history.runnerStatus) {
          setRunnerStatus(history.runnerStatus);
        }

        if (history.events?.length) {
          setEvents(history.events);
          setTasks((current) => replayStateDeltas(current, history.events, applyStateDelta));
          setAgents((current) => replayStateDeltas(current, history.events, applyAgentStateDelta));
          const restoredConversations = buildConversationsFromEvents(history.events);
          if (hasConversationMessages(restoredConversations)) {
            setConversations(restoredConversations);
            const lastAgent = latestConversationAgentFromEvents(history.events);
            if (lastAgent) setActiveConversationAgent(lastAgent);
          }
        }
        if (history.planWorkflow) {
          setPlanWorkflow(history.planWorkflow);
          setTasks(history.planWorkflow.tasks);
          setAgents((current) => applyAgentStatusesFromPlan(current, history.planWorkflow as PlanWorkflow));
        }

        void history.lastResult;
      } catch {
        // History is an enhancement; the console can still run without it.
      } finally {
        if (active) setHistoryLoaded(true);
      }
    }

    void loadHistory();

    return () => {
      active = false;
    };
  }, [activeProjectId, agents.length, historyLoaded, projectStorageLoaded]);

  function addEvent(event: AGUIEvent) {
    setEvents((current) => [...current, { ...event, receivedAt: clock() }]);

    if (event.type === EventType.STATE_DELTA) {
      setTasks((current) => applyStateDelta(current, event));
      setAgents((current) => applyAgentStateDelta(current, event));
    }

    if (event.type === EventType.TEXT_MESSAGE_START && isAgentName(event.name)) {
      const agentName = event.name;
      setConversations((current) =>
        appendConversationMessage(current, agentName, {
          id: event.messageId,
          role: "agent",
          agentName,
          content: ""
        })
      );
    }

    if (event.type === EventType.TEXT_MESSAGE_CONTENT) {
      const delta = cleanPlanningAgentDelta(event.delta);
      if (!delta) return;
      setConversations((current) => appendConversationDelta(current, event.messageId, delta));
    }

    if (event.type === EventType.CUSTOM) {
      const value = event.value as { plan?: PlanWorkflow } | undefined;
      if (event.name === "artifacts_registered") {
        const artifactValue = event.value as { messageId?: string; artifacts?: Artifact[] } | undefined;
        if (artifactValue?.messageId && artifactValue.artifacts?.length) {
          setConversations((current) =>
            appendConversationArtifacts(current, artifactValue.messageId as string, artifactValue.artifacts as Artifact[])
          );
          setOfficeArtifacts((current) => {
            const existingIds = new Set(current.map((artifact) => artifact.id));
            const nextArtifacts = artifactValue.artifacts!.filter((artifact) => !existingIds.has(artifact.id));
            return nextArtifacts.length ? [...current, ...nextArtifacts] : current;
          });
        }
      }
      if (
        event.name === "planning_agent_clarification" ||
        event.name === "plan_workflow_ready" ||
        event.name === "selected_tasks_started" ||
        event.name === "plan_workflow_completed" ||
        event.name === "ray_execution_completed"
      ) {
        if (value?.plan) {
          const plan = value.plan;
          setPlanWorkflow(plan);
          setTasks(plan.tasks);
          setAgents((current) => applyAgentStatusesFromPlan(current, plan));
        }
      }
    }

    if (event.type === EventType.RUN_FINISHED) {
      const result = event.result as { status?: string; notice?: string } | undefined;
      setNotice({
        message: result?.notice || (result?.status === "needs_attention" ? "Run needs attention." : "Run completed."),
        tone: result?.status === "needs_attention" ? "attention" : "success"
      });
      window.setTimeout(() => setNotice(null), 5200);
    }

    if (event.type === EventType.RUN_ERROR) {
      setNotice({ message: "Run failed. Check the event stream for details.", tone: "attention" });
      window.setTimeout(() => setNotice(null), 5200);
    }
  }

  function markRunNeedsAttention(targetAgent: AgentName, taskId: string, action: AgentAction) {
    const linkedAgents: AgentName[] =
      action === "dispatch_to_ray" ? ["Lucy", "Ray"] : [targetAgent];

    setTasks((current) => current.map((task) => (task.id === taskId ? { ...task, status: "blocked" } : task)));
    setAgents((current) =>
      current.map((agent) => (linkedAgents.includes(agent.name) ? { ...agent, status: "ready" } : agent))
    );
  }

  async function runAction(
    action: AgentAction,
    manualMessage?: string,
    options?: { selectedTaskIds?: string[]; planId?: string; targetAgent?: AgentName; attachments?: Artifact[]; taskId?: string }
  ) {
    const targetAgent = options?.targetAgent || targetForAction(action);
    const taskId = options?.taskId || activeTask?.id || "office-setup-task";
    setRunning(true);
    setNotice(null);
    setConnection("Streaming");

    await sendAguiInput(
      {
        action,
        targetAgent,
        projectId: normalizeOfficeProjectId(activeProjectId),
        taskId,
        message: manualMessage,
        attachments: options?.attachments,
        selectedTaskIds: options?.selectedTaskIds,
        planId: options?.planId
      },
      {
        onEvent: (event) => {
          addEvent(event);
          if (event.type === EventType.RUN_ERROR) {
            markRunNeedsAttention(targetAgent, taskId, action);
          }
        },
        onError: (message) => {
          setConnection("Error");
          markRunNeedsAttention(targetAgent, taskId, action);
          setEvents((current) => [
            ...current,
            {
              type: EventType.RUN_ERROR,
              message,
              receivedAt: clock()
            }
          ]);
          setNotice({ message: "AG-UI event stream failed.", tone: "attention" });
          window.setTimeout(() => setNotice(null), 5200);
        },
        onDone: () => {
          setRunning(false);
          setConnection((current) => (current === "Error" ? "Error" : "Local Connected"));
        }
      }
    );
  }

  async function submitRequirement() {
    const route = extractComposerRoute(requirement, activeConversationAgent);
    const targetAgent = route.target;
    const attachments = pendingArtifacts;
    const message = route.message || (attachments.length ? "Image attachments added." : "");
    if (!message && !attachments.length) return;
    const action: AgentAction = targetAgent === "Lucy" ? "submit_requirement_to_planning_agent" : "manual_message";
    setPlanningConversationActive(true);
    setActiveConversationAgent(targetAgent);
    setConversations((current) =>
      appendConversationMessage(current, targetAgent, {
        id: `user-${Date.now()}`,
        role: "user",
        content: message,
        artifacts: attachments
      })
    );
    setRequirement("");
    setPendingArtifacts([]);
    await runAction(action, message, { targetAgent, attachments });
  }

  async function handlePasteImages(files: File[]) {
    if (!files.length) return;

    setArtifactUploadBusy(true);
    try {
      const uploaded: Artifact[] = [];
      for (const file of files) {
        const formData = new FormData();
        formData.set("file", file);
        formData.set("projectId", normalizeOfficeProjectId(activeProjectId));
        formData.set("title", file.name && file.name !== "image.png" ? file.name : "Pasted image");

        const response = await fetch("/api/artifacts/upload", {
          method: "POST",
          body: formData
        });
        const data = (await response.json()) as { ok: boolean; artifacts?: Artifact[]; error?: string };
        if (!response.ok || !data.ok || !data.artifacts?.length) {
          throw new Error(data.error || "Image upload failed.");
        }
        uploaded.push(...data.artifacts);
      }

      setPendingArtifacts((current) => [...current, ...uploaded]);
      setNotice({ message: `Added ${uploaded.length} image attachment${uploaded.length === 1 ? "" : "s"}.`, tone: "success" });
      window.setTimeout(() => setNotice(null), 2600);
    } catch (error) {
      setNotice({ message: error instanceof Error ? error.message : "Image upload failed.", tone: "attention" });
      window.setTimeout(() => setNotice(null), 4200);
    } finally {
      setArtifactUploadBusy(false);
    }
  }

  function removePendingArtifact(artifactId: string) {
    setPendingArtifacts((current) => current.filter((artifact) => artifact.id !== artifactId));
  }

  function togglePlannedTask(taskId: string) {
    setTasks((current) => current.map((task) => (task.id === taskId ? { ...task, selected: !task.selected } : task)));
    setPlanWorkflow((current) =>
      current
        ? {
            ...current,
            tasks: current.tasks.map((task) => (task.id === taskId ? { ...task, selected: !task.selected } : task))
          }
        : current
    );
  }

  async function executeSelectedTasks() {
    const selectedTaskIds = selectedExecutableTasks.map((task) => task.id);
    if (!selectedTaskIds.length) {
      setNotice({ message: "Select at least one task before running.", tone: "attention" });
      window.setTimeout(() => setNotice(null), 3600);
      return;
    }
    if (executionDisabledReason) {
      setNotice({ message: "Select at least one task before running.", tone: "attention" });
      window.setTimeout(() => setNotice(null), 5200);
      return;
    }
    await runAction("execute_selected_tasks", planWorkflow?.requirement || requirement, {
      selectedTaskIds,
      planId: planWorkflow?.id
    });
  }

  async function requestCanvasReview(taskId: string) {
    const task = tasks.find((item) => item.id === taskId);
    if (!task) return;

    await runAction("ask_planning_agent_review", `Ask the planning agent to review Ray output for ${task.title}.`, {
      taskId,
      planId: planWorkflow?.id,
      targetAgent: "Lucy"
    });
  }

  async function copyTextToClipboard(text: string) {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        // Fall back for embedded browsers that block the async clipboard API.
      }
    }

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "0";
    document.body.appendChild(textarea);
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);

    try {
      return document.execCommand("copy");
    } finally {
      document.body.removeChild(textarea);
    }
  }

  async function copyHermesEnableApiPrompt() {
    try {
      const copied = await copyTextToClipboard(HERMES_ENABLE_API_PROMPT);
      if (!copied) throw new Error("Copy command failed.");
      setHermesPromptCopied(true);
      setNotice({ message: "Hermes setup prompt copied.", tone: "success" });
      window.setTimeout(() => setHermesPromptCopied(false), 1800);
      window.setTimeout(() => setNotice(null), 2600);
    } catch {
      setHermesPromptCopied(false);
      setNotice({ message: "Could not copy. Select the prompt text manually.", tone: "attention" });
      window.setTimeout(() => setNotice(null), 3600);
    }
  }

  const officePanelMeta =
    activeOfficePanel === "tasks"
      ? { title: "Task Desk", icon: CheckSquare, tone: "text-slate-300" }
      : activeOfficePanel === "archive"
        ? { title: "Project Context Hub", icon: Database, tone: "text-emerald-300" }
        : activeOfficePanel === "outputs"
          ? { title: "Materials & Outputs", icon: PackageOpen, tone: "text-emerald-300" }
          : activeOfficePanel === "history"
            ? { title: "History Log", icon: History, tone: "text-cyan-300" }
            : null;
  const OfficePanelIcon = officePanelMeta?.icon;

  function renderOfficePanel() {
    if (!activeOfficePanel || !officePanelMeta || !OfficePanelIcon) return null;

    return (
      <div className="pointer-events-none absolute inset-x-4 bottom-[84px] z-[180] flex h-[min(58%,460px)] min-h-[240px]">
        <div className="pointer-events-auto flex h-full min-h-0 w-full flex-col overflow-hidden rounded-xl border border-slate-700/85 bg-[#050914]/[0.99] shadow-[0_-18px_64px_rgba(0,0,0,0.48)] backdrop-blur">
          <div className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-800/80 px-5 py-4">
            <div className="flex min-w-0 items-center gap-2">
              <OfficePanelIcon className={`h-4 w-4 shrink-0 ${officePanelMeta.tone}`} />
              <h2 className="truncate text-base font-semibold text-slate-100">{officePanelMeta.title}</h2>
              {activeOfficePanel === "history" ? (
                <>
                  <span className="status-dot bg-emerald-400" />
                  <span className="shrink-0 text-xs text-slate-400">Live</span>
                </>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {activeOfficePanel === "history" ? (
                <button
                  type="button"
                  onClick={() => setAutoScroll((value) => !value)}
                  aria-label="Toggle auto-scroll"
                  aria-pressed={autoScroll}
                  title={autoScroll ? "Auto-scroll on" : "Auto-scroll off"}
                  className="inline-flex h-8 shrink-0 items-center gap-2 rounded-lg px-1.5 text-xs font-medium text-slate-300 transition hover:bg-slate-800/45 hover:text-slate-100 focus:outline-none focus-visible:ring-1 focus-visible:ring-slate-500/50"
                >
                  <span>Auto-scroll</span>
                  <span
                    aria-hidden="true"
                    className={`relative h-5 w-9 rounded-full border border-slate-700 transition ${
                      autoScroll ? "bg-emerald-300/18" : "bg-slate-900/70"
                    }`}
                  >
                    <span
                      className={`absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full transition ${
                        autoScroll ? "left-[19px] bg-emerald-300" : "left-1 bg-slate-500"
                      }`}
                    />
                  </span>
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setActiveOfficePanel(null)}
                aria-label="Close panel"
                title="Close"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-slate-700/85 bg-slate-950/45 text-slate-400 transition hover:bg-slate-800/75 hover:text-slate-100 focus:outline-none focus-visible:ring-1 focus-visible:ring-slate-500/50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="min-h-0 flex-1 px-5 pb-4 pt-4">
            {activeOfficePanel === "tasks" ? (
              <TaskList
                tasks={tasks}
                className="h-full"
                embedded
                selectable={
                  planWorkflow?.stage === "planned" ||
                  planWorkflow?.stage === "executing" ||
                  planWorkflow?.stage === "reviewing" ||
                  planWorkflow?.stage === "blocked"
                }
                running={running}
                executionDisabledReason={executionDisabledReason}
                onToggleTask={togglePlannedTask}
                onExecuteSelected={executeSelectedTasks}
              />
            ) : activeOfficePanel === "archive" ? (
              <ContextHubPanel projectId={activeProjectId} className="h-full" embedded />
            ) : activeOfficePanel === "outputs" ? (
              <OutputsCabinetPanel
                owner={selectedArtifactOwner}
                artifacts={selectedOwnerArtifacts}
                allArtifacts={projectOfficeArtifacts}
                agents={outputFilterAgents}
                onOwnerChange={setSelectedArtifactOwner}
              />
            ) : (
              <EventStream events={events} autoScroll={autoScroll} onToggleAutoScroll={() => setAutoScroll((value) => !value)} embedded />
            )}
          </div>
        </div>
      </div>
    );
  }

  function guideButton(label: string, onClick: () => void, tone: "primary" | "secondary" = "secondary", disabled = false) {
    return (
      <button
        key={label}
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={
          tone === "primary"
            ? "inline-flex h-9 items-center justify-center rounded-lg bg-cyan-300 px-4 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
            : "inline-flex h-9 items-center justify-center rounded-lg border border-cyan-300/25 px-3 text-sm font-semibold text-cyan-100 transition hover:border-cyan-300/45 hover:bg-cyan-400/10 disabled:cursor-not-allowed disabled:opacity-60"
        }
      >
        {label}
      </button>
    );
  }

  function renderHermesDiagnostics() {
    if (!setupHermesResult) return null;
    const checkedBaseUrl = setupHermesResult.baseUrl || setupHermesBaseUrl;
    const remoteHttpApi = /^https?:\/\/(?!localhost(?::|\/)|127\.0\.0\.1(?::|\/))/i.test(checkedBaseUrl);
    const simpleMessage =
      setupHermesResult.diagnosticCode === "api_unreachable"
        ? remoteHttpApi
          ? "The public API port is not reachable from this machine."
          : "I could not reach Hermes at this address."
        : setupHermesResult.diagnosticCode === "unauthorized_key"
          ? "This is not accepted by Hermes."
          : setupHermesResult.diagnosticCode === "responses_unavailable"
            ? "Hermes accepted the key, but responses are not ready."
            : setupHermesResult.message;

    return (
      <div className="grid gap-2 rounded-lg border border-slate-800/80 bg-slate-950/24 px-3 py-3">
        <p className="text-xs leading-5 text-slate-500">{simpleMessage}</p>
        {setupHermesResult.ok && setupHermesResult.checkedEndpoints?.length ? (
          <div className="grid gap-1">
            {setupHermesResult.checkedEndpoints.map((endpoint) => (
              <p key={`${endpoint.label}-${endpoint.url}`} className="text-xs leading-5 text-slate-500">
                <span className={endpoint.ok ? "font-semibold text-emerald-300" : "font-semibold text-amber-200"}>
                  {endpoint.label}
                </span>{" "}
                {endpoint.status ? `HTTP ${endpoint.status}` : endpoint.ok ? "OK" : "No response"} - {endpoint.message}
              </p>
            ))}
          </div>
        ) : null}
        {setupHermesResult.models.length ? (
          <p className="truncate text-xs leading-5 text-slate-500">Models: {setupHermesResult.models.join(", ")}</p>
        ) : null}
      </div>
    );
  }

  function renderLocalHermesGuide() {
    const statusLabel = setupHermesResult?.ok
      ? "Hermes connected"
      : setupHermesResult?.diagnosticCode === "api_reachable_key_required"
        ? "Key required"
        : setupHermesResult?.diagnosticCode === "api_unreachable"
          ? "API not reachable"
          : setupHermesResult?.diagnosticCode === "unauthorized_key"
            ? "Key rejected"
            : setupHermesResult?.diagnosticCode === "responses_unavailable"
              ? "Responses not ready"
              : null;

    if (localHermesGuideStep === "api_unreachable_help") {
      return (
        <div className="grid max-w-xl gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-100">Open Hermes first.</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              This flow assumes Hermes framework is already installed on this computer. Open Hermes, then come back here.
            </p>
          </div>
          {renderHermesDiagnostics()}
          <div className="flex flex-wrap items-center gap-3 border-t border-slate-800/70 pt-3">
            {guideButton("Hermes is open", () => setLocalHermesGuideStep("ask_hermes_enable_api"), "primary")}
            {guideButton("Test local API", () => void diagnoseHermesWithoutKeyInConversation(), "secondary", setupHermesChecking)}
          </div>
        </div>
      );
    }

    if (
      localHermesGuideStep === "intro" ||
      localHermesGuideStep === "open_hermes" ||
      localHermesGuideStep === "ask_hermes_enable_api"
    ) {
      return (
        <div className="grid max-w-xl gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-100">Next: prepare Hermes access.</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Open Hermes and send this message. Paste the reply here; I will read the URL and key, then test them.
            </p>
          </div>
          <div className="relative rounded-lg border border-cyan-300/20 bg-cyan-400/8">
            <button
              type="button"
              onClick={() => void copyHermesEnableApiPrompt()}
              className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-md border border-cyan-200/20 text-cyan-50 transition hover:border-cyan-200/45 hover:bg-cyan-300/10"
              title={hermesPromptCopied ? "Copied" : "Copy message"}
              aria-label={hermesPromptCopied ? "Copied Hermes message" : "Copy message to Hermes"}
            >
              {hermesPromptCopied ? (
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
              )}
            </button>
            <pre className="whitespace-pre-wrap px-3 py-3 pr-12 text-xs leading-5 text-cyan-50/90">
              {HERMES_ENABLE_API_PROMPT}
            </pre>
          </div>
          <p className="text-xs leading-5 text-slate-500">
            If Hermes restarts, wait a few seconds. Then paste its reply in the chat box below.
          </p>
          {statusLabel ? <span className="text-xs font-semibold text-amber-200">{statusLabel}</span> : null}
          {renderHermesDiagnostics()}
        </div>
      );
    }

    if (localHermesGuideStep === "responses_help") {
      return (
        <div className="grid max-w-xl gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-100">Hermes API is partly ready.</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Hermes accepted the key, but the responses endpoint is not ready. Ask Hermes to restart the gateway, then test again.
            </p>
          </div>
          {renderHermesDiagnostics()}
          <div className="flex flex-wrap items-center gap-3 border-t border-slate-800/70 pt-3">
            {guideButton("Hermes restarted", () => void checkExistingHermesInConversation(), "primary", setupHermesChecking)}
            {guideButton("Show me what to ask Hermes", () => setLocalHermesGuideStep("ask_hermes_enable_api"))}
          </div>
        </div>
      );
    }

    if (localHermesGuideStep === "ready") {
      return (
        <div className="grid max-w-xl gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-100">Hermes is ready.</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Both endpoint checks passed. Review activation before the Chief Agent goes online.
            </p>
          </div>
          {renderHermesDiagnostics()}
        </div>
      );
    }

    const hasSavedHermesKey = setupHermesApiKey.trim().length > 0;
    const shouldShowSavedConnection =
      hasSavedHermesKey &&
      setupHermesResult?.diagnosticCode !== "missing_base_url";

    if (shouldShowSavedConnection) {
      const canRetryHermesTest = Boolean(setupHermesResult && !setupHermesResult.ok && !setupHermesChecking);
      const remoteHttpApi = /^https?:\/\/(?!localhost(?::|\/)|127\.0\.0\.1(?::|\/))/i.test(setupHermesBaseUrl);
      const failedTitle =
        setupHermesResult?.diagnosticCode === "api_unreachable"
          ? remoteHttpApi
            ? "Public API is not reachable."
            : "Tunnel is not open yet."
          : setupHermesResult?.diagnosticCode === "unauthorized_key"
            ? "Hermes rejected this key."
            : setupHermesResult?.diagnosticCode === "responses_unavailable"
              ? "Hermes API needs a restart."
              : "Hermes is not ready yet.";
      const failedHelp =
        setupHermesResult?.diagnosticCode === "api_unreachable"
          ? remoteHttpApi
            ? "Open port 8642 in the cloud security group or firewall, or use an SSH tunnel."
            : "Open the SSH tunnel, then I can retry."
          : setupHermesResult?.diagnosticCode === "unauthorized_key"
            ? "Ask Hermes to test its current key locally and send the working API_SERVER_KEY."
            : setupHermesResult?.diagnosticCode === "responses_unavailable"
              ? "Ask Hermes to restart the gateway, then I can retry."
              : "I will not activate anything until both checks pass.";
      return (
        <div className="grid max-w-xl gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-100">
              {setupHermesChecking ? "Testing Hermes..." : canRetryHermesTest ? failedTitle : "Testing Hermes automatically."}
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              {setupHermesChecking ? "I am checking /v1/models and /v1/responses." : canRetryHermesTest ? failedHelp : "No click needed."}
            </p>
          </div>
          <div className="rounded-lg border border-slate-800/80 bg-slate-950/28 px-3 py-2 text-xs leading-5 text-slate-400">
            <span className="font-semibold text-slate-300">Using:</span> {setupHermesBaseUrl || LOCAL_HERMES_PRIMARY_URL}
          </div>
          {canRetryHermesTest && setupHermesResult?.diagnosticCode !== "unauthorized_key" ? (
            <div className="flex flex-wrap items-center gap-3">
              {guideButton("Retry test", () => void checkExistingHermesInConversation(), "primary", setupHermesChecking)}
            </div>
          ) : null}
          {statusLabel ? <span className="text-xs font-semibold text-amber-200">{statusLabel}</span> : null}
          {renderHermesDiagnostics()}
        </div>
      );
    }

    return (
      <div className="grid max-w-xl gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-100">Paste the Hermes access key.</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Use the key Hermes gave you after enabling its API server. Do not paste your model provider key.
          </p>
        </div>
        <div className="grid gap-1.5 border-t border-slate-800/70 pt-3">
          <label className="text-xs font-semibold text-slate-500">Base URL</label>
          <input
            value={setupHermesBaseUrl}
            onChange={(event) => {
              setSetupHermesBaseUrl(event.target.value);
              setSetupHermesResult(null);
            }}
            placeholder="http://localhost:8642/v1"
            className="h-9 rounded-lg border border-slate-800 bg-slate-950/50 px-3 text-sm text-slate-100 outline-none placeholder:text-slate-600"
          />
        </div>
        <div className="grid gap-1.5">
          <label className="text-xs font-semibold text-slate-500">Hermes access key</label>
          <input
            value={setupHermesApiKey}
            onChange={(event) => {
              setSetupHermesApiKey(event.target.value);
              setSetupHermesResult(null);
            }}
            type="password"
            placeholder="Paste Hermes access key"
            className="h-9 rounded-lg border border-slate-800 bg-slate-950/50 px-3 text-sm text-slate-100 outline-none placeholder:text-slate-600"
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {guideButton("Test Hermes Agent", () => void checkExistingHermesInConversation(), "primary", setupHermesChecking)}
        </div>
        {statusLabel ? <span className="text-xs font-semibold text-amber-200">{statusLabel}</span> : null}
        {renderHermesDiagnostics()}
      </div>
    );
  }

  const hideSetupWelcomeSidebar =
    activeSystemView === "office_setup" &&
    (!displayOfficeSetupSession || displayOfficeSetupSession.status === "empty");
  const mainGridClass = hideSetupWelcomeSidebar
    ? "relative grid min-h-0 flex-1 grid-cols-1 gap-5 overflow-hidden px-9 pb-6 pt-0 max-md:px-5"
    : "relative grid min-h-0 flex-1 grid-cols-[260px_minmax(340px,0.72fr)_minmax(0,1.2fr)] gap-5 overflow-hidden px-9 pb-6 pt-0 max-2xl:grid-cols-[240px_minmax(320px,0.78fr)_minmax(0,1.05fr)] max-lg:grid-cols-1 max-md:px-5";

  return (
    <main className="mx-auto flex h-screen max-w-[1920px] flex-col overflow-hidden">
      <Header connection={connection} />
      {notice ? (
        <div
          className={`fixed right-8 top-28 z-30 rounded-xl px-5 py-3 text-sm font-semibold shadow-[0_18px_48px_rgba(0,0,0,0.3)] backdrop-blur ${
            notice.tone === "attention"
              ? "border border-red-400/20 bg-red-500/12 text-red-200"
              : "border border-emerald-400/20 bg-emerald-500/12 text-emerald-200"
          }`}
        >
          {notice.message}
        </div>
      ) : null}

      <div className={mainGridClass}>
        {hideSetupWelcomeSidebar ? null : (
          <OfficeSidebar
            agents={visibleOfficeAgents}
            projects={projects}
            officeSetupSession={displayOfficeSetupSession}
            activeProjectId={activeProjectId}
            activeAgent={activeConversationAgent}
            activeVirtualAgent={activeVirtualAgent}
            running={running}
            connection={connection}
            setupActive={activeSystemView === "office_setup" || activeSystemView === "developer_setup"}
            onSelectAgent={(agentName) => {
              setActiveSystemView(null);
              setActiveConversationAgent(agentName);
              setPlanningConversationActive(true);
            }}
            onSelectVirtualAgent={(agentName) => {
              setActiveVirtualAgent(agentName);
              setActiveSystemView(null);
              setActiveOfficePanel(null);
              setPlanningConversationActive(true);
            }}
            onProjectChange={switchProject}
            onCreateProject={createProject}
            onOpenSetup={() => {
              setActiveSystemView("office_setup");
              setActiveOfficePanel(null);
            }}
          />
        )}

        {activeSystemView === "office_setup" ? (
          <div className={`min-h-0 min-w-0 overflow-hidden ${hideSetupWelcomeSidebar ? "" : "lg:col-span-2"}`}>
            <RuntimeQuickStart
              health={runtimeHealth}
              quickStart={runtimeQuickStart}
              preparing={runtimePreparing}
              testMode={setupTestMode}
              guideCompleted={runtimeGuideCompleted}
              onPrepare={prepareRuntime}
              onOpenOffice={openRuntimeChiefAgent}
              onOfficeSetupSaved={handleOfficeSetupSaved}
              onOpenDeveloperMode={() => setActiveSystemView("developer_setup")}
            />
          </div>
        ) : activeSystemView === "developer_setup" ? (
          <div className="min-h-0 min-w-0 overflow-hidden lg:col-span-2">
            <ProvisioningOnboarding embedded onOfficeSetupSaved={handleOfficeSetupSaved} />
          </div>
        ) : (
          <>
            <div className="flex min-h-0 min-w-0 flex-col gap-5">
              {showingVirtualOfficeConversation || visibleOfficeAgents.length === 0 ? (
                <>
                  <AgentConversationPanel
                    plan={null}
                    messages={visibleVirtualMessages}
                    running={running}
                    activeAgent="Lucy"
                    displayName={
                      displayOfficeSetupSession?.status === "office_active"
                        ? normalizeHermesAgentName(selectedOfficeAgent?.displayName || displayOfficeSetupSession.activation.chiefAgentName)
                        : setupAssistantOnline
                          ? "Office Guide"
                          : "Vibe Office"
                    }
                    displayInitial={
                      displayOfficeSetupSession?.status === "office_active"
                        ? normalizeHermesAgentName(selectedOfficeAgent?.displayName || displayOfficeSetupSession.activation.chiefAgentName).slice(0, 1).toUpperCase()
                        : setupAssistantOnline
                          ? undefined
                          : "V"
                    }
                    displayIcon={setupAssistantOnline && displayOfficeSetupSession?.status !== "office_active" ? Bot : undefined}
                    displayToneClass={
                      displayOfficeSetupSession?.status === "office_active"
                        ? OFFICE_AGENT_AVATAR_CLASS[selectedOfficeAgentTone]
                        : setupAssistantOnline
                          ? SYSTEM_ASSISTANT_AVATAR_CLASS
                          : undefined
                    }
                    emptyStateName={
                      displayOfficeSetupSession?.status === "office_active"
                        ? normalizeHermesAgentName(selectedOfficeAgent?.displayName || displayOfficeSetupSession.activation.chiefAgentName)
                        : setupAssistantOnline
                          ? "Office Guide"
                          : "Vibe Office"
                    }
                    primaryAction={undefined}
                    inlineContent={
                      showInlineModelKeySetup ? (
                        <div className="grid max-w-xl gap-3 rounded-xl border border-slate-800/80 bg-slate-950/32 p-4">
                          <div>
                            <p className="text-sm font-semibold text-slate-100">Start guide</p>
                            <p className="mt-1 text-xs leading-5 text-slate-500">
                              Use a model provider key. If it works, setup starts here.
                            </p>
                          </div>
                          <div className="grid gap-1.5">
                            <label className="text-xs font-semibold text-slate-500">Model provider</label>
                            <div
                              className="relative"
                              onBlur={(event) => {
                                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                                  setProviderMenuOpen(false);
                                }
                              }}
                            >
                              <button
                                type="button"
                                onClick={() => setProviderMenuOpen((current) => !current)}
                                className="flex h-9 w-full items-center justify-between rounded-lg border border-slate-800 bg-slate-950/50 px-3 text-left text-sm text-slate-100 outline-none transition hover:border-slate-700 hover:bg-slate-900/70 focus:border-cyan-300/60"
                                aria-haspopup="listbox"
                                aria-expanded={providerMenuOpen}
                              >
                                <span>{setupProvider?.name || "Choose provider"}</span>
                                <ChevronDown
                                  className={`h-4 w-4 text-slate-500 transition ${providerMenuOpen ? "rotate-180 text-cyan-200" : ""}`}
                                  aria-hidden="true"
                                />
                              </button>
                              {providerMenuOpen ? (
                                <div
                                  className="absolute left-0 right-0 top-10 z-30 overflow-hidden rounded-lg border border-slate-800 bg-[#070d19] py-1 shadow-[0_18px_42px_rgba(0,0,0,0.45)]"
                                  role="listbox"
                                >
                                  {providerTemplates.map((provider) => {
                                    const selected = provider.id === setupProviderId;
                                    return (
                                      <button
                                        key={provider.id}
                                        type="button"
                                        role="option"
                                        aria-selected={selected}
                                        onClick={() => {
                                          setSetupProviderId(provider.id);
                                          setSetupKeyResult(null);
                                          setProviderMenuOpen(false);
                                        }}
                                        className={`flex h-8 w-full items-center px-3 text-left text-sm transition ${
                                          selected
                                            ? "bg-cyan-300/14 text-cyan-100"
                                            : "text-slate-300 hover:bg-slate-800/80 hover:text-slate-100"
                                        }`}
                                      >
                                        {provider.name}
                                      </button>
                                    );
                                  })}
                                </div>
                              ) : null}
                            </div>
                          </div>
                          {setupProviderId === "custom-openai" ? (
                            <div className="grid gap-1.5">
                              <label className="text-xs font-semibold text-slate-500">Base URL</label>
                              <input
                                value={setupCustomBaseUrl}
                                onChange={(event) => {
                                  setSetupCustomBaseUrl(event.target.value);
                                  setSetupKeyResult(null);
                                }}
                                placeholder="https://example.com/v1"
                                className="h-9 rounded-lg border border-slate-800 bg-slate-950/50 px-3 text-sm text-slate-100 outline-none placeholder:text-slate-600"
                              />
                            </div>
                          ) : null}
                          <div className="grid gap-1.5">
                            <label className="text-xs font-semibold text-slate-500">Model API key</label>
                            <input
                              value={setupApiKey}
                              onChange={(event) => {
                                const nextApiKey = event.target.value;
                                setSetupApiKey(nextApiKey);
                                setSetupKeyResult(null);
                                if (nextApiKey.trim()) {
                                  ensureOfficeSetupProject();
                                }
                              }}
                              type="password"
                              placeholder={setupProvider?.keyEnvName || "MODEL_API_KEY"}
                              className="h-9 rounded-lg border border-slate-800 bg-slate-950/50 px-3 text-sm text-slate-100 outline-none placeholder:text-slate-600"
                            />
                          </div>
                          <div className="flex flex-wrap items-center gap-3">
                            <button
                              type="button"
                              onClick={checkModelKeyInConversation}
                              disabled={setupKeyChecking}
                              className="inline-flex h-9 items-center justify-center rounded-lg bg-cyan-300 px-4 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {setupKeyChecking ? "Checking key" : "Start guide"}
                            </button>
                            <button
                              type="button"
                              onClick={openExistingAgentTeam}
                              className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-700/80 px-4 text-sm font-semibold text-slate-200 transition hover:border-cyan-300/40 hover:bg-slate-900/70 hover:text-cyan-100"
                            >
                              Open existing Agent team
                            </button>
                            {setupKeyResult ? (
                              <span className={`text-xs font-semibold ${setupKeyResult.ok ? "text-emerald-300" : "text-rose-300"}`}>
                                {setupKeyResult.ok ? "Key works" : "Key failed"}
                              </span>
                            ) : null}
                          </div>
                          {setupKeyResult ? <p className="text-xs leading-5 text-slate-500">{setupKeyResult.message}</p> : null}
                          <p className="text-xs leading-5 text-slate-600">
                            We only test the key here. No Hermes settings will be changed.
                          </p>
                        </div>
                      ) : setupAssistantOnline && officeSetupSession?.status === "model_ready" ? (
                        renderLocalHermesGuide()
                      ) : setupAssistantOnline &&
                        (officeSetupSession?.status === "hermes_ready" ||
                          (officeSetupSession?.status === "office_previewed" && officeSetupSession.userPath === "existing_hermes") ||
                          officeSetupSession?.status === "activation_review") ? (
                        <div className="grid max-w-xl gap-4">
                          <div className="grid gap-1">
                            <p className="text-sm font-semibold text-slate-100">Name your Chief Agent</p>
                            <p className="text-xs leading-5 text-slate-500">
                              {officeSetupSession.status === "hermes_ready" ||
                              (officeSetupSession.status === "office_previewed" && officeSetupSession.userPath === "existing_hermes")
                                ? "Hermes is connected. Give this Agent a name before review."
                                : officeSetupSession.status === "activation_review"
                                  ? "Review the name and activate when ready. Optional permissions can stay off for now."
                                  : null}
                            </p>
                          </div>

                          <div className="grid gap-1.5">
                            <label className="text-xs font-semibold text-slate-500">Agent name</label>
                            <input
                              value={setupChiefAgentName}
                              onChange={(event) => setSetupChiefAgentName(event.target.value)}
                              placeholder="Chief"
                              className="h-9 rounded-lg border border-slate-800 bg-slate-950/50 px-3 text-sm text-slate-100 outline-none placeholder:text-slate-600"
                            />
                          </div>

                          <div className="grid gap-2 rounded-lg border border-slate-800/80 bg-slate-950/24 px-3 py-3 text-xs leading-5 text-slate-400">
                            <p>
                              <span className="font-semibold text-slate-300">Connection:</span> Hermes connected
                            </p>
                            <p>
                              <span className="font-semibold text-slate-300">Name:</span>{" "}
                              {activationAgentName || "Unnamed Agent"}
                            </p>
                            <p>
                              <span className="font-semibold text-slate-300">Role:</span> Chief Agent
                            </p>
                            <p className="text-slate-500">Advanced permissions stay off for now.</p>
                          </div>

                          {officeSetupSession.status === "hermes_ready" ||
                          (officeSetupSession.status === "office_previewed" && officeSetupSession.userPath === "existing_hermes") ? (
                            <button
                              type="button"
                              onClick={() =>
                                saveInlineOfficeSetupSession("activation_review", {
                                  chiefAgentName: activationAgentName
                                })
                              }
                              disabled={!activationAgentName}
                              className="w-fit rounded-lg bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Continue to review
                            </button>
                          ) : null}

                          {officeSetupSession.status === "activation_review" ? (
                            <div className="grid gap-3 border-t border-slate-800/70 pt-3">
                              <p className="text-xs leading-5 text-slate-500">
                                This only brings the Chief Agent online. You can add more permissions later.
                              </p>
                              <button
                                type="button"
                                onClick={() =>
                                  saveInlineOfficeSetupSession("office_active", {
                                    chiefAgentName: activationAgentName
                                  })
                                }
                                disabled={!activationAgentName}
                                className="w-fit rounded-lg bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                Activate {activationAgentName || "Agent"}
                              </button>
                            </div>
                          ) : null}
                        </div>
                      ) : null
                    }
                    className="min-h-0 flex-1"
                  />
                  <RequirementComposer
                    value={requirement}
                    running={running}
                    agents={visibleOfficeAgents}
                    projectId={activeProjectId}
                    target={composerRoute.target}
                    attachments={pendingArtifacts}
                    attachmentBusy={artifactUploadBusy}
                    onChange={setRequirement}
                    onSubmit={submitOfficeSetupMessage}
                    onPasteImages={handlePasteImages}
                    onRemoveAttachment={removePendingArtifact}
                    disabledReason={selectedOfficeAgentChatDisabledReason}
                    placeholder={
                      selectedOfficeAgentChatDisabledReason
                        ? selectedOfficeAgentChatDisabledReason
                        : officeSetupSession?.status === "office_active"
                        ? `Ask ${normalizeHermesAgentName(selectedOfficeAgent?.displayName || officeSetupSession.activation.chiefAgentName)} what to do next.`
                        : officeSetupSession?.status === "activation_review"
                        ? "Ask what will happen before approving activation."
                        : officeSetupSession?.status === "hermes_ready"
                          ? "Ask what to review before the Chief Agent goes online."
                          : officeSetupSession?.status === "model_ready" || officeSetupSession?.status === "office_previewed"
                          ? setupHermesResult?.diagnosticCode === "unauthorized_key"
                            ? "Paste the Hermes key or latest Hermes reply here."
                            : "Paste Hermes reply here. I will read and test it."
                          : "Complete the guide before chatting."
                    }
                    className={`shrink-0 ${officeSetupSession ? "" : "opacity-80"}`}
                  />
                </>
              ) : (
                <>
                  <AgentConversationPanel
                    plan={activeConversationAgent === "Lucy" ? planWorkflow : null}
                    messages={visibleActiveConversationMessages}
                    running={running}
                    activeAgent={activeConversationAgent}
                    className="min-h-0 flex-1"
                  />
                  <RequirementComposer
                    value={requirement}
                    running={running}
                    agents={agents}
                    projectId={activeProjectId}
                    target={composerRoute.target}
                    attachments={pendingArtifacts}
                    attachmentBusy={artifactUploadBusy}
                    onChange={setRequirement}
                    onSubmit={submitRequirement}
                    onPasteImages={handlePasteImages}
                    onRemoveAttachment={removePendingArtifact}
                    className="shrink-0"
                  />
                </>
              )}
            </div>

            <div className="relative min-h-0 min-w-0 overflow-hidden">
              <AgentStatus
                agents={visibleOfficeAgents}
                officeSetupSession={displayOfficeSetupSession}
                running={running}
                connection={connection}
                projects={projects}
                projectId={activeProjectId}
                onProjectChange={switchProject}
                onCreateProject={createProject}
                officeTemplates={officeTemplates}
                officeTemplateId={displayOfficeSetupSession?.officeTemplateId || defaultOfficeTemplate?.id}
                onOfficeTemplateChange={handleOfficeTemplateChange}
                selectedAgent={activeConversationAgent}
                selectedVirtualAgent={activeVirtualAgent}
                onSelectAgent={(agentName) => {
                  setActiveConversationAgent(agentName);
                  setPlanningConversationActive(true);
                }}
                onSelectVirtualAgent={(agentName) => {
                  setActiveVirtualAgent(agentName);
                  setActiveSystemView(null);
                  setActiveOfficePanel(null);
                  setPlanningConversationActive(true);
                }}
                tasks={tasks}
                activeOfficePanel={activeOfficePanel}
                officeDockCounts={officeDockCounts}
                onOpenTaskDesk={() => setActiveOfficePanel((current) => (current === "tasks" ? null : "tasks"))}
                onOpenArchiveLibrary={() => setActiveOfficePanel((current) => (current === "archive" ? null : "archive"))}
                onOpenArtifactBox={() => setActiveOfficePanel((current) => (current === "outputs" ? null : "outputs"))}
                onOpenHistoryLog={() => setActiveOfficePanel((current) => (current === "history" ? null : "history"))}
                onArtifactsChange={setOfficeArtifacts}
                onReviewTask={requestCanvasReview}
                collapsed={false}
                className="h-full"
              />
              {renderOfficePanel()}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
