import type {
  A2AAgentCard,
  A2AJsonRpcRequest,
  A2AJsonRpcResponse,
  A2AMessage,
  A2ASendMessageParams,
  A2ATask,
} from "../domain/a2a";
import { createBrowserAgentHttpTransport, type AgentHttpTransport } from "./agentHttpTransport";

export type A2AClientOptions = {
  endpoint: string;
  agentId?: string;
  apiKey?: string;
  protocolVersion?: string;
  timeoutMs?: number;
  useA2AVersionHeader?: boolean;
  transport?: AgentHttpTransport;
};

export class A2AClient {
  private endpoint: string;
  private agentId?: string;
  private apiKey?: string;
  private protocolVersion?: string;
  private timeoutMs: number;
  private useA2AVersionHeader: boolean;
  private transport: AgentHttpTransport;

  constructor(options: A2AClientOptions) {
    this.endpoint = options.endpoint.replace(/\/$/, "");
    this.agentId = options.agentId;
    this.apiKey = options.apiKey;
    this.protocolVersion = options.protocolVersion;
    this.timeoutMs = options.timeoutMs ?? 60_000;
    this.useA2AVersionHeader = Boolean(options.useA2AVersionHeader && options.protocolVersion);
    this.transport = options.transport ?? createBrowserAgentHttpTransport();
  }

  async getAgentCard(agentCardUrl = `${this.endpoint}/.well-known/agent-card.json`) {
    const response = await this.transport.request(agentCardUrl, {
      headers: this.buildHeaders(false),
    }, {
      timeoutMs: this.timeoutMs,
      timeoutMessage: "Provider capability request timed out.",
      agentId: this.agentId,
    });

    if (!response.ok) {
      throw new Error(`Unable to load provider capabilities: ${response.status}`);
    }

    return (await response.json()) as A2AAgentCard;
  }

  async sendMessage(message: A2AMessage, metadata?: Record<string, unknown>) {
    return this.rpc<A2ASendMessageParams, A2ATask>("message/send", {
      message,
      configuration: {
        acceptedOutputModes: ["text/plain", "application/json"],
        blocking: false,
        historyLength: 0,
      },
      metadata,
    });
  }

  async getTask(taskId: string, contextId: string) {
    return this.rpc<{ id: string; contextId: string }, A2ATask>("tasks/get", {
      id: taskId,
      contextId,
    });
  }

  async cancelTask(taskId: string, contextId: string) {
    return this.rpc<{ id: string; contextId: string }, A2ATask>("tasks/cancel", {
      id: taskId,
      contextId,
    });
  }

  private async rpc<TParams, TResult>(method: string, params: TParams) {
    const request: A2AJsonRpcRequest<TParams> = {
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
      method,
      params,
    };

    const response = await this.transport.request(this.endpoint, {
      method: "POST",
      headers: this.buildHeaders(true),
      body: JSON.stringify(request),
    }, {
      timeoutMs: this.timeoutMs,
      timeoutMessage: "Agent task request timed out.",
      agentId: this.agentId,
    });

    if (!response.ok) {
      throw new Error(`Agent task request failed: ${response.status}`);
    }

    const payload = (await response.json()) as A2AJsonRpcResponse<TResult>;
    if (payload.error) {
      throw new Error(payload.error.message);
    }

    if (!payload.result) {
      throw new Error("Agent response did not include a result.");
    }

    return payload.result;
  }

  private buildHeaders(isJsonRpc: boolean) {
    const headers: Record<string, string> = {
      Accept: "application/json",
    };

    if (isJsonRpc) {
      headers["Content-Type"] = "application/json";
    }

    if (this.apiKey && !this.agentId) {
      headers.Authorization = `Bearer ${this.apiKey}`;
    }

    if (this.useA2AVersionHeader && this.protocolVersion) {
      headers["A2A-Version"] = this.protocolVersion;
    }

    return headers;
  }
}
