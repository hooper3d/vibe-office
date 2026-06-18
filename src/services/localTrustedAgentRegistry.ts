import type { AgentInstance } from "../domain/types";

export type LocalTrustedAgentSafeStatus = {
  id: string;
  runtimeProvider: "hermes" | "openai" | "anthropic";
  model: string;
  hasCredential: boolean;
  registered: boolean;
  issues: string[];
};

export function stripAgentCredential(agent: AgentInstance): AgentInstance {
  const { apiKey: _apiKey, ...safeAgent } = agent;
  return safeAgent;
}

export async function upsertLocalTrustedAgent(agent: AgentInstance) {
  if (typeof window === "undefined") return;

  const response = await fetch("/agent-local/registry-command", createLocalTrustedAgentRegistryCommandRequest({
    command: "agent.upsert",
    payload: { agent },
  }));

  if (!response.ok) {
    throw new Error("Unable to update the local trusted agent registry.");
  }
}

export async function assertLocalTrustedAgentCredential(agent: AgentInstance) {
  const runtimeProvider = agent.runtimeProvider ?? "hermes";
  if (runtimeProvider === "hermes" || typeof window === "undefined") return;

  const [status] = await getLocalTrustedAgentStatuses([agent.id]);
  if (!status?.registered) {
    throw new Error("Agent is not saved in the local trusted layer.");
  }
  if (status.runtimeProvider !== runtimeProvider) {
    throw new Error("Agent provider type was not saved in the local trusted layer.");
  }
  if (!status.hasCredential) {
    throw new Error("API key is missing in the local trusted layer.");
  }
}

export async function deleteLocalTrustedAgent(agentId: string) {
  if (typeof window === "undefined") return;

  const response = await fetch("/agent-local/registry-command", createLocalTrustedAgentRegistryCommandRequest({
    command: "agent.delete",
    payload: { agentId },
  }));

  if (!response.ok) {
    throw new Error("Unable to remove the local trusted agent registry entry.");
  }
}

export async function getLocalTrustedAgentStatuses(agentIds?: string[]) {
  if (typeof window === "undefined") return [] satisfies LocalTrustedAgentSafeStatus[];

  const response = await fetch("/agent-local/registry-command", createLocalTrustedAgentRegistryCommandRequest({
    command: "agent.status",
    payload: { agentIds },
  }));

  if (!response.ok) {
    throw new Error("Unable to read the local trusted agent status.");
  }

  const payload = (await response.json()) as { statuses?: LocalTrustedAgentSafeStatus[] };
  return Array.isArray(payload.statuses) ? payload.statuses : [];
}

export type LocalTrustedAgentRegistryCommand =
  | {
      command: "agent.upsert";
      payload: { agent: AgentInstance };
    }
  | {
      command: "agent.delete";
      payload: { agentId: string };
    }
  | {
      command: "agent.status";
      payload: { agentIds?: string[] };
    };

export function createLocalTrustedAgentRegistryCommandRequest(command: LocalTrustedAgentRegistryCommand): RequestInit {
  return {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
  };
}
