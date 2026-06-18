export type AgentHttpTransport = {
  request(url: string, init: RequestInit, options: AgentHttpRequestOptions): Promise<Response>;
  requestJson<T>(url: string, init: RequestInit, options: AgentHttpRequestOptions): Promise<T>;
  commandJson<T>(command: LocalTrustedProviderCommand, options: AgentHttpRequestOptions): Promise<T>;
};

export type AgentHttpRequestOptions = {
  timeoutMs: number;
  timeoutMessage: string;
  failurePrefix?: string;
  agentId?: string;
};

export type LocalTrustedProviderRequestBody = {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
  agentId?: string;
};

export type LocalTrustedProviderCommand =
  | {
      agentId: string;
      command: "openai.chatCompletions";
      payload: {
        messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
        maxTokens?: number;
      };
    }
  | {
      agentId: string;
      command: "anthropic.messages";
      payload: {
        system?: string;
        messages: Array<{ role: "user" | "assistant"; content: string }>;
        maxTokens?: number;
      };
    };

export function createBrowserAgentHttpTransport(): AgentHttpTransport {
  return {
    async request(url: string, init: RequestInit, options: AgentHttpRequestOptions) {
      return fetchWithTimeout("/agent-local/request", createLocalTrustedProviderRequest(url, init, options), options.timeoutMs, options.timeoutMessage);
    },
    async requestJson<T>(url: string, init: RequestInit, options: AgentHttpRequestOptions) {
      const response = await fetchWithTimeout("/agent-local/request", createLocalTrustedProviderRequest(url, init, options), options.timeoutMs, options.timeoutMessage);

      if (!response.ok) {
        throw new Error(`${options.failurePrefix ?? "Agent request failed"}: ${response.status}${await readErrorSuffix(response)}`);
      }

      return (await response.json()) as T;
    },
    async commandJson<T>(command: LocalTrustedProviderCommand, options: AgentHttpRequestOptions) {
      const response = await fetchWithTimeout("/agent-local/command", createLocalTrustedProviderCommandRequest(command), options.timeoutMs, options.timeoutMessage);

      if (!response.ok) {
        throw new Error(`${options.failurePrefix ?? "Agent command failed"}: ${response.status}${await readErrorSuffix(response)}`);
      }

      return (await response.json()) as T;
    },
  };
}

export function createLocalTrustedProviderCommandRequest(command: LocalTrustedProviderCommand): RequestInit {
  return {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
  };
}

export function createLocalTrustedProviderRequest(url: string, init: RequestInit, options: Pick<AgentHttpRequestOptions, "agentId"> = {}): RequestInit {
  return {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(toLocalTrustedProviderRequestBody(url, init, options)),
  };
}

export function toLocalTrustedProviderRequestBody(url: string, init: RequestInit, options: Pick<AgentHttpRequestOptions, "agentId"> = {}): LocalTrustedProviderRequestBody {
  return {
    url,
    method: init.method ?? "GET",
    headers: normalizeRequestHeaders(init.headers),
    body: typeof init.body === "string" ? init.body : undefined,
    agentId: options.agentId,
  };
}

export function toLocalTrustedProxyUrl(url: string) {
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

function normalizeRequestHeaders(headers: RequestInit["headers"]) {
  const normalized: Record<string, string> = {};
  if (!headers) return normalized;

  if (headers instanceof Headers) {
    headers.forEach((value, key) => {
      normalized[key] = value;
    });
    return normalized;
  }

  if (Array.isArray(headers)) {
    headers.forEach(([key, value]) => {
      normalized[key] = value;
    });
    return normalized;
  }

  Object.entries(headers).forEach(([key, value]) => {
    normalized[key] = String(value);
  });
  return normalized;
}

export async function readErrorSuffix(response: Response) {
  try {
    const payload = (await response.json()) as { error?: { message?: string } };
    return payload.error?.message ? `: ${payload.error.message}` : "";
  } catch {
    return "";
  }
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number, timeoutMessage: string) {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);

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
    globalThis.clearTimeout(timeout);
  }
}
