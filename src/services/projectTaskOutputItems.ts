import type { ProjectArtifact, ProjectRun, ProjectRunType, ProjectTask, WorkState } from "../domain/projectScope";
import { getStandaloneOutputTasks, getVisibleOutputRuns } from "./outputSelectors";

export type TrackableTaskOutputItem = {
  id: string;
  artifactIds: string[];
  contextLabel: string;
  events: ProjectTask["events"];
  lifecycleTask?: ProjectTask;
  ownerAgentId: string;
  source: "run" | "task";
  state: WorkState;
  summary: string;
  title: string;
};

export function getTrackableTaskOutputItems({
  runs,
  tasks,
}: {
  runs: ProjectRun[];
  tasks: ProjectTask[];
}): TrackableTaskOutputItem[] {
  const visibleRuns = getVisibleOutputRuns(runs);
  const standaloneTasks = getStandaloneOutputTasks(runs, tasks);

  return [
    ...visibleRuns.map((run) => createRunOutputItem(run, tasks)),
    ...standaloneTasks.map(createTaskOutputItem),
  ];
}

export function getArtifactsForTaskOutputItem(artifacts: ProjectArtifact[], item: Pick<TrackableTaskOutputItem, "artifactIds">) {
  return artifacts.filter((artifact) => item.artifactIds.includes(artifact.id));
}

function createRunOutputItem(run: ProjectRun, tasks: ProjectTask[]): TrackableTaskOutputItem {
  const linkedTask = run.taskId ? tasks.find((task) => task.id === run.taskId) : undefined;
  return {
    id: run.id,
    artifactIds: run.artifactIds,
    contextLabel: formatRunType(run.type),
    events: linkedTask?.events ?? [],
    lifecycleTask: linkedTask,
    ownerAgentId: run.ownerAgentId,
    source: "run",
    state: run.state,
    summary: linkedTask?.summary ?? run.summary ?? "Project-scoped run record.",
    title: linkedTask?.title ?? getFallbackRunTitle(run.type),
  };
}

function createTaskOutputItem(task: ProjectTask): TrackableTaskOutputItem {
  return {
    id: task.id,
    artifactIds: task.artifactIds,
    contextLabel: task.contextId,
    events: task.events,
    lifecycleTask: task,
    ownerAgentId: task.ownerAgentId,
    source: "task",
    state: task.state,
    summary: task.summary,
    title: task.title,
  };
}

function getFallbackRunTitle(type: ProjectRunType) {
  if (type === "direct_message") return "Direct message";
  if (type === "chief_delegation") return "Chief delegation";
  return "Task";
}

function formatRunType(type: ProjectRunType) {
  return type.replace("_", " ");
}
