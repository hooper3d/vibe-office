import type { Conversation, ConversationMessage, ProjectArtifact, ProjectRun, ProjectTask } from "../domain/projectScope";
import type { AgentInstance, Project } from "../domain/types";
import { failRunForMessage, markConversationMessageFailed } from "../domain/requestLifecycle";
import { getUserFacingAgentError } from "./agentErrorText";
import { buildAgentRequestText } from "./agentRequestText";
import { executeFreeChatTurn, executeProjectDirectTurn } from "./directChatRequest";
import {
  applyConversationMessageFailed,
  applyFreeChatTurnCompleted,
  applyProjectDirectTurnCompleted,
  applyProjectDirectTurnFailed,
  touchConversationUpdatedAt,
} from "./directChatState";
import { restoreWorkspaceAttachments } from "./workspaceContextRecovery";
import type { WorkspaceFileAttachment } from "./workspaceFileClient";

export type DirectRequestOutputMode = "runs" | "artifacts";

export type DirectRequestState = {
  conversations: Conversation[];
  messages: ConversationMessage[];
  runs: ProjectRun[];
  tasks: ProjectTask[];
  artifacts: ProjectArtifact[];
};

export type DirectRequestResult = {
  state: DirectRequestState;
  outputMode?: DirectRequestOutputMode;
};

export type DirectRequestOrchestratorDeps = {
  executeFreeChatTurn?: typeof executeFreeChatTurn;
  executeProjectDirectTurn?: typeof executeProjectDirectTurn;
  restoreWorkspaceAttachments?: typeof restoreWorkspaceAttachments;
  now?: () => string;
};

export async function completeFreeChatRequestState({
  state,
  conversation,
  targetAgent,
  userMessageId,
  text,
  freeChatProjectId,
  deps = {},
}: {
  state: DirectRequestState;
  conversation: Conversation;
  targetAgent: AgentInstance;
  userMessageId: string;
  text: string;
  freeChatProjectId: string;
  deps?: DirectRequestOrchestratorDeps;
}): Promise<DirectRequestResult> {
  const executeTurn = deps.executeFreeChatTurn ?? executeFreeChatTurn;

  try {
    const result = await executeTurn({
      agent: targetAgent,
      text,
      messages: state.messages,
      conversationId: conversation.id,
      userMessageId,
    });

    return {
      state: {
        ...state,
        messages: applyFreeChatTurnCompleted({
          messages: state.messages,
          result,
          conversationId: conversation.id,
          projectId: freeChatProjectId,
          agentId: targetAgent.id,
          userMessageId,
        }),
        conversations: touchConversationUpdatedAt(state.conversations, conversation.id, result.completedAt),
      },
    };
  } catch (error) {
    return {
      state: {
        ...state,
        messages: applyConversationMessageFailed({
          messages: state.messages,
          messageId: userMessageId,
          errorText: getUserFacingAgentError(error),
        }),
      },
    };
  }
}

export async function resumeProjectDirectRequestState({
  state,
  message,
  conversation,
  project,
  targetAgent,
  text,
  deps = {},
}: {
  state: DirectRequestState;
  message: ConversationMessage;
  conversation: Conversation;
  project: Project;
  targetAgent: AgentInstance;
  text: string;
  deps?: DirectRequestOrchestratorDeps;
}): Promise<DirectRequestResult> {
  const restoreAttachments = deps.restoreWorkspaceAttachments ?? restoreWorkspaceAttachments;
  const now = deps.now ?? (() => new Date().toISOString());
  let restoredFiles: WorkspaceFileAttachment[] = [];

  try {
    restoredFiles = await restoreAttachments(project, message);
  } catch {
    const failedAt = now();
    const errorText = "Workspace files from the interrupted request could not be restored. Please resend it.";

    return {
      state: {
        ...state,
        messages: markConversationMessageFailed(state.messages, message.id, errorText, { errorKind: "context" }),
        runs: failRunForMessage(state.runs, message, failedAt, errorText),
      },
      outputMode: "runs",
    };
  }

  const runId = message.runId ?? crypto.randomUUID();
  const participantAgentIds = [targetAgent.id];
  const existingRun = state.runs.find((run) => run.id === runId);
  const runReadyState: DirectRequestState = existingRun
    ? state
    : {
        ...state,
        runs: [
          {
            id: runId,
            projectId: project.id,
            conversationId: conversation.id,
            type: "direct_message",
            ownerAgentId: targetAgent.id,
            participantAgentIds,
            state: "submitting",
            summary: "Restoring interrupted project chat.",
            eventIds: [`${runId}-restored`],
            artifactIds: [],
            createdAt: message.createdAt,
            updatedAt: now(),
          },
          ...state.runs,
        ],
      };

  return completeProjectDirectRequestState({
    state: runReadyState,
    project,
    conversation,
    targetAgent,
    userMessageId: message.id,
    runId,
    participantAgentIds,
    text,
    agentRequestText: buildAgentRequestText(text, project, restoredFiles),
    deps,
  });
}

export async function completeProjectDirectRequestState({
  state,
  project,
  conversation,
  targetAgent,
  userMessageId,
  runId,
  participantAgentIds,
  text,
  agentRequestText,
  deps = {},
}: {
  state: DirectRequestState;
  project: Project;
  conversation: Conversation;
  targetAgent: AgentInstance;
  userMessageId: string;
  runId: string;
  participantAgentIds: string[];
  text: string;
  agentRequestText: string;
  deps?: DirectRequestOrchestratorDeps;
}): Promise<DirectRequestResult> {
  const executeTurn = deps.executeProjectDirectTurn ?? executeProjectDirectTurn;

  try {
    const result = await executeTurn({
      agent: targetAgent,
      project,
      agentRequestText,
      messages: state.messages,
      conversationId: conversation.id,
      userMessageId,
    });
    const nextState = applyProjectDirectTurnCompleted({
      messages: state.messages,
      runs: state.runs,
      tasks: state.tasks,
      artifacts: state.artifacts,
      result,
      project,
      conversationId: conversation.id,
      targetAgent,
      userMessageId,
      runId,
      participantAgentIds,
      text,
    });

    return {
      state: {
        conversations: touchConversationUpdatedAt(state.conversations, conversation.id, nextState.completedAt),
        messages: nextState.messages,
        runs: nextState.runs,
        tasks: nextState.tasks,
        artifacts: nextState.artifacts,
      },
      outputMode: nextState.returnedArtifactCount > 0 ? "artifacts" : nextState.createdTask ? "runs" : undefined,
    };
  } catch (error) {
    const failedAt = (deps.now ?? (() => new Date().toISOString()))();
    const nextState = applyProjectDirectTurnFailed({
      messages: state.messages,
      runs: state.runs,
      userMessageId,
      runId,
      errorText: getUserFacingAgentError(error),
      failedAt,
    });

    return {
      state: {
        ...state,
        messages: nextState.messages,
        runs: nextState.runs,
      },
      outputMode: "runs",
    };
  }
}
