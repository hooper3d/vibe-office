import type { ConversationFailureKind, ConversationMessage, ProjectRun, ProjectTask } from "./projectScope";

export function markConversationMessageFailed(
  messages: ConversationMessage[],
  messageId: string,
  errorText: string,
  updates: Partial<Pick<ConversationMessage, "runId" | "taskId" | "errorKind">> = {},
) {
  return messages.map((message) =>
    message.id === messageId
      ? {
          ...message,
          ...updates,
          status: "failed" as const,
          errorKind: updates.errorKind ?? inferConversationFailureKind(errorText),
          errorText,
        }
      : message,
  );
}

export function markConversationMessageSending(messages: ConversationMessage[], messageId: string) {
  return messages.map((message) =>
    message.id === messageId
      ? {
          ...message,
          status: "sending" as const,
          errorKind: undefined,
          errorText: undefined,
        }
      : message,
  );
}

export function markConversationMessageSent(
  messages: ConversationMessage[],
  messageId: string,
  updates: Partial<Pick<ConversationMessage, "runId" | "taskId">> = {},
) {
  return messages.map((message) =>
    message.id === messageId
      ? {
          ...message,
          ...updates,
          status: "sent" as const,
          errorKind: undefined,
          errorText: undefined,
        }
      : message,
  );
}

export function failTaskRoomTaskForMessage(
  tasks: ProjectTask[],
  message: ConversationMessage,
  reason: string,
  failedAt: string,
) {
  if (!message.taskId) return tasks;

  return tasks.map((task) =>
    task.id === message.taskId
      ? {
          ...task,
          state: "failed" as const,
          summary: reason,
          events: [
            ...task.events,
            {
              id: `${message.taskId}-message-failed-${failedAt}`,
              taskId: message.taskId ?? task.id,
              agentId: task.ownerAgentId,
              label: "Task Room request failed.",
              state: "failed" as const,
              timestamp: failedAt,
            },
          ],
          updatedAt: failedAt,
        }
      : task,
  );
}

export function failRunForMessage(runs: ProjectRun[], message: ConversationMessage, failedAt: string, summary?: string) {
  if (!message.runId) return runs;
  return failRunById(runs, message.runId, failedAt, summary ?? message.errorText);
}

export function failRunById(runs: ProjectRun[], runId: string, failedAt: string, summary?: string) {
  return runs.map((run) =>
    run.id === runId
      ? {
          ...run,
          state: "failed" as const,
          summary: summary ?? run.summary,
          eventIds: mergeIds(run.eventIds, [`${runId}-failed`]),
          updatedAt: failedAt,
        }
      : run,
  );
}

function mergeIds(first: string[], second: string[]) {
  return Array.from(new Set([...first, ...second]));
}

function inferConversationFailureKind(text: string): ConversationFailureKind {
  if (/timeout|timed out|did not respond/i.test(text)) return "timeout";
  if (/network|failed to fetch|connection/i.test(text)) return "network";
  if (/auth|api key|permission|401|403/i.test(text)) return "auth";
  if (/not found|endpoint|404/i.test(text)) return "not_found";
  if (/workspace file|workspace files|context|directory/i.test(text)) return "context";
  if (/interrupted|no longer exists|restored|resend/i.test(text)) return "interrupted";
  return "unknown";
}
