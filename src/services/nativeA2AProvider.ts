import type { A2AAgentCard, A2AMessage, A2ATask } from "../domain/a2a";
import type { AgentInstance, Project } from "../domain/types";
import { A2AClient } from "./a2aClient";
import type { AgentHttpTransport } from "./agentHttpTransport";
import { getFreeChatContextId, type ChatHistoryMessage, type ProviderConnectionTestResult } from "./providerTypes";

export class NativeA2AProvider {
  private agent: AgentInstance;
  private client: A2AClient;

  constructor({
    agent,
    apiKey,
    timeoutMs,
    transport,
    useA2AVersionHeader,
  }: {
    agent: AgentInstance;
    apiKey?: string;
    timeoutMs: number;
    transport: AgentHttpTransport;
    useA2AVersionHeader: boolean;
  }) {
    this.agent = agent;
    this.client = new A2AClient({
      endpoint: agent.a2aEndpoint,
      apiKey: apiKey ?? agent.apiKey,
      protocolVersion: useA2AVersionHeader ? agent.a2aProtocolVersion : undefined,
      timeoutMs,
      useA2AVersionHeader,
      transport,
    });
  }

  async getAgentCard(url = this.agent.agentCardUrl): Promise<A2AAgentCard> {
    return this.client.getAgentCard(url);
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

export function shouldUseNativeA2A(agent: AgentInstance) {
  return (
    (agent.runtimeProvider ?? "hermes") === "hermes" &&
    agent.a2aTransportBinding === "json-rpc/http" &&
    agent.a2aProtocolVersion !== "compatibility"
  );
}
