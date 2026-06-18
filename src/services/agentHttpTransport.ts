export type AgentHttpTransport = {
  request(url: string, init: RequestInit, options: AgentHttpRequestOptions): Promise<Response>;
  requestJson<T>(url: string, init: RequestInit, options: AgentHttpRequestOptions): Promise<T>;
};

export type AgentHttpRequestOptions = {
  timeoutMs: number;
  timeoutMessage: string;
  failurePrefix?: string;
};

export function createBrowserAgentHttpTransport(): AgentHttpTransport {
  return {
    async request(url: string, init: RequestInit, options: AgentHttpRequestOptions) {
      return fetchWithTimeout(toLocalTrustedProxyUrl(url), init, options.timeoutMs, options.timeoutMessage);
    },
    async requestJson<T>(url: string, init: RequestInit, options: AgentHttpRequestOptions) {
      const response = await fetchWithTimeout(toLocalTrustedProxyUrl(url), init, options.timeoutMs, options.timeoutMessage);

      if (!response.ok) {
        throw new Error(`${options.failurePrefix ?? "Agent request failed"}: ${response.status}${await readErrorSuffix(response)}`);
      }

      return (await response.json()) as T;
    },
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
