import { useEffect } from "react";
import type { ConversationMessage, ProjectArtifact, ProjectRun, ProjectTask } from "../domain/projectScope";
import type { Project } from "../domain/types";
import { applyMediaArtifactBackfillState } from "./artifactBackfillState";
import type { RequestWorkspaceState } from "./requestRuntimeStore";
import { getPollableTasks } from "./taskLifecycleRequestState";

export type AppMaintenanceControllerOptions = {
  artifacts: ProjectArtifact[];
  applyRequestWorkspaceState: (state: RequestWorkspaceState) => void;
  getRequestWorkspaceState: () => RequestWorkspaceState;
  messages: ConversationMessage[];
  refreshTaskLifecycle: (taskId: string, options?: { silent?: boolean }) => Promise<void>;
  runs: ProjectRun[];
  scopedRuns: ProjectRun[];
  scopedTasks: ProjectTask[];
  selectedWorkspaceProject?: Project;
  tasks: ProjectTask[];
};

export function useAppMaintenanceController({
  artifacts,
  applyRequestWorkspaceState,
  getRequestWorkspaceState,
  messages,
  refreshTaskLifecycle,
  runs,
  scopedRuns,
  scopedTasks,
  selectedWorkspaceProject,
  tasks,
}: AppMaintenanceControllerOptions) {
  useEffect(() => {
    const backfilled = applyMediaArtifactBackfillState(getRequestWorkspaceState());
    if (backfilled.changed) applyRequestWorkspaceState(backfilled.state);
  }, [artifacts, messages, runs, tasks]);

  useEffect(() => {
    if (!selectedWorkspaceProject) return;
    const pollableTasks = getPollableTasks({ runs: scopedRuns, tasks: scopedTasks });
    if (pollableTasks.length === 0) return;

    const interval = window.setInterval(() => {
      pollableTasks.forEach((task) => {
        void refreshTaskLifecycle(task.id, { silent: true });
      });
    }, 15000);

    return () => window.clearInterval(interval);
  }, [scopedRuns, scopedTasks, selectedWorkspaceProject?.id]);
}
