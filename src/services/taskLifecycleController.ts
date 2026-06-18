import { useState } from "react";
import type { ProjectRun, ProjectTask } from "../domain/projectScope";
import type { AgentInstance, Project } from "../domain/types";
import { getUserFacingAgentError } from "./agentErrorText";
import type { RequestWorkspaceState } from "./requestRuntimeStore";
import { cancelRemoteTaskLifecycle, refreshRemoteTaskLifecycle, retryRemoteProjectTask } from "./taskLifecycleExecutor";
import {
  applyTaskCancelUnsupportedToWorkspace,
  applyTaskLifecycleRemoteUpdateToWorkspace,
  applyTaskLifecycleUnsupportedToWorkspace,
  applyTaskRetryFailureToWorkspace,
  applyTaskRetrySubmittingToWorkspace,
  resolveTaskLifecycleRequest,
  resolveTaskRetryRequest,
} from "./taskLifecycleRequestState";
import { getRemoteTaskWorkState, getTaskLifecycleBusyId } from "./taskLifecycleState";

export type TaskLifecycleControllerOptions = {
  agents: AgentInstance[];
  applyRequestWorkspaceState: (state: RequestWorkspaceState) => void;
  getRequestWorkspaceState: () => RequestWorkspaceState;
  projects: Project[];
  runs: ProjectRun[];
  tasks: ProjectTask[];
};

export function useTaskLifecycleController({
  agents,
  applyRequestWorkspaceState,
  getRequestWorkspaceState,
  projects,
  runs,
  tasks,
}: TaskLifecycleControllerOptions) {
  const [taskLifecycleBusyId, setTaskLifecycleBusyId] = useState("");

  function applyLifecycleUnsupported(task: ProjectTask, reason: string) {
    applyRequestWorkspaceState(
      applyTaskLifecycleUnsupportedToWorkspace({
        state: getRequestWorkspaceState(),
        task,
        reason,
        at: new Date().toISOString(),
      }),
    );
  }

  function applyCancelUnsupported(task: ProjectTask, reason: string) {
    applyRequestWorkspaceState(
      applyTaskCancelUnsupportedToWorkspace({
        state: getRequestWorkspaceState(),
        task,
        reason,
        at: new Date().toISOString(),
      }),
    );
  }

  async function refreshTaskLifecycle(taskId: string, options: { silent?: boolean } = {}) {
    const request = resolveTaskLifecycleRequest({ agents, runs, taskId, tasks });
    if (request.kind === "ignore") return;
    if (request.kind === "unsupported") {
      applyLifecycleUnsupported(request.task, request.reason);
      return;
    }

    if (!options.silent) setTaskLifecycleBusyId(getTaskLifecycleBusyId("refresh", taskId));

    try {
      const remoteTask = await refreshRemoteTaskLifecycle({ agent: request.owner, address: request.address });
      applyRequestWorkspaceState(
        applyTaskLifecycleRemoteUpdateToWorkspace({
          state: getRequestWorkspaceState(),
          task: request.task,
          remoteTask,
          agentId: request.owner.id,
          label: "Task status refreshed.",
          now: () => new Date().toISOString(),
        }),
      );
    } catch (error) {
      applyLifecycleUnsupported(request.task, getUserFacingAgentError(error));
    } finally {
      if (!options.silent) setTaskLifecycleBusyId("");
    }
  }

  async function cancelTaskLifecycle(taskId: string) {
    const request = resolveTaskLifecycleRequest({ agents, runs, taskId, tasks });
    if (request.kind === "ignore") return;
    if (request.kind === "unsupported") {
      applyLifecycleUnsupported(request.task, request.reason);
      return;
    }

    setTaskLifecycleBusyId(getTaskLifecycleBusyId("cancel", taskId));
    try {
      const remoteTask = await cancelRemoteTaskLifecycle({ agent: request.owner, address: request.address });
      applyRequestWorkspaceState(
        applyTaskLifecycleRemoteUpdateToWorkspace({
          state: getRequestWorkspaceState(),
          task: request.task,
          remoteTask,
          agentId: request.owner.id,
          label: "Task cancel requested.",
          now: () => new Date().toISOString(),
        }),
      );
    } catch (error) {
      applyCancelUnsupported(request.task, getUserFacingAgentError(error));
    } finally {
      setTaskLifecycleBusyId("");
    }
  }

  async function retryTaskLifecycle(taskId: string) {
    const request = resolveTaskRetryRequest({ agents, projects, taskId, tasks });
    if (request.kind === "ignore") return false;
    if (request.kind === "unsupported") {
      applyLifecycleUnsupported(request.task, request.reason);
      return false;
    }

    const retryAt = new Date().toISOString();
    setTaskLifecycleBusyId(getTaskLifecycleBusyId("retry", taskId));
    applyRequestWorkspaceState(
      applyTaskRetrySubmittingToWorkspace({
        state: getRequestWorkspaceState(),
        task: request.task,
        ownerAgentId: request.owner.id,
        retryAt,
      }),
    );

    try {
      const remoteTask = await retryRemoteProjectTask({
        agent: request.owner,
        project: request.project,
        taskTitle: request.task.title,
        previousFailure: request.task.summary,
      });
      applyRequestWorkspaceState(
        applyTaskLifecycleRemoteUpdateToWorkspace({
          state: getRequestWorkspaceState(),
          task: request.task,
          remoteTask,
          agentId: request.owner.id,
          label: "Retry returned a task update.",
          now: () => new Date().toISOString(),
        }),
      );
      return getRemoteTaskWorkState(remoteTask) !== "failed";
    } catch (error) {
      applyRequestWorkspaceState(
        applyTaskRetryFailureToWorkspace({
          state: getRequestWorkspaceState(),
          task: request.task,
          ownerAgentId: request.owner.id,
          errorText: getUserFacingAgentError(error),
          failedAt: new Date().toISOString(),
        }),
      );
      return false;
    } finally {
      setTaskLifecycleBusyId("");
    }
  }

  return {
    cancelTaskLifecycle,
    refreshTaskLifecycle,
    retryTaskLifecycle,
    taskLifecycleBusyId,
  };
}
