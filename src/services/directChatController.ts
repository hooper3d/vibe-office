import type { Dispatch, SetStateAction } from "react";
import type { Conversation, ConversationMessage } from "../domain/projectScope";
import { markConversationMessageFailed } from "../domain/requestLifecycle";
import type { AgentInstance, Project } from "../domain/types";
import {
  completeFreeChatRequestState,
  completeProjectDirectRequestState,
  resumeProjectDirectRequestState,
  type DirectRequestOutputMode,
  type DirectRequestResult,
  type DirectRequestState,
} from "./directRequestOrchestrator";
import {
  prepareDirectRetrySubmission,
} from "./requestRetrySubmissionState";
import type { RequestRuntimeStore, RequestWorkspaceState } from "./requestRuntimeStore";
import {
  prepareFreeChatSubmission,
  prepareProjectDirectSubmission,
} from "./requestSubmissionState";
import type { WorkspaceFileAttachment } from "./workspaceFileClient";

export type DirectChatControllerOptions = {
  agents: AgentInstance[];
  applyRequestWorkspaceState: (state: RequestWorkspaceState, outputMode?: DirectRequestOutputMode) => void;
  attachedWorkspaceFiles: WorkspaceFileAttachment[];
  currentConversation?: Conversation;
  freeChatNamespace: string;
  freeChatProjectId: string;
  projects: Project[];
  requestStore: RequestRuntimeStore;
  selectedAgent?: AgentInstance;
  selectedWorkspaceProject?: Project;
  setActiveFreeChatConversationIds: Dispatch<SetStateAction<Record<string, string>>>;
  setAttachedWorkspaceFiles: Dispatch<SetStateAction<WorkspaceFileAttachment[]>>;
  setMessageText: Dispatch<SetStateAction<string>>;
};

export function useDirectChatController({
  agents,
  applyRequestWorkspaceState,
  attachedWorkspaceFiles,
  currentConversation,
  freeChatNamespace,
  freeChatProjectId,
  projects,
  requestStore,
  selectedAgent,
  selectedWorkspaceProject,
  setActiveFreeChatConversationIds,
  setAttachedWorkspaceFiles,
  setMessageText,
}: DirectChatControllerOptions) {
  function getDirectRequestState(): DirectRequestState {
    return requestStore.snapshot();
  }

  function applyDirectRequestResult(result: DirectRequestResult) {
    applyRequestWorkspaceState(result.state, result.outputMode);
  }

  function markInterruptedMessageFailed(message: ConversationMessage, reason: string) {
    const failedMessages = markConversationMessageFailed(requestStore.snapshot().messages, message.id, reason);
    requestStore.sync({ messages: failedMessages });
    applyRequestWorkspaceState({
      ...requestStore.snapshot(),
      messages: failedMessages,
    });
  }

  async function completeFreeChatRequest({
    conversation,
    targetAgent,
    userMessageId,
    text,
  }: {
    conversation: Conversation;
    targetAgent: AgentInstance;
    userMessageId: string;
    text: string;
  }) {
    applyDirectRequestResult(
      await completeFreeChatRequestState({
        state: getDirectRequestState(),
        conversation,
        targetAgent,
        userMessageId,
        text,
        freeChatProjectId,
      }),
    );
  }

  async function submitFreeChatMessage(text: string) {
    if (!selectedAgent) return;

    const targetAgent = selectedAgent;
    const submission = prepareFreeChatSubmission({
      state: requestStore.snapshot(),
      currentConversation,
      targetAgent,
      text,
      freeChatProjectId,
      freeChatNamespace,
    });
    const { conversation, requestId, userMessageId } = submission;

    setActiveFreeChatConversationIds((current) => ({
      ...current,
      [targetAgent.id]: conversation.id,
    }));
    requestStore.begin(requestId);
    applyRequestWorkspaceState(submission.state);
    setMessageText("");
    setAttachedWorkspaceFiles([]);

    try {
      await completeFreeChatRequest({ conversation, targetAgent, userMessageId, text });
    } finally {
      requestStore.end(requestId);
    }
  }

  async function retryDirectMessage(messageId: string) {
    const retry = prepareDirectRetrySubmission({
      state: requestStore.snapshot(),
      messageId,
      agents,
      projects,
      freeChatProjectId,
    });
    if (retry.kind === "ignore") return;
    if (retry.kind === "fail") {
      markInterruptedMessageFailed(retry.message, retry.reason);
      return;
    }

    const trackedRequestId = requestStore.begin(retry.retry.message);
    applyRequestWorkspaceState(retry.state);

    try {
      if (retry.retry.kind === "free-chat") {
        await completeFreeChatRequest({
          conversation: retry.retry.conversation,
          targetAgent: retry.retry.targetAgent,
          userMessageId: retry.retry.message.id,
          text: retry.retry.text,
        });
        return;
      }

      await resumeProjectDirectRequest({
        message: retry.retry.message,
        conversation: retry.retry.conversation,
        project: retry.retry.project,
        targetAgent: retry.retry.targetAgent,
        text: retry.retry.text,
      });
    } finally {
      requestStore.end(trackedRequestId);
    }
  }

  async function resumeProjectDirectRequest({
    message,
    conversation,
    project,
    targetAgent,
    text,
  }: {
    message: ConversationMessage;
    conversation: Conversation;
    project: Project;
    targetAgent: AgentInstance;
    text: string;
  }) {
    applyDirectRequestResult(
      await resumeProjectDirectRequestState({
        state: getDirectRequestState(),
        message,
        conversation,
        project,
        targetAgent,
        text,
      }),
    );
  }

  async function completeProjectDirectRequest({
    project,
    conversation,
    targetAgent,
    userMessageId,
    runId,
    participantAgentIds,
    text,
    agentRequestText,
  }: {
    project: Project;
    conversation: Conversation;
    targetAgent: AgentInstance;
    userMessageId: string;
    runId: string;
    participantAgentIds: string[];
    text: string;
    agentRequestText: string;
  }) {
    applyDirectRequestResult(
      await completeProjectDirectRequestState({
        state: getDirectRequestState(),
        project,
        conversation,
        targetAgent,
        userMessageId,
        runId,
        participantAgentIds,
        text,
        agentRequestText,
      }),
    );
  }

  async function submitProjectDirectMessage(text: string) {
    if (!selectedAgent || !selectedWorkspaceProject) return;

    const targetAgent = selectedAgent;
    const submission = prepareProjectDirectSubmission({
      state: requestStore.snapshot(),
      project: selectedWorkspaceProject,
      targetAgent,
      text,
      files: attachedWorkspaceFiles,
    });
    const {
      agentRequestText,
      conversation,
      participantAgentIds,
      requestId,
      runId,
      userMessageId,
    } = submission;

    requestStore.begin(requestId);
    applyRequestWorkspaceState(submission.state);
    setMessageText("");
    setAttachedWorkspaceFiles([]);

    try {
      await completeProjectDirectRequest({
        project: selectedWorkspaceProject,
        conversation,
        targetAgent,
        userMessageId,
        runId,
        participantAgentIds,
        text,
        agentRequestText,
      });
    } finally {
      requestStore.end(requestId);
    }
  }

  return {
    completeFreeChatRequest,
    resumeProjectDirectRequest,
    retryDirectMessage,
    submitFreeChatMessage,
    submitProjectDirectMessage,
  };
}
