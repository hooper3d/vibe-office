import assert from "node:assert/strict";
import test from "node:test";
import { createAgentFromHermesSetup, getProviderSetupIssue } from "../domain/hermesSetup";
import type { AgentInstance } from "../domain/types";
import { runAgentConnectionTest } from "../services/agentConnectionTestState";
import {
  applyLocalTrustedAgentStatuses,
  deriveAgentReadinessIssues,
  readLocalTrustedAgentReadinessRefresh,
  removeAgentReadinessIssues,
  removeAgentReadinessStatus,
} from "../services/agentReadinessState";
import { persistBlockedProviderCredential } from "../services/agentSetupController";
import {
  applyAgentAvatarUpdate,
  applyAgentDelete,
  applyAgentSetupSave,
  normalizeChief,
  resolveSelectedAgent,
} from "../services/agentSetupState";
import { loadConfiguredAgents, saveConfiguredAgents, syncConfiguredAgents } from "../services/agentStorage";
import { deriveAppAgentViewState } from "../services/appAgentViewState";
import { readAvatarFile } from "../services/avatarFile";

import { agent, conversation, MemoryLocalStorage, participant, userMessage, withWindowStorage } from "./testSupport";

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

test("agent connection test preserves the trusted credential save step when provider verification fails", async () => {
  const form = new FormData();
  form.set("name", "MiniMax");
  form.set("officeRole", "builder");
  form.set("role", "drafts / code");
  form.set("runtimeProvider", "anthropic");
  form.set("endpoint", "https://api.minimaxi.com/anthropic");
  form.set("model", "MiniMax-M3");
  form.set("apiKey", "local-trusted-secret");

  let persistedAgent: AgentInstance | undefined;
  const result = await runAgentConnectionTest({
    form,
    agentId: "agent-provider-failure",
    async persistAgent(agentToPersist) {
      persistedAgent = agentToPersist;
    },
    createAdapter() {
      return {
        async testConnection() {
          throw new Error("Agent authentication failed.");
        },
      };
    },
  });

  assert.equal(result.status, "failed");
  assert.ok(persistedAgent);
  assert.equal(persistedAgent.id, "agent-provider-failure");
  assert.equal(persistedAgent.apiKey, "local-trusted-secret");
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

test("blocked existing provider save persists a newly entered key before reporting setup issues", async () => {
  const blockedAgent: AgentInstance = {
    ...participant,
    id: "agent-minimax-blocked-save",
    endpoint: "https://api.minimaxi.com/v1",
    a2aEndpoint: "https://api.minimaxi.com/a2a",
    agentCardUrl: "https://api.minimaxi.com/.well-known/agent-card.json",
    model: "MiniMax-M3",
    runtimeProvider: "openai",
    apiKey: "local-trusted-secret",
  };
  const setupIssue = getProviderSetupIssue(blockedAgent);
  const persistedAgentIds: string[] = [];
  const refreshedAgentIds: string[] = [];

  const saved = await persistBlockedProviderCredential({
    agent: blockedAgent,
    async persistAgent(agentToPersist) {
      persistedAgentIds.push(agentToPersist.id);
      assert.equal(agentToPersist.apiKey, "local-trusted-secret");
      return true;
    },
    async refreshLocalTrustedAgentIssues(agentIds) {
      refreshedAgentIds.push(...agentIds);
    },
  });

  assert.match(setupIssue ?? "", /MiniMax M3 should be configured as Anthropic-compatible/);
  assert.equal(saved, true);
  assert.deepEqual(persistedAgentIds, ["agent-minimax-blocked-save"]);
  assert.deepEqual(refreshedAgentIds, ["agent-minimax-blocked-save"]);
});

test("blocked provider save skips credential persistence when no new key was entered", async () => {
  let persistCalled = false;

  const saved = await persistBlockedProviderCredential({
    agent: {
      ...participant,
      id: "agent-no-key-blocked-save",
      endpoint: "https://api.minimaxi.com/v1",
      a2aEndpoint: "https://api.minimaxi.com/a2a",
      agentCardUrl: "https://api.minimaxi.com/.well-known/agent-card.json",
      model: "MiniMax-M3",
      runtimeProvider: "openai",
    },
    async persistAgent() {
      persistCalled = true;
      return true;
    },
    async refreshLocalTrustedAgentIssues() {
      throw new Error("refresh should not run without a key");
    },
  });

  assert.equal(saved, false);
  assert.equal(persistCalled, false);
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
