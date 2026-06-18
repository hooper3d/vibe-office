import type { Conversation, ConversationMessage } from "../domain/projectScope";

export function getPendingRequestMessages(
  messages: ConversationMessage[],
  activeMessageIds: ReadonlySet<string>,
) {
  return messages.filter(
    (message) =>
      message.role === "user" &&
      message.status === "sending" &&
      !activeMessageIds.has(message.id),
  );
}

export function getRespondingAgentIds(conversations: Conversation[], messages: ConversationMessage[]) {
  const agentIds = new Set<string>();
  const conversationById = new Map(conversations.map((conversation) => [conversation.id, conversation]));

  messages.forEach((message) => {
    if (message.role !== "user" || message.status !== "sending") return;

    const conversation = conversationById.get(message.conversationId);
    if (!conversation) return;

    if (conversation.mode === "task_room") {
      if (conversation.chiefAgentId) agentIds.add(conversation.chiefAgentId);
      return;
    }

    if (conversation.primaryAgentId) agentIds.add(conversation.primaryAgentId);
  });

  return agentIds;
}
