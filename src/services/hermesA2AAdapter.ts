import type { A2ATask } from "../domain/a2a";
import type { AgentInstance, Project } from "../domain/types";
import { createBrowserAgentHttpTransport, type AgentHttpTransport } from "./agentHttpTransport";
import { ProviderRouter } from "./providerRouter";
import { type ChatHistoryMessage, type ProviderConnectionTestResult } from "./providerTypes";

export { createA2ACompatibilityMetadata } from "./providerTypes";
export type { A2ACompatibilityMetadata, ChatHistoryMessage } from "./providerTypes";

export type HermesA2AAdapterOptions = {
  agent: AgentInstance;
  transport?: AgentHttpTransport;
};

export type HermesConnectionTestResult = ProviderConnectionTestResult;

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
