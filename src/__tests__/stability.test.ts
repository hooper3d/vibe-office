import test from "node:test";
import assert from "node:assert/strict";
import type { A2ATask } from "../domain/a2a";
import type { Conversation, ConversationMessage, ProjectRun, ProjectTask } from "../domain/projectScope";
import type { AgentInstance, Project } from "../domain/types";
import { markConversationMessageFailed, markConversationMessageSending } from "../domain/requestLifecycle";
import {
  getPendingRequestMessages,
  resolveDirectMessageRetry,
  resolvePendingRequestRecovery,
  resolveTaskRoomMessageRetry,
} from "../services/requestRecovery";
import {
  applyTaskRoomAggregationCompleted,
  applyTaskRoomChiefPlanCompleted,
  applyTaskRoomParticipantCompleted,
  applyTaskRoomParticipantDelegated,
  applyTaskRoomRequestFailed,
} from "../services/taskRoomState";

const at = "2026-06-18T10:00:00.000Z";
const freeChatProjectId = "default";

const agent: AgentInstance = {
  id: "agent-lucy",
  name: "Lucy",
  role: "drafts / releases",
  officeRole: "chief",
  location: "local",
  endpoint: "http://127.0.0.1:8642/v1/chat/completions",
  a2aEndpoint: "",
  agentCardUrl: "",
  model: "hermes",
  tags: ["drafts"],
  status: "online",
};

const participant: AgentInstance = {
  ...agent,
  id: "agent-tiger",
  name: "Tiger",
  officeRole: "writer",
  tags: ["releases"],
};

const project: Project = {
  id: "project-vibe",
  name: "Vibe Office",
  namespace: "project-vibe-office",
  description: "Project workspace.",
};

function conversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: "conversation-1",
    projectId: project.id,
    mode: "direct",
    title: "Direct chat",
    primaryAgentId: agent.id,
    participantAgentIds: [],
    a2aContextId: project.namespace,
    createdAt: at,
    updatedAt: at,
    ...overrides,
  };
}

function userMessage(overrides: Partial<ConversationMessage> = {}): ConversationMessage {
  return {
    id: "message-1",
    conversationId: "conversation-1",
    projectId: project.id,
    role: "user",
    contentParts: [{ kind: "text", text: "hello" }],
    requestId: "request-1",
    requestAttempt: 1,
    requestStartedAt: at,
    status: "sending",
    createdAt: at,
    ...overrides,
  };
}

function task(overrides: Partial<ProjectTask> = {}): ProjectTask {
  return {
    id: "task-1",
    projectId: project.id,
    contextId: project.namespace,
    title: "Task",
    ownerAgentId: agent.id,
    participantAgentIds: [participant.id],
    state: "submitting",
    summary: "Task submitted to Chief.",
    events: [],
    artifactIds: [],
    updatedAt: at,
    ...overrides,
  };
}

function run(overrides: Partial<ProjectRun> = {}): ProjectRun {
  return {
    id: "run-1",
    projectId: project.id,
    conversationId: "conversation-1",
    taskId: "task-1",
    type: "chief_delegation",
    ownerAgentId: agent.id,
    participantAgentIds: [agent.id, participant.id],
    state: "submitting",
    summary: "Chief-led task submitted.",
    eventIds: ["run-1-submitted"],
    artifactIds: [],
    createdAt: at,
    updatedAt: at,
    ...overrides,
  };
}

function a2aTask(summary: string, id = "remote-task-1"): A2ATask {
  return {
    id,
    contextId: project.namespace,
    status: {
      state: "completed",
      timestamp: at,
      message: {
        messageId: `${id}-message`,
        role: "agent",
        parts: [{ kind: "text", text: summary }],
      },
    },
  };
}

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

test("task room reducers persist chief plan, participant result, aggregation, and failure states", () => {
  const chiefState = applyTaskRoomChiefPlanCompleted({
    state: {
      messages: [userMessage({ taskId: "task-1", runId: "run-1" })],
      tasks: [task()],
      runs: [run()],
      artifacts: [],
    },
    result: {
      task: a2aTask("Chief plan ready."),
      summary: "Chief plan ready.",
      completedAt: at,
    },
    conversationId: "conversation-1",
    projectId: project.id,
    chiefAgentId: agent.id,
    taskId: "task-1",
    runId: "run-1",
    userMessageId: "message-1",
    artifactIds: [],
  });

  assert.equal(chiefState.state.messages[0].status, "sent");
  assert.equal(chiefState.state.messages[1].role, "agent");
  assert.equal(chiefState.state.tasks[0].state, "working");
  assert.deepEqual(chiefState.state.runs[0].eventIds, ["run-1-submitted", "run-1-chief-response"]);

  const delegatedTasks = applyTaskRoomParticipantDelegated({
    tasks: chiefState.state.tasks,
    taskId: "task-1",
    participant,
    delegatedAt: at,
  });
  assert.equal(delegatedTasks[0].summary, "Delegated to Tiger.");

  const participantState = applyTaskRoomParticipantCompleted({
    state: {
      tasks: delegatedTasks,
      artifacts: [],
    },
    projectId: project.id,
    taskId: "task-1",
    participant,
    participantState: "completed",
    participantSummary: "Tiger result.",
    participantAt: at,
    artifactIds: chiefState.artifactIds,
  });
  assert.equal(participantState.participantResult.agentName, "Tiger");
  assert.equal(participantState.state.artifacts.length, 1);
  assert.equal(participantState.state.tasks[0].artifactIds.length, 1);

  const aggregation = applyTaskRoomAggregationCompleted({
    state: {
      messages: chiefState.state.messages,
      tasks: participantState.state.tasks,
      runs: chiefState.state.runs,
      artifacts: participantState.state.artifacts,
    },
    conversations: [conversation({ mode: "task_room", chiefAgentId: agent.id })],
    result: {
      task: a2aTask("Final summary.", "remote-aggregate"),
      summary: "Final summary.",
      completedAt: at,
    },
    conversationId: "conversation-1",
    projectId: project.id,
    chiefAgentId: agent.id,
    taskId: "task-1",
    runId: "run-1",
    finalState: "completed",
    finalSummary: "Final summary.",
    finalAt: at,
    participantAgentIds: [participant.id],
    artifactIds: participantState.artifactIds,
    userMessageId: "message-1",
  });
  assert.equal(aggregation.state.tasks[0].state, "completed");
  assert.equal(aggregation.state.runs[0].state, "completed");
  assert.equal(aggregation.finalArtifactIds.length, 2);
  assert.deepEqual(aggregation.conversations[0].participantAgentIds, [participant.id]);

  const failed = applyTaskRoomRequestFailed({
    messages: [userMessage({ taskId: "task-1", runId: "run-1" })],
    tasks: [task()],
    runs: [run()],
    userMessageId: "message-1",
    taskId: "task-1",
    runId: "run-1",
    chiefAgentId: agent.id,
    errorMessage: "Agent did not respond before the timeout.",
    failedAt: at,
  });
  assert.equal(failed.messages[0].status, "failed");
  assert.equal(failed.messages[0].errorKind, "timeout");
  assert.equal(failed.tasks[0].state, "failed");
  assert.equal(failed.runs[0].state, "failed");
});
