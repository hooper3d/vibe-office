import { useEffect } from "react";
import type { Conversation, ConversationMessage } from "../domain/projectScope";
import type { AgentInstance, Project } from "../domain/types";
import { getNextPendingRecoverySubmission } from "./requestRecoverySubmissionState";
import type { RequestRuntimeStore, RequestWorkspaceState } from "./requestRuntimeStore";

export type PendingRecoveryControllerOptions = {
  agents: AgentInstance[];
  applyRequestWorkspaceState: (state: RequestWorkspaceState) => void;
  completeFreeChatRequest: (options: {
    conversation: Conversation;
    targetAgent: AgentInstance;
    userMessageId: string;
    text: string;
  }) => Promise<void>;
  conversations: Conversation[];
  freeChatProjectId: string;
  messages: ConversationMessage[];
  projects: Project[];
  requestStore: RequestRuntimeStore;
  resumeProjectDirectRequest: (options: {
    message: ConversationMessage;
    conversation: Conversation;
    project: Project;
    targetAgent: AgentInstance;
    text: string;
  }) => Promise<void>;
};

export function usePendingRecoveryController({
  agents,
  applyRequestWorkspaceState,
  completeFreeChatRequest,
  conversations,
  freeChatProjectId,
  messages,
  projects,
  requestStore,
  resumeProjectDirectRequest,
}: PendingRecoveryControllerOptions) {
  useEffect(() => {
    const submission = getNextPendingRecoverySubmission({
      activeRequestIds: requestStore.activeRequestIds(),
      agents,
      freeChatProjectId,
      projects,
      state: requestStore.snapshot(),
    });
    if (submission.kind === "none") return;

    if (submission.kind === "fail") {
      applyRequestWorkspaceState(submission.state);
      return;
    }

    const trackedRequestId = requestStore.begin(submission.message);
    applyRequestWorkspaceState(submission.state);

    if (submission.recovery.kind === "free-chat") {
      void completeFreeChatRequest({
        conversation: submission.recovery.conversation,
        targetAgent: submission.recovery.targetAgent,
        userMessageId: submission.message.id,
        text: submission.recovery.text,
      }).finally(() => {
        requestStore.end(trackedRequestId);
      });
      return;
    }

    void resumeProjectDirectRequest({
      message: submission.message,
      conversation: submission.recovery.conversation,
      project: submission.recovery.project,
      targetAgent: submission.recovery.targetAgent,
      text: submission.recovery.text,
    }).finally(() => {
      requestStore.end(trackedRequestId);
    });
  }, [agents, conversations, messages, projects]);
}
