import type { A2AAgentCard, A2AMessage, A2ATask } from "../domain/a2a";
import type { AgentInstance, Project } from "../domain/types";
import { A2AClient } from "./a2aClient";
import type { AgentHttpTransport } from "./agentHttpTransport";
import { getFreeChatContextId, type ChatHistoryMessage, type ProviderAdapter, type ProviderConnectionTestResult } from "./providerTypes";

export class NativeA2AProvider implements ProviderAdapter {
  private agent: AgentInstance;
  private client: A2AClient;

  constructor({
    agent,
    timeoutMs,
    transport,
  }: {
    agent: AgentInstance;
    timeoutMs: number;
    transport: AgentHttpTransport;
  }) {
    this.agent = agent;
    this.client = new A2AClient({
      agentId: agent.id,
      timeoutMs,
      transport,
    });
  }

  async getAgentCard(): Promise<A2AAgentCard> {
    return this.client.getAgentCard();
  }

  async testConnection(): Promise<ProviderConnectionTestResult> {
    return {
      card: await this.getAgentCard(),
      mode: "native-a2a",
    };
  }

  async sendProjectMessage(project: Project, text: string, _history: ChatHistoryMessage[] = []): Promise<A2ATask> {
    const message: A2AMessage = {
      messageId: crypto.randomUUID(),
      role: "user",
      contextId: project.namespace,
      parts: [
        {
          kind: "text",
          text,
        },
      ],
      metadata: {
        projectId: project.id,
        namespace: project.namespace,
        routedBy: "vibe-office",
      },
    };

    return this.client.sendMessage(message, {
      projectId: project.id,
      namespace: project.namespace,
      targetAgentId: this.agent.id,
    });
  }

  async sendFreeChatMessage(text: string, _history: ChatHistoryMessage[] = []): Promise<A2ATask> {
    const contextId = getFreeChatContextId(this.agent);
    const message: A2AMessage = {
      messageId: crypto.randomUUID(),
      role: "user",
      contextId,
      parts: [
        {
          kind: "text",
          text,
        },
      ],
      metadata: {
        scope: "free-chat",
        appContext: "Vibe Office Free Chat",
        projectScope: "none",
        routedBy: "vibe-office",
        targetAgentId: this.agent.id,
      },
    };

    return this.client.sendMessage(message, {
      projectId: "free-chat",
      namespace: contextId,
      targetAgentId: this.agent.id,
    });
  }

  async getProjectTask(taskId: string, contextId: string) {
    return this.client.getTask(taskId, contextId);
  }

  async cancelProjectTask(taskId: string, contextId: string) {
    return this.client.cancelTask(taskId, contextId);
  }
}
