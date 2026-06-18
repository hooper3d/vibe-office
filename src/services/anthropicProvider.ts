import type { A2ATask } from "../domain/a2a";
import type { AgentInstance, Project } from "../domain/types";
import type { AgentHttpTransport } from "./agentHttpTransport";
import {
  createCompletedTextTask,
  createSyntheticAgentCard,
  getFreeChatContextId,
  getProjectSystemContent,
  type ChatHistoryMessage,
  type ProviderConnectionTestResult,
  type ProviderMessageRequest,
} from "./providerTypes";

export class AnthropicProvider {
  private agent: AgentInstance;
  private timeoutMs: number;
  private transport: AgentHttpTransport;

  constructor({ agent, timeoutMs, transport }: { agent: AgentInstance; timeoutMs: number; transport: AgentHttpTransport }) {
    this.agent = agent;
    this.timeoutMs = timeoutMs;
    this.transport = transport;
  }

  async testConnection(): Promise<ProviderConnectionTestResult> {
    await this.validateMessages();
    return {
      card: createSyntheticAgentCard(this.agent, "Anthropic"),
      mode: "anthropic-compatible",
    };
  }

  async sendProjectMessage(project: Project, text: string, history: ChatHistoryMessage[] = []): Promise<A2ATask> {
    return this.sendMessagesAsTask({
      contextId: project.namespace,
      text,
      history,
      systemContent: getProjectSystemContent(project),
      metadata: {
        adapter: "anthropic-compatible",
        responseKind: "direct-message",
        projectId: project.id,
      },
    });
  }

  async sendFreeChatMessage(text: string, history: ChatHistoryMessage[] = []): Promise<A2ATask> {
    return this.sendMessagesAsTask({
      contextId: getFreeChatContextId(this.agent),
      text,
      history,
      systemContent: "Context: Vibe Office Free Chat.",
      metadata: {
        adapter: "anthropic-compatible",
        responseKind: "free-chat",
      },
    });
  }

  private async sendMessagesAsTask({
    contextId,
    text,
    history,
    systemContent,
    metadata,
  }: ProviderMessageRequest): Promise<A2ATask> {
    const payload = await this.transport.commandJson<{
      content?: Array<{
        type?: string;
        text?: string;
        thinking?: string;
      }>;
    }>(
      {
        agentId: this.agent.id,
        command: "anthropic.messages",
        payload: {
          ...(systemContent ? { system: systemContent } : {}),
          maxTokens: 4096,
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
        },
      },
      {
        timeoutMs: this.timeoutMs,
        timeoutMessage: "Agent did not respond before the timeout.",
        failurePrefix: "Anthropic message failed",
        agentId: this.agent.id,
      },
    );
    const content =
      payload.content
        ?.filter((part) => part.type === "text" && typeof part.text === "string")
        .map((part) => part.text)
        .join("\n\n")
        .trim() || "Anthropic provider returned an empty response.";

    return createCompletedTextTask({ contextId, content, metadata });
  }

  private async validateMessages() {
    await this.transport.commandJson<unknown>(
      {
        agentId: this.agent.id,
        command: "anthropic.messages",
        payload: {
          maxTokens: 8,
          messages: [
            {
              role: "user",
              content: "Reply with exactly: ok",
            },
          ],
        },
      },
      {
        timeoutMs: this.timeoutMs,
        timeoutMessage: "Agent connection test timed out.",
        failurePrefix: "Anthropic message auth failed",
        agentId: this.agent.id,
      },
    );
  }

}

export function toAnthropicMessagesUrl(endpoint: string) {
  const trimmed = endpoint.trim().replace(/\/+$/, "");
  if (/\/messages$/i.test(trimmed)) return trimmed;
  if (/\/v1$/i.test(trimmed)) return `${trimmed}/messages`;
  return `${trimmed}/v1/messages`;
}
