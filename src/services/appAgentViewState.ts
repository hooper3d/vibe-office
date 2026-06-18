import type { Conversation, ConversationMessage } from "../domain/projectScope";
import type { AgentInstance } from "../domain/types";
import { deriveAgentReadinessIssues, type AgentReadinessIssuesById } from "./agentReadinessState";
import { resolveSelectedAgent } from "./agentSetupState";
import { getRespondingAgentIds } from "./requestRecovery";
import {
  getAvailableTaskParticipants,
  getSelectedTaskParticipants,
} from "./taskParticipantSelectionState";

export type AppAgentViewState = {
  agentSetupIssues: AgentReadinessIssuesById;
  availableTaskParticipants: AgentInstance[];
  chiefAgent?: AgentInstance;
  respondingAgentIds: Set<string>;
  selectedAgent?: AgentInstance;
  selectedTaskParticipants: AgentInstance[];
};

export function deriveAppAgentViewState({
  agents,
  conversations,
  localTrustedAgentIssues,
  messages,
  selectedAgentId,
  taskParticipantIds,
}: {
  agents: AgentInstance[];
  conversations: Conversation[];
  localTrustedAgentIssues: AgentReadinessIssuesById;
  messages: ConversationMessage[];
  selectedAgentId: string;
  taskParticipantIds: string[];
}): AppAgentViewState {
  const selectedAgent = resolveSelectedAgent({ agents, selectedAgentId });
  const chiefAgent = agents.find((agent) => agent.isChief);
  const availableTaskParticipants = getAvailableTaskParticipants({ agents, chiefAgentId: chiefAgent?.id });
  return {
    agentSetupIssues: deriveAgentReadinessIssues({ agents, localTrustedIssues: localTrustedAgentIssues }),
    availableTaskParticipants,
    chiefAgent,
    respondingAgentIds: getRespondingAgentIds(conversations, messages),
    selectedAgent,
    selectedTaskParticipants: getSelectedTaskParticipants({
      availableParticipants: availableTaskParticipants,
      selectedParticipantIds: taskParticipantIds,
    }),
  };
}
