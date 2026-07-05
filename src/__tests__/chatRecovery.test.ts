import assert from "node:assert/strict";
import test from "node:test";
import type { ConversationMessage } from "../domain/projectScope";
import { markConversationMessageFailed, markConversationMessageSending } from "../domain/requestLifecycle";
import {
  getPendingRequestMessages,
  resolveDirectMessageRetry,
  resolvePendingRequestRecovery,
  resolveTaskRoomMessageRetry,
} from "../services/requestRecovery";
import {
  applyPendingRecoveryFailure,
  getNextPendingRecoverySubmission,
} from "../services/requestRecoverySubmissionState";
import {
  completeTaskRoomMessageRetry,
  prepareDirectMessageRetry,
  prepareTaskRoomMessageRetry,
} from "../services/requestRetryState";
import {
  completeTaskRoomRetrySubmission,
  prepareDirectRetrySubmission,
  prepareTaskRoomRetrySubmission,
} from "../services/requestRetrySubmissionState";
import { createRequestRuntimeStore, syncRequestRuntimeWorkspaceState } from "../services/requestRuntimeStore";

import { agent, artifact, at, conversation, directRequestState, freeChatProjectId, project, run, task, taskRoomRequestState, userMessage } from "./testSupport";

test("pending recovery ignores active requests and recovers free/project direct chats", () => {
  const active = userMessage({ id: "active-message", requestId: "active-request" });
  const orphaned = userMessage({ id: "orphaned-message", requestId: "orphaned-request" });

  assert.deepEqual(getPendingRequestMessages([active, orphaned], new Set(["active-request"])).map((message) => message.id), [
    "orphaned-message",
  ]);

  const projectConversation = conversation();
  const projectRecovery = resolvePendingRequestRecovery({
    message: orphaned,
    conversations: [projectConversation],
    agents: [agent],
    projects: [project],
    freeChatProjectId,
  });
  assert.equal(projectRecovery.kind, "project-chat");
  if (projectRecovery.kind === "project-chat") {
    assert.equal(projectRecovery.project.id, project.id);
    assert.equal(projectRecovery.text, "hello");
  }

  const freeConversation = conversation({
    id: "free-conversation",
    projectId: freeChatProjectId,
    a2aContextId: "free-chat:agent-lucy",
  });
  const freeRecovery = resolvePendingRequestRecovery({
    message: userMessage({ conversationId: freeConversation.id, projectId: freeChatProjectId }),
    conversations: [freeConversation],
    agents: [agent],
    projects: [project],
    freeChatProjectId,
  });
  assert.equal(freeRecovery.kind, "free-chat");
});

test("pending recovery submission prepares ready and failed interrupted states", () => {
  const freeConversation = conversation({
    id: "free-conversation",
    projectId: freeChatProjectId,
    a2aContextId: "free-chat:agent-lucy",
  });
  const freeMessage = userMessage({
    id: "free-message",
    conversationId: freeConversation.id,
    projectId: freeChatProjectId,
    requestId: "free-request",
  });
  const freeSubmission = getNextPendingRecoverySubmission({
    activeRequestIds: new Set(),
    agents: [agent],
    freeChatProjectId,
    projects: [project],
    state: directRequestState({
      conversations: [freeConversation],
      messages: [freeMessage],
    }),
  });
  assert.equal(freeSubmission.kind, "ready");
  if (freeSubmission.kind === "ready") {
    assert.equal(freeSubmission.recovery.kind, "free-chat");
    assert.equal(freeSubmission.message.id, "free-message");
    assert.equal(freeSubmission.state.messages[0].status, "sending");
  }

  const missingProjectSubmission = getNextPendingRecoverySubmission({
    activeRequestIds: new Set(),
    agents: [agent],
    freeChatProjectId,
    projects: [],
    state: directRequestState({
      conversations: [conversation()],
      messages: [userMessage()],
    }),
    now: () => at,
  });
  assert.equal(missingProjectSubmission.kind, "fail");
  if (missingProjectSubmission.kind === "fail") {
    assert.equal(missingProjectSubmission.state.messages[0].status, "failed");
    assert.equal(missingProjectSubmission.state.tasks.length, 0);
    assert.equal(missingProjectSubmission.state.runs.length, 0);
  }

  const taskRoomConversation = conversation({
    mode: "task_room",
    chiefAgentId: agent.id,
    primaryAgentId: undefined,
  });
  const interruptedTaskMessage = userMessage({
    conversationId: taskRoomConversation.id,
    taskId: "task-1",
    runId: "run-1",
  });
  const failedTaskRoom = applyPendingRecoveryFailure({
    state: taskRoomRequestState({
      conversations: [taskRoomConversation],
      messages: [interruptedTaskMessage],
      tasks: [task()],
      runs: [run()],
    }),
    message: interruptedTaskMessage,
    reason: "Task Room was interrupted before the agent returned. You can retry this request.",
    failTaskRoom: true,
    failedAt: at,
  });
  assert.equal(failedTaskRoom.messages[0].status, "failed");
  assert.equal(failedTaskRoom.tasks[0].state, "failed");
  assert.equal(failedTaskRoom.runs[0].state, "failed");
});

test("retry resolution keeps direct chat and task room responsibilities separate", () => {
  const failedDirect = markConversationMessageFailed([userMessage({ status: "sending" })], "message-1", "Agent did not respond before the timeout.")[0];
  const directRetry = resolveDirectMessageRetry({
    messageId: failedDirect.id,
    messages: [failedDirect],
    conversations: [conversation()],
    agents: [agent],
    projects: [project],
    freeChatProjectId,
  });
  assert.equal(directRetry.kind, "project-chat");

  const taskRoomConversation = conversation({
    mode: "task_room",
    chiefAgentId: agent.id,
    primaryAgentId: undefined,
  });
  const failedTaskRoom = markConversationMessageFailed(
    [userMessage({ taskId: "task-1", conversationId: taskRoomConversation.id })],
    "message-1",
    "Task Room was interrupted before the agent returned. You can retry this request.",
  )[0];
  const taskRoomRetry = resolveTaskRoomMessageRetry({
    messageId: failedTaskRoom.id,
    messages: [failedTaskRoom],
    conversations: [taskRoomConversation],
  });
  assert.deepEqual({ kind: taskRoomRetry.kind, taskId: taskRoomRetry.kind === "retry" ? taskRoomRetry.taskId : "" }, {
    kind: "retry",
    taskId: "task-1",
  });
});

test("retry submission helpers prepare direct and task-room retry state", () => {
  const failedDirect = markConversationMessageFailed(
    [userMessage({ runId: "run-1", status: "sending" })],
    "message-1",
    "Agent did not respond before the timeout.",
    { runId: "run-1" },
  )[0];
  const retrySystemMessage: ConversationMessage = {
    id: "system-retry-error",
    conversationId: failedDirect.conversationId,
    projectId: failedDirect.projectId,
    role: "system",
    agentId: agent.id,
    runId: "run-1",
    contentParts: [{ kind: "text", text: "Old retry error." }],
    status: "sent",
    createdAt: "2026-06-18T10:01:00.000Z",
  };
  const directSubmission = prepareDirectRetrySubmission({
    state: directRequestState({
      messages: [failedDirect, retrySystemMessage],
      conversations: [conversation()],
      runs: [run()],
    }),
    messageId: failedDirect.id,
    agents: [agent],
    projects: [project],
    freeChatProjectId,
  });

  assert.equal(directSubmission.kind, "ready");
  if (directSubmission.kind === "ready") {
    assert.equal(directSubmission.retry.kind, "project-chat");
    assert.equal(directSubmission.state.messages.length, 1);
    assert.equal(directSubmission.state.messages[0].status, "sending");
    assert.equal(directSubmission.state.messages[0].errorText, undefined);
  }

  const taskRoomConversation = conversation({
    mode: "task_room",
    chiefAgentId: agent.id,
    primaryAgentId: undefined,
  });
  const failedTaskRoom = markConversationMessageFailed(
    [userMessage({ taskId: "task-1", conversationId: taskRoomConversation.id })],
    "message-1",
    "Retry this request.",
  )[0];
  const taskSubmission = prepareTaskRoomRetrySubmission({
    state: taskRoomRequestState({
      conversations: [taskRoomConversation],
      messages: [failedTaskRoom],
    }),
    messageId: failedTaskRoom.id,
  });

  assert.equal(taskSubmission.kind, "ready");
  if (taskSubmission.kind === "ready") {
    assert.equal(taskSubmission.retry.taskId, "task-1");
    assert.equal(taskSubmission.state.messages[0].status, "sending");

    const completed = completeTaskRoomRetrySubmission({
      state: taskSubmission.state,
      messageId: failedTaskRoom.id,
      succeeded: true,
    });
    assert.equal(completed.messages[0].status, "sent");

    const failed = completeTaskRoomRetrySubmission({
      state: taskSubmission.state,
      messageId: failedTaskRoom.id,
      succeeded: false,
    });
    assert.equal(failed.messages[0].status, "failed");
    assert.match(failed.messages[0].errorText ?? "", /Retry failed/);
  }
});

test("conversation lifecycle retry attempt preserves request identity and clears prior error", () => {
  const failed = markConversationMessageFailed([userMessage()], "message-1", "Hermes chat completion timed out.")[0];
  assert.equal(failed.status, "failed");
  assert.equal(failed.errorKind, "timeout");
  assert.equal(failed.requestId, "request-1");

  const sendingAgain = markConversationMessageSending([failed], "message-1")[0];
  assert.equal(sendingAgain.status, "sending");
  assert.equal(sendingAgain.requestId, "request-1");
  assert.equal(sendingAgain.requestAttempt, 2);
  assert.equal(sendingAgain.errorText, undefined);
  assert.equal(sendingAgain.errorKind, undefined);
});

test("request runtime store keeps active request ids with the latest workspace snapshot", () => {
  const store = createRequestRuntimeStore(directRequestState());

  assert.deepEqual([...store.activeRequestIds()], []);
  const requestId = store.begin(userMessage());
  assert.equal(requestId, "request-1");
  assert.equal(store.activeRequestIds().has("request-1"), true);

  const nextMessages = [userMessage({ id: "message-2", requestId: "request-2" })];
  store.sync({ messages: nextMessages });
  assert.equal(store.snapshot().messages[0].id, "message-2");

  store.replace({
    ...store.snapshot(),
    runs: [run({ id: "run-2" })],
  });
  assert.equal(store.snapshot().runs[0].id, "run-2");

  store.end(requestId);
  assert.equal(store.activeRequestIds().has("request-1"), false);
});

test("request runtime workspace sync replaces the full snapshot without clearing active requests", () => {
  const store = createRequestRuntimeStore(directRequestState());
  const requestId = store.begin(userMessage());

  syncRequestRuntimeWorkspaceState(store, {
    conversations: [conversation({ id: "conversation-next" })],
    messages: [userMessage({ id: "message-next" })],
    runs: [run({ id: "run-next" })],
    tasks: [task({ id: "task-next" })],
    artifacts: [artifact({ id: "artifact-next" })],
  });

  assert.equal(store.snapshot().conversations[0].id, "conversation-next");
  assert.equal(store.snapshot().messages[0].id, "message-next");
  assert.equal(store.snapshot().runs[0].id, "run-next");
  assert.equal(store.snapshot().tasks[0].id, "task-next");
  assert.equal(store.snapshot().artifacts[0].id, "artifact-next");
  assert.equal(store.activeRequestIds().has(requestId), true);
});

test("retry state helpers prepare direct and task-room messages without stale retry artifacts", () => {
  const failed = markConversationMessageFailed(
    [userMessage({ id: "message-1", runId: "run-1", status: "sending" })],
    "message-1",
    "Agent did not respond before the timeout.",
  )[0];
  const relatedSystem: ConversationMessage = {
    id: "system-related",
    conversationId: failed.conversationId,
    projectId: failed.projectId,
    role: "system",
    contentParts: [{ kind: "text", text: "Old retry error" }],
    runId: "run-1",
    status: "sent",
    createdAt: "2026-06-18T10:01:00.000Z",
  };
  const unrelatedSystem: ConversationMessage = {
    ...relatedSystem,
    id: "system-unrelated",
    runId: "run-2",
  };

  const preparedDirect = prepareDirectMessageRetry({
    messages: [failed, relatedSystem, unrelatedSystem],
    message: failed,
    targetAgentId: agent.id,
  });
  assert.deepEqual(preparedDirect.map((message) => message.id), ["message-1", "system-unrelated"]);
  assert.equal(preparedDirect[0].status, "sending");
  assert.equal(preparedDirect[0].requestId, "request-1");
  assert.equal(preparedDirect[0].requestAttempt, 2);
  assert.equal(preparedDirect[0].errorText, undefined);

  const preparedTaskRoom = prepareTaskRoomMessageRetry({
    messages: [failed],
    messageId: failed.id,
  });
  assert.equal(preparedTaskRoom[0].status, "sending");
  assert.equal(preparedTaskRoom[0].requestAttempt, 2);

  const completedTaskRoom = completeTaskRoomMessageRetry({
    messages: preparedTaskRoom,
    messageId: failed.id,
    succeeded: true,
  });
  assert.equal(completedTaskRoom[0].status, "sent");
  assert.equal(completedTaskRoom[0].errorText, undefined);

  const failedTaskRoom = completeTaskRoomMessageRetry({
    messages: preparedTaskRoom,
    messageId: failed.id,
    succeeded: false,
  });
  assert.equal(failedTaskRoom[0].status, "failed");
  assert.equal(failedTaskRoom[0].errorKind, "unknown");
  assert.match(failedTaskRoom[0].errorText ?? "", /Retry failed/);
});
