import type { AgentInstance } from "../domain/types";

export type LocalTrustedAgentSafeStatus = {
  id: string;
  runtimeProvider: "hermes" | "openai" | "anthropic";
  model: string;
  hasCredential: boolean;
  issues: string[];
};

export function stripAgentCredential(agent: AgentInstance): AgentInstance {
  const { apiKey: _apiKey, ...safeAgent } = agent;
  return safeAgent;
}

export async function upsertLocalTrustedAgent(agent: AgentInstance) {
  if (typeof window === "undefined") return;

  const response = await fetch("/agent-local/agents/upsert", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ agent }),
  });

  if (!response.ok) {
    throw new Error("Unable to update the local trusted agent registry.");
  }
}

export async function deleteLocalTrustedAgent(agentId: string) {
  if (typeof window === "undefined") return;

  const response = await fetch("/agent-local/agents/delete", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ agentId }),
  });

  if (!response.ok) {
    throw new Error("Unable to remove the local trusted agent registry entry.");
  }
}

export async function getLocalTrustedAgentStatuses(agentIds?: string[]) {
  if (typeof window === "undefined") return [] satisfies LocalTrustedAgentSafeStatus[];

  const response = await fetch("/agent-local/agents/status", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ agentIds }),
  });

  if (!response.ok) {
    throw new Error("Unable to read the local trusted agent status.");
  }

  const payload = (await response.json()) as { statuses?: LocalTrustedAgentSafeStatus[] };
  return Array.isArray(payload.statuses) ? payload.statuses : [];
}
