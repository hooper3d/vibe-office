import type { A2ATask, A2ATaskState } from "../domain/a2a";
import type { ConversationMessage, WorkState } from "../domain/projectScope";

export function extractA2ATaskText(task: A2ATask) {
  const parts = task.status.message?.parts ?? [];
  const text = parts.find((part) => part.kind === "text")?.text;
  if (text) return text;

  const artifactText = task.artifacts
    ?.flatMap((artifact) => artifact.parts)
    .find((part) => part.kind === "text")?.text;

  return artifactText;
}

export function isDirectMessageResponse(task: A2ATask) {
  return task.metadata?.responseKind === "direct-message";
}

export function getA2ATaskTimestamp(task: A2ATask) {
  return task.status.timestamp ?? new Date().toISOString();
}

export function mapA2AState(state: A2ATaskState): WorkState {
  if (state === "input-required") return "input_required";
  if (state === "rejected" || state === "auth-required" || state === "unknown") return "failed";
  return state;
}

export function createAgentMessageFromTask({
  task,
  conversationId,
  projectId,
  agentId,
  fallbackText,
  taskId,
  runId,
  createdAt = getA2ATaskTimestamp(task),
}: {
  task: A2ATask;
  conversationId: string;
  projectId: string;
  agentId: string;
  fallbackText: string;
  taskId?: string;
  runId?: string;
  createdAt?: string;
}): ConversationMessage {
  return {
    id: task.status.message?.messageId ?? crypto.randomUUID(),
    conversationId,
    projectId,
    role: "agent",
    agentId,
    contentParts: task.status.message?.parts ?? [
      {
        kind: "text",
        text: fallbackText,
      },
    ],
    a2aMessageId: task.status.message?.messageId,
    taskId,
    runId,
    status: "sent",
    createdAt,
  };
}
