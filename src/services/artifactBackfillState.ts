import { createBackfilledMediaArtifacts } from "./artifactState";
import type { RequestWorkspaceState } from "./requestRuntimeStore";

export type ArtifactBackfillResult = {
  changed: boolean;
  state: RequestWorkspaceState;
};

export function applyMediaArtifactBackfillState(state: RequestWorkspaceState): ArtifactBackfillResult {
  const mediaLinks = createBackfilledMediaArtifacts(state.messages);
  if (mediaLinks.length === 0) {
    return {
      changed: false,
      state,
    };
  }

  const existingArtifactIds = new Set(state.artifacts.map((artifact) => artifact.id));
  const missingArtifacts = mediaLinks
    .map((link) => link.artifact)
    .filter((artifact) => !existingArtifactIds.has(artifact.id));
  const tasks = state.tasks.map((task) => {
    const artifactIds = mediaLinks
      .filter((link) => link.artifact.taskId === task.id)
      .map((link) => link.artifact.id)
      .filter((artifactId) => !task.artifactIds.includes(artifactId));

    return artifactIds.length > 0 ? { ...task, artifactIds: [...task.artifactIds, ...artifactIds] } : task;
  });
  const runs = state.runs.map((run) => {
    const artifactIds = mediaLinks
      .filter((link) => link.runId === run.id)
      .map((link) => link.artifact.id)
      .filter((artifactId) => !run.artifactIds.includes(artifactId));

    return artifactIds.length > 0 ? { ...run, artifactIds: [...run.artifactIds, ...artifactIds] } : run;
  });
  const changed =
    missingArtifacts.length > 0 ||
    tasks.some((task, index) => task !== state.tasks[index]) ||
    runs.some((item, index) => item !== state.runs[index]);

  return {
    changed,
    state: changed
      ? {
          ...state,
          artifacts: missingArtifacts.length > 0 ? [...missingArtifacts, ...state.artifacts] : state.artifacts,
          tasks,
          runs,
        }
      : state,
  };
}
