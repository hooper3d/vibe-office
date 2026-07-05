import type { A2APart } from "../domain/a2a";
import type { Conversation, ConversationMessage } from "../domain/projectScope";
import type { AgentInstance, Project } from "../domain/types";

export type FreeChatHistoryItem = {
  conversation: Conversation;
  messageCount: number;
  title: string;
};

export function buildFreeChatHistory({
  agent,
  conversations,
  messages,
  freeChatProjectId,
}: {
  agent?: AgentInstance;
  conversations: Conversation[];
  messages: ConversationMessage[];
  freeChatProjectId: string;
}): FreeChatHistoryItem[] {
  if (!agent) return [];

  return conversations
    .filter(
      (conversation) =>
        conversation.projectId === freeChatProjectId &&
        conversation.mode === "direct" &&
        conversation.primaryAgentId === agent.id,
    )
    .map((conversation) => {
      const conversationMessages = messages.filter((message) => message.conversationId === conversation.id);
      const firstUserMessage = conversationMessages.find((message) => message.role === "user");
      return {
        conversation,
        messageCount: conversationMessages.length,
        title: getFreeChatHistoryTitle(conversation, firstUserMessage),
      };
    })
    .sort((left, right) => right.conversation.updatedAt.localeCompare(left.conversation.updatedAt));
}

export function getFreeChatHistoryTitle(conversation: Conversation, firstUserMessage?: ConversationMessage) {
  if (conversation.customTitle?.trim()) return conversation.customTitle.trim();
  if (firstUserMessage) return getPartText(firstUserMessage.contentParts);
  return conversation.title;
}

export function resolveCurrentDirectConversation({
  agent,
  activeFreeChatConversationId,
  chatScope,
  conversations,
  directConversationProjectId,
  freeChatHistory,
}: {
  agent?: AgentInstance;
  activeFreeChatConversationId?: string;
  chatScope: "free" | "project";
  conversations: Conversation[];
  directConversationProjectId: string;
  freeChatHistory: FreeChatHistoryItem[];
}) {
  if (!agent) return undefined;
  if (chatScope === "free") {
    return (
      freeChatHistory.find((item) => item.conversation.id === activeFreeChatConversationId)?.conversation ??
      freeChatHistory[0]?.conversation
    );
  }

  return conversations.find(
    (conversation) =>
      conversation.projectId === directConversationProjectId &&
      conversation.mode === "direct" &&
      conversation.primaryAgentId === agent.id,
  );
}

export function getConversationMessages({
  conversation,
  messages,
}: {
  conversation?: Conversation;
  messages: ConversationMessage[];
}) {
  if (!conversation) return [];
  return messages.filter((message) => message.conversationId === conversation.id);
}

export function hasPendingUserRequest(messages: ConversationMessage[]) {
  return messages.some((message) => message.role === "user" && message.status === "sending");
}

export function resolveTaskRoomConversation({
  chiefAgent,
  conversations,
  project,
}: {
  chiefAgent?: AgentInstance;
  conversations: Conversation[];
  project?: Project;
}) {
  if (!chiefAgent || !project) return undefined;
  return conversations.find(
    (conversation) =>
      conversation.projectId === project.id &&
      conversation.mode === "task_room" &&
      conversation.chiefAgentId === chiefAgent.id,
  );
}

export function applyActiveFreeChatConversation({
  activeConversationIds,
  agentId,
  conversationId,
}: {
  activeConversationIds: Record<string, string>;
  agentId: string;
  conversationId: string;
}) {
  if (activeConversationIds[agentId] === conversationId) return activeConversationIds;
  return {
    ...activeConversationIds,
    [agentId]: conversationId,
  };
}

export function shouldReuseEmptyFreeChat({
  conversation,
  messageCount,
  freeChatProjectId,
}: {
  conversation?: Conversation;
  messageCount: number;
  freeChatProjectId: string;
}) {
  return Boolean(conversation && conversation.projectId === freeChatProjectId && messageCount === 0);
}

export function renameFreeChatConversation({
  conversationId,
  conversations,
  title,
}: {
  conversationId: string;
  conversations: Conversation[];
  title: string;
}) {
  const trimmedTitle = title.trim();
  if (!trimmedTitle) return conversations;
  return conversations.map((conversation) =>
    conversation.id === conversationId
      ? {
          ...conversation,
          title: trimmedTitle,
          customTitle: trimmedTitle,
        }
      : conversation,
  );
}

export function deleteFreeChatConversationState({
  activeConversationIds,
  agentId,
  conversationId,
  conversations,
  freeChatProjectId,
  messages,
}: {
  activeConversationIds: Record<string, string>;
  agentId: string;
  conversationId: string;
  conversations: Conversation[];
  freeChatProjectId: string;
  messages: ConversationMessage[];
}) {
  const nextConversations = conversations.filter((conversation) => conversation.id !== conversationId);
  const nextMessages = messages.filter((message) => message.conversationId !== conversationId);
  const activeConversationId = activeConversationIds[agentId];
  if (activeConversationId !== conversationId) {
    return {
      activeConversationIds,
      conversations: nextConversations,
      messages: nextMessages,
    };
  }

  const fallbackConversation = nextConversations
    .filter(
      (conversation) =>
        conversation.projectId === freeChatProjectId &&
        conversation.mode === "direct" &&
        conversation.primaryAgentId === agentId,
    )
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
  const { [agentId]: _removed, ...remainingActiveConversationIds } = activeConversationIds;

  return {
    activeConversationIds: fallbackConversation
      ? {
          ...remainingActiveConversationIds,
          [agentId]: fallbackConversation.id,
        }
      : remainingActiveConversationIds,
    conversations: nextConversations,
    messages: nextMessages,
  };
}

function getPartText(parts: A2APart[]) {
  return parts
    .map((part) => {
      if (part.kind === "text") return part.text;
      if (part.kind === "data") return JSON.stringify(part.data, null, 2);
      return part.file.name ?? part.file.uri ?? "File";
    })
    .join("\n");
}
