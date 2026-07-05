import assert from "node:assert/strict";
import test from "node:test";
import {
  completeFreeChatRequestState,
  resumeProjectDirectRequestState,
} from "../services/directRequestOrchestrator";
import {
  prepareFreeChatSubmission,
  prepareProjectDirectSubmission,
  prepareTaskRoomSubmission,
} from "../services/requestSubmissionState";

import { agent, at, conversation, directA2ATask, directRequestState, freeChatProjectId, participant, project, run, taskRoomRequestState, userMessage } from "./testSupport";

test("request submission helpers create stable optimistic chat and task state", () => {
  let idIndex = 0;
  const createId = () => `generated-${++idIndex}`;
  const files = [
    {
      path: "src/App.tsx",
      content: "export function App() {}",
      size: 24,
      attachedAt: at,
      truncated: false,
    },
  ];

  const freeChat = prepareFreeChatSubmission({
    state: directRequestState({ conversations: [], messages: [] }),
    targetAgent: agent,
    text: "hello",
    freeChatProjectId,
    freeChatNamespace: "free-chat",
    now: () => at,
    createId,
  });
  assert.equal(freeChat.state.conversations.length, 1);
  assert.equal(freeChat.state.messages[0].status, "sending");
  assert.equal(freeChat.state.messages[0].requestId, "generated-2");
  assert.equal(freeChat.conversation.primaryAgentId, agent.id);

  const projectDirect = prepareProjectDirectSubmission({
    state: directRequestState({ conversations: [], messages: [], runs: [] }),
    project,
    targetAgent: participant,
    text: "review this file",
    files,
    now: () => at,
    createId,
  });
  assert.equal(projectDirect.state.conversations[0].projectId, project.id);
  assert.equal(projectDirect.state.messages[0].runId, "generated-3");
  assert.deepEqual(projectDirect.state.messages[0].workspaceContext, [
    {
      path: "src/App.tsx",
      size: 24,
      attachedAt: at,
    },
  ]);
  assert.equal(projectDirect.state.runs[0].type, "direct_message");
  assert.match(projectDirect.agentRequestText, /review this file/);
  assert.match(projectDirect.agentRequestText, /src\/App\.tsx/);

  const taskRoom = prepareTaskRoomSubmission({
    state: taskRoomRequestState({ conversations: [], messages: [], runs: [], tasks: [] }),
    project,
    chief: agent,
    participants: [participant],
    text: "coordinate one small release draft",
    files,
    now: () => at,
    createId,
  });
  assert.equal(taskRoom.state.conversations[0].mode, "task_room");
  assert.equal(taskRoom.state.messages[0].taskId, "generated-6");
  assert.equal(taskRoom.state.tasks[0].state, "submitting");
  assert.equal(taskRoom.state.runs[0].type, "chief_delegation");
  assert.deepEqual(taskRoom.state.runs[0].participantAgentIds, [agent.id, participant.id]);
});

test("direct request orchestrator completes free chat without component-local state edits", async () => {
  const freeConversation = conversation({
    id: "free-conversation",
    projectId: freeChatProjectId,
    a2aContextId: "free-chat:agent-lucy",
  });
  const pending = userMessage({
    conversationId: freeConversation.id,
    projectId: freeChatProjectId,
  });
  const result = await completeFreeChatRequestState({
    state: directRequestState({
      conversations: [freeConversation],
      messages: [pending],
    }),
    conversation: freeConversation,
    targetAgent: agent,
    userMessageId: pending.id,
    text: "hello",
    freeChatProjectId,
    deps: {
      executeFreeChatTurn: async () => ({
        task: directA2ATask("Free chat recovered."),
        summary: "Free chat recovered.",
        completedAt: "2026-06-18T10:02:00.000Z",
      }),
    },
  });

  assert.equal(result.state.messages[0].status, "sent");
  assert.equal(result.state.messages[1].role, "agent");
  assert.equal(result.state.messages[1].contentParts[0].kind, "text");
  assert.equal(result.state.conversations[0].updatedAt, "2026-06-18T10:02:00.000Z");
});

test("direct request orchestrator restores workspace context before project retry", async () => {
  let sentRequestText = "";
  const pending = userMessage({
    runId: "run-1",
    workspaceContext: [{ path: "package.json", size: 0, attachedAt: at }],
  });
  const result = await resumeProjectDirectRequestState({
    state: directRequestState({
      messages: [pending],
      runs: [run({ type: "direct_message", taskId: undefined, ownerAgentId: agent.id, participantAgentIds: [agent.id] })],
    }),
    message: pending,
    conversation: conversation(),
    project,
    targetAgent: agent,
    text: "Use attached file.",
    deps: {
      restoreWorkspaceAttachments: async () => [
        {
          path: "package.json",
          content: "{\"name\":\"vibe-office\"}",
          size: 27,
          updatedAt: at,
          attachedAt: at,
        },
      ],
      executeProjectDirectTurn: async ({ agentRequestText }) => {
        sentRequestText = agentRequestText;
        return {
          task: directA2ATask("Project context recovered."),
          summary: "Project context recovered.",
          completedAt: "2026-06-18T10:03:00.000Z",
        };
      },
    },
  });

  assert.match(sentRequestText, /package\.json/);
  assert.match(sentRequestText, /remote agent cannot access the local filesystem/i);
  assert.equal(result.state.messages[0].status, "sent");
  assert.equal(result.state.messages[1].contentParts[0].kind, "text");
  assert.equal(result.state.runs[0].state, "completed");
});

test("direct request orchestrator converts workspace recovery failure into context retry state", async () => {
  const pending = userMessage({
    runId: "run-1",
    workspaceContext: [{ path: "missing.md", size: 0, attachedAt: at }],
  });
  const result = await resumeProjectDirectRequestState({
    state: directRequestState({
      messages: [pending],
      runs: [run({ type: "direct_message", taskId: undefined, ownerAgentId: agent.id, participantAgentIds: [agent.id] })],
    }),
    message: pending,
    conversation: conversation(),
    project,
    targetAgent: agent,
    text: "Use missing file.",
    deps: {
      restoreWorkspaceAttachments: async () => {
        throw new Error("Project directory is not available.");
      },
      now: () => "2026-06-18T10:04:00.000Z",
    },
  });

  assert.equal(result.state.messages[0].status, "failed");
  assert.equal(result.state.messages[0].errorKind, "context");
  assert.match(result.state.messages[0].errorText ?? "", /workspace files/i);
  assert.equal(result.state.runs[0].state, "failed");
  assert.equal(result.outputMode, "outputs");
});
