import type { A2APart } from "../domain/a2a";
import type { ConversationMessage } from "../domain/projectScope";
import type { ChatHistoryMessage } from "./providerTypes";

export function getTextPartContent(parts: A2APart[]) {
  return parts
    .filter((part) => part.kind === "text")
    .map((part) => part.text)
    .join("\n");
}

export function getMessageTextContent(message: ConversationMessage) {
  return getTextPartContent(message.contentParts);
}

export function buildChatCompletionHistory({
  messages,
  conversationId,
  pendingMessageId,
  maxMessages = 20,
}: {
  messages: ConversationMessage[];
  conversationId: string;
  pendingMessageId: string;
  maxMessages?: number;
}): ChatHistoryMessage[] {
  return messages
    .filter(
      (message) =>
        message.conversationId === conversationId &&
        message.id !== pendingMessageId &&
        message.status === "sent" &&
        (message.role === "user" || message.role === "agent"),
    )
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    .slice(-maxMessages)
    .map((message): ChatHistoryMessage => ({
      role: message.role === "agent" ? "assistant" : "user",
      content: getTextPartContent(message.contentParts),
    }))
    .filter((message) => message.content.trim().length > 0);
}
