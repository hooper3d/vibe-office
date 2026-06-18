import type { A2AAgentCard, A2AMessage, A2ATask } from "../domain/a2a";
import type { AgentInstance, AgentRuntimeProvider, Project } from "../domain/types";
import { A2AClient } from "./a2aClient";
import { createBrowserAgentHttpTransport, type AgentHttpTransport } from "./agentHttpTransport";

export type ChatHistoryMessage = {
  role: "user" | "assistant";
  content: string;
};

export type HermesA2AAdapterOptions = {
  agent: AgentInstance;
  apiKey?: string;
  transport?: AgentHttpTransport;
};

export type HermesConnectionTestResult = {
  card: A2AAgentCard;
  mode: "native-a2a" | "hermes-adapter" | "openai-compatible" | "anthropic-compatible";
};

export class HermesA2AAdapter {
  private agent: AgentInstance;
  private client: A2AClient;
  private timeoutMs: number;
  private transport: AgentHttpTransport;

  constructor(options: HermesA2AAdapterOptions) {
    this.agent = options.agent;
    this.timeoutMs = (options.agent.timeoutSeconds ?? 60) * 1000;
    this.transport = options.transport ?? createBrowserAgentHttpTransport();
    const nativeA2A =
      this.runtimeProvider() === "hermes" &&
      options.agent.a2aTransportBinding === "json-rpc/http" &&
      options.agent.a2aProtocolVersion !== "compatibility";
    this.client = new A2AClient({
      endpoint: options.agent.a2aEndpoint,
      apiKey: options.apiKey ?? options.agent.apiKey,
      protocolVersion: nativeA2A ? options.agent.a2aProtocolVersion : undefined,
      timeoutMs: this.timeoutMs,
      useA2AVersionHeader: nativeA2A,
      transport: this.transport,
    });
  }

  async getAgentCard() {
    try {
      return await this.client.getAgentCard(this.agent.agentCardUrl);
    } catch {
      return this.getHermesBackedAgentCard();
    }
  }

  async testConnection(): Promise<HermesConnectionTestResult> {
    const provider = this.runtimeProvider();

    if (provider === "openai") {
      await this.validateOpenAIChat();
      return {
        card: await this.getHermesBackedAgentCard("OpenAI"),
        mode: "openai-compatible",
      };
    }

    if (provider === "anthropic") {
      await this.validateAnthropicMessages();
      return {
        card: await this.getHermesBackedAgentCard("Anthropic"),
        mode: "anthropic-compatible",
      };
    }

    try {
      return {
        card: await this.client.getAgentCard(this.agent.agentCardUrl),
        mode: "native-a2a",
      };
    } catch {
      await this.validateOpenAIChat();
      return {
        card: await this.getHermesBackedAgentCard("Hermes"),
        mode: "hermes-adapter",
      };
    }
  }

  async sendProjectMessage(project: Project, text: string, history: ChatHistoryMessage[] = []) {
    const provider = this.runtimeProvider();
    if (provider === "openai") {
      return this.sendOpenAIChatAsA2ATask(project, text, history);
    }
    if (provider === "anthropic") {
      return this.sendAnthropicMessagesAsA2ATask(project, text, history);
    }

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

    try {
      return await this.client.sendMessage(message, {
        projectId: project.id,
        namespace: project.namespace,
        targetAgentId: this.agent.id,
      });
    } catch {
      return this.sendHermesChatAsA2ATask(project, text, history);
    }
  }

  async sendFreeChatMessage(text: string, history: ChatHistoryMessage[] = []) {
    const contextId = `free-chat:${this.agent.id}`;
    const provider = this.runtimeProvider();
    if (provider === "openai") {
      return this.sendOpenAIChatAsFreeChatTask(contextId, text, history);
    }
    if (provider === "anthropic") {
      return this.sendAnthropicMessagesAsFreeChatTask(contextId, text, history);
    }

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

    try {
      return await this.client.sendMessage(message, {
        projectId: "free-chat",
        namespace: contextId,
        targetAgentId: this.agent.id,
      });
    } catch {
      return this.sendHermesChatAsFreeChatTask(contextId, text, history);
    }
  }

  async getProjectTask(taskId: string, contextId: string) {
    return this.client.getTask(taskId, contextId);
  }

  async cancelProjectTask(taskId: string, contextId: string) {
    return this.client.cancelTask(taskId, contextId);
  }

  private runtimeProvider(): AgentRuntimeProvider {
    return this.agent.runtimeProvider ?? "hermes";
  }

  private async getHermesBackedAgentCard(providerLabel = "Model-compatible"): Promise<A2AAgentCard> {
    return {
      name: this.agent.name,
      description: this.agent.role || providerLabel,
      url: this.agent.a2aEndpoint,
      version: "0.1.0",
      protocolVersion: "1.0",
      capabilities: {
        streaming: false,
        pushNotifications: false,
        stateTransitionHistory: true,
      },
      skills: this.agent.tags.map((tag) => ({
        id: tag,
        name: tag,
        tags: [tag],
      })),
    };
  }

  private async sendHermesChatAsA2ATask(project: Project, text: string, history: ChatHistoryMessage[]): Promise<A2ATask> {
    return this.sendOpenAIChatCompletionAsTask({
      contextId: project.namespace,
      text,
      history,
      systemContent: `Vibe Office project namespace: ${project.namespace}. Keep this task scoped to this project.`,
      metadata: {
        adapter: "hermes-openai-compatible",
        responseKind: "direct-message",
        projectId: project.id,
      },
    });
  }

  private async sendHermesChatAsFreeChatTask(contextId: string, text: string, history: ChatHistoryMessage[]): Promise<A2ATask> {
    return this.sendOpenAIChatCompletionAsTask({
      contextId,
      text,
      history,
      systemContent: "Context: Vibe Office Free Chat.",
      metadata: {
        adapter: "hermes-openai-compatible",
        responseKind: "free-chat",
      },
    });
  }

  private async sendOpenAIChatAsA2ATask(project: Project, text: string, history: ChatHistoryMessage[]): Promise<A2ATask> {
    return this.sendOpenAIChatCompletionAsTask({
      contextId: project.namespace,
      text,
      history,
      systemContent: `Vibe Office project namespace: ${project.namespace}. Keep this task scoped to this project.`,
      metadata: {
        adapter: "openai-compatible",
        responseKind: "direct-message",
        projectId: project.id,
      },
    });
  }

  private async sendOpenAIChatAsFreeChatTask(contextId: string, text: string, history: ChatHistoryMessage[]): Promise<A2ATask> {
    return this.sendOpenAIChatCompletionAsTask({
      contextId,
      text,
      history,
      systemContent: "Context: Vibe Office Free Chat.",
      metadata: {
        adapter: "openai-compatible",
        responseKind: "free-chat",
      },
    });
  }

  private async sendOpenAIChatCompletionAsTask({
    contextId,
    text,
    history,
    systemContent,
    metadata,
  }: {
    contextId: string;
    text: string;
    history: ChatHistoryMessage[];
    systemContent?: string;
    metadata: Record<string, unknown>;
  }): Promise<A2ATask> {
    const messages = [
      ...(systemContent
        ? [
            {
              role: "system",
              content: systemContent,
            },
          ]
        : []),
      ...history,
      {
        role: "user" as const,
        content: text,
      },
    ];
    const payload = await this.transport.requestJson<{
      choices?: Array<{
        message?: {
          content?: string;
        };
      }>;
    }>(toOpenAIChatCompletionsUrl(this.agent.endpoint), {
      method: "POST",
      headers: this.buildOpenAIHeaders(true),
      body: JSON.stringify({
        model: this.agent.model,
        messages,
      }),
    }, {
      timeoutMs: this.timeoutMs,
      timeoutMessage: "Agent did not respond before the timeout.",
      failurePrefix: "OpenAI chat failed",
    });
    const content = payload.choices?.[0]?.message?.content ?? "OpenAI provider returned an empty response.";
    const now = new Date().toISOString();

    return {
      id: crypto.randomUUID(),
      contextId,
      status: {
        state: "completed",
        timestamp: now,
        message: {
          messageId: crypto.randomUUID(),
          role: "agent",
          contextId,
          parts: [
            {
              kind: "text",
              text: content,
            },
          ],
        },
      },
      metadata,
    };
  }

  private async sendAnthropicMessagesAsA2ATask(project: Project, text: string, history: ChatHistoryMessage[]): Promise<A2ATask> {
    return this.sendAnthropicMessagesAsTask({
      contextId: project.namespace,
      text,
      history,
      systemContent: `Vibe Office project namespace: ${project.namespace}. Keep this task scoped to this project.`,
      metadata: {
        adapter: "anthropic-compatible",
        responseKind: "direct-message",
        projectId: project.id,
      },
    });
  }

  private async sendAnthropicMessagesAsFreeChatTask(contextId: string, text: string, history: ChatHistoryMessage[]): Promise<A2ATask> {
    return this.sendAnthropicMessagesAsTask({
      contextId,
      text,
      history,
      systemContent: "Context: Vibe Office Free Chat.",
      metadata: {
        adapter: "anthropic-compatible",
        responseKind: "free-chat",
      },
    });
  }

  private async sendAnthropicMessagesAsTask({
    contextId,
    text,
    history,
    systemContent,
    metadata,
  }: {
    contextId: string;
    text: string;
    history: ChatHistoryMessage[];
    systemContent?: string;
    metadata: Record<string, unknown>;
  }): Promise<A2ATask> {
    const payload = await this.transport.requestJson<{
      content?: Array<{
        type?: string;
        text?: string;
        thinking?: string;
      }>;
    }>(toAnthropicMessagesUrl(this.agent.endpoint), {
      method: "POST",
      headers: this.buildAnthropicHeaders(true),
      body: JSON.stringify({
        model: this.agent.model,
        max_tokens: 4096,
        ...(systemContent ? { system: systemContent } : {}),
        messages: [
          ...history.map((message) => ({
            role: message.role,
            content: message.content,
          })),
          {
            role: "user" as const,
            content: text,
          },
        ],
      }),
    }, {
      timeoutMs: this.timeoutMs,
      timeoutMessage: "Agent did not respond before the timeout.",
      failurePrefix: "Anthropic message failed",
    });
    const content =
      payload.content
        ?.filter((part) => part.type === "text" && typeof part.text === "string")
        .map((part) => part.text)
        .join("\n\n")
        .trim() || "Anthropic provider returned an empty response.";
    const now = new Date().toISOString();

    return {
      id: crypto.randomUUID(),
      contextId,
      status: {
        state: "completed",
        timestamp: now,
        message: {
          messageId: crypto.randomUUID(),
          role: "agent",
          contextId,
          parts: [
            {
              kind: "text",
              text: content,
            },
          ],
        },
      },
      metadata,
    };
  }

  private async validateOpenAIChat() {
    await this.transport.requestJson<unknown>(toOpenAIChatCompletionsUrl(this.agent.endpoint), {
      method: "POST",
      headers: this.buildOpenAIHeaders(true),
      body: JSON.stringify({
        model: this.agent.model,
        messages: [
          {
            role: "user",
            content: "Reply with exactly: ok",
          },
        ],
        max_tokens: 8,
      }),
    }, {
      timeoutMs: this.timeoutMs,
      timeoutMessage: "Agent connection test timed out.",
      failurePrefix: "OpenAI chat auth failed",
    });
  }

  private async validateAnthropicMessages() {
    await this.transport.requestJson<unknown>(toAnthropicMessagesUrl(this.agent.endpoint), {
      method: "POST",
      headers: this.buildAnthropicHeaders(true),
      body: JSON.stringify({
        model: this.agent.model,
        max_tokens: 8,
        messages: [
          {
            role: "user",
            content: "Reply with exactly: ok",
          },
        ],
      }),
    }, {
      timeoutMs: this.timeoutMs,
      timeoutMessage: "Agent connection test timed out.",
      failurePrefix: "Anthropic message auth failed",
    });
  }

  private buildOpenAIHeaders(isJson: boolean) {
    const headers: Record<string, string> = {
      Accept: "application/json",
    };

    if (isJson) {
      headers["Content-Type"] = "application/json";
    }

    if (this.agent.apiKey) {
      headers.Authorization = `Bearer ${this.agent.apiKey}`;
    }

    return headers;
  }

  private buildAnthropicHeaders(isJson: boolean) {
    const headers: Record<string, string> = {
      Accept: "application/json",
      "anthropic-version": "2023-06-01",
    };

    if (isJson) {
      headers["Content-Type"] = "application/json";
    }

    if (this.agent.apiKey) {
      headers["x-api-key"] = this.agent.apiKey;
      headers.Authorization = `Bearer ${this.agent.apiKey}`;
    }

    return headers;
  }
}

function toOpenAIChatCompletionsUrl(endpoint: string) {
  const trimmed = endpoint.trim().replace(/\/+$/, "");
  if (/\/chat\/completions$/i.test(trimmed)) return trimmed;
  return `${trimmed}/chat/completions`;
}

function toAnthropicMessagesUrl(endpoint: string) {
  const trimmed = endpoint.trim().replace(/\/+$/, "");
  if (/\/messages$/i.test(trimmed)) return trimmed;
  if (/\/v1$/i.test(trimmed)) return `${trimmed}/messages`;
  return `${trimmed}/v1/messages`;
}
