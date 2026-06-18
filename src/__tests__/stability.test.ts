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
  completeTaskRoomMessageRetry,
  prepareDirectMessageRetry,
  prepareTaskRoomMessageRetry,
} from "../services/requestRetryState";
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
  toLocalTrustedProviderRequestBody,
  toLocalTrustedProxyUrl,
} from "../services/agentHttpTransport";
import { createA2ACompatibilityMetadata, HermesA2AAdapter } from "../services/hermesA2AAdapter";
import { getCanonicalLocalhostRedirectUrl } from "../services/canonicalHost";
import { createRequestRuntimeStore } from "../services/requestRuntimeStore";
import { loadUiState, saveUiState } from "../services/uiStateStorage";
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
    toLocalTrustedProviderRequestBody("https://api.example.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: "Bearer test-key",
        "Content-Type": "application/json",
      },
      body: "{\"model\":\"test\"}",
    }),
    {
      url: "https://api.example.com/v1/chat/completions",
      method: "POST",
      headers: {
        Authorization: "Bearer test-key",
        "Content-Type": "application/json",
      },
      body: "{\"model\":\"test\"}",
    },
  );
  assert.equal(JSON.parse(String(createLocalTrustedProviderRequest("https://api.example.com/v1", {}).body)).url, "https://api.example.com/v1");

  const previousFetch = globalThis.fetch;
  const requestedUrls: string[] = [];
  const requestedBodies: Array<{ url?: string }> = [];
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
      await transport.requestJson<{ ok: boolean }>("http://127.0.0.1:8642/ok", {}, {
        timeoutMs: 1000,
        timeoutMessage: "timed out",
        failurePrefix: "Provider failed",
      }),
      { ok: true },
    );
    assert.equal(requestedUrls[0], "/agent-local/request");
    assert.equal(requestedBodies[0].url, "http://127.0.0.1:8642/ok");
    await assert.rejects(
      () =>
        transport.requestJson("https://api.example.com/fail", {}, {
          timeoutMs: 1000,
          timeoutMessage: "timed out",
          failurePrefix: "Provider failed",
        }),
      /Provider failed: 401: bad key/,
    );
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("provider adapter routes OpenAI-compatible free chat through chat completions", async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const transport: AgentHttpTransport = {
    async request() {
      throw new Error("Native A2A should not be used for OpenAI-compatible agents.");
    },
    async requestJson<T>(url: string, init: RequestInit) {
      calls.push({ url, init });
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
  };

  const adapter = new HermesA2AAdapter({ agent: openAIAgent, transport });
  const task = await adapter.sendFreeChatMessage("hi", [{ role: "assistant", content: "prior answer" }]);
  const result = await adapter.testConnection();
  const metadata = createA2ACompatibilityMetadata(result);

  assert.equal(calls[0].url, "https://api.deepseek.example/v1/chat/completions");
  assert.equal(task.metadata?.adapter, "openai-compatible");
  assert.equal(task.status.message?.parts[0].kind, "text");
  assert.equal(result.mode, "openai-compatible");
  assert.equal(metadata.a2aTransportBinding, "openai-compatible-http");
});

test("provider adapter routes Anthropic-compatible project chat through messages", async () => {
  const calls: Array<{ url: string; body: unknown }> = [];
  const transport: AgentHttpTransport = {
    async request() {
      throw new Error("Native A2A should not be used for Anthropic-compatible agents.");
    },
    async requestJson<T>(url: string, init: RequestInit) {
      calls.push({ url, body: JSON.parse(String(init.body)) });
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
  };

  const adapter = new HermesA2AAdapter({ agent: anthropicAgent, transport });
  const task = await adapter.sendProjectMessage(project, "Draft release notes.", [{ role: "assistant", content: "prior answer" }]);
  const result = await adapter.testConnection();
  const metadata = createA2ACompatibilityMetadata(result);

  assert.equal(calls[0].url, "https://api.minimax.example/anthropic/v1/messages");
  assert.equal((calls[0].body as { system?: string }).system, "Vibe Office project namespace: project-vibe-office. Keep this task scoped to this project.");
  assert.equal(task.metadata?.adapter, "anthropic-compatible");
  assert.equal(result.mode, "anthropic-compatible");
  assert.equal(metadata.a2aSelectedInterface, "Anthropic messages");
});

test("provider adapter falls Hermes native A2A failures back to Hermes chat compatibility", async () => {
  const requestUrls: string[] = [];
  const requestJsonUrls: string[] = [];
  const transport: AgentHttpTransport = {
    async request(url: string) {
      requestUrls.push(url);
      return new Response(JSON.stringify({ error: "native unavailable" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      });
    },
    async requestJson<T>(url: string) {
      requestJsonUrls.push(url);
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

  const task = await new HermesA2AAdapter({ agent: nativeHermesAgent, transport }).sendProjectMessage(project, "Recover through chat.");

  assert.equal(requestUrls[0], "https://native.example/a2a");
  assert.equal(requestJsonUrls[0], "http://127.0.0.1:8642/v1/chat/completions");
  assert.equal(task.metadata?.adapter, "hermes-openai-compatible");
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
