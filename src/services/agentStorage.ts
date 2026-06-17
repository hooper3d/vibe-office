import type { AgentInstance } from "../domain/types";

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
  };
}
