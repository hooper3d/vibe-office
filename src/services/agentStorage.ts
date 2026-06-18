import type { AgentInstance, AgentOfficeRole } from "../domain/types";

const STORAGE_KEY = "vibe-office.configured-agents";

export function loadConfiguredAgents() {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return ensureOneChief(
      parsed
        .map(normalizeAgentInstance)
        .filter((agent): agent is AgentInstance => Boolean(agent))
        .filter((agent) => !isDemoAgent(agent)),
    );
  } catch {
    return [];
  }
}

function ensureOneChief(agents: AgentInstance[]) {
  if (agents.length === 0) return agents;
  if (agents.some((agent) => agent.officeRole)) {
    return agents.map((agent) => ({
      ...agent,
      isChief: agent.officeRole === "chief",
    }));
  }
  if (agents.some((agent) => agent.isChief)) {
    return agents.map((agent) => ({
      ...agent,
      isChief: agent.isChief === true,
    }));
  }

  return agents.map((agent, index) => ({
    ...agent,
    isChief: index === 0,
  }));
}

function isDemoAgent(agent: AgentInstance) {
  const demoIds = new Set(["chief-home", "builder-cloud", "writer-cloud"]);
  if (demoIds.has(agent.id)) return true;
  if (agent.endpoint.includes("example.com")) return true;
  if (agent.a2aEndpoint.includes("example.com")) return true;
  if (agent.agentCardUrl.startsWith("data:")) return true;
  return agent.name === "Researcher";
}

export function saveConfiguredAgents(agents: AgentInstance[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(agents));
}

function normalizeAgentInstance(value: unknown): AgentInstance | null {
  if (!value || typeof value !== "object") return null;

  const agent = value as Partial<AgentInstance>;
  const hasBaseShape =
    typeof agent.id === "string" &&
    typeof agent.name === "string" &&
    typeof agent.role === "string" &&
    typeof agent.location === "string" &&
    typeof agent.endpoint === "string" &&
    typeof agent.model === "string" &&
    Array.isArray(agent.tags) &&
    (agent.status === "online" || agent.status === "checking" || agent.status === "offline");

  if (!hasBaseShape) return null;

  const safeAgent = agent as AgentInstance;
  const endpoint = safeAgent.endpoint.replace(/\/$/, "");
  const a2aEndpoint = typeof safeAgent.a2aEndpoint === "string" ? safeAgent.a2aEndpoint : `${endpoint}/a2a`;
  const agentCardUrl =
    typeof safeAgent.agentCardUrl === "string" ? safeAgent.agentCardUrl : `${endpoint}/.well-known/agent-card.json`;

  return {
    ...safeAgent,
    a2aEndpoint,
    agentCardUrl,
    apiKey: typeof safeAgent.apiKey === "string" ? safeAgent.apiKey : undefined,
    avatarUrl: typeof safeAgent.avatarUrl === "string" ? safeAgent.avatarUrl : undefined,
    ipAddress: typeof safeAgent.ipAddress === "string" ? safeAgent.ipAddress : undefined,
    officeRole: normalizeOfficeRole(safeAgent.officeRole, safeAgent.isChief),
    a2aProtocolVersion: typeof safeAgent.a2aProtocolVersion === "string" ? safeAgent.a2aProtocolVersion : undefined,
    a2aTransportBinding: typeof safeAgent.a2aTransportBinding === "string" ? safeAgent.a2aTransportBinding : undefined,
    a2aSupportedInterfaces: Array.isArray(safeAgent.a2aSupportedInterfaces)
      ? safeAgent.a2aSupportedInterfaces.filter((item): item is string => typeof item === "string")
      : undefined,
    a2aSelectedInterface: typeof safeAgent.a2aSelectedInterface === "string" ? safeAgent.a2aSelectedInterface : undefined,
    a2aLastCompatibilityCheckAt:
      typeof safeAgent.a2aLastCompatibilityCheckAt === "string" ? safeAgent.a2aLastCompatibilityCheckAt : undefined,
    supportsTaskLifecycle: typeof safeAgent.supportsTaskLifecycle === "boolean" ? safeAgent.supportsTaskLifecycle : undefined,
    supportsCancel: typeof safeAgent.supportsCancel === "boolean" ? safeAgent.supportsCancel : undefined,
  };
}

function normalizeOfficeRole(value: unknown, isChief?: boolean): AgentOfficeRole {
  if (value === "chief" || value === "builder" || value === "writer" || value === "operator") return value;
  return isChief ? "chief" : "operator";
}
