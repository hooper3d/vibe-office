import type { ProjectArtifact, ProjectRun, ProjectTask } from "../domain/projectScope";
import type { AgentInstance } from "../domain/types";

export type OutputAgentGroup = {
  agent: AgentInstance;
  runs: ProjectRun[];
  tasks: ProjectTask[];
  artifacts: ProjectArtifact[];
  taskCount: number;
  artifactCount: number;
};

export function getVisibleOutputRuns(runs: ProjectRun[]) {
  return runs.filter(
    (run) => run.type !== "direct_message" || run.state !== "completed" || run.artifactIds.length > 0 || Boolean(run.taskId),
  );
}

export function getStandaloneOutputTasks(runs: ProjectRun[], tasks: ProjectTask[]) {
  const visibleRunTaskIds = new Set(getVisibleOutputRuns(runs).map((run) => run.taskId).filter(Boolean));
  return tasks.filter((task) => !visibleRunTaskIds.has(task.id));
}

export function countTrackableTaskOutputs(runs: ProjectRun[], tasks: ProjectTask[]) {
  return getVisibleOutputRuns(runs).length + getStandaloneOutputTasks(runs, tasks).length;
}

export function getVisibleOutputAgentIds({
  agents,
  runs,
  tasks,
  artifacts,
}: {
  agents: AgentInstance[];
  runs: ProjectRun[];
  tasks: ProjectTask[];
  artifacts: ProjectArtifact[];
}) {
  const ids = new Set<string>();
  getVisibleOutputRuns(runs).forEach((run) => {
    ids.add(run.ownerAgentId);
    run.participantAgentIds.forEach((agentId) => ids.add(agentId));
  });
  tasks.forEach((task) => {
    ids.add(task.ownerAgentId);
    task.participantAgentIds.forEach((agentId) => ids.add(agentId));
  });
  artifacts.forEach((artifact) => ids.add(artifact.agentId));
  return agents.map((agent) => agent.id).filter((agentId) => ids.has(agentId));
}

export function getOutputAgentGroups({
  agents,
  runs,
  tasks,
  artifacts,
}: {
  agents: AgentInstance[];
  runs: ProjectRun[];
  tasks: ProjectTask[];
  artifacts: ProjectArtifact[];
}): OutputAgentGroup[] {
  return getVisibleOutputAgentIds({ agents, runs, tasks, artifacts })
    .map((agentId) => {
      const agent = agents.find((item) => item.id === agentId);
      if (!agent) return undefined;

      const agentRuns = filterRunsByAgent(getVisibleOutputRuns(runs), agentId);
      const agentTasks = filterTasksByAgent(tasks, agentId);
      const agentArtifacts = filterArtifactsByAgent(artifacts, agentId);

      return {
        agent,
        runs: agentRuns,
        tasks: agentTasks,
        artifacts: agentArtifacts,
        taskCount: countTrackableTaskOutputs(agentRuns, agentTasks),
        artifactCount: agentArtifacts.length,
      };
    })
    .filter((group): group is OutputAgentGroup => Boolean(group));
}

export function filterRunsByAgent(runs: ProjectRun[], agentId: string) {
  if (agentId === "all") return runs;
  return runs.filter((run) => run.ownerAgentId === agentId || run.participantAgentIds.includes(agentId));
}

export function filterTasksByAgent(tasks: ProjectTask[], agentId: string) {
  if (agentId === "all") return tasks;
  return tasks.filter((task) => task.ownerAgentId === agentId || task.participantAgentIds.includes(agentId));
}

export function filterArtifactsByAgent(artifacts: ProjectArtifact[], agentId: string) {
  if (agentId === "all") return artifacts;
  return artifacts.filter((artifact) => artifact.agentId === agentId);
}
