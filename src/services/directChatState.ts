import type { Conversation, ConversationMessage, ProjectArtifact, ProjectRun, ProjectTask } from "../domain/projectScope";
import type { AgentInstance, Project } from "../domain/types";
import { failRunById, markConversationMessageFailed, markConversationMessageSent } from "../domain/requestLifecycle";
import type { AgentRequestExecution } from "./agentRequestExecutor";
import { createMediaArtifactFromText, mapA2AArtifacts } from "./artifactState";
import { createAgentMessageFromTask, isDirectMessageResponse, mapA2AState } from "./agentTaskResult";

export function applyFreeChatTurnCompleted({
  messages,
  result,
  conversationId,
  projectId,
  agentId,
  userMessageId,
}: {
  messages: ConversationMessage[];
  result: AgentRequestExecution;
  conversationId: string;
  projectId: string;
  agentId: string;
  userMessageId: string;
}) {
  return [
    ...markConversationMessageSent(messages, userMessageId),
    createAgentMessageFromTask({
      task: result.task,
      conversationId,
      projectId,
      agentId,
      fallbackText: result.summary,
      createdAt: result.completedAt,
    }),
  ];
}

export function applyConversationMessageFailed({
  messages,
  messageId,
  errorText,
}: {
  messages: ConversationMessage[];
  messageId: string;
  errorText: string;
}) {
  return markConversationMessageFailed(messages, messageId, errorText);
}

export function applyProjectDirectTurnCompleted({
  messages,
  runs,
  tasks,
  artifacts,
  result,
  project,
  conversationId,
  targetAgent,
  userMessageId,
  runId,
  participantAgentIds,
  text,
}: {
  messages: ConversationMessage[];
  runs: ProjectRun[];
  tasks: ProjectTask[];
  artifacts: ProjectArtifact[];
  result: AgentRequestExecution;
  project: Project;
  conversationId: string;
  targetAgent: AgentInstance;
  userMessageId: string;
  runId: string;
  participantAgentIds: string[];
  text: string;
}) {
  const remoteTask = result.task;
  const responseSummary = result.summary;
  const completedAt = result.completedAt;
  const mediaArtifact = createMediaArtifactFromText({
    projectId: project.id,
    taskId: remoteTask.id || runId,
    agentId: targetAgent.id,
    name: `${targetAgent.name} media`,
    text: responseSummary,
    createdAt: completedAt,
  });
  const returnedArtifacts = [
    ...mapA2AArtifacts(remoteTask, project.id, targetAgent.id),
    ...(mediaArtifact ? [mediaArtifact] : []),
  ];
  const returnedArtifactIds = returnedArtifacts.map((artifact) => artifact.id);
  const mappedState = mapA2AState(remoteTask.status.state);
  const shouldCreateTask = !isDirectMessageResponse(remoteTask);
  const taskId = shouldCreateTask ? remoteTask.id || crypto.randomUUID() : undefined;
  const agentMessage = responseSummary
    ? createAgentMessageFromTask({
        task: remoteTask,
        conversationId,
        projectId: project.id,
        agentId: targetAgent.id,
        fallbackText: responseSummary,
        taskId,
        runId,
        createdAt: completedAt,
      })
    : undefined;
  const projectTask: ProjectTask | undefined =
    shouldCreateTask && taskId
      ? {
          id: taskId,
          projectId: project.id,
          contextId: remoteTask.contextId || project.namespace,
          remoteTaskId: remoteTask.id || taskId,
          remoteContextId: remoteTask.contextId || project.namespace,
          title: text.length > 56 ? `${text.slice(0, 56)}...` : text,
          ownerAgentId: targetAgent.id,
          participantAgentIds,
          state: mappedState,
          summary: responseSummary,
          events: [
            {
              id: `${taskId}-accepted`,
              taskId,
              agentId: targetAgent.id,
              label: "Agent returned a task.",
              state: mappedState,
              timestamp: completedAt,
            },
          ],
          artifactIds: returnedArtifactIds,
          updatedAt: completedAt,
        }
      : undefined;

  return {
    messages: [
      ...markConversationMessageSent(messages, userMessageId, { runId }),
      ...(agentMessage ? [agentMessage] : []),
    ],
    artifacts: returnedArtifacts.length > 0 ? [...returnedArtifacts, ...artifacts] : artifacts,
    tasks: projectTask ? [projectTask, ...tasks.filter((task) => task.id !== projectTask.id)] : tasks,
    runs: runs.map((run) =>
      run.id === runId
        ? {
            ...run,
            taskId,
            state: mappedState,
            summary: responseSummary || run.summary,
            eventIds: mergeIds(run.eventIds, [`${runId}-completed`]),
            artifactIds: returnedArtifactIds,
            updatedAt: completedAt,
          }
        : run,
    ),
    completedAt,
    returnedArtifactCount: returnedArtifacts.length,
    createdTask: Boolean(projectTask),
  };
}

export function applyProjectDirectTurnFailed({
  messages,
  runs,
  userMessageId,
  runId,
  errorText,
  failedAt,
}: {
  messages: ConversationMessage[];
  runs: ProjectRun[];
  userMessageId: string;
  runId: string;
  errorText: string;
  failedAt: string;
}) {
  return {
    messages: markConversationMessageFailed(messages, userMessageId, errorText, { runId }),
    runs: failRunById(runs, runId, failedAt, errorText),
  };
}

export function touchConversationUpdatedAt(conversations: Conversation[], conversationId: string, updatedAt: string) {
  return conversations.map((conversation) =>
    conversation.id === conversationId
      ? {
          ...conversation,
          updatedAt,
        }
      : conversation,
  );
}

function mergeIds(first: string[], second: string[]) {
  return Array.from(new Set([...first, ...second]));
}
