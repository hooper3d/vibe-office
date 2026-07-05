import assert from "node:assert/strict";
import test from "node:test";
import type { A2ATask } from "../domain/a2a";
import {
  applyTaskCancelUnsupportedToWorkspace,
  applyTaskLifecycleRemoteUpdateToWorkspace,
  applyTaskLifecycleUnsupportedToWorkspace,
  applyTaskLifecycleWorkspaceUpdate,
  applyTaskRetryFailureToWorkspace,
  applyTaskRetrySubmittingToWorkspace,
  getPollableTasks,
  isTaskLifecyclePollable,
  resolveTaskLifecycleRequest,
  resolveTaskRetryRequest,
} from "../services/taskLifecycleRequestState";
import {
  failTaskRetry,
  getTaskLifecycleAddress,
  getTaskLifecycleBusyId,
  isTaskLifecycleBusy,
  prepareTaskRetrySubmitting,
  recordCancelUnsupportedState,
  recordLifecycleUnsupportedState,
} from "../services/taskLifecycleState";
import {
  getAvailableTaskParticipants,
  getSelectedTaskParticipants,
  toggleTaskParticipantSelection,
} from "../services/taskParticipantSelectionState";

import { a2aTask, agent, artifact, conversation, participant, project, run, task, userMessage } from "./testSupport";

test("task lifecycle reducer syncs remote task updates into tasks, runs, and artifacts", () => {
  const remoteTask: A2ATask = {
    ...a2aTask("Remote completed.", "remote-task-2"),
    artifacts: [
      {
        artifactId: "artifact-remote",
        name: "Remote artifact",
        description: "Returned artifact.",
        parts: [{ kind: "text", text: "artifact body" }],
      },
    ],
  };
  const localTask = task({ remoteTaskId: "remote-task-2", remoteContextId: "remote-context", summary: "Old summary." });
  const localRun = run({ state: "working", artifactIds: ["existing-artifact"] });

  const next = applyTaskLifecycleWorkspaceUpdate({
    state: {
      artifacts: [],
      runs: [localRun],
      tasks: [localTask],
    },
    task: localTask,
    remoteTask,
    agentId: agent.id,
    label: "Task status refreshed.",
    now: () => "2026-06-18T10:09:00.000Z",
  });

  assert.equal(next.tasks[0].state, "completed");
  assert.equal(next.tasks[0].summary, "Remote completed.");
  assert.equal(next.tasks[0].remoteTaskId, "remote-task-2");
  assert.deepEqual(next.tasks[0].artifactIds, ["artifact-remote"]);
  assert.equal(next.tasks[0].events[0].label, "Task status refreshed.");
  assert.equal(next.runs[0].state, "completed");
  assert.deepEqual(next.runs[0].artifactIds, ["existing-artifact", "artifact-remote"]);
  assert.equal(next.artifacts[0].id, "artifact-remote");
  assert.equal(next.artifacts[0].summary, "Returned artifact.");
});

test("task lifecycle workspace update preserves non-lifecycle workspace collections", () => {
  const localConversation = conversation({ id: "conversation-keep" });
  const localMessage = userMessage({ id: "message-keep" });
  const lifecycleTask = task({ id: "task-workspace-update", remoteTaskId: "remote-task" });
  const lifecycleRun = run({ id: "run-workspace-update", taskId: lifecycleTask.id });

  const next = applyTaskLifecycleRemoteUpdateToWorkspace({
    state: {
      conversations: [localConversation],
      messages: [localMessage],
      runs: [lifecycleRun],
      tasks: [lifecycleTask],
      artifacts: [],
    },
    task: lifecycleTask,
    remoteTask: a2aTask("Done.", "remote-task"),
    agentId: agent.id,
    label: "Task status refreshed.",
    now: () => "2026-06-18T10:20:00.000Z",
  });

  assert.equal(next.conversations[0].id, localConversation.id);
  assert.equal(next.messages[0].id, localMessage.id);
  assert.equal(next.tasks[0].state, "completed");
  assert.equal(next.runs[0].state, "completed");
});

test("task lifecycle local updates preserve the full request workspace snapshot", () => {
  const localConversation = conversation({ id: "conversation-local-keep" });
  const localMessage = userMessage({ id: "message-local-keep" });
  const lifecycleTask = task({ id: "task-local-workspace-update" });
  const baseState = {
    conversations: [localConversation],
    messages: [localMessage],
    runs: [run({ id: "run-local-workspace-update", taskId: lifecycleTask.id })],
    tasks: [lifecycleTask],
    artifacts: [artifact({ id: "artifact-local-keep" })],
  };

  const unsupported = applyTaskLifecycleUnsupportedToWorkspace({
    state: baseState,
    task: lifecycleTask,
    reason: "No remote task.",
    at: "2026-06-18T10:21:00.000Z",
  });
  assert.equal(unsupported.conversations[0].id, localConversation.id);
  assert.equal(unsupported.messages[0].id, localMessage.id);
  assert.equal(unsupported.artifacts[0].id, "artifact-local-keep");
  assert.match(unsupported.tasks[0].events[0].label, /Lifecycle unsupported/);

  const cancelUnsupported = applyTaskCancelUnsupportedToWorkspace({
    state: baseState,
    task: lifecycleTask,
    reason: "Cancel unavailable.",
    at: "2026-06-18T10:22:00.000Z",
  });
  assert.match(cancelUnsupported.tasks[0].events[0].label, /Cancel unsupported/);

  const retrying = applyTaskRetrySubmittingToWorkspace({
    state: baseState,
    task: lifecycleTask,
    ownerAgentId: agent.id,
    retryAt: "2026-06-18T10:23:00.000Z",
  });
  assert.equal(retrying.tasks[0].state, "submitting");
  assert.equal(retrying.messages[0].id, localMessage.id);

  const failed = applyTaskRetryFailureToWorkspace({
    state: retrying,
    task: retrying.tasks[0],
    ownerAgentId: agent.id,
    errorText: "Retry failed.",
    failedAt: "2026-06-18T10:24:00.000Z",
  });
  assert.equal(failed.tasks[0].state, "failed");
  assert.equal(failed.tasks[0].summary, "Retry failed.");
  assert.equal(failed.conversations[0].id, localConversation.id);
});

test("task lifecycle request state resolves ready, unsupported, and retry contexts", () => {
  const remoteTask = task({ remoteTaskId: "remote-task-1", remoteContextId: "remote-context-1" });
  const lifecycleReady = resolveTaskLifecycleRequest({
    agents: [agent],
    runs: [],
    taskId: remoteTask.id,
    tasks: [remoteTask],
  });
  assert.equal(lifecycleReady.kind, "ready");
  if (lifecycleReady.kind === "ready") {
    assert.equal(lifecycleReady.owner.id, agent.id);
    assert.deepEqual(lifecycleReady.address, { taskId: "remote-task-1", contextId: "remote-context-1" });
  }

  const localTask = task({ id: "local-task" });
  const lifecycleUnsupported = resolveTaskLifecycleRequest({
    agents: [agent],
    runs: [],
    taskId: localTask.id,
    tasks: [localTask],
  });
  assert.equal(lifecycleUnsupported.kind, "unsupported");
  if (lifecycleUnsupported.kind === "unsupported") {
    assert.match(lifecycleUnsupported.reason, /not linked to a remote task/);
  }

  const lifecycleMissingOwner = resolveTaskLifecycleRequest({
    agents: [],
    runs: [],
    taskId: remoteTask.id,
    tasks: [remoteTask],
  });
  assert.equal(lifecycleMissingOwner.kind, "unsupported");
  if (lifecycleMissingOwner.kind === "unsupported") {
    assert.match(lifecycleMissingOwner.reason, /owner is no longer connected/);
  }

  assert.equal(
    resolveTaskLifecycleRequest({ agents: [agent], runs: [], taskId: "missing-task", tasks: [remoteTask] }).kind,
    "ignore",
  );

  const retryReady = resolveTaskRetryRequest({
    agents: [agent],
    projects: [project],
    taskId: localTask.id,
    tasks: [localTask],
  });
  assert.equal(retryReady.kind, "ready");
  if (retryReady.kind === "ready") {
    assert.equal(retryReady.project.id, project.id);
    assert.equal(retryReady.owner.id, agent.id);
  }

  assert.equal(isTaskLifecyclePollable({ runs: [run({ type: "direct_message", taskId: localTask.id })], task: localTask }), true);
  assert.equal(isTaskLifecyclePollable({ runs: [], task: localTask }), false);
  assert.equal(isTaskLifecyclePollable({ runs: [run({ type: "direct_message" })], task: task({ state: "completed" }) }), false);
  assert.deepEqual(
    getPollableTasks({
      runs: [run({ type: "direct_message", taskId: localTask.id })],
      tasks: [localTask, task({ id: "done-task", state: "completed" })],
    }).map((item) => item.id),
    [localTask.id],
  );
});

test("task lifecycle helpers preserve unsupported and retry states", () => {
  const directRun = run({ type: "direct_message" });
  const localTask = task();
  assert.equal(getTaskLifecycleBusyId("refresh", localTask.id), `refresh:${localTask.id}`);
  assert.equal(isTaskLifecycleBusy(`retry:${localTask.id}`, "retry", localTask.id), true);
  assert.equal(isTaskLifecycleBusy(`refresh:${localTask.id}`, "cancel", localTask.id), false);
  assert.deepEqual(getTaskLifecycleAddress(localTask, [directRun]), {
    taskId: localTask.id,
    contextId: localTask.contextId,
  });

  const unsupported = recordLifecycleUnsupportedState({
    tasks: [localTask],
    task: localTask,
    reason: "No remote task.",
    at: "2026-06-18T10:10:00.000Z",
  });
  const unsupportedAgain = recordLifecycleUnsupportedState({
    tasks: unsupported,
    task: unsupported[0],
    reason: "Still unsupported.",
    at: "2026-06-18T10:11:00.000Z",
  });
  assert.equal(unsupportedAgain[0].events.length, 1);
  assert.match(unsupportedAgain[0].events[0].label, /Lifecycle unsupported/);

  const cancelUnsupported = recordCancelUnsupportedState({
    tasks: [localTask],
    task: localTask,
    reason: "Cancel unavailable.",
    at: "2026-06-18T10:12:00.000Z",
  });
  assert.match(cancelUnsupported[0].events[0].label, /Cancel unsupported/);

  const retrying = prepareTaskRetrySubmitting({
    tasks: [localTask],
    task: localTask,
    ownerAgentId: agent.id,
    retryAt: "2026-06-18T10:13:00.000Z",
  });
  assert.equal(retrying[0].state, "submitting");
  assert.equal(retrying[0].summary, "Retry submitted.");

  const failed = failTaskRetry({
    tasks: retrying,
    task: retrying[0],
    ownerAgentId: agent.id,
    errorText: "Retry failed.",
    failedAt: "2026-06-18T10:14:00.000Z",
  });
  assert.equal(failed[0].state, "failed");
  assert.equal(failed[0].summary, "Retry failed.");
  assert.equal(failed[0].events[failed[0].events.length - 1]?.label, "Retry failed.");
});

test("task participant selection excludes chief and offline agents while preserving toggles", () => {
  const offlineParticipant = {
    ...participant,
    id: "agent-offline",
    status: "offline" as const,
  };
  const available = getAvailableTaskParticipants({
    agents: [agent, participant, offlineParticipant],
    chiefAgentId: agent.id,
  });

  assert.deepEqual(available.map((item) => item.id), [participant.id]);
  assert.deepEqual(
    getSelectedTaskParticipants({
      availableParticipants: available,
      selectedParticipantIds: [participant.id, offlineParticipant.id],
    }).map((item) => item.id),
    [participant.id],
  );
  assert.deepEqual(
    toggleTaskParticipantSelection({
      selectedParticipantIds: [participant.id],
      agentId: participant.id,
      checked: true,
    }),
    [participant.id],
  );
  assert.deepEqual(
    toggleTaskParticipantSelection({
      selectedParticipantIds: [participant.id],
      agentId: participant.id,
      checked: false,
    }),
    [],
  );
});
