import type { A2ATask } from "../domain/a2a";
import type { AgentInstance, Project } from "../domain/types";
import { createBrowserAgentHttpTransport, type AgentHttpTransport } from "./agentHttpTransport";
import { AnthropicProvider } from "./anthropicProvider";
import { NativeA2AProvider, shouldUseNativeA2A } from "./nativeA2AProvider";
import { OpenAIProvider } from "./openaiProvider";
import {
  createSyntheticAgentCard,
  type ChatHistoryMessage,
  type ProviderConnectionMode,
  type ProviderConnectionTestResult,
} from "./providerTypes";

export type { ChatHistoryMessage } from "./providerTypes";

export type HermesA2AAdapterOptions = {
  agent: AgentInstance;
  apiKey?: string;
  transport?: AgentHttpTransport;
};

export type HermesConnectionTestResult = ProviderConnectionTestResult;

export type A2ACompatibilityMetadata = Pick<
  AgentInstance,
  | "a2aLastCompatibilityCheckAt"
  | "a2aProtocolVersion"
  | "a2aSelectedInterface"
  | "a2aSupportedInterfaces"
  | "a2aTransportBinding"
  | "supportsCancel"
  | "supportsTaskLifecycle"
>;

export class HermesA2AAdapter {
  private agent: AgentInstance;
  private nativeA2AProvider: NativeA2AProvider;
  private openAIProvider: OpenAIProvider;
  private hermesCompatibilityProvider: OpenAIProvider;
  private anthropicProvider: AnthropicProvider;

  constructor(options: HermesA2AAdapterOptions) {
    this.agent = options.agent;
    const timeoutMs = (options.agent.timeoutSeconds ?? 60) * 1000;
    const transport = options.transport ?? createBrowserAgentHttpTransport();

    this.nativeA2AProvider = new NativeA2AProvider({
      agent: options.agent,
      apiKey: options.apiKey,
      timeoutMs,
      transport,
      useA2AVersionHeader: shouldUseNativeA2A(options.agent),
    });
    this.openAIProvider = new OpenAIProvider({
      agent: options.agent,
      timeoutMs,
      transport,
    });
    this.hermesCompatibilityProvider = new OpenAIProvider({
      agent: options.agent,
      timeoutMs,
      transport,
      mode: "hermes-adapter",
      adapterName: "hermes-openai-compatible",
      providerLabel: "Hermes",
    });
    this.anthropicProvider = new AnthropicProvider({
      agent: options.agent,
      timeoutMs,
      transport,
    });
  }

  async getAgentCard() {
    try {
      return await this.nativeA2AProvider.getAgentCard(this.agent.agentCardUrl);
    } catch {
      return createSyntheticAgentCard(this.agent);
    }
  }

  async testConnection(): Promise<HermesConnectionTestResult> {
    if (this.runtimeProvider() === "openai") {
      return this.openAIProvider.testConnection();
    }

    if (this.runtimeProvider() === "anthropic") {
      return this.anthropicProvider.testConnection();
    }

    try {
      return await this.nativeA2AProvider.testConnection();
    } catch {
      return this.hermesCompatibilityProvider.testConnection();
    }
  }

  async sendProjectMessage(project: Project, text: string, history: ChatHistoryMessage[] = []) {
    if (this.runtimeProvider() === "openai") {
      return this.openAIProvider.sendProjectMessage(project, text, history);
    }

    if (this.runtimeProvider() === "anthropic") {
      return this.anthropicProvider.sendProjectMessage(project, text, history);
    }

    try {
      return await this.nativeA2AProvider.sendProjectMessage(project, text, history);
    } catch {
      return this.hermesCompatibilityProvider.sendProjectMessage(project, text, history);
    }
  }

  async sendFreeChatMessage(text: string, history: ChatHistoryMessage[] = []) {
    if (this.runtimeProvider() === "openai") {
      return this.openAIProvider.sendFreeChatMessage(text, history);
    }

    if (this.runtimeProvider() === "anthropic") {
      return this.anthropicProvider.sendFreeChatMessage(text, history);
    }

    try {
      return await this.nativeA2AProvider.sendFreeChatMessage(text, history);
    } catch {
      return this.hermesCompatibilityProvider.sendFreeChatMessage(text, history);
    }
  }

  async getProjectTask(taskId: string, contextId: string): Promise<A2ATask> {
    return this.nativeA2AProvider.getProjectTask(taskId, contextId);
  }

  async cancelProjectTask(taskId: string, contextId: string): Promise<A2ATask> {
    return this.nativeA2AProvider.cancelProjectTask(taskId, contextId);
  }

  private runtimeProvider() {
    return this.agent.runtimeProvider ?? "hermes";
  }
}

export function createA2ACompatibilityMetadata(result: HermesConnectionTestResult): A2ACompatibilityMetadata {
  const nativeA2A = result.mode === "native-a2a";
  const providerInterfaces: Record<ProviderConnectionMode, string[]> = {
    "native-a2a": ["message/send", "tasks/get", "tasks/cancel"],
    "hermes-adapter": ["chat/completions"],
    "openai-compatible": ["chat/completions"],
    "anthropic-compatible": ["messages"],
  };
  const providerTransport: Record<ProviderConnectionMode, string> = {
    "native-a2a": "json-rpc/http",
    "hermes-adapter": "hermes-compatible-http",
    "openai-compatible": "openai-compatible-http",
    "anthropic-compatible": "anthropic-compatible-http",
  };
  const providerSelectedInterface: Record<ProviderConnectionMode, string> = {
    "native-a2a": "message/send + tasks/get",
    "hermes-adapter": "Hermes compatibility",
    "openai-compatible": "OpenAI chat completions",
    "anthropic-compatible": "Anthropic messages",
  };

  return {
    a2aProtocolVersion: result.card.protocolVersion ?? (nativeA2A ? "unknown" : "compatibility"),
    a2aTransportBinding: providerTransport[result.mode],
    a2aSupportedInterfaces: providerInterfaces[result.mode],
    a2aSelectedInterface: providerSelectedInterface[result.mode],
    a2aLastCompatibilityCheckAt: new Date().toISOString(),
    supportsTaskLifecycle: nativeA2A,
    supportsCancel: nativeA2A ? undefined : false,
  };
}
