import assert from "node:assert/strict";
import test from "node:test";
import type { ConversationMessage, ProjectArtifact } from "../domain/projectScope";
import type { AgentInstance } from "../domain/types";
import { applyMediaArtifactBackfillState } from "../services/artifactBackfillState";
import {
  assignPreviewToOutputGroups,
  countTrackableTaskOutputs,
  filterArtifactsByAgent,
  filterRunsByAgent,
  filterTasksByAgent,
  getInitialOutputSelection,
  getOutputAgentGroups,
  getOutputSelectionMeta,
  getSelectedOutputAgentGroup,
  getStandaloneOutputTasks,
  getVisibleOutputAgentIds,
  getVisibleOutputRuns,
  isSameOutputSelection,
  resolveOutputSelection,
  resolveOutputTypeFilter,
} from "../services/outputSelectors";
import { getTrackableTaskOutputItems } from "../services/projectTaskOutputItems";

import { agent, at, participant, project, run, task, taskRoomRequestState } from "./testSupport";

test("output selectors keep chat records separate from trackable project outputs", () => {
  const hiddenDirectRun = run({
    id: "run-direct-chat",
    taskId: undefined,
    type: "direct_message",
    state: "completed",
    artifactIds: [],
    participantAgentIds: [],
  });
  const trackedDirectRun = run({
    id: "run-direct-task",
    taskId: "task-direct",
    type: "direct_message",
    state: "completed",
    artifactIds: [],
  });
  const chiefRun = run({ id: "run-chief", taskId: "task-chief" });
  const standaloneTask = task({
    id: "task-standalone",
    ownerAgentId: participant.id,
    participantAgentIds: [],
  });
  const tasks = [
    task({ id: "task-chief" }),
    task({ id: "task-direct" }),
    standaloneTask,
  ];
  const artifact: ProjectArtifact = {
    id: "artifact-1",
    projectId: project.id,
    taskId: standaloneTask.id,
    agentId: participant.id,
    name: "Standalone artifact",
    kind: "text",
    summary: "Artifact body.",
    contentParts: [{ kind: "text", text: "Artifact body." }],
    createdAt: at,
  };
  const runs = [hiddenDirectRun, trackedDirectRun, chiefRun];

  assert.deepEqual(getVisibleOutputRuns(runs).map((item) => item.id), ["run-direct-task", "run-chief"]);
  assert.deepEqual(getStandaloneOutputTasks(runs, tasks).map((item) => item.id), ["task-standalone"]);
  assert.deepEqual(
    getTrackableTaskOutputItems({ runs, tasks }).map((item) => ({
      id: item.id,
      source: item.source,
      title: item.title,
      ownerAgentId: item.ownerAgentId,
      contextLabel: item.contextLabel,
      lifecycleTaskId: item.lifecycleTask?.id,
    })),
    [
      {
        id: "run-direct-task",
        source: "run",
        title: "Task",
        ownerAgentId: agent.id,
        contextLabel: "direct message",
        lifecycleTaskId: "task-direct",
      },
      {
        id: "run-chief",
        source: "run",
        title: "Task",
        ownerAgentId: agent.id,
        contextLabel: "chief delegation",
        lifecycleTaskId: "task-chief",
      },
      {
        id: "task-standalone",
        source: "task",
        title: "Task",
        ownerAgentId: participant.id,
        contextLabel: "project-vibe-office",
        lifecycleTaskId: "task-standalone",
      },
    ],
  );
  assert.equal(countTrackableTaskOutputs(runs, tasks), 3);
  assert.deepEqual(getVisibleOutputAgentIds({ agents: [agent, participant], runs, tasks, artifacts: [artifact] }), [
    agent.id,
    participant.id,
  ]);
  assert.deepEqual(filterRunsByAgent(runs, participant.id).map((item) => item.id), ["run-direct-task", "run-chief"]);
  assert.deepEqual(filterTasksByAgent(tasks, participant.id).map((item) => item.id), ["task-chief", "task-direct", "task-standalone"]);
  assert.deepEqual(filterArtifactsByAgent([artifact], participant.id).map((item) => item.id), ["artifact-1"]);

  const groups = getOutputAgentGroups({ agents: [agent, participant], runs, tasks, artifacts: [artifact] });
  assert.deepEqual(
    groups.map((group) => ({
      agentId: group.agent.id,
      taskCount: group.taskCount,
      artifactCount: group.artifactCount,
      previewCount: group.previewCount,
    })),
    [
      { agentId: agent.id, taskCount: 2, artifactCount: 0, previewCount: 0 },
      { agentId: participant.id, taskCount: 3, artifactCount: 1, previewCount: 0 },
    ],
  );

  const groupsWithPreview = assignPreviewToOutputGroups({ groups, hasPreview: true, ownerAgentId: participant.id });
  assert.deepEqual(
    groupsWithPreview.map((group) => ({
      agentId: group.agent.id,
      previewCount: group.previewCount,
    })),
    [
      { agentId: agent.id, previewCount: 0 },
      { agentId: participant.id, previewCount: 1 },
    ],
  );
  assert.deepEqual(
    assignPreviewToOutputGroups({ groups, hasPreview: true, ownerAgentId: "missing-agent" }).map((group) => ({
      agentId: group.agent.id,
      previewCount: group.previewCount,
    })),
    [
      { agentId: agent.id, previewCount: 0 },
      { agentId: participant.id, previewCount: 0 },
    ],
  );
});

test("output selectors exclude agents that only have non-output direct chat runs", () => {
  const chatOnlyAgent: AgentInstance = {
    ...participant,
    id: "agent-chat-only",
    name: "Chat Only",
  };
  const hiddenDirectRun = run({
    id: "run-chat-only",
    ownerAgentId: chatOnlyAgent.id,
    participantAgentIds: [],
    taskId: undefined,
    type: "direct_message",
    state: "completed",
    artifactIds: [],
  });

  assert.deepEqual(
    getVisibleOutputAgentIds({
      agents: [agent, chatOnlyAgent],
      runs: [hiddenDirectRun],
      tasks: [],
      artifacts: [],
    }),
    [],
  );
  assert.deepEqual(
    getOutputAgentGroups({
      agents: [agent, chatOnlyAgent],
      runs: [hiddenDirectRun],
      tasks: [],
      artifacts: [],
    }),
    [],
  );
});

test("output selection state recovers when preview or agent outputs change", () => {
  const agentRun = run({
    id: "run-output-agent",
    ownerAgentId: agent.id,
    participantAgentIds: [],
    taskId: "task-output-agent",
    type: "direct_message",
    state: "completed",
    artifactIds: [],
  });
  const groups = getOutputAgentGroups({
    agents: [agent, participant],
    runs: [agentRun],
    tasks: [task({ id: "task-output-agent", ownerAgentId: agent.id, participantAgentIds: [] })],
    artifacts: [],
  });

  const initialSelection = getInitialOutputSelection(groups);
  assert.deepEqual(initialSelection, { kind: "agent", agentId: agent.id });
  assert.equal(getSelectedOutputAgentGroup(groups, initialSelection)?.agent.id, agent.id);
  assert.equal(getOutputSelectionMeta({ group: groups[0], hasPreview: false, selection: initialSelection }), "1 task / 0 artifacts");
  const groupsWithPreview = assignPreviewToOutputGroups({ groups, hasPreview: true, ownerAgentId: agent.id });
  assert.equal(
    getOutputSelectionMeta({ group: groupsWithPreview[0], hasPreview: true, selection: initialSelection }),
    "1 task / 0 artifacts / 1 preview",
  );

  assert.deepEqual(resolveOutputSelection({ groups, hasPreview: false, selection: { kind: "preview" } }), {
    kind: "agent",
    agentId: agent.id,
  });
  assert.deepEqual(
    resolveOutputSelection({
      groups,
      hasPreview: true,
      selection: { kind: "agent", agentId: "missing-agent" },
    }),
    { kind: "agent", agentId: agent.id },
  );
  assert.deepEqual(resolveOutputSelection({ groups: [], hasPreview: true, selection: initialSelection }), { kind: "preview" });
  assert.equal(resolveOutputTypeFilter({ kind: "preview" }, "all"), "preview");
  assert.equal(resolveOutputTypeFilter(initialSelection, "preview"), "all");
  assert.equal(resolveOutputTypeFilter(initialSelection, "preview", groupsWithPreview[0]), "preview");
  assert.equal(resolveOutputTypeFilter(initialSelection, "preview", groupsWithPreview[1]), "all");
  assert.equal(resolveOutputTypeFilter(initialSelection, "tasks"), "tasks");
  assert.equal(isSameOutputSelection(initialSelection, { kind: "agent", agentId: agent.id }), true);
  assert.equal(isSameOutputSelection(initialSelection, { kind: "preview" }), false);
});

test("artifact backfill state materializes generated media links into task and run outputs", () => {
  const mediaMessage: ConversationMessage = {
    id: "agent-media-message",
    conversationId: "conversation-1",
    projectId: project.id,
    role: "agent",
    agentId: participant.id,
    taskId: "task-1",
    runId: "run-1",
    contentParts: [{ kind: "text", text: "Generated image\nMEDIA:/tmp/mmx-gen/image_001.jpg" }],
    status: "sent",
    createdAt: at,
  };
  const result = applyMediaArtifactBackfillState(
    taskRoomRequestState({
      messages: [mediaMessage],
      runs: [run({ artifactIds: [] })],
      tasks: [task({ artifactIds: [] })],
      artifacts: [],
    }),
  );

  assert.equal(result.changed, true);
  assert.equal(result.state.artifacts.length, 1);
  assert.equal(result.state.artifacts[0].name, "Generated media");
  assert.equal(result.state.artifacts[0].kind, "file");
  assert.deepEqual(result.state.tasks[0].artifactIds, ["agent-media-message-media-0"]);
  assert.deepEqual(result.state.runs[0].artifactIds, ["agent-media-message-media-0"]);

  const stable = applyMediaArtifactBackfillState(result.state);
  assert.equal(stable.changed, false);
});
