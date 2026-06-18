import type {
  ProjectArtifact,
  ProjectRun,
  ProjectTask,
} from "../domain/projectScope";
import type { Project } from "../domain/types";

export type WorkspaceSelectionState = {
  selectedProject?: Project;
  selectedWorkspaceProject?: Project;
  scopedTasks: ProjectTask[];
  scopedRuns: ProjectRun[];
  latestChiefTask?: ProjectTask;
  scopedArtifacts: ProjectArtifact[];
};

export function deriveWorkspaceSelection({
  projects,
  selectedProjectId,
  freeChatEntryProjectId,
  tasks,
  runs,
  artifacts,
}: {
  projects: Project[];
  selectedProjectId: string;
  freeChatEntryProjectId: string;
  tasks: ProjectTask[];
  runs: ProjectRun[];
  artifacts: ProjectArtifact[];
}): WorkspaceSelectionState {
  const selectedProject = projects.find((project) => project.id === selectedProjectId);
  const selectedWorkspaceProject = selectedProject?.id === freeChatEntryProjectId ? undefined : selectedProject;
  const scopedTasks = selectedWorkspaceProject
    ? tasks.filter((task) => task.projectId === selectedWorkspaceProject.id)
    : [];
  const scopedRuns = selectedWorkspaceProject ? runs.filter((run) => run.projectId === selectedWorkspaceProject.id) : [];
  const latestChiefRun = scopedRuns.find((run) => run.type === "chief_delegation" && run.taskId);
  const latestChiefTask = scopedTasks.find((task) => task.id === latestChiefRun?.taskId);
  const scopedArtifacts = selectedWorkspaceProject
    ? artifacts.filter((artifact) => artifact.projectId === selectedWorkspaceProject.id)
    : [];

  return {
    selectedProject,
    selectedWorkspaceProject,
    scopedTasks,
    scopedRuns,
    latestChiefTask,
    scopedArtifacts,
  };
}
