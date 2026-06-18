import type { A2ATask } from "../domain/a2a";
import type { AgentInstance, Project } from "../domain/types";
import type { AgentHttpTransport } from "./agentHttpTransport";
import {
  createCompletedTextTask,
  createSyntheticAgentCard,
  getFreeChatContextId,
  getProjectSystemContent,
  type ChatHistoryMessage,
  type ProviderConnectionMode,
  type ProviderConnectionTestResult,
  type ProviderMessageRequest,
} from "./providerTypes";

export class OpenAIProvider {
  private agent: AgentInstance;
  private timeoutMs: number;
  private transport: AgentHttpTransport;
  private mode: Extract<ProviderConnectionMode, "openai-compatible" | "hermes-adapter">;
  private adapterName: "openai-compatible" | "hermes-openai-compatible";
  private providerLabel: string;

  constructor({
    agent,
    timeoutMs,
    transport,
    mode = "openai-compatible",
    adapterName = "openai-compatible",
    providerLabel = "OpenAI",
  }: {
    agent: AgentInstance;
    timeoutMs: number;
    transport: AgentHttpTransport;
    mode?: Extract<ProviderConnectionMode, "openai-compatible" | "hermes-adapter">;
    adapterName?: "openai-compatible" | "hermes-openai-compatible";
    providerLabel?: string;
  }) {
    this.agent = agent;
    this.timeoutMs = timeoutMs;
    this.transport = transport;
    this.mode = mode;
    this.adapterName = adapterName;
    this.providerLabel = providerLabel;
  }

  async testConnection(): Promise<ProviderConnectionTestResult> {
    await this.validateChat();
    return {
      card: createSyntheticAgentCard(this.agent, this.providerLabel),
      mode: this.mode,
    };
  }

  async sendProjectMessage(project: Project, text: string, history: ChatHistoryMessage[] = []): Promise<A2ATask> {
    return this.sendChatCompletionAsTask({
      contextId: project.namespace,
      text,
      history,
      systemContent: getProjectSystemContent(project),
      metadata: {
        adapter: this.adapterName,
        responseKind: "direct-message",
        projectId: project.id,
      },
    });
  }

  async sendFreeChatMessage(text: string, history: ChatHistoryMessage[] = []): Promise<A2ATask> {
    return this.sendChatCompletionAsTask({
      contextId: getFreeChatContextId(this.agent),
      text,
      history,
      systemContent: "Context: Vibe Office Free Chat.",
      metadata: {
        adapter: this.adapterName,
        responseKind: "free-chat",
      },
    });
  }

  private async sendChatCompletionAsTask({
    contextId,
    text,
    history,
    systemContent,
    metadata,
  }: ProviderMessageRequest): Promise<A2ATask> {
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
    }>(
      toOpenAIChatCompletionsUrl(this.agent.endpoint),
      {
        method: "POST",
        headers: this.buildHeaders(true),
        body: JSON.stringify({
          model: this.agent.model,
          messages,
        }),
      },
      {
        timeoutMs: this.timeoutMs,
        timeoutMessage: "Agent did not respond before the timeout.",
        failurePrefix: "OpenAI chat failed",
        agentId: this.agent.id,
      },
    );
    const content = payload.choices?.[0]?.message?.content ?? "OpenAI provider returned an empty response.";

    return createCompletedTextTask({ contextId, content, metadata });
  }

  private async validateChat() {
    await this.transport.requestJson<unknown>(
      toOpenAIChatCompletionsUrl(this.agent.endpoint),
      {
        method: "POST",
        headers: this.buildHeaders(true),
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
      },
      {
        timeoutMs: this.timeoutMs,
        timeoutMessage: "Agent connection test timed out.",
        failurePrefix: "OpenAI chat auth failed",
        agentId: this.agent.id,
      },
    );
  }

  private buildHeaders(isJson: boolean) {
    const headers: Record<string, string> = {
      Accept: "application/json",
    };

    if (isJson) {
      headers["Content-Type"] = "application/json";
    }

    return headers;
  }
}

export function toOpenAIChatCompletionsUrl(endpoint: string) {
  const trimmed = endpoint.trim().replace(/\/+$/, "");
  if (/\/chat\/completions$/i.test(trimmed)) return trimmed;
  return `${trimmed}/chat/completions`;
}
