import type { AgentInstance } from "../domain/types";

export function getAvailableTaskParticipants({
  agents,
  chiefAgentId,
}: {
  agents: AgentInstance[];
  chiefAgentId?: string;
}): AgentInstance[] {
  return agents.filter((agent) => agent.id !== chiefAgentId && agent.status === "online");
}

export function getSelectedTaskParticipants({
  availableParticipants,
  selectedParticipantIds,
}: {
  availableParticipants: AgentInstance[];
  selectedParticipantIds: string[];
}): AgentInstance[] {
  return availableParticipants.filter((agent) => selectedParticipantIds.includes(agent.id));
}

export function toggleTaskParticipantSelection({
  selectedParticipantIds,
  agentId,
  checked,
}: {
  selectedParticipantIds: string[];
  agentId: string;
  checked: boolean;
}): string[] {
  if (!checked) return selectedParticipantIds.filter((id) => id !== agentId);
  return Array.from(new Set([...selectedParticipantIds, agentId]));
}
