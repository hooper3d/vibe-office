import type { A2AAgentCard, A2ATask } from "../domain/a2a";
import type { AgentInstance, Project } from "../domain/types";
import type { AgentHttpTransport } from "./agentHttpTransport";
import { AnthropicProvider } from "./anthropicProvider";
import { NativeA2AProvider, shouldUseNativeA2A } from "./nativeA2AProvider";
import { OpenAIProvider } from "./openaiProvider";
import {
  createSyntheticAgentCard,
  type ChatHistoryMessage,
  type ProviderConnectionTestResult,
} from "./providerTypes";

export type ProviderRouterOptions = {
  agent: AgentInstance;
  timeoutMs: number;
  transport: AgentHttpTransport;
};

export class ProviderRouter {
  private agent: AgentInstance;
  private nativeA2AProvider: NativeA2AProvider;
  private openAIProvider: OpenAIProvider;
  private hermesCompatibilityProvider: OpenAIProvider;
  private anthropicProvider: AnthropicProvider;

  constructor({ agent, timeoutMs, transport }: ProviderRouterOptions) {
    this.agent = agent;
    this.nativeA2AProvider = new NativeA2AProvider({
      agent,
      timeoutMs,
      transport,
      useA2AVersionHeader: shouldUseNativeA2A(agent),
    });
    this.openAIProvider = new OpenAIProvider({
      agent,
      timeoutMs,
      transport,
    });
    this.hermesCompatibilityProvider = new OpenAIProvider({
      agent,
      timeoutMs,
      transport,
      mode: "hermes-adapter",
      adapterName: "hermes-openai-compatible",
      providerLabel: "Hermes",
    });
    this.anthropicProvider = new AnthropicProvider({
      agent,
      timeoutMs,
      transport,
    });
  }

  async getAgentCard(): Promise<A2AAgentCard> {
    try {
      return await this.nativeA2AProvider.getAgentCard(this.agent.agentCardUrl);
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
