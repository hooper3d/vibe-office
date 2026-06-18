import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { A2ATask } from "../domain/a2a";
import type { Conversation, ConversationMessage, ProjectArtifact, ProjectRun, ProjectTask } from "../domain/projectScope";
import type { AgentInstance, Project } from "../domain/types";
import { markConversationMessageFailed, markConversationMessageSending } from "../domain/requestLifecycle";
import { createAgentFromHermesSetup, getProviderSetupIssue } from "../domain/hermesSetup";
import { runAgentConnectionTest } from "../services/agentConnectionTestState";
import { getUserFacingAgentError } from "../services/agentErrorText";
import { applyMediaArtifactBackfillState } from "../services/artifactBackfillState";
import { readAvatarFile } from "../services/avatarFile";
import { resolveComposerSubmissionIntent } from "../services/composerSubmissionState";
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
import {
  prepareFreeChatSubmission,
  prepareProjectDirectSubmission,
  prepareTaskRoomSubmission,
} from "../services/requestSubmissionState";
import {
  applyTaskRoomAggregationCompleted,
  applyTaskRoomChiefPlanCompleted,
  applyTaskRoomParticipantCompleted,
  applyTaskRoomParticipantDelegated,
  applyTaskRoomRequestFailed,
} from "../services/taskRoomState";
import {
  completeFreeChatRequestState,
  resumeProjectDirectRequestState,
  type DirectRequestState,
} from "../services/directRequestOrchestrator";
import {
  executeTaskRoomRequestState,
  type TaskRoomRequestState,
} from "../services/taskRoomOrchestrator";
import {
  createBrowserAgentHttpTransport,
  readErrorSuffix,
  type AgentHttpTransport,
  type LocalTrustedProviderCommand,
} from "../services/agentHttpTransport";
import { HermesA2AAdapter } from "../services/hermesA2AAdapter";
import { ProviderRouter, resolveProviderRoute } from "../services/providerRouter";
import {
  createA2ACompatibilityMetadata,
  createCompletedTextTask,
  createSyntheticAgentCard,
  type ProviderAdapter,
  type ProviderConnectionMode,
} from "../services/providerTypes";
import { A2AClient } from "../services/a2aClient";
import {
  applyAgentAvatarUpdate,
  applyAgentDelete,
  applyAgentSetupSave,
  normalizeChief,
  resolveSelectedAgent,
} from "../services/agentSetupState";
import {
  applyLocalTrustedAgentStatusMap,
  applyLocalTrustedAgentStatuses,
  deriveAgentReadinessIssues,
  readLocalTrustedAgentReadinessRefresh,
  removeAgentReadinessIssues,
  removeAgentReadinessStatus,
} from "../services/agentReadinessState";
import { loadConfiguredAgents, saveConfiguredAgents, syncConfiguredAgents } from "../services/agentStorage";
import {
  applyActiveFreeChatConversation,
  buildFreeChatHistory,
  getConversationMessages,
  hasPendingUserRequest,
  resolveCurrentDirectConversation,
  resolveTaskRoomConversation,
  shouldReuseEmptyFreeChat,
} from "../services/conversationSelectionState";
import { getCanonicalLocalhostRedirectUrl } from "../services/canonicalHost";
import {
  deriveInitialChatScope,
  FREE_CHAT_ENTRY_PROJECT_ID,
  normalizeOutputMode,
} from "../services/appBootstrapState";
import { deriveAppAgentViewState } from "../services/appAgentViewState";
import { deriveAppConversationViewState } from "../services/appConversationViewState";
import {
  applyMissingProjectSelection,
  applyProjectDelete,
  applyProjectDeleteSelection,
  applyProjectSave,
  canDeleteProject,
  normalizeConversationModeForScope,
} from "../services/projectSetupState";
import {
  clearConfirmActionState,
  closeProjectDialogState,
  createProjectDialogViewState,
  openCreateProjectDialogState,
  openEditProjectDialogState,
  requestDeleteAgentConfirmState,
  requestDeleteProjectConfirmState,
  setProjectFormErrorState,
} from "../services/projectDialogState";
import { createRequestRuntimeStore, syncRequestRuntimeWorkspaceState } from "../services/requestRuntimeStore";
import { getSplitPercentFromClientX, nudgeSplitPercent } from "../services/splitPaneState";
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
import { loadUiState, saveUiState } from "../services/uiStateStorage";
import {
  applyTaskCancelUnsupportedToWorkspace,
  applyTaskLifecycleUnsupportedToWorkspace,
  applyTaskLifecycleRemoteUpdateToWorkspace,
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
  prepareTaskRetrySubmitting,
  recordCancelUnsupportedState,
  recordLifecycleUnsupportedState,
  isTaskLifecycleBusy,
} from "../services/taskLifecycleState";
import {
  getAvailableTaskParticipants,
  getSelectedTaskParticipants,
  toggleTaskParticipantSelection,
} from "../services/taskParticipantSelectionState";
import { attachWorkspaceFileState, detachWorkspaceFileState } from "../services/workspaceAttachmentState";
import { deriveWorkspaceSelection } from "../services/workspaceSelectionState";
import { applyWorkspaceStateDefaults, emptyWorkspaceState, loadWorkspaceState, saveWorkspaceState } from "../services/workspaceStorage";
import {
  createLocalTrustedWorkspaceCommandRequest,
  readWorkspaceFile,
  type WorkspaceFileAttachment,
  type WorkspaceFileReadResult,
} from "../services/workspaceFileClient";
import { createLocalTrustedAgentRegistryCommandRequest } from "../services/localTrustedAgentRegistry";

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

function artifact(overrides: Partial<ProjectArtifact> = {}): ProjectArtifact {
  return {
    id: "artifact-1",
    projectId: project.id,
    taskId: "task-1",
    agentId: participant.id,
    name: "Artifact",
    kind: "text",
    summary: "Artifact body.",
    contentParts: [{ kind: "text", text: "Artifact body." }],
    createdAt: at,
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

function directA2ATask(summary: string, id = "remote-message-1"): A2ATask {
  return {
    ...a2aTask(summary, id),
    metadata: {
      responseKind: "direct-message",
    },
  };
}

function directRequestState(overrides: Partial<DirectRequestState> = {}): DirectRequestState {
  return {
    conversations: [conversation()],
    messages: [userMessage()],
    runs: [],
    tasks: [],
    artifacts: [],
    ...overrides,
  };
}

function taskRoomRequestState(overrides: Partial<TaskRoomRequestState> = {}): TaskRoomRequestState {
  return {
    conversations: [conversation({ mode: "task_room", chiefAgentId: agent.id })],
    messages: [userMessage({ taskId: "task-1", runId: "run-1" })],
    runs: [run()],
    tasks: [task()],
    artifacts: [],
    ...overrides,
  };
}

class MemoryLocalStorage {
  private values = new Map<string, string>();

  constructor(private shouldThrowOnSet = false) {}

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    if (this.shouldThrowOnSet) throw new Error("Quota exceeded");
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  clear() {
    this.values.clear();
  }
}

function withWindowStorage<T>(storage: MemoryLocalStorage, run: () => T) {
  const hadWindow = Object.prototype.hasOwnProperty.call(globalThis, "window");
  const previousWindow = (globalThis as { window?: unknown }).window;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { localStorage: storage },
  });

  try {
    return run();
  } finally {
    if (hadWindow) {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: previousWindow,
      });
    } else {
      Reflect.deleteProperty(globalThis, "window");
    }
  }
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

test("agent http transport delegates provider commands to the local trusted layer", async () => {
  const previousFetch = globalThis.fetch;
  const requestedUrls: string[] = [];
  const requestedBodies: Array<Record<string, unknown>> = [];
  const requestedHeaders: Array<Headers> = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    requestedUrls.push(String(url));
    requestedBodies.push(JSON.parse(String(init?.body || "{}")));
    requestedHeaders.push(new Headers(init?.headers));
    if (String(init?.body).includes("fail")) {
      return new Response(JSON.stringify({ error: { message: "bad key" } }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const transport = createBrowserAgentHttpTransport();
    assert.deepEqual(
      await transport.commandJson<{ ok: boolean }>(
        {
          agentId: "agent-lucy",
          command: "openai.chatCompletions",
          payload: {
            messages: [{ role: "user", content: "hi" }],
          },
        },
        {
          timeoutMs: 1000,
          timeoutMessage: "timed out",
          failurePrefix: "Provider command failed",
        },
      ),
      { ok: true },
    );
    assert.equal(requestedUrls[0], "/agent-local/command");
    assert.equal(requestedBodies[0].agentId, "agent-lucy");
    assert.equal(requestedBodies[0].command, "openai.chatCompletions");
    assert.equal("url" in requestedBodies[0], false);
    assert.equal("endpoint" in requestedBodies[0], false);
    assert.equal("apiKey" in requestedBodies[0], false);
    assert.equal(requestedHeaders[0].has("Authorization"), false);
    assert.equal(requestedHeaders[0].has("x-api-key"), false);

    await assert.rejects(
      () =>
        transport.commandJson(
          {
            agentId: "agent-lucy",
            command: "openai.chatCompletions",
            payload: {
              messages: [{ role: "user", content: "fail" }],
            },
          },
          {
            timeoutMs: 1000,
            timeoutMessage: "timed out",
            failurePrefix: "Provider failed",
            agentId: "agent-lucy",
          },
        ),
      /Provider failed: 401: bad key/,
    );
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("agent http transport preserves local trusted error details", async () => {
  const objectError = await readErrorSuffix(
    new Response(JSON.stringify({ error: { message: "API key is missing in the local trusted layer." } }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    }),
  );
  const stringError = await readErrorSuffix(
    new Response(JSON.stringify({ error: "Legacy local trusted error." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    }),
  );

  assert.equal(objectError, ": API key is missing in the local trusted layer.");
  assert.equal(stringError, ": Legacy local trusted error.");
});

test("configured agent storage keeps provider credentials out of browser localStorage", () => {
  withWindowStorage(new MemoryLocalStorage(), () => {
    saveConfiguredAgents([
      {
        ...agent,
        a2aEndpoint: "http://127.0.0.1:8642/a2a",
        agentCardUrl: "http://127.0.0.1:8642/.well-known/agent-card.json",
        apiKey: "local-secret-value",
      },
    ]);

    const raw = window.localStorage.getItem("vibe-office.configured-agents") ?? "";
    assert.equal(raw.includes("local-secret-value"), false);
    assert.equal(JSON.parse(raw)[0].apiKey, undefined);
  });
});

test("configured agent sync keeps local trusted credentials separate from browser metadata", () => {
  withWindowStorage(new MemoryLocalStorage(), () => {
    const syncedAgents: AgentInstance[] = [];
    const agentWithCredential = {
      ...agent,
      id: "agent-sync-secret",
      apiKey: "local-trusted-secret",
    };

    syncConfiguredAgents({
      agents: [agentWithCredential],
      upsertAgent(agentToSync) {
        syncedAgents.push(agentToSync);
      },
    });

    const raw = window.localStorage.getItem("vibe-office.configured-agents") ?? "";
    assert.equal(syncedAgents[0].apiKey, "local-trusted-secret");
    assert.equal(raw.includes("local-trusted-secret"), false);
    assert.equal(JSON.parse(raw)[0].apiKey, undefined);
  });
});

test("configured agent storage does not restore legacy browser credentials", () => {
  withWindowStorage(new MemoryLocalStorage(), () => {
    window.localStorage.setItem(
      "vibe-office.configured-agents",
      JSON.stringify([
        {
          ...agent,
          a2aEndpoint: "http://127.0.0.1:8642/a2a",
          agentCardUrl: "http://127.0.0.1:8642/.well-known/agent-card.json",
          apiKey: "legacy-browser-secret",
        },
      ]),
    );

    const [loadedAgent] = loadConfiguredAgents();

    assert.equal(loadedAgent.apiKey, undefined);
  });
});

test("avatar file reader validates empty, non-image, and oversized files", async () => {
  assert.deepEqual(await readAvatarFile(), {});
  assert.deepEqual(await readAvatarFile(new File([""], "empty.png", { type: "image/png" })), {});
  assert.deepEqual(await readAvatarFile(new File(["text"], "notes.txt", { type: "text/plain" })), {
    error: "Avatar must be an image file.",
  });
  assert.deepEqual(await readAvatarFile(new File([new Uint8Array(512 * 1024 + 1)], "huge.png", { type: "image/png" })), {
    error: "Avatar image must be 512 KB or smaller.",
  });
});

test("agent setup form parsing keeps a stable setup id across test and save", () => {
  const form = new FormData();
  form.set("name", "DeepSeek");
  form.set("officeRole", "operator");
  form.set("role", "browser / planning");
  form.set("runtimeProvider", "openai");
  form.set("endpoint", "https://api.deepseek.com");
  form.set("a2aEndpoint", "https://api.deepseek.com/a2a");
  form.set("agentCardUrl", "https://api.deepseek.com/.well-known/agent-card.json");
  form.set("model", "deepseek-v4-flash");
  form.set("apiKey", "local-trusted-secret");

  const parsedAgent = createAgentFromHermesSetup(form, { id: "agent-draft-stable" });
  const saveResult = applyAgentSetupSave({
    agents: [agent],
    submittedAgent: parsedAgent,
  });

  assert.equal(parsedAgent.id, "agent-draft-stable");
  assert.equal(saveResult.mode, "created");
  assert.equal(saveResult.trustedAgent.id, "agent-draft-stable");
  assert.equal(saveResult.trustedAgent.apiKey, "local-trusted-secret");
  assert.equal(saveResult.agents[1].id, "agent-draft-stable");
  assert.equal(saveResult.agents[1].apiKey, undefined);
});

test("agent connection test persists credentials but tests with a stripped agent", async () => {
  const form = new FormData();
  form.set("name", "DeepSeek");
  form.set("officeRole", "operator");
  form.set("role", "browser / planning");
  form.set("runtimeProvider", "openai");
  form.set("endpoint", "https://api.deepseek.com/v1");
  form.set("model", "deepseek-chat");
  form.set("apiKey", "local-trusted-secret");

  let persistedAgent: AgentInstance | undefined;
  let refreshedAgentId = "";
  let testedAgent: AgentInstance | undefined;

  const result = await runAgentConnectionTest({
    form,
    agentId: "agent-connection-test",
    async persistAgent(agentToPersist) {
      persistedAgent = agentToPersist;
    },
    async onAgentPersisted(agentToRefresh) {
      refreshedAgentId = agentToRefresh.id;
    },
    createAdapter(agentToTest) {
      testedAgent = agentToTest;
      return {
        async testConnection() {
          return {
            mode: "openai-compatible",
            card: {
              name: "DeepSeek",
              description: "OpenAI-compatible provider",
              url: "https://api.deepseek.com/v1",
              version: "0.1.0",
              protocolVersion: "1.0",
              capabilities: {
                streaming: false,
                pushNotifications: false,
                stateTransitionHistory: true,
              },
              skills: [],
            },
          };
        },
      };
    },
  });

  assert.equal(result.status, "passed");
  assert.equal(result.agent.id, "agent-connection-test");
  assert.equal(result.metadata.a2aTransportBinding, "openai-compatible-http");
  assert.equal(result.message, "DeepSeek provider connection verified.");
  assert.ok(persistedAgent);
  assert.equal(persistedAgent.apiKey, "local-trusted-secret");
  assert.equal(refreshedAgentId, "agent-connection-test");
  assert.ok(testedAgent);
  assert.equal(testedAgent.apiKey, undefined);
});

test("agent setup save keeps credentials in the trusted payload and out of UI state", () => {
  const existingAgent: AgentInstance = {
    ...agent,
    apiKey: "old-secret",
    avatarUrl: "data:image/png;base64,old-avatar",
    status: "offline",
  };
  const submittedAgent: AgentInstance = {
    ...agent,
    id: "agent-new-form-id",
    name: "Lucy Updated",
    apiKey: "new-secret",
    avatarUrl: "data:image/png;base64,new-avatar",
    officeRole: "chief",
    model: "updated-model",
  };

  const result = applyAgentSetupSave({
    agents: [existingAgent, participant],
    submittedAgent,
    editingAgentId: existingAgent.id,
    metadata: { supportsTaskLifecycle: true },
  });

  assert.equal(result.mode, "updated");
  assert.equal(result.selectedAgentId, existingAgent.id);
  assert.equal(result.trustedAgent.id, existingAgent.id);
  assert.equal(result.trustedAgent.apiKey, "new-secret");
  assert.equal(result.agents[0].id, existingAgent.id);
  assert.equal(result.agents[0].name, "Lucy Updated");
  assert.equal(result.agents[0].apiKey, undefined);
  assert.equal(result.agents[0].avatarUrl, "data:image/png;base64,old-avatar");
  assert.equal(result.agents[0].status, "offline");
  assert.equal(result.agents[0].supportsTaskLifecycle, true);
});

test("agent setup save deduplicates providers and keeps one chief", () => {
  const existingAgent: AgentInstance = {
    ...participant,
    endpoint: "https://api.deepseek.com/v1/",
    model: "deepseek-chat",
    runtimeProvider: "openai",
    officeRole: "writer",
    isChief: false,
  };
  const submittedAgent: AgentInstance = {
    ...agent,
    id: "agent-form-id",
    endpoint: "https://api.deepseek.com/v1",
    model: "deepseek-chat",
    runtimeProvider: "openai",
    officeRole: "chief",
    apiKey: "secret",
  };

  const result = applyAgentSetupSave({
    agents: [agent, existingAgent],
    submittedAgent,
  });

  assert.equal(result.mode, "deduplicated");
  assert.equal(result.selectedAgentId, undefined);
  assert.equal(result.trustedAgent.id, existingAgent.id);
  assert.equal(result.trustedAgent.apiKey, "secret");
  assert.equal(result.agents[0].isChief, false);
  assert.equal(result.agents[0].officeRole, "operator");
  assert.equal(result.agents[1].id, existingAgent.id);
  assert.equal(result.agents[1].isChief, true);
  assert.equal(result.agents[1].apiKey, undefined);
});

test("agent delete state removes agents and falls back to the remaining chief", () => {
  const chief: AgentInstance = {
    ...agent,
    id: "agent-chief-delete",
    officeRole: "chief",
    isChief: true,
  };
  const operator: AgentInstance = {
    ...participant,
    id: "agent-operator-keep",
    officeRole: "operator",
    isChief: false,
  };
  const writer: AgentInstance = {
    ...participant,
    id: "agent-writer-keep",
    officeRole: "writer",
    isChief: false,
  };

  const selectedDeleted = applyAgentDelete({
    agentId: chief.id,
    agents: [chief, operator, writer],
    selectedAgentId: chief.id,
  });
  assert.deepEqual(selectedDeleted.agents.map((item) => item.id), [operator.id, writer.id]);
  assert.equal(selectedDeleted.agents[0].isChief, false);
  assert.equal(selectedDeleted.selectedAgentId, operator.id);

  const selectedKept = applyAgentDelete({
    agentId: writer.id,
    agents: [chief, operator, writer],
    selectedAgentId: operator.id,
  });
  assert.deepEqual(selectedKept.agents.map((item) => item.id), [chief.id, operator.id]);
  assert.equal(selectedKept.selectedAgentId, operator.id);
});

test("agent selection resolves selected agent with chief and first-agent fallback", () => {
  const chief: AgentInstance = {
    ...agent,
    id: "agent-chief-selected",
    isChief: true,
  };
  const operator: AgentInstance = {
    ...participant,
    id: "agent-operator-selected",
    isChief: false,
  };

  assert.equal(resolveSelectedAgent({ agents: [chief, operator], selectedAgentId: operator.id })?.id, operator.id);
  assert.equal(resolveSelectedAgent({ agents: [chief, operator], selectedAgentId: "missing-agent" })?.id, chief.id);
  assert.equal(resolveSelectedAgent({ agents: [operator], selectedAgentId: "missing-agent" })?.id, operator.id);
  assert.equal(resolveSelectedAgent({ agents: [], selectedAgentId: "missing-agent" }), undefined);
});

test("agent avatar update state changes only the target agent", () => {
  const updated = applyAgentAvatarUpdate({
    agents: [agent, participant],
    agentId: participant.id,
    avatarUrl: "data:image/png;base64,avatar",
  });

  assert.equal(updated[0].avatarUrl, agent.avatarUrl);
  assert.equal(updated[1].avatarUrl, "data:image/png;base64,avatar");
  assert.equal(
    applyAgentAvatarUpdate({
      agents: updated,
      agentId: participant.id,
      avatarUrl: undefined,
    })[1].avatarUrl,
    undefined,
  );
});

test("agent readiness state merges local trusted and static setup issues", () => {
  const minimaxAgent: AgentInstance = {
    ...agent,
    id: "agent-minimax",
    endpoint: "https://api.minimaxi.com/v1",
    model: "MiniMax-M3",
    runtimeProvider: "openai",
  };

  const issues = deriveAgentReadinessIssues({
    agents: [minimaxAgent, participant],
    localTrustedIssues: {
      "agent-minimax": ["API key is not saved in the local trusted layer."],
      [participant.id]: ["Transient local status issue."],
    },
  });

  assert.match(issues["agent-minimax"].join("\n"), /MiniMax M3 should be configured as Anthropic-compatible/);
  assert.match(issues["agent-minimax"].join("\n"), /API key is not saved/);
  assert.deepEqual(issues[participant.id], ["Transient local status issue."]);
});

test("app agent view state derives selected, readiness, participants, and responding agents", () => {
  const chiefAgent: AgentInstance = {
    ...agent,
    isChief: true,
  };
  const offlineParticipant: AgentInstance = {
    ...participant,
    id: "agent-offline",
    status: "offline",
  };
  const directConversation = conversation({
    id: "responding-direct",
    primaryAgentId: participant.id,
  });
  const taskConversation = conversation({
    id: "responding-task",
    mode: "task_room",
    chiefAgentId: chiefAgent.id,
  });
  const view = deriveAppAgentViewState({
    agents: [chiefAgent, participant, offlineParticipant],
    conversations: [directConversation, taskConversation],
    localTrustedAgentIssues: {
      [participant.id]: ["Provider is missing a key."],
    },
    messages: [
      userMessage({ id: "direct-pending", conversationId: directConversation.id, status: "sending" }),
      userMessage({ id: "task-pending", conversationId: taskConversation.id, status: "sending" }),
    ],
    selectedAgentId: "missing-agent",
    taskParticipantIds: [participant.id, offlineParticipant.id],
  });

  assert.equal(view.selectedAgent?.id, chiefAgent.id);
  assert.equal(view.chiefAgent?.id, chiefAgent.id);
  assert.deepEqual(view.availableTaskParticipants.map((item) => item.id), [participant.id]);
  assert.deepEqual(view.selectedTaskParticipants.map((item) => item.id), [participant.id]);
  assert.deepEqual(view.agentSetupIssues[participant.id], ["Provider is missing a key."]);
  assert.equal(view.respondingAgentIds.has(chiefAgent.id), true);
  assert.equal(view.respondingAgentIds.has(participant.id), true);
  assert.equal(view.respondingAgentIds.has(offlineParticipant.id), false);
});

test("agent readiness state applies status refreshes and removes deleted agents", () => {
  const currentIssues = {
    "agent-a": ["old"],
    "agent-b": ["stale"],
  };

  const merged = applyLocalTrustedAgentStatuses({
    currentIssues,
    statuses: [{ id: "agent-a", issues: ["fresh"] }],
  });
  assert.deepEqual(merged, {
    "agent-a": ["fresh"],
    "agent-b": ["stale"],
  });

  const replaced = applyLocalTrustedAgentStatuses({
    currentIssues,
    replace: true,
    statuses: [{ id: "agent-c", issues: [] }],
  });
  assert.deepEqual(replaced, { "agent-c": [] });
  assert.deepEqual(removeAgentReadinessIssues(merged, "agent-b"), { "agent-a": ["fresh"] });

  const statuses = {
    "agent-a": {
      id: "agent-a",
      runtimeProvider: "openai" as const,
      model: "model-a",
      hasCredential: true,
      registered: true,
      issues: [],
    },
    "agent-b": {
      id: "agent-b",
      runtimeProvider: "anthropic" as const,
      model: "model-b",
      hasCredential: false,
      registered: true,
      issues: ["stale"],
    },
  };
  assert.deepEqual(removeAgentReadinessStatus(statuses, "agent-b"), {
    "agent-a": statuses["agent-a"],
  });
});

test("agent readiness refresh reads safe statuses and applies UI maps", async () => {
  const requestedAgentIds: string[][] = [];
  const refresh = await readLocalTrustedAgentReadinessRefresh({
    agentIds: ["agent-a"],
    async readStatuses(agentIds) {
      requestedAgentIds.push(agentIds);
      return [
        {
          id: "agent-a",
          runtimeProvider: "openai",
          model: "deepseek-chat",
          hasCredential: true,
          registered: true,
          issues: [],
        },
      ];
    },
  });

  assert.deepEqual(requestedAgentIds, [["agent-a"]]);
  assert.deepEqual(refresh.applyIssues({ "agent-b": ["stale"] }), {
    "agent-a": [],
    "agent-b": ["stale"],
  });
  assert.deepEqual(refresh.applyStatuses({}), {
    "agent-a": {
      id: "agent-a",
      runtimeProvider: "openai",
      model: "deepseek-chat",
      hasCredential: true,
      registered: true,
      issues: [],
    },
  });
});

test("agent chief normalization preserves legacy chief fallback", () => {
  const normalized = normalizeChief([
    { ...agent, officeRole: undefined, isChief: false },
    { ...participant, officeRole: undefined, isChief: false },
  ]);

  assert.equal(normalized[0].isChief, true);
  assert.equal(normalized[1].isChief, false);
});

test("project setup save creates, validates, and updates projects", () => {
  const created = applyProjectSave({
    projects: [project],
    draft: {
      name: "",
      description: "",
      directory: "C:\\Users\\hooper\\Documents\\New Office",
    },
    createProjectId: () => "project-new-office",
  });

  assert.equal(created.kind, "created");
  if (created.kind !== "created") throw new Error("Expected created project");
  assert.equal(created.project.name, "New Office");
  assert.equal(created.project.namespace, "project.new-office");
  assert.equal(created.project.description, "Project-scoped workspace.");
  assert.equal(created.project.directory, "C:\\Users\\hooper\\Documents\\New Office");
  assert.equal(created.projects.length, 2);

  const duplicate = applyProjectSave({
    projects: created.projects,
    draft: {
      name: "Vibe Office",
      description: "",
      directory: "C:\\Users\\hooper\\Documents\\Other",
    },
    createProjectId: () => "project-other",
  });
  assert.equal(duplicate.kind, "error");

  const updated = applyProjectSave({
    projects: created.projects,
    editingProjectId: project.id,
    draft: {
      name: "Vibe Office Renamed",
      description: "Updated workspace.",
      directory: "",
    },
    createProjectId: () => "unused",
  });

  assert.equal(updated.kind, "updated");
  if (updated.kind !== "updated") throw new Error("Expected updated project");
  assert.equal(updated.project.id, project.id);
  assert.equal(updated.project.namespace, project.namespace);
  assert.equal(updated.project.directory, undefined);
  assert.equal(updated.project.description, "Updated workspace.");
});

test("project delete clears scoped records and protects free chat entry", () => {
  assert.equal(canDeleteProject([project], project.id, "default"), false);
  assert.equal(canDeleteProject([project, { ...project, id: "project-two" }], "default", "default"), false);
  assert.equal(canDeleteProject([project, { ...project, id: "project-two" }], project.id, "default"), true);

  const otherProject = { ...project, id: "project-two", namespace: "project-two", name: "Two" };
  const nextState = applyProjectDelete({
    projectId: project.id,
    state: {
      projects: [project, otherProject],
      conversations: [conversation(), conversation({ id: "conversation-two", projectId: otherProject.id })],
      messages: [userMessage(), userMessage({ id: "message-two", projectId: otherProject.id })],
      runs: [run(), run({ id: "run-two", projectId: otherProject.id })],
      tasks: [task(), task({ id: "task-two", projectId: otherProject.id })],
      artifacts: [
        {
          id: "artifact-1",
          projectId: project.id,
          taskId: "task-1",
          agentId: agent.id,
          name: "Result",
          kind: "text",
          summary: "Scoped artifact.",
          contentParts: [],
          createdAt: at,
        },
        {
          id: "artifact-two",
          projectId: otherProject.id,
          taskId: "task-two",
          agentId: agent.id,
          name: "Other",
          kind: "text",
          summary: "Other artifact.",
          contentParts: [],
          createdAt: at,
        },
      ],
    },
  });

  assert.deepEqual(nextState.projects.map((item) => item.id), [otherProject.id]);
  assert.deepEqual(nextState.conversations.map((item) => item.projectId), [otherProject.id]);
  assert.deepEqual(nextState.messages.map((item) => item.projectId), [otherProject.id]);
  assert.deepEqual(nextState.runs.map((item) => item.projectId), [otherProject.id]);
  assert.deepEqual(nextState.tasks.map((item) => item.projectId), [otherProject.id]);
  assert.deepEqual(nextState.artifacts.map((item) => item.projectId), [otherProject.id]);
});

test("project delete selection returns to free chat only when the selected project is deleted", () => {
  const currentSelection = {
    selectedProjectId: project.id,
    chatScope: "project" as const,
    conversationMode: "task-room" as const,
  };

  assert.deepEqual(
    applyProjectDeleteSelection({
      deletedProjectId: project.id,
      freeChatEntryProjectId: "default",
      selection: currentSelection,
    }),
    {
      selectedProjectId: "default",
      chatScope: "free",
      conversationMode: "single",
    },
  );
  assert.deepEqual(
    applyProjectDeleteSelection({
      deletedProjectId: "project-two",
      freeChatEntryProjectId: "default",
      selection: currentSelection,
    }),
    currentSelection,
  );
});

test("project selection recovery returns missing projects and invalid free chat modes to free chat", () => {
  const projectSelection = {
    selectedProjectId: project.id,
    chatScope: "project" as const,
    conversationMode: "task-room" as const,
  };

  assert.deepEqual(
    applyMissingProjectSelection({
      projects: [project],
      freeChatEntryProjectId: freeChatProjectId,
      selection: projectSelection,
    }),
    projectSelection,
  );
  assert.deepEqual(
    applyMissingProjectSelection({
      projects: [],
      freeChatEntryProjectId: freeChatProjectId,
      selection: projectSelection,
    }),
    {
      selectedProjectId: freeChatProjectId,
      chatScope: "free",
      conversationMode: "single",
    },
  );
  assert.deepEqual(
    normalizeConversationModeForScope({
      selectedProjectId: freeChatProjectId,
      chatScope: "free",
      conversationMode: "task-room",
    }),
    {
      selectedProjectId: freeChatProjectId,
      chatScope: "free",
      conversationMode: "single",
    },
  );
});

test("workspace selection scopes project work and keeps free chat empty", () => {
  const otherProject = { ...project, id: "project-two", namespace: "project-two", name: "Two" };
  const selectedTask = task();
  const selectedRun = run();
  const selectedArtifact = artifact();
  const freeSelection = deriveWorkspaceSelection({
    projects: [project, otherProject],
    selectedProjectId: freeChatProjectId,
    freeChatEntryProjectId: freeChatProjectId,
    tasks: [selectedTask],
    runs: [selectedRun],
    artifacts: [selectedArtifact],
  });

  assert.equal(freeSelection.selectedWorkspaceProject, undefined);
  assert.deepEqual(freeSelection.scopedTasks, []);
  assert.deepEqual(freeSelection.scopedRuns, []);
  assert.deepEqual(freeSelection.scopedArtifacts, []);

  const workspaceSelection = deriveWorkspaceSelection({
    projects: [project, otherProject],
    selectedProjectId: project.id,
    freeChatEntryProjectId: freeChatProjectId,
    tasks: [selectedTask, task({ id: "task-two", projectId: otherProject.id })],
    runs: [selectedRun, run({ id: "run-two", projectId: otherProject.id, taskId: "task-two" })],
    artifacts: [selectedArtifact, artifact({ id: "artifact-two", projectId: otherProject.id })],
  });

  assert.equal(workspaceSelection.selectedWorkspaceProject?.id, project.id);
  assert.deepEqual(workspaceSelection.scopedTasks.map((item) => item.id), ["task-1"]);
  assert.deepEqual(workspaceSelection.scopedRuns.map((item) => item.id), ["run-1"]);
  assert.equal(workspaceSelection.latestChiefTask?.id, "task-1");
  assert.deepEqual(workspaceSelection.scopedArtifacts.map((item) => item.id), ["artifact-1"]);
});

test("project dialog state opens, resets errors, and protects free chat entry", () => {
  const initial = createProjectDialogViewState();
  const creating = openCreateProjectDialogState(setProjectFormErrorState(initial, "Old error"));
  assert.equal(creating.showProjectDialog, true);
  assert.equal(creating.editingProjectId, null);
  assert.equal(creating.projectFormError, "");

  const editing = openEditProjectDialogState({
    freeChatEntryProjectId: "default",
    projectId: "project-vibe",
    state: creating,
  });
  assert.equal(editing.showProjectDialog, true);
  assert.equal(editing.editingProjectId, "project-vibe");

  const protectedFreeChat = openEditProjectDialogState({
    freeChatEntryProjectId: "default",
    projectId: "default",
    state: editing,
  });
  assert.equal(protectedFreeChat, editing);

  const closed = closeProjectDialogState(setProjectFormErrorState(editing, "Required."));
  assert.equal(closed.showProjectDialog, false);
  assert.equal(closed.editingProjectId, null);
  assert.equal(closed.projectFormError, "");
});

test("project dialog state prepares confirm actions for deletable items", () => {
  const initial = createProjectDialogViewState();
  const protectedProject = requestDeleteProjectConfirmState({
    freeChatEntryProjectId: "default",
    projectId: "default",
    projects: [project],
    state: initial,
  });
  assert.equal(protectedProject.confirmAction, null);

  const deletableProject = requestDeleteProjectConfirmState({
    freeChatEntryProjectId: "default",
    projectId: project.id,
    projects: [project, { ...project, id: "default" }],
    state: initial,
  });
  assert.deepEqual(deletableProject.confirmAction, { kind: "delete-project", projectId: project.id });

  const agentConfirm = requestDeleteAgentConfirmState(deletableProject, agent.id);
  assert.deepEqual(agentConfirm.confirmAction, { kind: "delete-agent", agentId: agent.id });
  assert.equal(clearConfirmActionState(agentConfirm).confirmAction, null);
});

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
  assert.equal(history[0].title, JSON.stringify({ title: "newer" }, null, 2));
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
      { agentId: agent.id, previewCount: 1 },
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

test("local trusted registry preserves credentials when metadata is rewritten without keys", async () => {
  const localTrustedHome = await mkdtemp(path.join(os.tmpdir(), "vibe-office-local-trusted-"));
  const previousHome = process.env.VIBE_OFFICE_LOCAL_TRUSTED_HOME;
  process.env.VIBE_OFFICE_LOCAL_TRUSTED_HOME = localTrustedHome;

  try {
    const { readLocalTrustedAgentRegistry, writeLocalTrustedAgentRegistry } = await import("../../localTrusted/agentRegistry");

    await writeLocalTrustedAgentRegistry({
      "agent-secret": {
        ...agent,
        id: "agent-secret",
        name: "Secret Agent",
        a2aEndpoint: "http://127.0.0.1:8642/a2a",
        agentCardUrl: "http://127.0.0.1:8642/.well-known/agent-card.json",
        runtimeProvider: "hermes",
        apiKey: "local-trusted-secret",
      },
      "agent-delete": {
        ...participant,
        id: "agent-delete",
        name: "Delete Agent",
        a2aEndpoint: "http://127.0.0.1:8643/a2a",
        agentCardUrl: "http://127.0.0.1:8643/.well-known/agent-card.json",
        runtimeProvider: "hermes",
        apiKey: "delete-secret",
      },
    });

    await writeLocalTrustedAgentRegistry({
      "agent-secret": {
        ...agent,
        id: "agent-secret",
        name: "Secret Agent",
        a2aEndpoint: "http://127.0.0.1:8642/a2a",
        agentCardUrl: "http://127.0.0.1:8642/.well-known/agent-card.json",
        runtimeProvider: "hermes",
      },
    });

    const registryRaw = await readFile(path.join(localTrustedHome, "agent-registry.local.json"), "utf8");
    const credentialRaw = await readFile(path.join(localTrustedHome, "agent-credentials.local.json"), "utf8");
    const credentials = JSON.parse(credentialRaw);
    const hydrated = await readLocalTrustedAgentRegistry();
    const hydratedAgent = hydrated["agent-secret"];

    assert.equal(registryRaw.includes("local-trusted-secret"), false);
    assert.equal(JSON.parse(registryRaw)["agent-secret"].apiKey, undefined);
    assert.equal(credentials["agent-secret"].apiKey, "local-trusted-secret");
    assert.equal(credentials["agent-delete"], undefined);
    assert.ok(hydratedAgent);
    assert.equal(hydratedAgent.apiKey, "local-trusted-secret");
  } finally {
    if (previousHome === undefined) {
      delete process.env.VIBE_OFFICE_LOCAL_TRUSTED_HOME;
    } else {
      process.env.VIBE_OFFICE_LOCAL_TRUSTED_HOME = previousHome;
    }
    await rm(localTrustedHome, { recursive: true, force: true });
  }
});

test("local trusted registry update sync keeps saved credentials while refreshing provider metadata", async () => {
  const localTrustedHome = await mkdtemp(path.join(os.tmpdir(), "vibe-office-local-trusted-"));
  const previousHome = process.env.VIBE_OFFICE_LOCAL_TRUSTED_HOME;
  process.env.VIBE_OFFICE_LOCAL_TRUSTED_HOME = localTrustedHome;

  try {
    const {
      readLocalTrustedAgentRegistry,
      updateLocalTrustedAgentRegistry,
      writeLocalTrustedAgentRegistry,
    } = await import("../../localTrusted/agentRegistry");

    await writeLocalTrustedAgentRegistry({
      "agent-provider-sync": {
        ...agent,
        id: "agent-provider-sync",
        name: "Provider Sync",
        endpoint: "https://api.example.com/v1",
        a2aEndpoint: "https://api.example.com/a2a",
        agentCardUrl: "https://api.example.com/.well-known/agent-card.json",
        model: "old-model",
        runtimeProvider: "openai",
        apiKey: "saved-provider-key",
      },
    });

    await updateLocalTrustedAgentRegistry((registry) => ({
      ...registry,
      "agent-provider-sync": {
        ...registry["agent-provider-sync"],
        endpoint: "https://api.example.com/v1",
        a2aEndpoint: "https://api.example.com/a2a",
        agentCardUrl: "https://api.example.com/.well-known/agent-card.json",
        model: "new-model",
        runtimeProvider: "anthropic",
        apiKey: undefined,
      },
    }));

    const registryRaw = await readFile(path.join(localTrustedHome, "agent-registry.local.json"), "utf8");
    const credentialRaw = await readFile(path.join(localTrustedHome, "agent-credentials.local.json"), "utf8");
    const hydrated = await readLocalTrustedAgentRegistry();

    assert.equal(registryRaw.includes("saved-provider-key"), false);
    assert.equal(JSON.parse(credentialRaw)["agent-provider-sync"].apiKey, "saved-provider-key");
    assert.equal(hydrated["agent-provider-sync"].apiKey, "saved-provider-key");
    assert.equal(hydrated["agent-provider-sync"].model, "new-model");
    assert.equal(hydrated["agent-provider-sync"].runtimeProvider, "anthropic");
  } finally {
    if (previousHome === undefined) {
      delete process.env.VIBE_OFFICE_LOCAL_TRUSTED_HOME;
    } else {
      process.env.VIBE_OFFICE_LOCAL_TRUSTED_HOME = previousHome;
    }
    await rm(localTrustedHome, { recursive: true, force: true });
  }
});

test("local trusted credential files use private atomic write helpers", async () => {
  const credentialStore = await readFile(path.join(process.cwd(), "localTrusted", "credentialStore.ts"), "utf8");
  const agentRegistry = await readFile(path.join(process.cwd(), "localTrusted", "agentRegistry.ts"), "utf8");
  const credentialUpdater = await readFile(path.join(process.cwd(), "scripts", "update-local-agent-credential.mjs"), "utf8");

  assert.match(credentialStore, /LOCAL_TRUSTED_DIRECTORY_MODE = 0o700/);
  assert.match(credentialStore, /LOCAL_TRUSTED_PRIVATE_FILE_MODE = 0o600/);
  assert.match(credentialStore, /writeLocalTrustedPrivateJsonFile/);
  assert.match(credentialStore, /fs\.chmod/);
  assert.match(agentRegistry, /writeLocalTrustedPrivateJsonFile\(registryPath/);
  assert.match(credentialUpdater, /localTrustedDirectoryMode = 0o700/);
  assert.match(credentialUpdater, /localTrustedPrivateFileMode = 0o600/);
  assert.match(credentialUpdater, /fs\.chmod/);
  assert.match(credentialStore, /cleanupStaleLocalTrustedTempFiles/);
});

test("local trusted temp cleanup removes only stale atomic-write leftovers", async () => {
  const { cleanupStaleLocalTrustedTempFiles } = await import("../../localTrusted/credentialStore");
  const localTrustedHome = await mkdtemp(path.join(os.tmpdir(), "vibe-office-temp-cleanup-"));
  const nowMs = Date.parse("2026-06-19T00:00:00.000Z");
  const oldTemp = path.join(localTrustedHome, "agent-credentials.local.1.1.old.tmp");
  const freshTemp = path.join(localTrustedHome, "agent-credentials.local.1.1.fresh.tmp");
  const unrelatedTemp = path.join(localTrustedHome, "agent-registry.local.1.1.old.tmp");
  const realCredentialFile = path.join(localTrustedHome, "agent-credentials.local.json");

  try {
    await writeFile(oldTemp, "old", "utf8");
    await writeFile(freshTemp, "fresh", "utf8");
    await writeFile(unrelatedTemp, "other", "utf8");
    await writeFile(realCredentialFile, "{}", "utf8");
    await utimes(oldTemp, new Date(nowMs - 120_000), new Date(nowMs - 120_000));
    await utimes(freshTemp, new Date(nowMs - 10_000), new Date(nowMs - 10_000));
    await utimes(unrelatedTemp, new Date(nowMs - 120_000), new Date(nowMs - 120_000));

    await cleanupStaleLocalTrustedTempFiles(localTrustedHome, "agent-credentials.local", {
      maxAgeMs: 60_000,
      nowMs,
    });

    const remaining = await readdir(localTrustedHome);
    assert.equal(remaining.includes(path.basename(oldTemp)), false);
    assert.equal(remaining.includes(path.basename(freshTemp)), true);
    assert.equal(remaining.includes(path.basename(unrelatedTemp)), true);
    assert.equal(remaining.includes(path.basename(realCredentialFile)), true);
  } finally {
    await rm(localTrustedHome, { recursive: true, force: true });
  }
});

test("local trusted registry exposes safe agent status without credentials", async () => {
  const localTrustedHome = await mkdtemp(path.join(os.tmpdir(), "vibe-office-local-trusted-"));
  const previousHome = process.env.VIBE_OFFICE_LOCAL_TRUSTED_HOME;
  process.env.VIBE_OFFICE_LOCAL_TRUSTED_HOME = localTrustedHome;

  try {
    const { getLocalTrustedAgentSafeStatuses, writeLocalTrustedAgentRegistry } = await import("../../localTrusted/agentRegistry");

    await writeLocalTrustedAgentRegistry({
      "agent-deepseek": {
        ...agent,
        id: "agent-deepseek",
        endpoint: "https://api.deepseek.com",
        a2aEndpoint: "https://api.deepseek.com/a2a",
        agentCardUrl: "https://api.deepseek.com/.well-known/agent-card.json",
        model: "deepseek-v4-flash",
        runtimeProvider: "openai",
      },
      "agent-minimax": {
        ...participant,
        id: "agent-minimax",
        endpoint: "https://api.minimaxi.com/v1",
        a2aEndpoint: "https://api.minimaxi.com/a2a",
        agentCardUrl: "https://api.minimaxi.com/.well-known/agent-card.json",
        model: "MiniMax-M3",
        runtimeProvider: "openai",
        apiKey: "local-trusted-secret",
      },
      "agent-hermes": {
        ...agent,
        id: "agent-hermes",
        endpoint: "https://hooper.ink/v1",
        a2aEndpoint: "https://hooper.ink/a2a",
        agentCardUrl: "https://hooper.ink/.well-known/agent-card.json",
        model: "hermes-agent",
        runtimeProvider: "hermes",
      },
    });

    const statuses = await getLocalTrustedAgentSafeStatuses();
    const deepseekStatus = statuses.find((status) => status.id === "agent-deepseek");
    const minimaxStatus = statuses.find((status) => status.id === "agent-minimax");
    const hermesStatus = statuses.find((status) => status.id === "agent-hermes");

    assert.ok(deepseekStatus);
    assert.ok(minimaxStatus);
    assert.ok(hermesStatus);
    assert.equal("apiKey" in deepseekStatus, false);
    assert.equal("apiKey" in minimaxStatus, false);
    assert.equal(deepseekStatus.registered, true);
    assert.equal(deepseekStatus.hasCredential, false);
    assert.match(deepseekStatus.issues.join("\n"), /API key is not saved/);
    assert.equal(minimaxStatus.registered, true);
    assert.equal(minimaxStatus.hasCredential, true);
    assert.match(minimaxStatus.issues.join("\n"), /MiniMax M3 should be configured as Anthropic-compatible/);
    assert.equal(hermesStatus.registered, true);
    assert.equal(hermesStatus.hasCredential, false);
    assert.deepEqual(hermesStatus.issues, []);

    const [missingStatus] = await getLocalTrustedAgentSafeStatuses(["agent-missing"]);
    assert.equal(missingStatus.registered, false);
    assert.equal(missingStatus.hasCredential, false);
    assert.match(missingStatus.issues.join("\n"), /not registered/);
  } finally {
    if (previousHome === undefined) {
      delete process.env.VIBE_OFFICE_LOCAL_TRUSTED_HOME;
    } else {
      process.env.VIBE_OFFICE_LOCAL_TRUSTED_HOME = previousHome;
    }
    await rm(localTrustedHome, { recursive: true, force: true });
  }
});

test("local trusted agent registry commands upsert, report status, and delete safely", async () => {
  const localTrustedHome = await mkdtemp(path.join(os.tmpdir(), "vibe-office-local-trusted-"));
  const previousHome = process.env.VIBE_OFFICE_LOCAL_TRUSTED_HOME;
  process.env.VIBE_OFFICE_LOCAL_TRUSTED_HOME = localTrustedHome;

  try {
    const { executeAgentRegistryCommand } = await import("../../localTrusted/agentRegistryCommands");

    const upsert = await executeAgentRegistryCommand({
      command: "agent.upsert",
      payload: {
        agent: {
          ...agent,
          id: "agent-registry-command",
          endpoint: "https://api.deepseek.com/v1",
          a2aEndpoint: "https://api.deepseek.com/a2a",
          agentCardUrl: "https://api.deepseek.com/.well-known/agent-card.json",
          model: "deepseek-chat",
          runtimeProvider: "openai",
          apiKey: "local-command-secret",
        },
      },
    });
    const status = await executeAgentRegistryCommand({
      command: "agent.status",
      payload: { agentIds: ["agent-registry-command"] },
    });
    const registryRaw = await readFile(path.join(localTrustedHome, "agent-registry.local.json"), "utf8");
    const credentialRaw = await readFile(path.join(localTrustedHome, "agent-credentials.local.json"), "utf8");

    assert.deepEqual(upsert, { status: 200, body: { ok: true } });
    assert.equal(registryRaw.includes("local-command-secret"), false);
    assert.equal(JSON.parse(credentialRaw)["agent-registry-command"].apiKey, "local-command-secret");
    assert.equal(
      ((status.body as { statuses: Array<{ id: string; hasCredential: boolean }> }).statuses[0]?.hasCredential),
      true,
    );

    const deleted = await executeAgentRegistryCommand({
      command: "agent.delete",
      payload: { agentId: "agent-registry-command" },
    });
    const missing = await executeAgentRegistryCommand({
      command: "agent.status",
      payload: { agentIds: ["agent-registry-command"] },
    });

    assert.deepEqual(deleted, { status: 200, body: { ok: true } });
    assert.equal(
      ((missing.body as { statuses: Array<{ registered: boolean }> }).statuses[0]?.registered),
      false,
    );
  } finally {
    if (previousHome === undefined) {
      delete process.env.VIBE_OFFICE_LOCAL_TRUSTED_HOME;
    } else {
      process.env.VIBE_OFFICE_LOCAL_TRUSTED_HOME = previousHome;
    }
    await rm(localTrustedHome, { recursive: true, force: true });
  }
});

test("local trusted credential assertion rejects provider agents without saved keys", async () => {
  const previousWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  const previousFetch = globalThis.fetch;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {},
  });
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        statuses: [
          {
            id: "agent-missing-key",
            runtimeProvider: "openai",
            model: "deepseek-chat",
            hasCredential: false,
            registered: true,
            issues: ["API key is not saved in the local trusted layer."],
          },
        ],
      }),
      {
        headers: { "Content-Type": "application/json" },
        status: 200,
      },
    );

  try {
    const { assertLocalTrustedAgentCredential } = await import("../services/localTrustedAgentRegistry");

    await assert.rejects(
      assertLocalTrustedAgentCredential({
        ...agent,
        id: "agent-missing-key",
        endpoint: "https://api.deepseek.com",
        a2aEndpoint: "https://api.deepseek.com/a2a",
        agentCardUrl: "https://api.deepseek.com/.well-known/agent-card.json",
        model: "deepseek-chat",
        runtimeProvider: "openai",
      }),
      /API key is missing in the local trusted layer/,
    );
  } finally {
    globalThis.fetch = previousFetch;
    if (previousWindowDescriptor) {
      Object.defineProperty(globalThis, "window", previousWindowDescriptor);
    } else {
      Reflect.deleteProperty(globalThis, "window");
    }
  }
});

test("local trusted provider commands stop missing provider keys before forwarding", async () => {
  const localTrustedHome = await mkdtemp(path.join(os.tmpdir(), "vibe-office-local-trusted-"));
  const previousHome = process.env.VIBE_OFFICE_LOCAL_TRUSTED_HOME;
  process.env.VIBE_OFFICE_LOCAL_TRUSTED_HOME = localTrustedHome;

  try {
    const { writeLocalTrustedAgentRegistry } = await import("../../localTrusted/agentRegistry");
    const { getVerifiedProviderCommandRequest } = await import("../../localTrusted/providerRequests");

    await writeLocalTrustedAgentRegistry({
      "agent-openai-missing-key": {
        ...agent,
        id: "agent-openai-missing-key",
        endpoint: "https://api.deepseek.com/v1",
        a2aEndpoint: "https://api.deepseek.com/a2a",
        agentCardUrl: "https://api.deepseek.com/.well-known/agent-card.json",
        model: "deepseek-chat",
        runtimeProvider: "openai",
      },
      "agent-anthropic-missing-key": {
        ...participant,
        id: "agent-anthropic-missing-key",
        endpoint: "https://api.minimaxi.com/anthropic",
        a2aEndpoint: "https://api.minimaxi.com/a2a",
        agentCardUrl: "https://api.minimaxi.com/.well-known/agent-card.json",
        model: "MiniMax-M3",
        runtimeProvider: "anthropic",
      },
    });

    await assert.rejects(
      getVerifiedProviderCommandRequest({
        agentId: "agent-openai-missing-key",
        command: "openai.chatCompletions",
        payload: {
          messages: [{ role: "user", content: "hi" }],
        },
      }),
      /OpenAI-compatible API key is missing in the local trusted layer/,
    );
    await assert.rejects(
      getVerifiedProviderCommandRequest({
        agentId: "agent-anthropic-missing-key",
        command: "anthropic.messages",
        payload: {
          messages: [{ role: "user", content: "hi" }],
        },
      }),
      /Anthropic-compatible API key is missing in the local trusted layer/,
    );

    assert.equal(
      getUserFacingAgentError(
        new Error("OpenAI-compatible chat failed: 400: OpenAI-compatible API key is missing in the local trusted layer."),
      ),
      "Agent API key is missing. Open this agent's settings, save the API key again, then retry.",
    );
  } finally {
    if (previousHome === undefined) {
      delete process.env.VIBE_OFFICE_LOCAL_TRUSTED_HOME;
    } else {
      process.env.VIBE_OFFICE_LOCAL_TRUSTED_HOME = previousHome;
    }
    await rm(localTrustedHome, { recursive: true, force: true });
  }
});

test("agent readiness status map preserves safe local trusted diagnostics", () => {
  const status = {
    id: "agent-deepseek",
    runtimeProvider: "openai" as const,
    model: "deepseek-v4-flash",
    hasCredential: false,
    registered: true,
    issues: ["API key is not saved in the local trusted layer."],
  };

  const replaced = applyLocalTrustedAgentStatusMap({
    currentStatuses: {
      stale: {
        id: "stale",
        runtimeProvider: "hermes",
        model: "old",
        hasCredential: false,
        registered: false,
        issues: ["stale"],
      },
    },
    replace: true,
    statuses: [status],
  });
  assert.deepEqual(Object.keys(replaced), ["agent-deepseek"]);
  assert.equal(replaced["agent-deepseek"].hasCredential, false);
  assert.equal(replaced["agent-deepseek"].registered, true);
});

test("local trusted agent registry client sends command-shaped requests", () => {
  const request = createLocalTrustedAgentRegistryCommandRequest({
    command: "agent.status",
    payload: {
      agentIds: ["agent-deepseek"],
    },
  });

  assert.equal(request.method, "POST");
  assert.equal(JSON.parse(String(request.body)).command, "agent.status");
  assert.deepEqual(JSON.parse(String(request.body)).payload, { agentIds: ["agent-deepseek"] });
});

test("workspace file client sends command-shaped local trusted requests", () => {
  const request = createLocalTrustedWorkspaceCommandRequest({
    command: "workspace.read",
    payload: {
      root: "C:/workspace/project",
      path: "src/App.tsx",
    },
  });
  const body = JSON.parse(String(request.body));

  assert.equal(request.method, "POST");
  assert.equal(body.command, "workspace.read");
  assert.deepEqual(body.payload, {
    root: "C:/workspace/project",
    path: "src/App.tsx",
  });
});

test("workspace file client preserves local trusted error details", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ error: { message: "Workspace file context could not be restored." } }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })) as typeof fetch;

  try {
    await assert.rejects(
      () => readWorkspaceFile("C:/workspace/project", "src/App.tsx"),
      /Workspace file context could not be restored/,
    );
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("workspace attachment state deduplicates, caps, and detaches files", () => {
  const makeFile = (name: string): WorkspaceFileReadResult => ({
    path: `docs/${name}.md`,
    content: name,
    size: name.length,
    updatedAt: at,
    truncated: false,
  });
  let attachments = ["one", "two", "three"].reduce<WorkspaceFileAttachment[]>(
    (current, name) =>
      attachWorkspaceFileState({
        attachments: current,
        file: makeFile(name),
        attachedAt: `${at}-${name}`,
        limit: 3,
      }),
    [],
  );

  assert.deepEqual(attachments.map((item) => item.path), ["docs/one.md", "docs/two.md", "docs/three.md"]);
  assert.equal(
    attachWorkspaceFileState({
      attachments,
      file: makeFile("two"),
      attachedAt: `${at}-duplicate`,
      limit: 3,
    }),
    attachments,
  );

  attachments = attachWorkspaceFileState({
    attachments,
    file: makeFile("four"),
    attachedAt: `${at}-four`,
    limit: 3,
  });

  assert.deepEqual(attachments.map((item) => item.path), ["docs/two.md", "docs/three.md", "docs/four.md"]);
  assert.deepEqual(
    detachWorkspaceFileState({ attachments, path: "docs/three.md" }).map((item) => item.path),
    ["docs/two.md", "docs/four.md"],
  );
});

test("local trusted workspace commands list, read, search, and reject path escape", async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "vibe-office-workspace-command-"));
  await mkdir(path.join(workspaceRoot, "docs"));
  await writeFile(path.join(workspaceRoot, "docs", "README.md"), "hello workspace needle\nsecond line", "utf8");

  try {
    const { executeWorkspaceCommand } = await import("../../localTrusted/workspaceFiles");

    const listed = await executeWorkspaceCommand({
      command: "workspace.list",
      payload: {
        root: workspaceRoot,
        path: "",
      },
    });
    assert.equal(listed.status, 200);
    assert.equal((listed.body as { entries: Array<{ name: string }> }).entries[0]?.name, "docs");

    const read = await executeWorkspaceCommand({
      command: "workspace.read",
      payload: {
        root: workspaceRoot,
        path: "docs/README.md",
      },
    });
    assert.equal(read.status, 200);
    assert.equal((read.body as { content: string }).content.includes("needle"), true);

    const searched = await executeWorkspaceCommand({
      command: "workspace.search",
      payload: {
        root: workspaceRoot,
        query: "needle",
      },
    });
    assert.equal(searched.status, 200);
    assert.equal((searched.body as { matches: Array<{ path: string; lineNumber: number }> }).matches[0]?.path, "docs/README.md");

    await assert.rejects(
      executeWorkspaceCommand({
        command: "workspace.read",
        payload: {
          root: workspaceRoot,
          path: "../outside.md",
        },
      }),
      /limited to the selected project directory/,
    );
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test("local trusted middleware exposes command-only provider and workspace routes", async () => {
  const source = await readFile(path.join(process.cwd(), "localTrusted", "vitePlugin.ts"), "utf8");

  assert.match(source, /agent-local\/command/);
  assert.match(source, /agent-local\/registry-command/);
  assert.doesNotMatch(source, /agent-local\/agents\/upsert/);
  assert.doesNotMatch(source, /agent-local\/agents\/delete/);
  assert.doesNotMatch(source, /agent-local\/agents\/status/);
  assert.doesNotMatch(source, /agent-local\/request/);
  assert.match(source, /workspace-local\/command/);
  assert.match(source, /sendSafeError/);
  assert.doesNotMatch(source, /error:\s*getSafeErrorMessage/);
  assert.doesNotMatch(source, /workspace-local\/list/);
  assert.doesNotMatch(source, /workspace-local\/read/);
  assert.doesNotMatch(source, /workspace-local\/search/);
});

test("local trusted safe error messages redact secrets before returning to the UI", async () => {
  const { getSafeErrorMessage, redactSensitiveText } = await import("../../localTrusted/http");
  const raw =
    'Authorization: Bearer secret-token api_key=query-secret x-api-key: header-secret {"apiKey":"json-secret"} https://user:pass@example.com/path?token=url-secret';
  const redacted = redactSensitiveText(raw);

  assert.equal(redacted.includes("secret-token"), false);
  assert.equal(redacted.includes("query-secret"), false);
  assert.equal(redacted.includes("header-secret"), false);
  assert.equal(redacted.includes("json-secret"), false);
  assert.equal(redacted.includes("user:pass"), false);
  assert.equal(redacted.includes("url-secret"), false);
  assert.match(redacted, /Authorization: Bearer \[redacted\]/i);
  assert.match(getSafeErrorMessage(new Error(raw)), /\[redacted\]/);
});

test("local trusted provider forwarding redacts failed provider response bodies only", async () => {
  const { forwardProviderRequest } = await import("../../localTrusted/http");
  const originalFetch = globalThis.fetch;
  const forwardedBodies: string[] = [];
  const response = {
    statusCode: 0,
    setHeader() {},
    end(body: string) {
      forwardedBodies.push(body);
    },
  };

  try {
    globalThis.fetch = async () =>
      new Response('{"error":"Authorization: Bearer failed-secret api_key=failed-key"}', {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    await forwardProviderRequest(response, {
      body: "{}",
      headers: {},
      method: "POST",
      url: "https://provider.example/v1/chat/completions",
    });

    globalThis.fetch = async () =>
      new Response('{"content":"Bearer success-token should remain in successful model output"}', {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    await forwardProviderRequest(response, {
      body: "{}",
      headers: {},
      method: "POST",
      url: "https://provider.example/v1/chat/completions",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(forwardedBodies[0].includes("failed-secret"), false);
  assert.equal(forwardedBodies[0].includes("failed-key"), false);
  assert.match(forwardedBodies[0], /\[redacted\]/);
  assert.equal(forwardedBodies[1].includes("success-token"), true);
});

test("output workspace keeps browser preview and project outputs in focused components", async () => {
  const outputWorkspace = await readFile(path.join(process.cwd(), "src", "components", "OutputWorkspace.tsx"), "utf8");
  const browserPreview = await readFile(path.join(process.cwd(), "src", "components", "BrowserPreview.tsx"), "utf8");
  const projectOutputs = await readFile(path.join(process.cwd(), "src", "components", "ProjectOutputs.tsx"), "utf8");
  const projectOutputPrimitives = await readFile(path.join(process.cwd(), "src", "components", "ProjectOutputPrimitives.tsx"), "utf8");
  const projectTasks = await readFile(path.join(process.cwd(), "src", "components", "ProjectTasks.tsx"), "utf8");
  const projectArtifacts = await readFile(path.join(process.cwd(), "src", "components", "ProjectArtifacts.tsx"), "utf8");
  const projectArtifactViewer = await readFile(path.join(process.cwd(), "src", "components", "ProjectArtifactViewer.tsx"), "utf8");
  const projectArtifactContent = await readFile(path.join(process.cwd(), "src", "services", "projectArtifactContent.ts"), "utf8");

  assert.match(outputWorkspace, /export \{ BrowserPreview \} from "\.\/BrowserPreview"/);
  assert.match(outputWorkspace, /export \{ ProjectOutputs \} from "\.\/ProjectOutputs"/);
  assert.doesNotMatch(outputWorkspace, /function BrowserPreview|function ProjectOutputs/);
  assert.match(browserPreview, /export function BrowserPreview/);
  assert.match(projectOutputs, /export function ProjectOutputs/);
  assert.match(projectOutputs, /getOutputAgentGroups/);
  assert.match(projectOutputs, /assignPreviewToOutputGroups/);
  assert.match(projectOutputs, /ProjectOutputPrimitives/);
  assert.doesNotMatch(projectOutputs, /function OutputTypeButton|function PreviewOutputSection/);
  assert.match(projectOutputPrimitives, /export function OutputTypeButton/);
  assert.match(projectOutputPrimitives, /export function PreviewOutputSection/);
  assert.match(projectTasks, /getTrackableTaskOutputItems/);
  assert.doesNotMatch(projectTasks, /getVisibleOutputRuns|getStandaloneOutputTasks/);
  assert.match(projectArtifacts, /ProjectArtifactBrowser/);
  assert.match(projectArtifacts, /ProjectArtifactDetail/);
  assert.match(projectArtifacts, /projectArtifactContent/);
  assert.doesNotMatch(projectArtifacts, /function ArtifactPreview|function getArtifactCopyText/);
  assert.match(projectArtifactViewer, /export function ProjectArtifactBrowser/);
  assert.match(projectArtifactViewer, /export function ProjectArtifactDetail/);
  assert.match(projectArtifactContent, /export function getArtifactCopyText/);
  assert.match(projectArtifactContent, /export function getOpenableArtifactUrl/);
});

test("app shell delegates main workspace rendering to a focused component", async () => {
  const app = await readFile(path.join(process.cwd(), "src", "App.tsx"), "utf8");
  const mainWorkspace = await readFile(path.join(process.cwd(), "src", "components", "MainWorkspace.tsx"), "utf8");

  assert.match(app, /MainWorkspace/);
  assert.doesNotMatch(app, /<ConversationWorkspace/);
  assert.doesNotMatch(app, /<OutputPanel/);
  assert.doesNotMatch(app, /className="main-split"/);
  assert.match(mainWorkspace, /export function MainWorkspace/);
  assert.match(mainWorkspace, /<ConversationWorkspace/);
  assert.match(mainWorkspace, /<OutputPanel/);
  assert.match(mainWorkspace, /className="main-split"/);
});

test("M9 provider regression script keeps Chinese context probes readable", async () => {
  const source = await readFile(path.join(process.cwd(), "scripts", "run-provider-regression.mjs"), "utf8");

  assert.match(source, /用一句中文回复：M9 free chat ok/);
  assert.match(source, /用一句中文说明你正在进行 Vibe Office M9 project regression。/);
  assert.match(source, /请记住暗号：海盐柠檬。只回复：记住了。/);
  assert.match(source, /刚才暗号是什么？请只回答暗号。/);
  assert.doesNotMatch(source, /鐢|璇|娴|鏌|銆\?/);
});

test("M9 provider regression uses command-shaped local trusted registry requests", async () => {
  const source = await readFile(path.join(process.cwd(), "scripts", "run-provider-regression.mjs"), "utf8");

  assert.match(source, /agent-local\/registry-command/);
  assert.match(source, /command:\s*"agent\.upsert"/);
  assert.match(source, /command:\s*"agent\.delete"/);
  assert.doesNotMatch(source, /agent-local\/agents\/upsert/);
  assert.doesNotMatch(source, /agent-local\/agents\/delete/);
});

test("browser smoke cleanup uses command-shaped local trusted registry requests", async () => {
  const source = await readFile(path.join(process.cwd(), "scripts", "run-browser-smoke.mjs"), "utf8");

  assert.match(source, /agent-local\/registry-command/);
  assert.match(source, /command:\s*"agent\.delete"/);
  assert.doesNotMatch(source, /agent-local\/agents\/delete/);
});

test("M9 provider regression fails selected targets that are not ready", async () => {
  const localTrustedHome = await mkdtemp(path.join(os.tmpdir(), "vibe-office-m9-regression-"));
  try {
    const missing = spawnSync(process.execPath, ["scripts/run-provider-regression.mjs", "--target", "deepseek"], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        VIBE_OFFICE_LOCAL_TRUSTED_HOME: localTrustedHome,
      },
    });
    assert.equal(missing.status, 1);
    assert.match(`${missing.stdout}\n${missing.stderr}`, /DeepSeek OpenAI-compatible/);
    assert.match(`${missing.stdout}\n${missing.stderr}`, /setup: FAIL not ready: NOT_FOUND/);

    await writeFile(
      path.join(localTrustedHome, "agent-registry.local.json"),
      JSON.stringify({
        "agent-minimax": {
          id: "agent-minimax",
          name: "MiniMax",
          runtimeProvider: "openai",
          endpoint: "https://api.minimaxi.com/v1",
          model: "MiniMax-M3",
        },
      }),
    );
    const mismatch = spawnSync(process.execPath, ["scripts/run-provider-regression.mjs", "--target", "minimax"], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        VIBE_OFFICE_LOCAL_TRUSTED_HOME: localTrustedHome,
      },
    });
    assert.equal(mismatch.status, 1);
    assert.match(`${mismatch.stdout}\n${mismatch.stderr}`, /MiniMax Anthropic-compatible/);
    assert.match(`${mismatch.stdout}\n${mismatch.stderr}`, /PROVIDER_MISMATCH agent-minimax/);
    assert.match(`${mismatch.stdout}\n${mismatch.stderr}`, /repair=VIBE_AGENT_ID=agent-minimax VIBE_AGENT_M9_TARGET=minimax VIBE_AGENT_API_KEY=<key> npm run local-agent:credential/);
  } finally {
    await rm(localTrustedHome, { recursive: true, force: true });
  }
});

test("local agent credential updater applies M9 target presets without leaking keys", async () => {
  const localTrustedHome = await mkdtemp(path.join(os.tmpdir(), "vibe-office-m9-credential-"));
  const secret = "super-secret-m9-test-key";

  try {
    await writeFile(
      path.join(localTrustedHome, "agent-registry.local.json"),
      JSON.stringify(
        {
          "agent-minimax": {
            id: "agent-minimax",
            name: "MiniMax",
            endpoint: "https://api.minimaxi.com/v1",
            a2aEndpoint: "https://api.minimaxi.com/a2a",
            agentCardUrl: "https://api.minimaxi.com/.well-known/agent-card.json",
            model: "MiniMax-M3",
            runtimeProvider: "openai",
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    const result = spawnSync(process.execPath, ["scripts/update-local-agent-credential.mjs"], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        VIBE_OFFICE_LOCAL_TRUSTED_HOME: localTrustedHome,
        VIBE_AGENT_ID: "agent-minimax",
        VIBE_AGENT_M9_TARGET: "minimax",
        VIBE_AGENT_API_KEY: secret,
      },
    });
    const registryRaw = await readFile(path.join(localTrustedHome, "agent-registry.local.json"), "utf8");
    const credentialRaw = await readFile(path.join(localTrustedHome, "agent-credentials.local.json"), "utf8");
    const registry = JSON.parse(registryRaw);
    const credentials = JSON.parse(credentialRaw);
    const output = `${result.stdout}\n${result.stderr}`;

    assert.equal(result.status, 0);
    assert.match(output, /m9Target=minimax/);
    assert.match(output, /m9Readiness=READY:agent-minimax/);
    assert.equal(output.includes(secret), false);
    assert.equal(registryRaw.includes(secret), false);
    assert.equal(registry["agent-minimax"].runtimeProvider, "anthropic");
    assert.equal(registry["agent-minimax"].endpoint, "https://api.minimax.io/anthropic");
    assert.equal(registry["agent-minimax"].model, "MiniMax-M3");
    assert.equal(credentials["agent-minimax"].apiKey, secret);
  } finally {
    await rm(localTrustedHome, { recursive: true, force: true });
  }
});

test("provider setup detects obvious runtime endpoint mismatches", () => {
  assert.match(
    getProviderSetupIssue({
      endpoint: "https://api.minimaxi.com/anthropic",
      runtimeProvider: "openai",
    }) ?? "",
    /Anthropic-compatible/,
  );

  assert.match(
    getProviderSetupIssue({
      endpoint: "https://api.example.com/v1/chat/completions",
      runtimeProvider: "anthropic",
    }) ?? "",
    /OpenAI-compatible/,
  );

  assert.equal(
    getProviderSetupIssue({
      endpoint: "https://api.deepseek.com/v1",
      runtimeProvider: "openai",
    }),
    null,
  );

  assert.match(
    getProviderSetupIssue({
      endpoint: "https://api.minimaxi.com/v1",
      model: "MiniMax-M3",
      runtimeProvider: "openai",
    }) ?? "",
    /Anthropic-compatible/,
  );

  assert.equal(
    getProviderSetupIssue({
      endpoint: "https://api.minimaxi.com/anthropic",
      model: "MiniMax-M3",
      runtimeProvider: "anthropic",
    }),
    null,
  );
});

test("provider router uses provider adapters by runtime and isolates Hermes fallback", async () => {
  assert.equal(resolveProviderRoute({ runtimeProvider: "openai" }), "openai");
  assert.equal(resolveProviderRoute({ runtimeProvider: "anthropic" }), "anthropic");
  assert.equal(resolveProviderRoute({ runtimeProvider: "hermes" }), "native-with-hermes-fallback");
  assert.equal(resolveProviderRoute({ runtimeProvider: undefined }), "native-with-hermes-fallback");

  const calls: string[] = [];
  const createProvider = (label: string, mode: ProviderConnectionMode, failProject = false): ProviderAdapter => ({
    async testConnection() {
      calls.push(`${label}:test`);
      return {
        card: createSyntheticAgentCard(agent, label),
        mode,
      };
    },
    async sendProjectMessage(projectToUse) {
      calls.push(`${label}:project:${projectToUse.id}`);
      if (failProject) throw new Error(`${label} unavailable`);
      return createCompletedTextTask({
        contextId: projectToUse.namespace,
        content: `${label} project`,
        metadata: { adapter: label },
      });
    },
    async sendFreeChatMessage() {
      calls.push(`${label}:free`);
      return createCompletedTextTask({
        contextId: `free-chat:${label}`,
        content: `${label} free`,
        metadata: { adapter: label },
      });
    },
  });
  const nativeProvider = {
    ...createProvider("native", "native-a2a", true),
    async getAgentCard() {
      calls.push("native:card");
      return createSyntheticAgentCard(agent, "native");
    },
    async getProjectTask() {
      throw new Error("unused");
    },
    async cancelProjectTask() {
      throw new Error("unused");
    },
  };
  const transport: AgentHttpTransport = {
    async commandJson() {
      throw new Error("Provider router injection should not hit transport.");
    },
  };

  const openAIRouter = new ProviderRouter({
    agent: { ...agent, runtimeProvider: "openai" },
    timeoutMs: 1000,
    transport,
    providers: {
      nativeA2A: nativeProvider,
      openAI: createProvider("openai", "openai-compatible"),
      hermesCompatibility: createProvider("hermes", "hermes-adapter"),
      anthropic: createProvider("anthropic", "anthropic-compatible"),
    },
  });
  const openAITask = await openAIRouter.sendFreeChatMessage("hi");

  const hermesRouter = new ProviderRouter({
    agent: { ...agent, runtimeProvider: "hermes" },
    timeoutMs: 1000,
    transport,
    providers: {
      nativeA2A: nativeProvider,
      openAI: createProvider("openai-unused", "openai-compatible"),
      hermesCompatibility: createProvider("hermes", "hermes-adapter"),
      anthropic: createProvider("anthropic-unused", "anthropic-compatible"),
    },
  });
  const hermesTask = await hermesRouter.sendProjectMessage(project, "recover");

  assert.equal(openAITask.metadata?.adapter, "openai");
  assert.equal(hermesTask.metadata?.adapter, "hermes");
  assert.deepEqual(calls, ["openai:free", "native:project:project-vibe", "hermes:project:project-vibe"]);
});

test("provider adapter routes OpenAI-compatible free chat through local provider commands", async () => {
  const commands: LocalTrustedProviderCommand[] = [];
  const transport: AgentHttpTransport = {
    async commandJson<T>(command: LocalTrustedProviderCommand) {
      commands.push(command);
      return {
        choices: [
          {
            message: {
              content: "OpenAI-compatible response.",
            },
          },
        ],
      } as T;
    },
  };
  const openAIAgent: AgentInstance = {
    ...agent,
    runtimeProvider: "openai",
    endpoint: "https://api.deepseek.example/v1",
    model: "deepseek-chat",
    apiKey: "should-stay-local",
  };

  const adapter = new HermesA2AAdapter({ agent: openAIAgent, transport });
  const task = await adapter.sendFreeChatMessage("hi", [{ role: "assistant", content: "prior answer" }]);
  const result = await adapter.testConnection();
  const metadata = createA2ACompatibilityMetadata(result);

  assert.equal(commands[0].agentId, openAIAgent.id);
  assert.equal(commands[0].command, "openai.chatCompletions");
  assert.equal(commands[1].command, "openai.chatCompletions");
  assert.equal(task.metadata?.adapter, "openai-compatible");
  assert.equal(task.status.message?.parts[0].kind, "text");
  assert.equal(result.mode, "openai-compatible");
  assert.equal(metadata.a2aTransportBinding, "openai-compatible-http");
});

test("provider adapter routes Anthropic-compatible project chat through local provider commands", async () => {
  const commands: LocalTrustedProviderCommand[] = [];
  const transport: AgentHttpTransport = {
    async commandJson<T>(command: LocalTrustedProviderCommand) {
      commands.push(command);
      return {
        content: [
          {
            type: "text",
            text: "Anthropic-compatible response.",
          },
        ],
      } as T;
    },
  };
  const anthropicAgent: AgentInstance = {
    ...agent,
    runtimeProvider: "anthropic",
    endpoint: "https://api.minimax.example/anthropic",
    model: "MiniMax-M3",
    apiKey: "should-stay-local",
  };

  const adapter = new HermesA2AAdapter({ agent: anthropicAgent, transport });
  const task = await adapter.sendProjectMessage(project, "Draft release notes.", [{ role: "assistant", content: "prior answer" }]);
  const result = await adapter.testConnection();
  const metadata = createA2ACompatibilityMetadata(result);

  assert.equal(commands[0].agentId, anthropicAgent.id);
  assert.equal(commands[0].command, "anthropic.messages");
  assert.equal(commands[0].payload.system, "Vibe Office project namespace: project-vibe-office. Keep this task scoped to this project.");
  assert.equal(commands[1].command, "anthropic.messages");
  assert.equal(task.metadata?.adapter, "anthropic-compatible");
  assert.equal(result.mode, "anthropic-compatible");
  assert.equal(metadata.a2aSelectedInterface, "Anthropic messages");
});

test("provider adapter falls Hermes native A2A failures back to Hermes chat compatibility", async () => {
  const commands: LocalTrustedProviderCommand[] = [];
  const fallbackTransport: AgentHttpTransport = {
    async commandJson<T>(command: LocalTrustedProviderCommand) {
      commands.push(command);
      if (command.command === "a2a.messageSend") {
        return {
          jsonrpc: "2.0",
          id: "smoke-a2a",
          error: {
            code: -32000,
            message: "native unavailable",
          },
        } as T;
      }
      return {
        choices: [
          {
            message: {
              content: "Hermes compatibility response.",
            },
          },
        ],
      } as T;
    },
  };
  const nativeHermesAgent: AgentInstance = {
    ...agent,
    runtimeProvider: "hermes",
    endpoint: "http://127.0.0.1:8642/v1",
    a2aEndpoint: "https://native.example/a2a",
    agentCardUrl: "https://native.example/.well-known/agent-card.json",
    a2aTransportBinding: "json-rpc/http",
    a2aProtocolVersion: "1.0",
  };

  const task = await new HermesA2AAdapter({ agent: nativeHermesAgent, transport: fallbackTransport }).sendProjectMessage(project, "Recover through chat.");

  assert.equal(commands[0].command, "a2a.messageSend");
  assert.equal(commands[1].command, "openai.chatCompletions");
  assert.equal(task.metadata?.adapter, "hermes-openai-compatible");
});

test("A2A client delegates capability and task lifecycle calls to local provider commands", async () => {
  const commands: LocalTrustedProviderCommand[] = [];
  const transport: AgentHttpTransport = {
    async commandJson<T>(command: LocalTrustedProviderCommand) {
      commands.push(command);
      if (command.command === "a2a.getAgentCard") {
        return {
          name: "Native Smoke",
          url: "https://native.example/a2a",
          version: "1.0",
          protocolVersion: "1.0",
        } as T;
      }
      return {
        jsonrpc: "2.0",
        id: "local-test",
        result: a2aTask(`${command.command} ok`),
      } as T;
    },
  };
  const client = new A2AClient({
    agentId: "agent-native",
    transport,
  });

  const card = await client.getAgentCard();
  const taskResult = await client.getTask("task-1", "context-1");
  const cancelResult = await client.cancelTask("task-1", "context-1");

  assert.equal(card.name, "Native Smoke");
  assert.equal(taskResult.status.message?.parts[0].kind, "text");
  assert.equal(cancelResult.status.message?.parts[0].kind, "text");
  assert.deepEqual(commands.map((command) => command.command), ["a2a.getAgentCard", "a2a.tasksGet", "a2a.tasksCancel"]);
  const getCommand = commands.find((command) => command.command === "a2a.tasksGet");
  const cancelCommand = commands.find((command) => command.command === "a2a.tasksCancel");
  assert.equal(getCommand?.payload.id, "task-1");
  assert.equal(cancelCommand?.payload.contextId, "context-1");
});

test("canonical host redirect keeps local storage on one loopback origin", () => {
  assert.equal(
    getCanonicalLocalhostRedirectUrl({
      protocol: "http:",
      hostname: "localhost",
      port: "5180",
      pathname: "/project",
      search: "?tab=workspace",
      hash: "#files",
    }),
    "http://127.0.0.1:5180/project?tab=workspace#files",
  );
  assert.equal(
    getCanonicalLocalhostRedirectUrl({
      protocol: "http:",
      hostname: "127.0.0.1",
      port: "5180",
      pathname: "/",
      search: "",
      hash: "",
    }),
    "",
  );
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

test("ui state storage restores selected chrome and tolerates corrupt or unavailable storage", () => {
  withWindowStorage(new MemoryLocalStorage(), () => {
    saveUiState({
      selectedAgentId: "agent-lucy",
      selectedProjectId: "project-vibe",
      chatScope: "project",
      conversationMode: "task-room",
      outputMode: "outputs",
      browserUrl: "http://127.0.0.1:5180/",
      previewOutput: {
        ownerAgentId: "agent-lucy",
        openedAt: 1780000000000,
        url: "http://127.0.0.1:5180/",
      },
      activeFreeChatConversationIds: {
        "agent-lucy": "free-conversation-1",
      },
    });

    assert.deepEqual(loadUiState(), {
      selectedAgentId: "agent-lucy",
      selectedProjectId: "project-vibe",
      chatScope: "project",
      conversationMode: "task-room",
      outputMode: "outputs",
      browserUrl: "http://127.0.0.1:5180/",
      previewOutput: {
        ownerAgentId: "agent-lucy",
        openedAt: 1780000000000,
        url: "http://127.0.0.1:5180/",
      },
      activeFreeChatConversationIds: {
        "agent-lucy": "free-conversation-1",
      },
    });
  });

  withWindowStorage(new MemoryLocalStorage(), () => {
    window.localStorage.setItem(
      "vibe-office.ui.v1",
      JSON.stringify({
        outputMode: "artifacts",
      }),
    );

    assert.equal(loadUiState().outputMode, "outputs");
  });

  withWindowStorage(new MemoryLocalStorage(), () => {
    window.localStorage.setItem(
      "vibe-office.ui.v1",
      JSON.stringify({
        selectedAgentId: 12,
        selectedProjectId: "project-vibe",
        chatScope: "workspace",
        conversationMode: "task-room",
        outputMode: "floating",
        browserUrl: 123,
        previewOutput: {
          ownerAgentId: 456,
          openedAt: "yesterday",
          url: "",
        },
        activeFreeChatConversationIds: {
          valid: "conversation-id",
          invalid: 123,
        },
      }),
    );

    assert.deepEqual(loadUiState(), {
      selectedAgentId: undefined,
      selectedProjectId: "project-vibe",
      chatScope: undefined,
      conversationMode: "task-room",
      outputMode: undefined,
      browserUrl: undefined,
      previewOutput: undefined,
      activeFreeChatConversationIds: {
        valid: "conversation-id",
      },
    });
  });

  withWindowStorage(new MemoryLocalStorage(), () => {
    window.localStorage.setItem("vibe-office.ui.v1", "{bad json");
    assert.deepEqual(loadUiState(), {});
  });

  assert.doesNotThrow(() =>
    withWindowStorage(new MemoryLocalStorage(true), () => {
      saveUiState({ selectedAgentId: "agent-lucy" });
    }),
  );
});

test("app bootstrap state derives stable free chat and output defaults", () => {
  assert.equal(
    deriveInitialChatScope({
      freeChatEntryProjectId: FREE_CHAT_ENTRY_PROJECT_ID,
      selectedProjectId: undefined,
      storedChatScope: undefined,
    }),
    "free",
  );
  assert.equal(
    deriveInitialChatScope({
      freeChatEntryProjectId: FREE_CHAT_ENTRY_PROJECT_ID,
      selectedProjectId: "project-vibe",
      storedChatScope: undefined,
    }),
    "project",
  );
  assert.equal(
    deriveInitialChatScope({
      freeChatEntryProjectId: FREE_CHAT_ENTRY_PROJECT_ID,
      selectedProjectId: "project-vibe",
      storedChatScope: "free",
    }),
    "free",
  );
  assert.equal(normalizeOutputMode("workspace"), "workspace");
  assert.equal(normalizeOutputMode("browser"), "browser");
  assert.equal(normalizeOutputMode("artifacts"), "outputs");
  assert.equal(normalizeOutputMode("runs"), "outputs");
  assert.equal(normalizeOutputMode("floating"), "workspace");
});

test("workspace storage migrates recoverable state and falls back safely", () => {
  withWindowStorage(new MemoryLocalStorage(), () => {
    saveWorkspaceState({
      projects: [project],
      conversations: [conversation()],
      messages: [userMessage({ requestId: undefined, requestAttempt: undefined, requestStartedAt: undefined })],
      runs: [run({ summary: "Recovered run summary." })],
      tasks: [task()],
      artifacts: [],
    });

    const restored = loadWorkspaceState();
    assert.equal(restored.projects[0].id, project.id);
    assert.equal(restored.conversations[0].updatedAt, at);
    assert.equal(restored.messages[0].requestId, "message-1");
    assert.equal(restored.messages[0].requestAttempt, 1);
    assert.equal(restored.messages[0].requestStartedAt, at);
    assert.equal(restored.runs[0].summary, "Recovered run summary.");
  });

  withWindowStorage(new MemoryLocalStorage(), () => {
    window.localStorage.setItem(
      "vibe-office.workspace.v1",
      JSON.stringify({
        version: 1,
        projects: [{ id: "project-vibe", name: "Vibe Office", namespace: "project-vibe-office" }, { id: 5 }],
        conversations: [{ id: "conversation-1", projectId: "project-vibe", mode: "direct" }, { id: "bad" }],
        messages: [
          {
            id: "message-1",
            conversationId: "conversation-1",
            projectId: "project-vibe",
            role: "user",
            status: "sending",
            contentParts: [{ kind: "text", text: "hello" }, { kind: "file", file: {} }],
            workspaceContext: [{ path: "src/App.tsx", size: "big" }],
            createdAt: at,
          },
          { id: "bad-message", role: "robot" },
        ],
        runs: [{ id: "run-1", projectId: "project-vibe", conversationId: "conversation-1", type: "direct_message", ownerAgentId: "agent-lucy", state: "completed" }],
        tasks: [{ id: "task-1", projectId: "project-vibe", contextId: "project-vibe-office", title: "Task", ownerAgentId: "agent-lucy", state: "working" }],
        artifacts: [{ id: "artifact-1", projectId: "project-vibe", taskId: "task-1", agentId: "agent-lucy", name: "Result", kind: "text" }],
      }),
    );

    const restored = loadWorkspaceState();
    assert.equal(restored.projects.length, 1);
    assert.equal(restored.conversations.length, 1);
    assert.equal(restored.messages.length, 1);
    assert.equal(restored.messages[0].contentParts.length, 1);
    assert.deepEqual(restored.messages[0].workspaceContext, [{ path: "src/App.tsx", size: 0, attachedAt: restored.messages[0].workspaceContext?.[0].attachedAt }]);
    assert.equal(restored.runs.length, 1);
    assert.equal(restored.tasks.length, 1);
    assert.equal(restored.artifacts.length, 1);
  });

  withWindowStorage(new MemoryLocalStorage(), () => {
    window.localStorage.setItem("vibe-office.workspace.v1", "{bad json");
    assert.deepEqual(loadWorkspaceState(), emptyWorkspaceState);
  });

  assert.doesNotThrow(() =>
    withWindowStorage(new MemoryLocalStorage(true), () => {
      saveWorkspaceState(emptyWorkspaceState);
    }),
  );
});

test("workspace state defaults fill only empty persisted collections", () => {
  const defaults = {
    ...emptyWorkspaceState,
    projects: [project],
    conversations: [conversation()],
    messages: [userMessage()],
    runs: [run()],
    tasks: [task()],
    artifacts: [artifact()],
  };
  const persistedProject = { ...project, id: "persisted-project", name: "Persisted" };

  const initialized = applyWorkspaceStateDefaults(
    {
      ...emptyWorkspaceState,
      projects: [persistedProject],
    },
    defaults,
  );

  assert.deepEqual(initialized.projects.map((item) => item.id), [persistedProject.id]);
  assert.deepEqual(initialized.conversations.map((item) => item.id), ["conversation-1"]);
  assert.deepEqual(initialized.messages.map((item) => item.id), ["message-1"]);
  assert.deepEqual(initialized.runs.map((item) => item.id), ["run-1"]);
  assert.deepEqual(initialized.tasks.map((item) => item.id), ["task-1"]);
  assert.deepEqual(initialized.artifacts.map((item) => item.id), ["artifact-1"]);
});

test("split pane state clamps pointer and keyboard changes", () => {
  assert.equal(getSplitPercentFromClientX({ clientX: 540, left: 0, width: 1000 }), 54);
  assert.equal(getSplitPercentFromClientX({ clientX: 200, left: 0, width: 1000 }), 35);
  assert.equal(getSplitPercentFromClientX({ clientX: 900, left: 0, width: 1000 }), 70);
  assert.equal(getSplitPercentFromClientX({ clientX: 500, left: 100, width: 0 }), 35);
  assert.equal(nudgeSplitPercent(54, "left"), 50);
  assert.equal(nudgeSplitPercent(54, "right"), 58);
  assert.equal(nudgeSplitPercent(35, "left"), 35);
  assert.equal(nudgeSplitPercent(70, "right"), 70);
});
