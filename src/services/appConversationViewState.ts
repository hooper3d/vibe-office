import type { Conversation, ConversationMessage } from "../domain/projectScope";
import type { AgentInstance, Project } from "../domain/types";
import {
  buildFreeChatHistory,
  getConversationMessages,
  hasPendingUserRequest,
  resolveCurrentDirectConversation,
  resolveTaskRoomConversation,
  type FreeChatHistoryItem,
} from "./conversationSelectionState";
import type { ProjectChatScope, ProjectConversationMode } from "./projectSetupState";

export type AppConversationViewState = {
  activeComposerHasPendingRequest: boolean;
  activeFreeChatConversationId?: string;
  currentConversation?: Conversation;
  currentConversationHasPendingRequest: boolean;
  currentMessages: ConversationMessage[];
  directConversationProjectId: string;
  freeChatHistory: FreeChatHistoryItem[];
  taskRoomConversation?: Conversation;
  taskRoomHasPendingRequest: boolean;
  taskRoomMessages: ConversationMessage[];
};

export function deriveAppConversationViewState({
  activeFreeChatConversationIds,
  chatScope,
  chiefAgent,
  conversationMode,
  conversations,
  freeChatProjectId,
  messages,
  selectedAgent,
  selectedWorkspaceProject,
}: {
  activeFreeChatConversationIds: Record<string, string>;
  chatScope: ProjectChatScope;
  chiefAgent?: AgentInstance;
  conversationMode: ProjectConversationMode;
  conversations: Conversation[];
  freeChatProjectId: string;
  messages: ConversationMessage[];
  selectedAgent?: AgentInstance;
  selectedWorkspaceProject?: Project;
}): AppConversationViewState {
  const directConversationProjectId = chatScope === "free" ? freeChatProjectId : selectedWorkspaceProject?.id ?? "";
  const activeFreeChatConversationId = selectedAgent ? activeFreeChatConversationIds[selectedAgent.id] : undefined;
  const freeChatHistory = buildFreeChatHistory({
    agent: selectedAgent,
    conversations,
    messages,
    freeChatProjectId,
  });
  const currentConversation = resolveCurrentDirectConversation({
    agent: selectedAgent,
    activeFreeChatConversationId,
    chatScope,
    conversations,
    directConversationProjectId,
    freeChatHistory,
  });
  const currentMessages = getConversationMessages({ conversation: currentConversation, messages });
  const currentConversationHasPendingRequest = hasPendingUserRequest(currentMessages);
  const taskRoomConversation = resolveTaskRoomConversation({
    chiefAgent,
    conversations,
    project: selectedWorkspaceProject,
  });
  const taskRoomMessages = getConversationMessages({ conversation: taskRoomConversation, messages });
  const taskRoomHasPendingRequest = hasPendingUserRequest(taskRoomMessages);

  return {
    activeComposerHasPendingRequest:
      conversationMode === "single" ? currentConversationHasPendingRequest : taskRoomHasPendingRequest,
    activeFreeChatConversationId,
    currentConversation,
    currentConversationHasPendingRequest,
    currentMessages,
    directConversationProjectId,
    freeChatHistory,
    taskRoomConversation,
    taskRoomHasPendingRequest,
    taskRoomMessages,
  };
}
