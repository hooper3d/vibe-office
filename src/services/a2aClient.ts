import type {
  A2AAgentCard,
  A2AJsonRpcRequest,
  A2AJsonRpcResponse,
  A2AMessage,
  A2ASendMessageParams,
  A2ATask,
} from "../domain/a2a";

export type A2AClientOptions = {
  endpoint: string;
  apiKey?: string;
  protocolVersion?: string;
  timeoutMs?: number;
  useA2AVersionHeader?: boolean;
};

export class A2AClient {
  private endpoint: string;
  private apiKey?: string;
  private protocolVersion?: string;
  private timeoutMs: number;
  private useA2AVersionHeader: boolean;

  constructor(options: A2AClientOptions) {
    this.endpoint = options.endpoint.replace(/\/$/, "");
    this.apiKey = options.apiKey;
    this.protocolVersion = options.protocolVersion;
    this.timeoutMs = options.timeoutMs ?? 60_000;
    this.useA2AVersionHeader = Boolean(options.useA2AVersionHeader && options.protocolVersion);
  }

  async getAgentCard(agentCardUrl = `${this.endpoint}/.well-known/agent-card.json`) {
    const response = await fetchWithTimeout(toHermesProxyUrl(agentCardUrl), {
      headers: this.buildHeaders(false),
    }, this.timeoutMs, "A2A Agent Card request timed out.");

    if (!response.ok) {
      throw new Error(`Unable to load A2A Agent Card: ${response.status}`);
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

    const response = await fetchWithTimeout(toHermesProxyUrl(this.endpoint), {
      method: "POST",
      headers: this.buildHeaders(true),
      body: JSON.stringify(request),
    }, this.timeoutMs, `A2A ${method} request timed out.`);

    if (!response.ok) {
      throw new Error(`A2A request failed: ${response.status}`);
    }

    const payload = (await response.json()) as A2AJsonRpcResponse<TResult>;
    if (payload.error) {
      throw new Error(payload.error.message);
    }

    if (!payload.result) {
      throw new Error("A2A response did not include a result.");
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

    if (this.apiKey) {
      headers.Authorization = `Bearer ${this.apiKey}`;
    }

    if (this.useA2AVersionHeader && this.protocolVersion) {
      headers["A2A-Version"] = this.protocolVersion;
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
