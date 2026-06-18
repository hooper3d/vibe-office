import type { A2APart } from "../domain/a2a";
import type { Conversation, ConversationMessage } from "../domain/projectScope";
import type { AgentInstance } from "../domain/types";

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
        title: firstUserMessage ? getPartText(firstUserMessage.contentParts) : conversation.title,
      };
    })
    .sort((left, right) => right.conversation.updatedAt.localeCompare(left.conversation.updatedAt));
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

function getPartText(parts: A2APart[]) {
  return parts
    .map((part) => {
      if (part.kind === "text") return part.text;
      if (part.kind === "data") return JSON.stringify(part.data, null, 2);
      return part.file.name ?? part.file.uri ?? "File";
    })
    .join("\n");
}
