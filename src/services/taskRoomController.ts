import type { Dispatch, SetStateAction } from "react";
import type { AgentInstance, Project } from "../domain/types";
import {
  completeTaskRoomRetrySubmission,
  prepareTaskRoomRetrySubmission,
} from "./requestRetrySubmissionState";
import type { RequestRuntimeStore, RequestWorkspaceState } from "./requestRuntimeStore";
import { prepareTaskRoomSubmission } from "./requestSubmissionState";
import {
  executeTaskRoomRequestState,
  type TaskRoomRequestOutputMode,
  type TaskRoomRequestState,
  type TaskRoomRequestStep,
} from "./taskRoomOrchestrator";
import type { WorkspaceFileAttachment } from "./workspaceFileClient";

export type TaskRoomControllerOptions = {
  applyRequestWorkspaceState: (state: RequestWorkspaceState, outputMode?: TaskRoomRequestOutputMode) => void;
  attachedWorkspaceFiles: WorkspaceFileAttachment[];
  chiefAgent?: AgentInstance;
  requestStore: RequestRuntimeStore;
  retryTaskLifecycle: (taskId: string) => Promise<boolean>;
  selectedTaskParticipants: AgentInstance[];
  selectedWorkspaceProject?: Project;
  setAttachedWorkspaceFiles: Dispatch<SetStateAction<WorkspaceFileAttachment[]>>;
  setMessageText: Dispatch<SetStateAction<string>>;
  setOutputMode: (mode: TaskRoomRequestOutputMode) => void;
};

export function useTaskRoomController({
  applyRequestWorkspaceState,
  attachedWorkspaceFiles,
  chiefAgent,
  requestStore,
  retryTaskLifecycle,
  selectedTaskParticipants,
  selectedWorkspaceProject,
  setAttachedWorkspaceFiles,
  setMessageText,
  setOutputMode,
}: TaskRoomControllerOptions) {
  function getTaskRoomRequestState(): TaskRoomRequestState {
    return requestStore.snapshot();
  }

  function applyTaskRoomRequestStep(step: TaskRoomRequestStep) {
    applyRequestWorkspaceState(step.state, step.outputMode);
  }

  async function retryTaskRoomMessage(messageId: string) {
    const retry = prepareTaskRoomRetrySubmission({
      state: requestStore.snapshot(),
      messageId,
    });
    if (retry.kind === "ignore") return;

    const trackedRequestId = requestStore.begin(retry.retry.message);
    applyRequestWorkspaceState(retry.state);

    try {
      const succeeded = await retryTaskLifecycle(retry.retry.taskId);
      const completedState = completeTaskRoomRetrySubmission({
        state: requestStore.snapshot(),
        messageId: retry.retry.message.id,
        succeeded,
      });
      applyRequestWorkspaceState(completedState);
    } finally {
      requestStore.end(trackedRequestId);
    }
  }

  async function submitTaskRoomMessage(text: string) {
    if (!selectedWorkspaceProject || !chiefAgent) return;

    const targetAgent = chiefAgent;
    const participants = selectedTaskParticipants;
    const taskFiles = [...attachedWorkspaceFiles];
    const submission = prepareTaskRoomSubmission({
      state: requestStore.snapshot(),
      project: selectedWorkspaceProject,
      chief: targetAgent,
      participants,
      text,
      files: taskFiles,
    });
    const { conversation, requestId, runId, taskId, userMessageId } = submission;

    requestStore.begin(requestId);
    applyRequestWorkspaceState(submission.state);
    setMessageText("");
    setAttachedWorkspaceFiles([]);
    setOutputMode("outputs");

    try {
      await executeTaskRoomRequestState({
        state: getTaskRoomRequestState(),
        conversation,
        project: selectedWorkspaceProject,
        chief: targetAgent,
        participants,
        text,
        files: taskFiles,
        taskId,
        runId,
        userMessageId,
        onStep: applyTaskRoomRequestStep,
      });
    } finally {
      requestStore.end(requestId);
    }
  }

  return {
    retryTaskRoomMessage,
    submitTaskRoomMessage,
  };
}
