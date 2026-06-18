import type { ConversationMessage } from "../domain/projectScope";
import {
  markConversationMessageFailed,
  markConversationMessageSending,
  markConversationMessageSent,
} from "../domain/requestLifecycle";

export function prepareDirectMessageRetry({
  messages,
  message,
  targetAgentId,
}: {
  messages: ConversationMessage[];
  message: ConversationMessage;
  targetAgentId: string;
}) {
  return markConversationMessageSending(
    messages.filter((item) => !isRetrySystemMessageForDirectRequest(item, message, targetAgentId)),
    message.id,
  );
}

export function prepareTaskRoomMessageRetry({
  messages,
  messageId,
}: {
  messages: ConversationMessage[];
  messageId: string;
}) {
  return markConversationMessageSending(messages, messageId);
}

export function completeTaskRoomMessageRetry({
  messages,
  messageId,
  succeeded,
}: {
  messages: ConversationMessage[];
  messageId: string;
  succeeded: boolean;
}) {
  return succeeded
    ? markConversationMessageSent(messages, messageId)
    : markConversationMessageFailed(messages, messageId, "Retry failed. Check the task activity for details.");
}

function isRetrySystemMessageForDirectRequest(
  item: ConversationMessage,
  message: ConversationMessage,
  targetAgentId: string,
) {
  if (item.role !== "system") return false;
  if (item.conversationId !== message.conversationId) return false;
  if (item.createdAt < message.createdAt) return false;

  return message.runId ? item.runId === message.runId : item.agentId === targetAgentId;
}
