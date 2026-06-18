import { useEffect, type Dispatch, type SetStateAction } from "react";
import type { Conversation, ConversationMessage } from "../domain/projectScope";
import type { AgentInstance } from "../domain/types";
import { createConversation } from "./requestSubmissionState";
import type { WorkspaceFileAttachment } from "./workspaceFileClient";
import {
  applyActiveFreeChatConversation,
  shouldReuseEmptyFreeChat,
} from "./conversationSelectionState";
import type { ProjectChatScope, ProjectConversationMode } from "./projectSetupState";

export type FreeChatControllerOptions = {
  activeFreeChatConversationIds: Record<string, string>;
  chatScope: ProjectChatScope;
  currentConversation?: Conversation;
  currentMessages: ConversationMessage[];
  freeChatEntryProjectId: string;
  freeChatNamespace: string;
  freeChatProjectId: string;
  selectedAgent?: AgentInstance;
  setActiveFreeChatConversationIds: Dispatch<SetStateAction<Record<string, string>>>;
  setAttachedWorkspaceFiles: Dispatch<SetStateAction<WorkspaceFileAttachment[]>>;
  setChatScope: Dispatch<SetStateAction<ProjectChatScope>>;
  setConversationMode: Dispatch<SetStateAction<ProjectConversationMode>>;
  setConversations: Dispatch<SetStateAction<Conversation[]>>;
  setMessageText: Dispatch<SetStateAction<string>>;
  setSelectedProjectId: Dispatch<SetStateAction<string>>;
};

export function useFreeChatController({
  activeFreeChatConversationIds,
  chatScope,
  currentConversation,
  currentMessages,
  freeChatEntryProjectId,
  freeChatNamespace,
  freeChatProjectId,
  selectedAgent,
  setActiveFreeChatConversationIds,
  setAttachedWorkspaceFiles,
  setChatScope,
  setConversationMode,
  setConversations,
  setMessageText,
  setSelectedProjectId,
}: FreeChatControllerOptions) {
  useEffect(() => {
    if (chatScope !== "free" || !selectedAgent || !currentConversation) return;
    if (activeFreeChatConversationIds[selectedAgent.id] === currentConversation.id) return;

    setActiveFreeChatConversationIds((current) =>
      applyActiveFreeChatConversation({
        activeConversationIds: current,
        agentId: selectedAgent.id,
        conversationId: currentConversation.id,
      }),
    );
  }, [
    activeFreeChatConversationIds,
    chatScope,
    currentConversation,
    selectedAgent,
    setActiveFreeChatConversationIds,
  ]);

  function selectConversation(conversationId: string) {
    if (!selectedAgent) return;

    activateConversation(selectedAgent.id, conversationId);
    enterFreeChat();
  }

  function startNewConversation() {
    if (!selectedAgent) return;
    const reusableConversation = currentConversation;
    if (
      reusableConversation &&
      shouldReuseEmptyFreeChat({
        conversation: reusableConversation,
        messageCount: currentMessages.length,
        freeChatProjectId,
      })
    ) {
      selectConversation(reusableConversation.id);
      return;
    }

    const now = new Date().toISOString();
    const conversation = createConversation({
      projectId: freeChatProjectId,
      namespace: freeChatNamespace,
      mode: "direct",
      title: "New chat",
      primaryAgentId: selectedAgent.id,
      participantAgentIds: [selectedAgent.id],
      createdAt: now,
    });

    setConversations((current) => [conversation, ...current]);
    activateConversation(selectedAgent.id, conversation.id);
    enterFreeChat();
    setMessageText("");
    setAttachedWorkspaceFiles([]);
  }

  function activateConversation(agentId: string, conversationId: string) {
    setActiveFreeChatConversationIds((current) =>
      applyActiveFreeChatConversation({
        activeConversationIds: current,
        agentId,
        conversationId,
      }),
    );
  }

  function enterFreeChat() {
    setChatScope("free");
    setConversationMode("single");
    setSelectedProjectId(freeChatEntryProjectId);
  }

  return {
    selectConversation,
    startNewConversation,
  };
}
