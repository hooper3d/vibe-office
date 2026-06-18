import type { AgentInstance } from "../domain/types";
import { stripAgentCredential } from "./localTrustedAgentRegistry";

export type AgentSetupSaveMode = "created" | "updated" | "deduplicated";

export type AgentSetupSaveResult = {
  agents: AgentInstance[];
  mode: AgentSetupSaveMode;
  selectedAgentId?: string;
  trustedAgent: AgentInstance;
};

export type AgentDeleteResult = {
  agents: AgentInstance[];
  selectedAgentId: string;
};

export function applyAgentSetupSave({
  agents,
  submittedAgent,
  editingAgentId,
  metadata,
}: {
  agents: AgentInstance[];
  submittedAgent: AgentInstance;
  editingAgentId?: string | null;
  metadata?: Partial<AgentInstance> | null;
}): AgentSetupSaveResult {
  if (editingAgentId) {
    const trustedAgent = { ...submittedAgent, id: editingAgentId };
    return {
      agents: updateExistingAgent(agents, editingAgentId, submittedAgent, metadata),
      mode: "updated",
      selectedAgentId: editingAgentId,
      trustedAgent,
    };
  }

  const duplicateAgent = findDuplicateAgent(agents, submittedAgent);
  if (duplicateAgent) {
    const trustedAgent = { ...submittedAgent, id: duplicateAgent.id };
    return {
      agents: updateExistingAgent(agents, duplicateAgent.id, submittedAgent, metadata),
      mode: "deduplicated",
      trustedAgent,
    };
  }

  return {
    agents: addNewAgent(agents, submittedAgent, metadata),
    mode: "created",
    selectedAgentId: submittedAgent.id,
    trustedAgent: submittedAgent,
  };
}

export function applyAgentDelete({
  agentId,
  agents,
  selectedAgentId,
}: {
  agentId: string;
  agents: AgentInstance[];
  selectedAgentId: string;
}): AgentDeleteResult {
  const remainingAgents = normalizeChief(agents.filter((agent) => agent.id !== agentId));
  if (selectedAgentId !== agentId) {
    return {
      agents: remainingAgents,
      selectedAgentId,
    };
  }

  const fallbackAgent = remainingAgents.find((agent) => agent.isChief) ?? remainingAgents[0];
  return {
    agents: remainingAgents,
    selectedAgentId: fallbackAgent?.id ?? "",
  };
}

export function normalizeChief(agents: AgentInstance[]) {
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

function updateExistingAgent(
  agents: AgentInstance[],
  targetAgentId: string,
  submittedAgent: AgentInstance,
  metadata?: Partial<AgentInstance> | null,
) {
  const safeSubmittedAgent = stripAgentCredential(submittedAgent);
  return agents.map((agent) =>
    agent.id === targetAgentId
      ? {
          ...stripAgentCredential(agent),
          ...safeSubmittedAgent,
          id: agent.id,
          avatarUrl: agent.avatarUrl,
          isChief: submittedAgent.officeRole === "chief",
          status: agent.status,
          ...(metadata ?? {}),
        }
      : submittedAgent.officeRole === "chief"
        ? demoteChief(agent)
        : agent,
  );
}

function addNewAgent(
  agents: AgentInstance[],
  submittedAgent: AgentInstance,
  metadata?: Partial<AgentInstance> | null,
) {
  const addedAgent = {
    ...stripAgentCredential(submittedAgent),
    ...(metadata ?? {}),
    isChief: submittedAgent.officeRole === "chief",
  };
  if (submittedAgent.officeRole !== "chief") return [...agents, addedAgent];
  return [...agents.map(demoteChief), addedAgent];
}

function findDuplicateAgent(agents: AgentInstance[], submittedAgent: AgentInstance) {
  const normalizedEndpoint = normalizeEndpoint(submittedAgent.endpoint);
  return agents.find(
    (agent) =>
      normalizeEndpoint(agent.endpoint) === normalizedEndpoint &&
      agent.model === submittedAgent.model &&
      (agent.runtimeProvider ?? "hermes") === (submittedAgent.runtimeProvider ?? "hermes"),
  );
}

function normalizeEndpoint(endpoint: string) {
  return endpoint.replace(/\/$/, "");
}

function demoteChief(agent: AgentInstance): AgentInstance {
  return {
    ...agent,
    isChief: false,
    officeRole: agent.officeRole === "chief" ? "operator" : agent.officeRole,
  };
}
