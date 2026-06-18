import type { A2AAgentCard, A2ATask } from "../domain/a2a";
import type { AgentInstance, Project } from "../domain/types";
import type { AgentHttpTransport } from "./agentHttpTransport";
import { AnthropicProvider } from "./anthropicProvider";
import { NativeA2AProvider } from "./nativeA2AProvider";
import { OpenAIProvider } from "./openaiProvider";
import {
  createSyntheticAgentCard,
  type ChatHistoryMessage,
  type ProviderAdapter,
  type ProviderConnectionTestResult,
} from "./providerTypes";

export type ProviderRouterOptions = {
  agent: AgentInstance;
  timeoutMs: number;
  transport: AgentHttpTransport;
  providers?: Partial<ProviderRouterProviderSet>;
};

export type ProviderRouterProviderSet = {
  nativeA2A: NativeA2AProviderAdapter;
  openAI: ProviderAdapter;
  hermesCompatibility: ProviderAdapter;
  anthropic: ProviderAdapter;
};

export type NativeA2AProviderAdapter = ProviderAdapter & {
  getAgentCard(): Promise<A2AAgentCard>;
  getProjectTask(taskId: string, contextId: string): Promise<A2ATask>;
  cancelProjectTask(taskId: string, contextId: string): Promise<A2ATask>;
};

export class ProviderRouter {
  private agent: AgentInstance;
  private nativeA2AProvider: NativeA2AProviderAdapter;
  private openAIProvider: ProviderAdapter;
  private hermesCompatibilityProvider: ProviderAdapter;
  private anthropicProvider: ProviderAdapter;

  constructor({ agent, timeoutMs, transport, providers = {} }: ProviderRouterOptions) {
    this.agent = agent;
    this.nativeA2AProvider = providers.nativeA2A ?? new NativeA2AProvider({
      agent,
      timeoutMs,
      transport,
    });
    this.openAIProvider = providers.openAI ?? new OpenAIProvider({
      agent,
      timeoutMs,
      transport,
    });
    this.hermesCompatibilityProvider = providers.hermesCompatibility ?? new OpenAIProvider({
      agent,
      timeoutMs,
      transport,
      mode: "hermes-adapter",
      adapterName: "hermes-openai-compatible",
      providerLabel: "Hermes",
    });
    this.anthropicProvider = providers.anthropic ?? new AnthropicProvider({
      agent,
      timeoutMs,
      transport,
    });
  }

  async getAgentCard(): Promise<A2AAgentCard> {
    try {
      return await this.nativeA2AProvider.getAgentCard();
    } catch {
      return createSyntheticAgentCard(this.agent);
    }
  }

  async testConnection(): Promise<ProviderConnectionTestResult> {
    const runtimeProvider = this.runtimeProvider();
    if (runtimeProvider === "openai") {
      return this.openAIProvider.testConnection();
    }

    if (runtimeProvider === "anthropic") {
      return this.anthropicProvider.testConnection();
    }

    try {
      return await this.nativeA2AProvider.testConnection();
    } catch {
      return this.hermesCompatibilityProvider.testConnection();
    }
  }

  async sendProjectMessage(project: Project, text: string, history: ChatHistoryMessage[] = []): Promise<A2ATask> {
    const runtimeProvider = this.runtimeProvider();
    if (runtimeProvider === "openai") {
      return this.openAIProvider.sendProjectMessage(project, text, history);
    }

    if (runtimeProvider === "anthropic") {
      return this.anthropicProvider.sendProjectMessage(project, text, history);
    }

    try {
      return await this.nativeA2AProvider.sendProjectMessage(project, text, history);
    } catch {
      return this.hermesCompatibilityProvider.sendProjectMessage(project, text, history);
    }
  }

  async sendFreeChatMessage(text: string, history: ChatHistoryMessage[] = []): Promise<A2ATask> {
    const runtimeProvider = this.runtimeProvider();
    if (runtimeProvider === "openai") {
      return this.openAIProvider.sendFreeChatMessage(text, history);
    }

    if (runtimeProvider === "anthropic") {
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
