import type { A2ATask } from "../domain/a2a";
import type { ProjectArtifact, ProjectRun, ProjectTask, WorkState } from "../domain/projectScope";
import { extractA2ATaskText, mapA2AState } from "./agentTaskResult";
import { mapA2AArtifacts } from "./artifactState";
import type { RemoteTaskAddress } from "./taskLifecycleExecutor";

export type TaskLifecycleState = {
  artifacts: ProjectArtifact[];
  runs: ProjectRun[];
  tasks: ProjectTask[];
};

export type TaskLifecycleBusyAction = "refresh" | "cancel" | "retry";

export function getTaskLifecycleBusyId(action: TaskLifecycleBusyAction, taskId: string) {
  return `${action}:${taskId}`;
}

export function isTaskLifecycleBusy(busyActionId: string, action: TaskLifecycleBusyAction, taskId: string) {
  return busyActionId === getTaskLifecycleBusyId(action, taskId);
}

export function applyTaskLifecycleRemoteUpdate({
  state,
  task,
  remoteTask,
  agentId,
  label,
  now,
}: {
  state: TaskLifecycleState;
  task: ProjectTask;
  remoteTask: A2ATask;
  agentId: string;
  label: string;
  now: () => string;
}): TaskLifecycleState {
  const updatedAt = remoteTask.status.timestamp ?? now();
  const eventId = `${task.id}-lifecycle-${updatedAt}`;
  const mappedState = mapA2AState(remoteTask.status.state);
  const summary = extractA2ATaskText(remoteTask) ?? task.summary;
  const returnedArtifacts = mapA2AArtifacts(remoteTask, task.projectId, agentId);
  const returnedArtifactIds = returnedArtifacts.map((artifact) => artifact.id);
  const newArtifacts = returnedArtifacts.filter(
    (artifact) => !state.artifacts.some((item) => item.id === artifact.id),
  );

  return {
    artifacts: newArtifacts.length > 0 ? [...newArtifacts, ...state.artifacts] : state.artifacts,
    tasks: state.tasks.map((item) =>
      item.id === task.id
        ? mergeLifecycleTaskUpdate({
            task: item,
            remoteTask,
            agentId,
            label,
            mappedState,
            summary,
            eventId,
            updatedAt,
            returnedArtifactIds,
          })
        : item,
    ),
    runs: state.runs.map((run) =>
      run.taskId === task.id
        ? {
            ...run,
            state: mappedState,
            eventIds: mergeIds(run.eventIds, [eventId]),
            artifactIds: mergeIds(run.artifactIds, returnedArtifactIds),
            updatedAt,
          }
        : run,
    ),
  };
}

export function recordLifecycleUnsupportedState({
  tasks,
  task,
  reason,
  at,
}: {
  tasks: ProjectTask[];
  task: ProjectTask;
  reason: string;
  at: string;
}) {
  return tasks.map((item) =>
    item.id === task.id
      ? {
          ...item,
          events: hasLifecycleUnsupportedEvent(item)
            ? item.events
            : [
                ...item.events,
                {
                  id: `${task.id}-lifecycle-unsupported`,
                  taskId: task.id,
                  agentId: task.ownerAgentId,
                  label: `Lifecycle unsupported: ${reason}`,
                  state: "unsupported" as const,
                  timestamp: at,
                },
              ],
          updatedAt: at,
        }
      : item,
  );
}

export function recordCancelUnsupportedState({
  tasks,
  task,
  reason,
  at,
}: {
  tasks: ProjectTask[];
  task: ProjectTask;
  reason: string;
  at: string;
}) {
  return tasks.map((item) =>
    item.id === task.id
      ? {
          ...item,
          events: hasCancelUnsupportedEvent(item)
            ? item.events
            : [
                ...item.events,
                {
                  id: `${task.id}-cancel-unsupported`,
                  taskId: task.id,
                  agentId: task.ownerAgentId,
                  label: `Cancel unsupported: ${reason}`,
                  state: "unsupported" as const,
                  timestamp: at,
                },
              ],
          updatedAt: at,
        }
      : item,
  );
}

export function prepareTaskRetrySubmitting({
  tasks,
  task,
  ownerAgentId,
  retryAt,
}: {
  tasks: ProjectTask[];
  task: ProjectTask;
  ownerAgentId: string;
  retryAt: string;
}) {
  return tasks.map((item) =>
    item.id === task.id
      ? {
          ...item,
          state: "submitting" as const,
          summary: "Retry submitted.",
          events: [
            ...item.events,
            {
              id: `${task.id}-retry-${retryAt}`,
              taskId: task.id,
              agentId: ownerAgentId,
              label: "Retry submitted.",
              state: "submitting" as const,
              timestamp: retryAt,
            },
          ],
          updatedAt: retryAt,
        }
      : item,
  );
}

export function failTaskRetry({
  tasks,
  task,
  ownerAgentId,
  errorText,
  failedAt,
}: {
  tasks: ProjectTask[];
  task: ProjectTask;
  ownerAgentId: string;
  errorText: string;
  failedAt: string;
}) {
  return tasks.map((item) =>
    item.id === task.id
      ? {
          ...item,
          state: "failed" as const,
          summary: errorText,
          events: [
            ...item.events,
            {
              id: `${task.id}-retry-failed-${failedAt}`,
              taskId: task.id,
              agentId: ownerAgentId,
              label: "Retry failed.",
              state: "failed" as const,
              timestamp: failedAt,
            },
          ],
          updatedAt: failedAt,
        }
      : item,
  );
}

export function getTaskLifecycleAddress(task: ProjectTask, runs: ProjectRun[]): RemoteTaskAddress | null {
  if (task.remoteTaskId) {
    return {
      taskId: task.remoteTaskId,
      contextId: task.remoteContextId ?? task.contextId,
    };
  }

  const linkedRun = runs.find((run) => run.taskId === task.id);
  if (linkedRun?.type === "direct_message") {
    return {
      taskId: task.id,
      contextId: task.contextId,
    };
  }

  return null;
}

export function isTaskActive(state: WorkState) {
  return state === "submitting" || state === "submitted" || state === "working" || state === "input_required";
}

export function isTaskTerminal(state: WorkState) {
  return state === "completed" || state === "failed" || state === "canceled" || state === "unsupported";
}

export function getTaskEventDisplayLabel(label: string) {
  return label.replace("Agent returned an A2A task.", "Agent returned a task.").replace("A2A request failed", "Agent task request failed");
}

export function getRemoteTaskWorkState(remoteTask: A2ATask) {
  return mapA2AState(remoteTask.status.state);
}

function mergeLifecycleTaskUpdate({
  task,
  remoteTask,
  agentId,
  label,
  mappedState,
  summary,
  eventId,
  updatedAt,
  returnedArtifactIds,
}: {
  task: ProjectTask;
  remoteTask: A2ATask;
  agentId: string;
  label: string;
  mappedState: WorkState;
  summary: string;
  eventId: string;
  updatedAt: string;
  returnedArtifactIds: string[];
}) {
  const mergedArtifactIds = mergeIds(task.artifactIds, returnedArtifactIds);
  const remoteTaskId = remoteTask.id || task.remoteTaskId;
  const remoteContextId = remoteTask.contextId || task.remoteContextId;
  const shouldRecordEvent =
    !task.events.some((event) => event.id === eventId) &&
    (task.state !== mappedState ||
      task.summary !== summary ||
      task.remoteTaskId !== remoteTaskId ||
      task.remoteContextId !== remoteContextId ||
      mergedArtifactIds.length !== task.artifactIds.length);

  return {
    ...task,
    state: mappedState,
    remoteTaskId,
    remoteContextId,
    summary,
    events: shouldRecordEvent
      ? [
          ...task.events,
          {
            id: eventId,
            taskId: task.id,
            agentId,
            label,
            state: mappedState,
            timestamp: updatedAt,
          },
        ]
      : task.events,
    artifactIds: mergedArtifactIds,
    updatedAt,
  };
}

export function hasLifecycleUnsupportedEvent(task: ProjectTask) {
  return task.events.some((event) => event.state === "unsupported" || event.label.startsWith("Lifecycle unsupported:"));
}

export function hasCancelUnsupportedEvent(task: ProjectTask) {
  return task.events.some((event) => event.state === "unsupported" && event.label.startsWith("Cancel unsupported:"));
}

function mergeIds(first: string[], second: string[]) {
  return Array.from(new Set([...first, ...second]));
}
