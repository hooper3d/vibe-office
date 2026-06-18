import type { A2ATask } from "../domain/a2a";
import type { ProjectArtifact, ProjectRun, ProjectTask } from "../domain/projectScope";
import type { AgentInstance, Project } from "../domain/types";
import type { RequestWorkspaceState } from "./requestRuntimeStore";
import {
  applyTaskLifecycleRemoteUpdate,
  failTaskRetry,
  getTaskLifecycleAddress,
  hasLifecycleUnsupportedEvent,
  isTaskActive,
  prepareTaskRetrySubmitting,
  recordCancelUnsupportedState,
  recordLifecycleUnsupportedState,
} from "./taskLifecycleState";

export type TaskLifecycleWorkspaceState = {
  artifacts: ProjectArtifact[];
  runs: ProjectRun[];
  tasks: ProjectTask[];
};

export type TaskLifecycleRequestResolution =
  | {
      kind: "ready";
      task: ProjectTask;
      owner: AgentInstance;
      address: NonNullable<ReturnType<typeof getTaskLifecycleAddress>>;
    }
  | {
      kind: "unsupported";
      task: ProjectTask;
      reason: string;
    }
  | {
      kind: "ignore";
    };

export type TaskRetryRequestResolution =
  | {
      kind: "ready";
      task: ProjectTask;
      owner: AgentInstance;
      project: Project;
    }
  | {
      kind: "unsupported";
      task: ProjectTask;
      reason: string;
    }
  | {
      kind: "ignore";
    };

export function resolveTaskLifecycleRequest({
  agents,
  runs,
  taskId,
  tasks,
}: {
  agents: AgentInstance[];
  runs: ProjectRun[];
  taskId: string;
  tasks: ProjectTask[];
}): TaskLifecycleRequestResolution {
  const task = tasks.find((item) => item.id === taskId);
  if (!task) return { kind: "ignore" };

  const address = getTaskLifecycleAddress(task, runs);
  if (!address) {
    return {
      kind: "unsupported",
      task,
      reason: "This task was created by local orchestration and is not linked to a remote task.",
    };
  }

  const owner = agents.find((agent) => agent.id === task.ownerAgentId);
  if (!owner) {
    return {
      kind: "unsupported",
      task,
      reason: "Task owner is no longer connected.",
    };
  }

  return { kind: "ready", task, owner, address };
}

export function resolveTaskRetryRequest({
  agents,
  projects,
  taskId,
  tasks,
}: {
  agents: AgentInstance[];
  projects: Project[];
  taskId: string;
  tasks: ProjectTask[];
}): TaskRetryRequestResolution {
  const task = tasks.find((item) => item.id === taskId);
  if (!task) return { kind: "ignore" };

  const project = projects.find((item) => item.id === task.projectId);
  if (!project) return { kind: "ignore" };

  const owner = agents.find((agent) => agent.id === task.ownerAgentId);
  if (!owner) {
    return {
      kind: "unsupported",
      task,
      reason: "Task owner is no longer connected.",
    };
  }

  return { kind: "ready", task, owner, project };
}

export function isTaskLifecyclePollable({ runs, task }: { runs: ProjectRun[]; task: ProjectTask }) {
  return isTaskActive(task.state) && Boolean(getTaskLifecycleAddress(task, runs)) && !hasLifecycleUnsupportedEvent(task);
}

export function getPollableTasks({ runs, tasks }: { runs: ProjectRun[]; tasks: ProjectTask[] }) {
  return tasks.filter((task) => isTaskLifecyclePollable({ runs, task }));
}

export function applyTaskLifecycleWorkspaceUpdate({
  agentId,
  label,
  now,
  remoteTask,
  state,
  task,
}: {
  agentId: string;
  label: string;
  now: () => string;
  remoteTask: A2ATask;
  state: TaskLifecycleWorkspaceState;
  task: ProjectTask;
}): TaskLifecycleWorkspaceState {
  return applyTaskLifecycleRemoteUpdate({
    state,
    task,
    remoteTask,
    agentId,
    label,
    now,
  });
}

export function applyTaskLifecycleRemoteUpdateToWorkspace({
  agentId,
  label,
  now,
  remoteTask,
  state,
  task,
}: {
  agentId: string;
  label: string;
  now: () => string;
  remoteTask: A2ATask;
  state: RequestWorkspaceState;
  task: ProjectTask;
}): RequestWorkspaceState {
  const taskLifecycleState = applyTaskLifecycleWorkspaceUpdate({
    state: {
      artifacts: state.artifacts,
      runs: state.runs,
      tasks: state.tasks,
    },
    task,
    remoteTask,
    agentId,
    label,
    now,
  });

  return {
    ...state,
    artifacts: taskLifecycleState.artifacts,
    runs: taskLifecycleState.runs,
    tasks: taskLifecycleState.tasks,
  };
}

export function applyTaskLifecycleUnsupportedToWorkspace({
  at,
  reason,
  state,
  task,
}: {
  at: string;
  reason: string;
  state: RequestWorkspaceState;
  task: ProjectTask;
}): RequestWorkspaceState {
  return {
    ...state,
    tasks: recordLifecycleUnsupportedState({
      tasks: state.tasks,
      task,
      reason,
      at,
    }),
  };
}

export function applyTaskCancelUnsupportedToWorkspace({
  at,
  reason,
  state,
  task,
}: {
  at: string;
  reason: string;
  state: RequestWorkspaceState;
  task: ProjectTask;
}): RequestWorkspaceState {
  return {
    ...state,
    tasks: recordCancelUnsupportedState({
      tasks: state.tasks,
      task,
      reason,
      at,
    }),
  };
}

export function applyTaskRetrySubmittingToWorkspace({
  ownerAgentId,
  retryAt,
  state,
  task,
}: {
  ownerAgentId: string;
  retryAt: string;
  state: RequestWorkspaceState;
  task: ProjectTask;
}): RequestWorkspaceState {
  return {
    ...state,
    tasks: prepareTaskRetrySubmitting({
      tasks: state.tasks,
      task,
      ownerAgentId,
      retryAt,
    }),
  };
}

export function applyTaskRetryFailureToWorkspace({
  errorText,
  failedAt,
  ownerAgentId,
  state,
  task,
}: {
  errorText: string;
  failedAt: string;
  ownerAgentId: string;
  state: RequestWorkspaceState;
  task: ProjectTask;
}): RequestWorkspaceState {
  return {
    ...state,
    tasks: failTaskRetry({
      tasks: state.tasks,
      task,
      ownerAgentId,
      errorText,
      failedAt,
    }),
  };
}
