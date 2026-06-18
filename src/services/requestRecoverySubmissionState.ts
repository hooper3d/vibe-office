import type { ConversationMessage } from "../domain/projectScope";
import type { AgentInstance, Project } from "../domain/types";
import {
  failRunForMessage,
  failTaskRoomTaskForMessage,
  markConversationMessageFailed,
  markConversationMessageSending,
} from "../domain/requestLifecycle";
import type { RequestWorkspaceState } from "./requestRuntimeStore";
import {
  getPendingRequestMessages,
  resolvePendingRequestRecovery,
  type PendingRequestRecovery,
} from "./requestRecovery";

export type PendingRecoverySubmission =
  | {
      kind: "none";
    }
  | {
      kind: "fail";
      message: ConversationMessage;
      state: RequestWorkspaceState;
    }
  | {
      kind: "ready";
      message: ConversationMessage;
      recovery: Extract<PendingRequestRecovery, { kind: "free-chat" | "project-chat" }>;
      state: RequestWorkspaceState;
    };

export function getNextPendingRecoverySubmission({
  activeRequestIds,
  agents,
  freeChatProjectId,
  projects,
  state,
  now = () => new Date().toISOString(),
}: {
  activeRequestIds: ReadonlySet<string>;
  agents: AgentInstance[];
  freeChatProjectId: string;
  projects: Project[];
  state: RequestWorkspaceState;
  now?: () => string;
}): PendingRecoverySubmission {
  const [message] = getPendingRequestMessages(state.messages, activeRequestIds);
  if (!message) return { kind: "none" };

  const recovery = resolvePendingRequestRecovery({
    message,
    conversations: state.conversations,
    agents,
    projects,
    freeChatProjectId,
  });

  if (recovery.kind === "fail") {
    return {
      kind: "fail",
      message,
      state: applyPendingRecoveryFailure({
        state,
        message,
        reason: recovery.reason,
        failTaskRoom: recovery.failTaskRoom,
        failedAt: now(),
      }),
    };
  }

  return {
    kind: "ready",
    message,
    recovery,
    state: {
      ...state,
      messages: markConversationMessageSending(state.messages, message.id),
    },
  };
}

export function applyPendingRecoveryFailure({
  failTaskRoom,
  failedAt,
  message,
  reason,
  state,
}: {
  failTaskRoom: boolean;
  failedAt: string;
  message: ConversationMessage;
  reason: string;
  state: RequestWorkspaceState;
}): RequestWorkspaceState {
  const messages = markConversationMessageFailed(state.messages, message.id, reason);

  if (!failTaskRoom) {
    return {
      ...state,
      messages,
    };
  }

  return {
    ...state,
    messages,
    tasks: failTaskRoomTaskForMessage(state.tasks, message, reason, failedAt),
    runs: failRunForMessage(state.runs, message, failedAt, reason),
  };
}
