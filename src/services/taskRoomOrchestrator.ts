import type { Conversation, ConversationMessage, ProjectArtifact, ProjectRun, ProjectTask, WorkState } from "../domain/projectScope";
import type { AgentInstance, Project } from "../domain/types";
import { getUserFacingAgentError } from "./agentErrorText";
import { mapA2AState } from "./agentTaskResult";
import type { AgentRequestExecution } from "./agentRequestExecutor";
import {
  executeChiefAggregationTurn,
  executeChiefPlanTurn,
  executeParticipantTaskTurn,
  type ParticipantTaskResult,
} from "./taskRoomRequest";
import {
  applyTaskRoomAggregationCompleted,
  applyTaskRoomChiefPlanCompleted,
  applyTaskRoomParticipantCompleted,
  applyTaskRoomParticipantDelegated,
  applyTaskRoomRequestFailed,
} from "./taskRoomState";
import type { WorkspaceFileAttachment } from "./workspaceFileClient";

export type TaskRoomRequestOutputMode = "outputs";

export type TaskRoomRequestState = {
  conversations: Conversation[];
  messages: ConversationMessage[];
  runs: ProjectRun[];
  tasks: ProjectTask[];
  artifacts: ProjectArtifact[];
};

export type TaskRoomRequestStep = {
  state: TaskRoomRequestState;
  outputMode?: TaskRoomRequestOutputMode;
};

export type TaskRoomRequestDeps = {
  executeChiefPlanTurn?: typeof executeChiefPlanTurn;
  executeParticipantTaskTurn?: typeof executeParticipantTaskTurn;
  executeChiefAggregationTurn?: typeof executeChiefAggregationTurn;
  now?: () => string;
};

export async function executeTaskRoomRequestState({
  state,
  conversation,
  project,
  chief,
  participants,
  text,
  files,
  taskId,
  runId,
  userMessageId,
  artifactIds = [],
  deps = {},
  onStep,
}: {
  state: TaskRoomRequestState;
  conversation: Conversation;
  project: Project;
  chief: AgentInstance;
  participants: AgentInstance[];
  text: string;
  files: WorkspaceFileAttachment[];
  taskId: string;
  runId: string;
  userMessageId: string;
  artifactIds?: string[];
  deps?: TaskRoomRequestDeps;
  onStep?: (step: TaskRoomRequestStep) => void;
}): Promise<TaskRoomRequestStep> {
  const executeChiefPlan = deps.executeChiefPlanTurn ?? executeChiefPlanTurn;
  const executeParticipantTask = deps.executeParticipantTaskTurn ?? executeParticipantTaskTurn;
  const executeChiefAggregation = deps.executeChiefAggregationTurn ?? executeChiefAggregationTurn;
  const now = deps.now ?? (() => new Date().toISOString());
  let currentState = state;
  const taskArtifactIds = [...artifactIds];

  const applyStep = (step: TaskRoomRequestStep) => {
    currentState = step.state;
    onStep?.(step);
  };

  try {
    const chiefPlanResult = await executeChiefPlan({
      chief,
      project,
      text,
      participants,
      files,
    });
    const chiefPlanState = applyTaskRoomChiefPlanCompleted({
      state: currentState,
      result: chiefPlanResult,
      conversationId: conversation.id,
      projectId: project.id,
      chiefAgentId: chief.id,
      taskId,
      runId,
      userMessageId,
      artifactIds: taskArtifactIds,
    });
    taskArtifactIds.splice(0, taskArtifactIds.length, ...chiefPlanState.artifactIds);
    applyStep({
      state: {
        ...currentState,
        messages: chiefPlanState.state.messages,
        tasks: chiefPlanState.state.tasks,
        runs: chiefPlanState.state.runs,
        artifacts: chiefPlanState.state.artifacts,
      },
      outputMode: chiefPlanState.addedArtifactCount > 0 ? "outputs" : undefined,
    });

    const participantResults: ParticipantTaskResult[] = [];

    for (const participant of participants) {
      const delegatedTasks = applyTaskRoomParticipantDelegated({
        tasks: currentState.tasks,
        taskId,
        participant,
        delegatedAt: now(),
      });
      applyStep({
        state: {
          ...currentState,
          tasks: delegatedTasks,
        },
      });

      let participantSummary = "";
      let participantState: WorkState = "completed";
      let participantAt = now();

      try {
        const participantResult = await executeParticipantTask({
          participant,
          project,
          text,
          chief,
          chiefPlan: chiefPlanState.chiefPlan,
          files,
        });
        participantSummary = participantResult.summary;
        participantState = mapA2AState(participantResult.task.status.state);
        participantAt = participantResult.completedAt;
      } catch (error) {
        participantState = "failed";
        participantSummary = getUserFacingAgentError(error);
        participantAt = now();
      }

      const participantStateUpdate = applyTaskRoomParticipantCompleted({
        state: {
          tasks: currentState.tasks,
          artifacts: currentState.artifacts,
        },
        projectId: project.id,
        taskId,
        participant,
        participantState,
        participantSummary,
        participantAt,
        artifactIds: taskArtifactIds,
      });
      taskArtifactIds.splice(0, taskArtifactIds.length, ...participantStateUpdate.artifactIds);
      participantResults.push(participantStateUpdate.participantResult);
      applyStep({
        state: {
          ...currentState,
          artifacts: participantStateUpdate.state.artifacts,
          tasks: participantStateUpdate.state.tasks,
        },
      });
    }

    let finalSummary = "";
    let finalState: WorkState = "completed";
    let finalAt = now();
    let aggregateResult: AgentRequestExecution | undefined;
    let markUserMessageFailed = false;

    try {
      aggregateResult = await executeChiefAggregation({
        chief,
        project,
        text,
        chiefPlan: chiefPlanState.chiefPlan,
        participantResults,
        files,
      });
      finalSummary = aggregateResult.summary;
      finalState = mapA2AState(aggregateResult.task.status.state);
      finalAt = aggregateResult.completedAt;
    } catch (error) {
      finalState = "failed";
      finalSummary = getUserFacingAgentError(error);
      finalAt = now();
      markUserMessageFailed = true;
    }

    const finalStateUpdate = applyTaskRoomAggregationCompleted({
      state: currentState,
      conversations: currentState.conversations,
      result: aggregateResult,
      conversationId: conversation.id,
      projectId: project.id,
      chiefAgentId: chief.id,
      taskId,
      runId,
      finalState,
      finalSummary,
      finalAt,
      participantAgentIds: participants.map((participant) => participant.id),
      artifactIds: taskArtifactIds,
      userMessageId,
      markUserMessageFailed,
    });
    const finalStep = {
      state: {
        conversations: finalStateUpdate.conversations,
        messages: finalStateUpdate.state.messages,
        tasks: finalStateUpdate.state.tasks,
        runs: finalStateUpdate.state.runs,
        artifacts: finalStateUpdate.state.artifacts,
      },
      outputMode: "outputs",
    } satisfies TaskRoomRequestStep;
    applyStep(finalStep);
    return finalStep;
  } catch (error) {
    const failedState = applyTaskRoomRequestFailed({
      messages: currentState.messages,
      tasks: currentState.tasks,
      runs: currentState.runs,
      userMessageId,
      taskId,
      runId,
      chiefAgentId: chief.id,
      errorMessage: getUserFacingAgentError(error),
      failedAt: now(),
    });
    const failedStep = {
      state: {
        ...currentState,
        messages: failedState.messages,
        tasks: failedState.tasks,
        runs: failedState.runs,
      },
      outputMode: "outputs",
    } satisfies TaskRoomRequestStep;
    applyStep(failedStep);
    return failedStep;
  }
}
