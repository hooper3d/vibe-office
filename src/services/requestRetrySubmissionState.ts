import type { ConversationMessage } from "../domain/projectScope";
import type { AgentInstance, Project } from "../domain/types";
import type { RequestWorkspaceState } from "./requestRuntimeStore";
import {
  resolveDirectMessageRetry,
  resolveTaskRoomMessageRetry,
  type DirectMessageRetry,
  type TaskRoomMessageRetry,
} from "./requestRecovery";
import {
  completeTaskRoomMessageRetry,
  prepareDirectMessageRetry,
  prepareTaskRoomMessageRetry,
} from "./requestRetryState";

export type DirectRetrySubmission =
  | {
      kind: "ignore";
    }
  | {
      kind: "fail";
      message: ConversationMessage;
      reason: string;
    }
  | {
      kind: "ready";
      retry: Extract<DirectMessageRetry, { kind: "free-chat" | "project-chat" }>;
      state: RequestWorkspaceState;
    };

export type TaskRoomRetrySubmission =
  | {
      kind: "ignore";
    }
  | {
      kind: "ready";
      retry: Extract<TaskRoomMessageRetry, { kind: "retry" }>;
      state: RequestWorkspaceState;
    };

export function prepareDirectRetrySubmission({
  agents,
  freeChatProjectId,
  messageId,
  projects,
  state,
}: {
  agents: AgentInstance[];
  freeChatProjectId: string;
  messageId: string;
  projects: Project[];
  state: RequestWorkspaceState;
}): DirectRetrySubmission {
  const retry = resolveDirectMessageRetry({
    messageId,
    messages: state.messages,
    conversations: state.conversations,
    agents,
    projects,
    freeChatProjectId,
  });
  if (retry.kind === "ignore") return { kind: "ignore" };
  if (retry.kind === "fail") {
    return {
      kind: "fail",
      message: retry.message,
      reason: retry.reason,
    };
  }

  return {
    kind: "ready",
    retry,
    state: {
      ...state,
      messages: prepareDirectMessageRetry({
        messages: state.messages,
        message: retry.message,
        targetAgentId: retry.targetAgent.id,
      }),
    },
  };
}

export function prepareTaskRoomRetrySubmission({
  messageId,
  state,
}: {
  messageId: string;
  state: RequestWorkspaceState;
}): TaskRoomRetrySubmission {
  const retry = resolveTaskRoomMessageRetry({
    messageId,
    messages: state.messages,
    conversations: state.conversations,
  });
  if (retry.kind === "ignore") return { kind: "ignore" };

  return {
    kind: "ready",
    retry,
    state: {
      ...state,
      messages: prepareTaskRoomMessageRetry({
        messages: state.messages,
        messageId: retry.message.id,
      }),
    },
  };
}

export function completeTaskRoomRetrySubmission({
  messageId,
  state,
  succeeded,
}: {
  messageId: string;
  state: RequestWorkspaceState;
  succeeded: boolean;
}): RequestWorkspaceState {
  return {
    ...state,
    messages: completeTaskRoomMessageRetry({
      messages: state.messages,
      messageId,
      succeeded,
    }),
  };
}
