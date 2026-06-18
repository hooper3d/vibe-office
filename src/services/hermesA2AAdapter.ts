import type { A2AAgentCard, A2AMessage, A2ATask } from "../domain/a2a";
import type { AgentInstance, Project } from "../domain/types";
import { A2AClient } from "./a2aClient";

export type HermesA2AAdapterOptions = {
  agent: AgentInstance;
  apiKey?: string;
};

export type HermesConnectionTestResult = {
  card: A2AAgentCard;
  mode: "native-a2a" | "hermes-adapter";
};

export class HermesA2AAdapter {
  private agent: AgentInstance;
  private client: A2AClient;
  private timeoutMs: number;

  constructor(options: HermesA2AAdapterOptions) {
    this.agent = options.agent;
    this.timeoutMs = (options.agent.timeoutSeconds ?? 60) * 1000;
    const nativeA2A = options.agent.a2aTransportBinding === "json-rpc/http" && options.agent.a2aProtocolVersion !== "compatibility";
    this.client = new A2AClient({
      endpoint: options.agent.a2aEndpoint,
      apiKey: options.apiKey ?? options.agent.apiKey,
      protocolVersion: nativeA2A ? options.agent.a2aProtocolVersion : undefined,
      timeoutMs: this.timeoutMs,
      useA2AVersionHeader: nativeA2A,
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
    try {
      return {
        card: await this.client.getAgentCard(this.agent.agentCardUrl),
        mode: "native-a2a",
      };
    } catch {
      await this.validateHermesChat();
      return {
        card: await this.getHermesBackedAgentCard(),
        mode: "hermes-adapter",
      };
    }
  }

  async sendProjectMessage(project: Project, text: string) {
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
      return this.sendHermesChatAsA2ATask(project, text);
    }
  }

  async getProjectTask(taskId: string, contextId: string) {
    return this.client.getTask(taskId, contextId);
  }

  async cancelProjectTask(taskId: string, contextId: string) {
    return this.client.cancelTask(taskId, contextId);
  }

  private async getHermesBackedAgentCard(): Promise<A2AAgentCard> {
    return {
      name: this.agent.name,
      description: this.agent.role,
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

  private async sendHermesChatAsA2ATask(project: Project, text: string): Promise<A2ATask> {
    const response = await fetchWithTimeout(toHermesProxyUrl(`${this.agent.endpoint.replace(/\/$/, "")}/chat/completions`), {
      method: "POST",
      headers: this.buildHermesHeaders(true),
      body: JSON.stringify({
        model: this.agent.model,
        messages: [
          {
            role: "system",
            content: `Vibe Office project namespace: ${project.namespace}. Keep this task scoped to this project.`,
          },
          {
            role: "user",
            content: text,
          },
        ],
      }),
    }, this.timeoutMs, "Hermes chat completion timed out.");

    if (!response.ok) {
      throw new Error(`Hermes chat completion failed: ${response.status}${await readErrorSuffix(response)}`);
    }

    const payload = (await response.json()) as {
      choices?: Array<{
        message?: {
          content?: string;
        };
      }>;
    };
    const content = payload.choices?.[0]?.message?.content ?? "Hermes returned an empty response.";
    const now = new Date().toISOString();

    return {
      id: crypto.randomUUID(),
      contextId: project.namespace,
      status: {
        state: "completed",
        timestamp: now,
        message: {
          messageId: crypto.randomUUID(),
          role: "agent",
          contextId: project.namespace,
          parts: [
            {
              kind: "text",
              text: content,
            },
          ],
        },
      },
      metadata: {
        adapter: "hermes-openai-compatible",
        responseKind: "direct-message",
        projectId: project.id,
      },
    };
  }

  private async validateHermesChat() {
    const response = await fetchWithTimeout(toHermesProxyUrl(`${this.agent.endpoint.replace(/\/$/, "")}/chat/completions`), {
      method: "POST",
      headers: this.buildHermesHeaders(true),
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
    }, this.timeoutMs, "Hermes chat completion auth timed out.");

    if (!response.ok) {
      throw new Error(`Hermes chat completion auth failed: ${response.status}${await readErrorSuffix(response)}`);
    }
  }

  private hermesOrigin() {
    const endpoint = new URL(this.agent.endpoint);
    return `${endpoint.protocol}//${endpoint.host}`;
  }

  private buildHermesHeaders(isJson: boolean) {
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
}

function toHermesProxyUrl(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "127.0.0.1" && parsed.port === "8642") {
      return `/hermes-local${parsed.pathname}${parsed.search}`;
    }
    if (parsed.hostname === "hooper.ink") {
      return `/hermes-hooper${parsed.pathname}${parsed.search}`;
    }
  } catch {
    return url;
  }

  return url;
}

async function readErrorSuffix(response: Response) {
  try {
    const payload = (await response.json()) as { error?: { message?: string } };
    return payload.error?.message ? `: ${payload.error.message}` : "";
  } catch {
    return "";
  }
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number, timeoutMessage: string) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(timeoutMessage);
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}
