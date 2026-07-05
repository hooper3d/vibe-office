import assert from "node:assert/strict";
import test from "node:test";
import { deriveAppConversationViewState } from "../services/appConversationViewState";
import { resolveComposerSubmissionIntent } from "../services/composerSubmissionState";
import {
  applyActiveFreeChatConversation,
  buildFreeChatHistory,
  deleteFreeChatConversationState,
  getConversationMessages,
  hasPendingUserRequest,
  renameFreeChatConversation,
  resolveCurrentDirectConversation,
  resolveTaskRoomConversation,
  shouldReuseEmptyFreeChat,
} from "../services/conversationSelectionState";

import { agent, conversation, freeChatProjectId, participant, project, userMessage } from "./testSupport";

test("free chat selection derives history and current conversation", () => {
  const olderFreeConversation = conversation({
    id: "free-older",
    projectId: freeChatProjectId,
    primaryAgentId: agent.id,
    title: "Older chat",
    updatedAt: "2026-06-18T10:01:00.000Z",
  });
  const newerFreeConversation = conversation({
    id: "free-newer",
    projectId: freeChatProjectId,
    primaryAgentId: agent.id,
    title: "Newer chat",
    customTitle: "Renamed strategy chat",
    updatedAt: "2026-06-18T10:02:00.000Z",
  });
  const otherAgentConversation = conversation({
    id: "free-other-agent",
    projectId: freeChatProjectId,
    primaryAgentId: participant.id,
  });
  const history = buildFreeChatHistory({
    agent,
    conversations: [olderFreeConversation, newerFreeConversation, otherAgentConversation, conversation()],
    messages: [
      userMessage({
        id: "free-older-message",
        conversationId: olderFreeConversation.id,
        projectId: freeChatProjectId,
        contentParts: [{ kind: "text", text: "older title" }],
      }),
      userMessage({
        id: "free-newer-message",
        conversationId: newerFreeConversation.id,
        projectId: freeChatProjectId,
        contentParts: [{ kind: "data", data: { title: "newer" } }],
      }),
    ],
    freeChatProjectId,
  });

  assert.deepEqual(history.map((item) => item.conversation.id), ["free-newer", "free-older"]);
  assert.equal(history[0].title, "Renamed strategy chat");
  assert.equal(history[1].title, "older title");
  assert.equal(history[1].messageCount, 1);

  assert.equal(
    resolveCurrentDirectConversation({
      agent,
      activeFreeChatConversationId: olderFreeConversation.id,
      chatScope: "free",
      conversations: [olderFreeConversation, newerFreeConversation],
      directConversationProjectId: project.id,
      freeChatHistory: history,
    })?.id,
    olderFreeConversation.id,
  );
  assert.equal(
    resolveCurrentDirectConversation({
      agent,
      chatScope: "free",
      conversations: [olderFreeConversation, newerFreeConversation],
      directConversationProjectId: project.id,
      freeChatHistory: history,
    })?.id,
    newerFreeConversation.id,
  );
});

test("free chat history rename and delete update local conversation state", () => {
  const olderFreeConversation = conversation({
    id: "free-older",
    projectId: freeChatProjectId,
    primaryAgentId: agent.id,
    updatedAt: "2026-06-18T10:01:00.000Z",
  });
  const newerFreeConversation = conversation({
    id: "free-newer",
    projectId: freeChatProjectId,
    primaryAgentId: agent.id,
    updatedAt: "2026-06-18T10:02:00.000Z",
  });
  const olderMessage = userMessage({
    id: "free-older-message",
    conversationId: olderFreeConversation.id,
    projectId: freeChatProjectId,
  });
  const newerMessage = userMessage({
    id: "free-newer-message",
    conversationId: newerFreeConversation.id,
    projectId: freeChatProjectId,
  });
  const renamed = renameFreeChatConversation({
    conversations: [olderFreeConversation, newerFreeConversation],
    conversationId: olderFreeConversation.id,
    title: "  Market notes  ",
  });

  assert.equal(renamed[0].title, "Market notes");
  assert.equal(renamed[0].customTitle, "Market notes");

  const unchanged = renameFreeChatConversation({
    conversations: renamed,
    conversationId: olderFreeConversation.id,
    title: " ",
  });
  assert.equal(unchanged, renamed);

  const deleted = deleteFreeChatConversationState({
    activeConversationIds: { [agent.id]: newerFreeConversation.id },
    agentId: agent.id,
    conversationId: newerFreeConversation.id,
    conversations: renamed,
    freeChatProjectId,
    messages: [olderMessage, newerMessage],
  });

  assert.deepEqual(deleted.conversations.map((item) => item.id), [olderFreeConversation.id]);
  assert.deepEqual(deleted.messages.map((item) => item.id), [olderMessage.id]);
  assert.deepEqual(deleted.activeConversationIds, { [agent.id]: olderFreeConversation.id });

  const deletedLast = deleteFreeChatConversationState({
    activeConversationIds: { [agent.id]: olderFreeConversation.id },
    agentId: agent.id,
    conversationId: olderFreeConversation.id,
    conversations: [olderFreeConversation],
    freeChatProjectId,
    messages: [olderMessage],
  });

  assert.deepEqual(deletedLast.activeConversationIds, {});
});

test("conversation selection derives messages, pending state, and task room conversation", () => {
  const directConversation = conversation({ id: "direct-conversation" });
  const taskConversation = conversation({
    id: "task-room-conversation",
    mode: "task_room",
    chiefAgentId: agent.id,
  });
  const directSendingMessage = userMessage({
    id: "direct-sending",
    conversationId: directConversation.id,
    status: "sending",
  });
  const directSentMessage = userMessage({
    id: "direct-sent",
    conversationId: directConversation.id,
    status: "sent",
  });
  const taskMessage = userMessage({
    id: "task-message",
    conversationId: taskConversation.id,
    status: "sent",
  });

  assert.deepEqual(
    getConversationMessages({
      conversation: directConversation,
      messages: [directSendingMessage, taskMessage, directSentMessage],
    }).map((item) => item.id),
    ["direct-sending", "direct-sent"],
  );
  assert.deepEqual(getConversationMessages({ conversation: undefined, messages: [directSendingMessage] }), []);
  assert.equal(hasPendingUserRequest([directSentMessage]), false);
  assert.equal(hasPendingUserRequest([directSentMessage, directSendingMessage]), true);
  assert.equal(
    resolveTaskRoomConversation({
      chiefAgent: agent,
      conversations: [directConversation, taskConversation],
      project,
    })?.id,
    taskConversation.id,
  );
  assert.equal(
    resolveTaskRoomConversation({
      chiefAgent: participant,
      conversations: [taskConversation],
      project,
    }),
    undefined,
  );
});

test("app conversation view state derives active direct and task room chrome", () => {
  const olderFreeConversation = conversation({
    id: "free-older-view",
    projectId: freeChatProjectId,
    primaryAgentId: agent.id,
    updatedAt: "2026-06-18T10:01:00.000Z",
  });
  const newerFreeConversation = conversation({
    id: "free-newer-view",
    projectId: freeChatProjectId,
    primaryAgentId: agent.id,
    updatedAt: "2026-06-18T10:02:00.000Z",
  });
  const taskConversation = conversation({
    id: "task-room-view",
    projectId: project.id,
    mode: "task_room",
    chiefAgentId: agent.id,
  });
  const freeMessage = userMessage({
    id: "free-view-message",
    conversationId: olderFreeConversation.id,
    projectId: freeChatProjectId,
    status: "sent",
  });
  const taskPendingMessage = userMessage({
    id: "task-view-pending",
    conversationId: taskConversation.id,
    projectId: project.id,
    status: "sending",
  });

  const freeView = deriveAppConversationViewState({
    activeFreeChatConversationIds: { [agent.id]: olderFreeConversation.id },
    chatScope: "free",
    chiefAgent: agent,
    conversationMode: "single",
    conversations: [newerFreeConversation, olderFreeConversation, taskConversation],
    freeChatProjectId,
    messages: [freeMessage, taskPendingMessage],
    selectedAgent: agent,
    selectedWorkspaceProject: project,
  });

  assert.equal(freeView.activeFreeChatConversationId, olderFreeConversation.id);
  assert.equal(freeView.currentConversation?.id, olderFreeConversation.id);
  assert.deepEqual(freeView.currentMessages.map((message) => message.id), [freeMessage.id]);
  assert.equal(freeView.currentConversationHasPendingRequest, false);
  assert.equal(freeView.taskRoomConversation?.id, taskConversation.id);
  assert.equal(freeView.taskRoomHasPendingRequest, true);
  assert.equal(freeView.activeComposerHasPendingRequest, false);

  const taskRoomView = deriveAppConversationViewState({
    activeFreeChatConversationIds: {},
    chatScope: "project",
    chiefAgent: agent,
    conversationMode: "task-room",
    conversations: [newerFreeConversation, olderFreeConversation, taskConversation],
    freeChatProjectId,
    messages: [freeMessage, taskPendingMessage],
    selectedAgent: agent,
    selectedWorkspaceProject: project,
  });

  assert.equal(taskRoomView.directConversationProjectId, project.id);
  assert.equal(taskRoomView.activeComposerHasPendingRequest, true);
});

test("free chat active map and empty-chat reuse are stable", () => {
  const active = { [agent.id]: "conversation-1" };
  assert.equal(
    applyActiveFreeChatConversation({
      activeConversationIds: active,
      agentId: agent.id,
      conversationId: "conversation-1",
    }),
    active,
  );
  assert.deepEqual(
    applyActiveFreeChatConversation({
      activeConversationIds: active,
      agentId: agent.id,
      conversationId: "conversation-2",
    }),
    { [agent.id]: "conversation-2" },
  );
  assert.equal(
    shouldReuseEmptyFreeChat({
      conversation: conversation({ projectId: freeChatProjectId }),
      messageCount: 0,
      freeChatProjectId,
    }),
    true,
  );
  assert.equal(
    shouldReuseEmptyFreeChat({
      conversation: conversation({ projectId: project.id }),
      messageCount: 0,
      freeChatProjectId,
    }),
    false,
  );
});

test("composer submission intent routes free, project, and task room requests", () => {
  const base = {
    chatScope: "free" as const,
    conversationMode: "single" as const,
    hasChiefAgent: true,
    hasSelectedAgent: true,
    hasSelectedWorkspaceProject: false,
    isBusy: false,
    selectedTaskParticipantCount: 1,
    text: "  hello  ",
  };

  assert.deepEqual(resolveComposerSubmissionIntent({ ...base, text: "   " }), {
    kind: "ignore",
    reason: "empty",
  });
  assert.deepEqual(resolveComposerSubmissionIntent({ ...base, isBusy: true }), {
    kind: "ignore",
    reason: "busy",
  });
  assert.deepEqual(resolveComposerSubmissionIntent(base), {
    kind: "free-chat",
    text: "hello",
  });
  assert.deepEqual(resolveComposerSubmissionIntent({ ...base, chatScope: "project", hasSelectedWorkspaceProject: true }), {
    kind: "project-chat",
    text: "hello",
  });
  assert.deepEqual(
    resolveComposerSubmissionIntent({
      ...base,
      conversationMode: "task-room",
      hasSelectedWorkspaceProject: true,
      selectedTaskParticipantCount: 0,
    }),
    {
      kind: "ignore",
      reason: "missing-participant",
    },
  );
  assert.deepEqual(
    resolveComposerSubmissionIntent({
      ...base,
      conversationMode: "task-room",
      hasSelectedWorkspaceProject: true,
    }),
    {
      kind: "task-room",
      text: "hello",
    },
  );
});
