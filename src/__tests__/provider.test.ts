import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { getProviderSetupIssue } from "../domain/hermesSetup";
import type { AgentInstance } from "../domain/types";
import { A2AClient } from "../services/a2aClient";
import type { AgentHttpTransport, LocalTrustedProviderCommand } from "../services/agentHttpTransport";
import { HermesA2AAdapter } from "../services/hermesA2AAdapter";
import { ProviderRouter, resolveProviderRoute } from "../services/providerRouter";
import {
  createA2ACompatibilityMetadata,
  createCompletedTextTask,
  createSyntheticAgentCard,
  type ProviderAdapter,
  type ProviderConnectionMode,
} from "../services/providerTypes";

import { a2aTask, agent, project } from "./testSupport";

test("browser provider adapters stay credential-free and command-only", async () => {
  const providerSources = await Promise.all(
    ["openaiProvider.ts", "anthropicProvider.ts", "nativeA2AProvider.ts", "a2aClient.ts"].map(async (fileName) => ({
      fileName,
      source: await readFile(path.join(process.cwd(), "src", "services", fileName), "utf8"),
    })),
  );

  for (const { fileName, source } of providerSources) {
    assert.doesNotMatch(source, /apiKey|Authorization|x-api-key|Bearer/i, `${fileName} must not handle credentials in browser code`);
    assert.doesNotMatch(source, /\bfetch\s*\(/, `${fileName} must use the local trusted transport, not direct fetch`);
  }

  assert.match(providerSources.find((item) => item.fileName === "openaiProvider.ts")?.source ?? "", /openai\.chatCompletions/);
  assert.match(providerSources.find((item) => item.fileName === "anthropicProvider.ts")?.source ?? "", /anthropic\.messages/);
  assert.match(providerSources.find((item) => item.fileName === "nativeA2AProvider.ts")?.source ?? "", /new A2AClient/);
  assert.match(providerSources.find((item) => item.fileName === "a2aClient.ts")?.source ?? "", /a2a\.messageSend/);
  assert.match(providerSources.find((item) => item.fileName === "a2aClient.ts")?.source ?? "", /commandJson/);
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
