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
};

export class A2AClient {
  private endpoint: string;
  private apiKey?: string;

  constructor(options: A2AClientOptions) {
    this.endpoint = options.endpoint.replace(/\/$/, "");
    this.apiKey = options.apiKey;
  }

  async getAgentCard(agentCardUrl = `${this.endpoint}/.well-known/agent-card.json`) {
    const response = await fetch(toHermesProxyUrl(agentCardUrl), {
      headers: this.buildHeaders(false),
    });

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

  private async rpc<TParams, TResult>(method: string, params: TParams) {
    const request: A2AJsonRpcRequest<TParams> = {
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
      method,
      params,
    };

    const response = await fetch(toHermesProxyUrl(this.endpoint), {
      method: "POST",
      headers: this.buildHeaders(true),
      body: JSON.stringify(request),
    });

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

    return headers;
  }
}

function toHermesProxyUrl(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "127.0.0.1" && parsed.port === "8642") {
      return `/hermes-local${parsed.pathname}${parsed.search}`;
    }
  } catch {
    return url;
  }

  return url;
}
