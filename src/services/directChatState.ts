import type { Conversation, ConversationMessage } from "../domain/projectScope";
import { markConversationMessageFailed, markConversationMessageSent } from "../domain/requestLifecycle";
import type { AgentRequestExecution } from "./agentRequestExecutor";
import { createAgentMessageFromTask } from "./agentTaskResult";

export function applyFreeChatTurnCompleted({
  messages,
  result,
  conversationId,
  projectId,
  agentId,
  userMessageId,
}: {
  messages: ConversationMessage[];
  result: AgentRequestExecution;
  conversationId: string;
  projectId: string;
  agentId: string;
  userMessageId: string;
}) {
  return [
    ...markConversationMessageSent(messages, userMessageId),
    createAgentMessageFromTask({
      task: result.task,
      conversationId,
      projectId,
      agentId,
      fallbackText: result.summary,
      createdAt: result.completedAt,
    }),
  ];
}

export function applyConversationMessageFailed({
  messages,
  messageId,
  errorText,
}: {
  messages: ConversationMessage[];
  messageId: string;
  errorText: string;
}) {
  return markConversationMessageFailed(messages, messageId, errorText);
}

export function touchConversationUpdatedAt(conversations: Conversation[], conversationId: string, updatedAt: string) {
  return conversations.map((conversation) =>
    conversation.id === conversationId
      ? {
          ...conversation,
          updatedAt,
        }
      : conversation,
  );
}
