import assert from "node:assert/strict";
import test from "node:test";
import {
  executeTaskRoomRequestState,
  type TaskRoomRequestState,
} from "../services/taskRoomOrchestrator";
import {
  applyTaskRoomAggregationCompleted,
  applyTaskRoomChiefPlanCompleted,
  applyTaskRoomParticipantCompleted,
  applyTaskRoomParticipantDelegated,
  applyTaskRoomRequestFailed,
} from "../services/taskRoomState";

import { a2aTask, agent, at, conversation, participant, project, run, task, taskRoomRequestState, userMessage } from "./testSupport";

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

test("task room orchestrator emits progressive state steps for chief, participant, and aggregation", async () => {
  const steps: TaskRoomRequestState[] = [];
  const taskRoomConversation = conversation({ mode: "task_room", chiefAgentId: agent.id });
  const result = await executeTaskRoomRequestState({
    state: taskRoomRequestState({ conversations: [taskRoomConversation] }),
    conversation: taskRoomConversation,
    project,
    chief: agent,
    participants: [participant],
    text: "Coordinate release notes.",
    files: [],
    taskId: "task-1",
    runId: "run-1",
    userMessageId: "message-1",
    deps: {
      executeChiefPlanTurn: async () => ({
        task: a2aTask("Chief plan ready."),
        summary: "Chief plan ready.",
        completedAt: "2026-06-18T10:05:00.000Z",
      }),
      executeParticipantTaskTurn: async () => ({
        task: a2aTask("Tiger result."),
        summary: "Tiger result.",
        completedAt: "2026-06-18T10:06:00.000Z",
      }),
      executeChiefAggregationTurn: async () => ({
        task: a2aTask("Final summary."),
        summary: "Final summary.",
        completedAt: "2026-06-18T10:07:00.000Z",
      }),
      now: () => "2026-06-18T10:05:30.000Z",
    },
    onStep: (step) => steps.push(step.state),
  });

  assert.equal(steps.length, 4);
  assert.equal(steps[0].tasks[0].state, "working");
  assert.equal(steps[1].tasks[0].summary, "Delegated to Tiger.");
  assert.equal(steps[2].artifacts[0].name, "Tiger result");
  assert.equal(result.state.tasks[0].state, "completed");
  assert.equal(result.state.runs[0].state, "completed");
  assert.equal(result.state.messages[0].status, "sent");
  assert.equal(result.state.messages[result.state.messages.length - 1]?.role, "agent");
  assert.equal(result.outputMode, "outputs");
});

test("task room orchestrator converts chief planning failure into retryable failed request state", async () => {
  const taskRoomConversation = conversation({ mode: "task_room", chiefAgentId: agent.id });
  const result = await executeTaskRoomRequestState({
    state: taskRoomRequestState({ conversations: [taskRoomConversation] }),
    conversation: taskRoomConversation,
    project,
    chief: agent,
    participants: [participant],
    text: "Coordinate release notes.",
    files: [],
    taskId: "task-1",
    runId: "run-1",
    userMessageId: "message-1",
    deps: {
      executeChiefPlanTurn: async () => {
        throw new Error("Agent did not respond before the timeout.");
      },
      now: () => "2026-06-18T10:08:00.000Z",
    },
  });

  assert.equal(result.state.messages[0].status, "failed");
  assert.equal(result.state.messages[0].errorKind, "timeout");
  assert.equal(result.state.tasks[0].state, "failed");
  assert.equal(result.state.runs[0].state, "failed");
  assert.equal(result.outputMode, "outputs");
});
