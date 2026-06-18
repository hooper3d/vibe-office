import {
  getLocalTrustedAgentSafeStatuses,
  getVerifiedTrustedAgentRecord,
  updateLocalTrustedAgentRegistry,
} from "./agentRegistry";

export type AgentRegistryCommandResult = {
  status: number;
  body: unknown;
};

export async function executeAgentRegistryCommand(body: Record<string, unknown>): Promise<AgentRegistryCommandResult> {
  const command = String(body.command || "").trim();
  const payload = getCommandPayload(body.payload);

  if (command === "agent.upsert") {
    const agent = getVerifiedTrustedAgentRecord(payload.agent);
    await updateLocalTrustedAgentRegistry((registry) => {
      const existing = registry[agent.id];
      registry[agent.id] = {
        ...existing,
        ...agent,
        apiKey: agent.apiKey ?? existing?.apiKey,
      };
      return registry;
    });
    return { status: 200, body: { ok: true } };
  }

  if (command === "agent.delete") {
    const agentId = String(payload.agentId || "").trim();
    if (!agentId) throw new Error("Agent id is required.");
    await updateLocalTrustedAgentRegistry((registry) => {
      delete registry[agentId];
      return registry;
    });
    return { status: 200, body: { ok: true } };
  }

  if (command === "agent.status") {
    const agentIds = Array.isArray(payload.agentIds) ? payload.agentIds.map((id) => String(id)) : undefined;
    const statuses = await getLocalTrustedAgentSafeStatuses(agentIds);
    return { status: 200, body: { statuses } };
  }

  throw new Error("Agent registry command is not supported.");
}

function getCommandPayload(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}
