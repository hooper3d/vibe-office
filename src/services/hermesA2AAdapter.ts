import type { A2ATask } from "../domain/a2a";
import type { AgentInstance, Project } from "../domain/types";
import { createBrowserAgentHttpTransport, type AgentHttpTransport } from "./agentHttpTransport";
import { ProviderRouter } from "./providerRouter";
import {
  type ChatHistoryMessage,
  type ProviderConnectionMode,
  type ProviderConnectionTestResult,
} from "./providerTypes";

export type { ChatHistoryMessage } from "./providerTypes";

export type HermesA2AAdapterOptions = {
  agent: AgentInstance;
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
  private providerRouter: ProviderRouter;

  constructor(options: HermesA2AAdapterOptions) {
    const timeoutMs = (options.agent.timeoutSeconds ?? 60) * 1000;
    const transport = options.transport ?? createBrowserAgentHttpTransport();

    this.providerRouter = new ProviderRouter({
      agent: options.agent,
      timeoutMs,
      transport,
    });
  }

  async getAgentCard() {
    return this.providerRouter.getAgentCard();
  }

  async testConnection(): Promise<HermesConnectionTestResult> {
    return this.providerRouter.testConnection();
  }

  async sendProjectMessage(project: Project, text: string, history: ChatHistoryMessage[] = []) {
    return this.providerRouter.sendProjectMessage(project, text, history);
  }

  async sendFreeChatMessage(text: string, history: ChatHistoryMessage[] = []) {
    return this.providerRouter.sendFreeChatMessage(text, history);
  }

  async getProjectTask(taskId: string, contextId: string): Promise<A2ATask> {
    return this.providerRouter.getProjectTask(taskId, contextId);
  }

  async cancelProjectTask(taskId: string, contextId: string): Promise<A2ATask> {
    return this.providerRouter.cancelProjectTask(taskId, contextId);
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
