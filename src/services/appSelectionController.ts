import { useEffect, type Dispatch, type SetStateAction } from "react";
import type { AgentInstance, Project } from "../domain/types";
import {
  applyMissingProjectSelection,
  normalizeConversationModeForScope,
  type ProjectChatScope,
  type ProjectConversationMode,
} from "./projectSetupState";
import { toggleTaskParticipantSelection } from "./taskParticipantSelectionState";

export type AppSelectionControllerOptions = {
  availableTaskParticipants: AgentInstance[];
  chatScope: ProjectChatScope;
  chiefAgentId?: string;
  conversationMode: ProjectConversationMode;
  freeChatEntryProjectId: string;
  projects: Project[];
  selectedAgent?: AgentInstance;
  selectedAgentId: string;
  selectedProjectId: string;
  selectedWorkspaceProjectId?: string;
  setChatScope: Dispatch<SetStateAction<ProjectChatScope>>;
  setConversationMode: Dispatch<SetStateAction<ProjectConversationMode>>;
  setSelectedAgentId: Dispatch<SetStateAction<string>>;
  setSelectedProjectId: Dispatch<SetStateAction<string>>;
  setTaskParticipantIds: Dispatch<SetStateAction<string[]>>;
};

export function useAppSelectionController({
  availableTaskParticipants,
  chatScope,
  chiefAgentId,
  conversationMode,
  freeChatEntryProjectId,
  projects,
  selectedAgent,
  selectedAgentId,
  selectedProjectId,
  selectedWorkspaceProjectId,
  setChatScope,
  setConversationMode,
  setSelectedAgentId,
  setSelectedProjectId,
  setTaskParticipantIds,
}: AppSelectionControllerOptions) {
  useEffect(() => {
    const nextSelection = normalizeConversationModeForScope({ selectedProjectId, chatScope, conversationMode });
    if (nextSelection.conversationMode !== conversationMode) setConversationMode(nextSelection.conversationMode);
  }, [chatScope, conversationMode, selectedProjectId, setConversationMode]);

  useEffect(() => {
    setTaskParticipantIds(availableTaskParticipants.map((agent) => agent.id));
  }, [availableTaskParticipants, chiefAgentId, selectedWorkspaceProjectId, setTaskParticipantIds]);

  useEffect(() => {
    if (selectedAgent && selectedAgent.id !== selectedAgentId) {
      setSelectedAgentId(selectedAgent.id);
    }
  }, [selectedAgent, selectedAgentId, setSelectedAgentId]);

  useEffect(() => {
    const nextSelection = applyMissingProjectSelection({
      projects,
      freeChatEntryProjectId,
      selection: { selectedProjectId, chatScope, conversationMode },
    });
    if (nextSelection.selectedProjectId !== selectedProjectId) setSelectedProjectId(nextSelection.selectedProjectId);
    if (nextSelection.chatScope !== chatScope) setChatScope(nextSelection.chatScope);
    if (nextSelection.conversationMode !== conversationMode) setConversationMode(nextSelection.conversationMode);
  }, [
    chatScope,
    conversationMode,
    freeChatEntryProjectId,
    projects,
    selectedProjectId,
    setChatScope,
    setConversationMode,
    setSelectedProjectId,
  ]);

  function selectAgent(agentId: string) {
    setSelectedAgentId(agentId);
    setConversationMode("single");
  }

  function selectProject(projectId: string, scope: ProjectChatScope) {
    setSelectedProjectId(projectId);
    setChatScope(scope);
    setConversationMode("single");
  }

  function toggleTaskParticipant(agentId: string, checked: boolean) {
    setTaskParticipantIds((current) =>
      toggleTaskParticipantSelection({
        selectedParticipantIds: current,
        agentId,
        checked,
      }),
    );
  }

  return {
    selectAgent,
    selectProject,
    toggleTaskParticipant,
  };
}
