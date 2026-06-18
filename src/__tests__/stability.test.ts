import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { A2ATask } from "../domain/a2a";
import type { Conversation, ConversationMessage, ProjectArtifact, ProjectRun, ProjectTask } from "../domain/projectScope";
import type { AgentInstance, Project } from "../domain/types";
import { markConversationMessageFailed, markConversationMessageSending } from "../domain/requestLifecycle";
import { getProviderSetupIssue } from "../domain/hermesSetup";
import { applyMediaArtifactBackfillState } from "../services/artifactBackfillState";
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
  createLocalTrustedProviderRequest,
  type AgentHttpTransport,
  type LocalTrustedProviderCommand,
  toLocalTrustedProviderRequestBody,
  toLocalTrustedProxyUrl,
} from "../services/agentHttpTransport";
import { createA2ACompatibilityMetadata, HermesA2AAdapter } from "../services/hermesA2AAdapter";
import { A2AClient } from "../services/a2aClient";
import { applyAgentSetupSave, normalizeChief } from "../services/agentSetupState";
import { loadConfiguredAgents, saveConfiguredAgents } from "../services/agentStorage";
import {
  applyActiveFreeChatConversation,
  buildFreeChatHistory,
  resolveCurrentDirectConversation,
  shouldReuseEmptyFreeChat,
} from "../services/conversationSelectionState";
import { getCanonicalLocalhostRedirectUrl } from "../services/canonicalHost";
import { applyProjectDelete, applyProjectSave, canDeleteProject } from "../services/projectSetupState";
import { createRequestRuntimeStore } from "../services/requestRuntimeStore";
import {
  countTrackableTaskOutputs,
  filterArtifactsByAgent,
  filterRunsByAgent,
  filterTasksByAgent,
  getStandaloneOutputTasks,
  getVisibleOutputAgentIds,
  getVisibleOutputRuns,
} from "../services/outputSelectors";
import { loadUiState, saveUiState } from "../services/uiStateStorage";
import {
  applyTaskLifecycleWorkspaceUpdate,
  isTaskLifecyclePollable,
  resolveTaskLifecycleRequest,
  resolveTaskRetryRequest,
} from "../services/taskLifecycleRequestState";
import {
  failTaskRetry,
  getTaskLifecycleAddress,
  prepareTaskRetrySubmitting,
  recordCancelUnsupportedState,
  recordLifecycleUnsupportedState,
} from "../services/taskLifecycleState";
import { emptyWorkspaceState, loadWorkspaceState, saveWorkspaceState } from "../services/workspaceStorage";

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

test("agent http transport delegates provider requests to the local trusted layer", async () => {
  assert.equal(toLocalTrustedProxyUrl("http://127.0.0.1:8642/v1/chat/completions"), "/hermes-local/v1/chat/completions");
  assert.equal(toLocalTrustedProxyUrl("https://hooper.ink/a2a?x=1"), "/hermes-hooper/a2a?x=1");
  assert.equal(toLocalTrustedProxyUrl("https://api.example.com/v1"), "https://api.example.com/v1");
  assert.deepEqual(
    toLocalTrustedProviderRequestBody(
      "https://api.example.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer test-key",
          "Content-Type": "application/json",
        },
        body: "{\"model\":\"test\"}",
      },
      { agentId: "agent-lucy" },
    ),
    {
      url: "https://api.example.com/v1/chat/completions",
      method: "POST",
      headers: {
        Authorization: "Bearer test-key",
        "Content-Type": "application/json",
      },
      body: "{\"model\":\"test\"}",
      agentId: "agent-lucy",
    },
  );
  assert.equal(JSON.parse(String(createLocalTrustedProviderRequest("https://api.example.com/v1", {}, { agentId: "agent-lucy" }).body)).agentId, "agent-lucy");

  const previousFetch = globalThis.fetch;
  const requestedUrls: string[] = [];
  const requestedBodies: Array<{ url?: string; agentId?: string; command?: string }> = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    requestedUrls.push(String(url));
    requestedBodies.push(JSON.parse(String(init?.body || "{}")));
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

    assert.deepEqual(
      await transport.requestJson<{ ok: boolean }>("http://127.0.0.1:8642/ok", {}, {
        timeoutMs: 1000,
        timeoutMessage: "timed out",
        failurePrefix: "Provider failed",
        agentId: "agent-lucy",
      }),
      { ok: true },
    );
    assert.equal(requestedUrls[1], "/agent-local/request");
    assert.equal(requestedBodies[1].url, "http://127.0.0.1:8642/ok");
    assert.equal(requestedBodies[1].agentId, "agent-lucy");
    await assert.rejects(
      () =>
        transport.requestJson("https://api.example.com/fail", {}, {
          timeoutMs: 1000,
          timeoutMessage: "timed out",
          failurePrefix: "Provider failed",
          agentId: "agent-lucy",
        }),
      /Provider failed: 401: bad key/,
    );
  } finally {
    globalThis.fetch = previousFetch;
  }
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
});

test("task lifecycle helpers preserve unsupported and retry states", () => {
  const directRun = run({ type: "direct_message" });
  const localTask = task();
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
  assert.equal(countTrackableTaskOutputs(runs, tasks), 3);
  assert.deepEqual(getVisibleOutputAgentIds({ agents: [agent, participant], runs, tasks, artifacts: [artifact] }), [
    agent.id,
    participant.id,
  ]);
  assert.deepEqual(filterRunsByAgent(runs, participant.id).map((item) => item.id), ["run-direct-task", "run-chief"]);
  assert.deepEqual(filterTasksByAgent(tasks, participant.id).map((item) => item.id), ["task-chief", "task-direct", "task-standalone"]);
  assert.deepEqual(filterArtifactsByAgent([artifact], participant.id).map((item) => item.id), ["artifact-1"]);
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
});

test("provider adapter routes OpenAI-compatible free chat through local provider commands", async () => {
  const commands: LocalTrustedProviderCommand[] = [];
  const transport: AgentHttpTransport = {
    async request() {
      throw new Error("Native A2A should not be used for OpenAI-compatible agents.");
    },
    async requestJson() {
      throw new Error("OpenAI-compatible agents should not send browser-built provider HTTP requests.");
    },
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
    async request() {
      throw new Error("Native A2A should not be used for Anthropic-compatible agents.");
    },
    async requestJson() {
      throw new Error("Anthropic-compatible agents should not send browser-built provider HTTP requests.");
    },
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
    async request() {
      throw new Error("Native A2A should use local provider commands.");
    },
    async requestJson() {
      throw new Error("Hermes fallback should use local provider commands.");
    },
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
    async request() {
      throw new Error("A2A client should use local provider commands when an agent id is available.");
    },
    async requestJson() {
      throw new Error("A2A client should use local provider commands when an agent id is available.");
    },
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
    endpoint: "https://native.example/a2a",
    agentId: "agent-native",
    protocolVersion: "1.0",
    transport,
  });

  const card = await client.getAgentCard("https://native.example/.well-known/agent-card.json");
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
