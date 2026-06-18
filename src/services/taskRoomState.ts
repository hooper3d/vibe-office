import type { Conversation, ConversationMessage, ProjectArtifact, ProjectRun, ProjectTask, WorkState } from "../domain/projectScope";
import type { AgentInstance } from "../domain/types";
import { failRunById, markConversationMessageFailed, markConversationMessageSent } from "../domain/requestLifecycle";
import type { AgentRequestExecution } from "./agentRequestExecutor";
import { createMediaArtifactFromText, createTextArtifact } from "./artifactState";
import { createAgentMessageFromTask } from "./agentTaskResult";
import type { ParticipantTaskResult } from "./taskRoomRequest";

type TaskRoomState = {
  messages: ConversationMessage[];
  tasks: ProjectTask[];
  runs: ProjectRun[];
  artifacts: ProjectArtifact[];
};

export function applyTaskRoomChiefPlanCompleted({
  state,
  result,
  conversationId,
  projectId,
  chiefAgentId,
  taskId,
  runId,
  userMessageId,
  artifactIds,
}: {
  state: TaskRoomState;
  result: AgentRequestExecution;
  conversationId: string;
  projectId: string;
  chiefAgentId: string;
  taskId: string;
  runId: string;
  userMessageId: string;
  artifactIds: string[];
}) {
  const chiefPlan = result.summary;
  const chiefPlanAt = result.completedAt;
  const agentMessage = createAgentMessageFromTask({
    task: result.task,
    conversationId,
    projectId,
    agentId: chiefAgentId,
    fallbackText: chiefPlan,
    taskId,
    runId,
    createdAt: chiefPlanAt,
  });
  const chiefMediaArtifact = createMediaArtifactFromText({
    projectId,
    taskId,
    agentId: chiefAgentId,
    name: "Chief media",
    text: chiefPlan,
    createdAt: chiefPlanAt,
  });
  const nextArtifactIds = chiefMediaArtifact ? [...artifactIds, chiefMediaArtifact.id] : artifactIds;

  return {
    chiefPlan,
    chiefPlanAt,
    artifactIds: nextArtifactIds,
    addedArtifactCount: chiefMediaArtifact ? 1 : 0,
    state: {
      messages: [...markConversationMessageSent(state.messages, userMessageId), agentMessage],
      artifacts: chiefMediaArtifact ? [chiefMediaArtifact, ...state.artifacts] : state.artifacts,
      tasks: state.tasks.map((task) =>
        task.id === taskId
          ? {
              ...task,
              state: "working" as const,
              summary: "Chief plan ready. Delegating to selected participants.",
              events: [
                ...task.events,
                {
                  id: `${taskId}-chief-response`,
                  taskId,
                  agentId: chiefAgentId,
                  label: "Chief returned the first task-room plan.",
                  state: "working" as const,
                  timestamp: chiefPlanAt,
                },
              ],
              artifactIds: nextArtifactIds,
              updatedAt: chiefPlanAt,
            }
          : task,
      ),
      runs: state.runs.map((run) =>
        run.id === runId
          ? {
              ...run,
              state: "working" as const,
              summary: chiefPlan,
              eventIds: mergeIds(run.eventIds, [`${runId}-chief-response`]),
              artifactIds: nextArtifactIds,
              updatedAt: chiefPlanAt,
            }
          : run,
      ),
    },
  };
}

export function applyTaskRoomParticipantDelegated({
  tasks,
  taskId,
  participant,
  delegatedAt,
}: {
  tasks: ProjectTask[];
  taskId: string;
  participant: AgentInstance;
  delegatedAt: string;
}) {
  return tasks.map((task) =>
    task.id === taskId
      ? {
          ...task,
          state: "working" as const,
          summary: `Delegated to ${participant.name}.`,
          events: [
            ...task.events,
            {
              id: `${taskId}-${participant.id}-delegated`,
              taskId,
              agentId: participant.id,
              label: `Delegated to ${participant.name}.`,
              state: "submitted" as const,
              timestamp: delegatedAt,
            },
          ],
          updatedAt: delegatedAt,
        }
      : task,
  );
}

export function applyTaskRoomParticipantCompleted({
  state,
  projectId,
  taskId,
  participant,
  participantState,
  participantSummary,
  participantAt,
  artifactIds,
}: {
  state: Pick<TaskRoomState, "tasks" | "artifacts">;
  projectId: string;
  taskId: string;
  participant: AgentInstance;
  participantState: WorkState;
  participantSummary: string;
  participantAt: string;
  artifactIds: string[];
}) {
  const participantArtifact = createTextArtifact({
    projectId,
    taskId,
    agentId: participant.id,
    name: `${participant.name} result`,
    text: participantSummary,
    createdAt: participantAt,
  });
  const nextArtifactIds = [...artifactIds, participantArtifact.id];
  const participantResult: ParticipantTaskResult = {
    agentId: participant.id,
    agentName: participant.name,
    state: participantState,
    summary: participantSummary,
  };

  return {
    artifactIds: nextArtifactIds,
    participantResult,
    state: {
      artifacts: [participantArtifact, ...state.artifacts],
      tasks: state.tasks.map((task) =>
        task.id === taskId
          ? {
              ...task,
              state: "working" as const,
              summary: `${participant.name} returned a result.`,
              events: [
                ...task.events,
                {
                  id: `${taskId}-${participant.id}-result`,
                  taskId,
                  agentId: participant.id,
                  label: participantState === "failed" ? `${participant.name} failed.` : `${participant.name} returned a result.`,
                  state: participantState,
                  timestamp: participantAt,
                },
              ],
              artifactIds: nextArtifactIds,
              updatedAt: participantAt,
            }
          : task,
      ),
    },
  };
}

export function applyTaskRoomAggregationCompleted({
  state,
  conversations,
  result,
  conversationId,
  projectId,
  chiefAgentId,
  taskId,
  runId,
  finalState,
  finalSummary,
  finalAt,
  participantAgentIds,
  artifactIds,
  userMessageId,
  markUserMessageFailed,
}: {
  state: TaskRoomState;
  conversations: Conversation[];
  result?: AgentRequestExecution;
  conversationId: string;
  projectId: string;
  chiefAgentId: string;
  taskId: string;
  runId: string;
  finalState: WorkState;
  finalSummary: string;
  finalAt: string;
  participantAgentIds: string[];
  artifactIds: string[];
  userMessageId: string;
  markUserMessageFailed?: boolean;
}) {
  const aggregateMessage = result
    ? createAgentMessageFromTask({
        task: result.task,
        conversationId,
        projectId,
        agentId: chiefAgentId,
        fallbackText: finalSummary,
        taskId,
        runId,
        createdAt: finalAt,
      })
    : undefined;
  const finalArtifact = createTextArtifact({
    projectId,
    taskId,
    agentId: chiefAgentId,
    name: "Chief summary",
    text: finalSummary,
    createdAt: finalAt,
  });
  const finalArtifactIds = [...artifactIds, finalArtifact.id];
  const nextMessages = markUserMessageFailed
    ? markConversationMessageFailed(state.messages, userMessageId, finalSummary)
    : state.messages;

  return {
    finalArtifactIds,
    state: {
      messages: aggregateMessage ? [...nextMessages, aggregateMessage] : nextMessages,
      artifacts: [finalArtifact, ...state.artifacts],
      tasks: state.tasks.map((task) =>
        task.id === taskId
          ? {
              ...task,
              state: finalState,
              summary: finalSummary,
              events: [
                ...task.events,
                {
                  id: `${taskId}-chief-aggregate`,
                  taskId,
                  agentId: chiefAgentId,
                  label: finalState === "failed" ? "Chief aggregation failed." : "Chief aggregated participant results.",
                  state: finalState,
                  timestamp: finalAt,
                },
              ],
              artifactIds: finalArtifactIds,
              updatedAt: finalAt,
            }
          : task,
      ),
      runs: state.runs.map((run) =>
        run.id === runId
          ? {
              ...run,
              state: finalState,
              summary: finalSummary,
              eventIds: mergeIds(run.eventIds, [`${runId}-completed`]),
              artifactIds: finalArtifactIds,
              updatedAt: finalAt,
            }
          : run,
      ),
    },
    conversations: conversations.map((item) =>
      item.id === conversationId
        ? {
            ...item,
            participantAgentIds,
            updatedAt: finalAt,
          }
        : item,
    ),
  };
}

export function applyTaskRoomRequestFailed({
  messages,
  tasks,
  runs,
  userMessageId,
  taskId,
  runId,
  chiefAgentId,
  errorMessage,
  failedAt,
}: {
  messages: ConversationMessage[];
  tasks: ProjectTask[];
  runs: ProjectRun[];
  userMessageId: string;
  taskId: string;
  runId: string;
  chiefAgentId: string;
  errorMessage: string;
  failedAt: string;
}) {
  return {
    messages: markConversationMessageFailed(messages, userMessageId, errorMessage),
    tasks: tasks.map((task) =>
      task.id === taskId
        ? {
            ...task,
            state: "failed" as const,
            summary: errorMessage,
            events: [
              ...task.events,
              {
                id: `${taskId}-failed`,
                taskId,
                agentId: chiefAgentId,
                label: "Chief task request failed.",
                state: "failed" as const,
                timestamp: failedAt,
              },
            ],
            updatedAt: failedAt,
          }
        : task,
    ),
    runs: failRunById(runs, runId, failedAt, errorMessage),
  };
}

function mergeIds(first: string[], second: string[]) {
  return Array.from(new Set([...first, ...second]));
}
