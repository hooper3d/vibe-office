import type { A2ASendMessageParams } from "../domain/a2a";

export type AgentHttpTransport = {
  commandJson<T>(command: LocalTrustedProviderCommand, options: AgentHttpRequestOptions): Promise<T>;
};

export type AgentHttpRequestOptions = {
  timeoutMs: number;
  timeoutMessage: string;
  failurePrefix?: string;
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
    }
  | {
      agentId: string;
      command: "a2a.getAgentCard";
      payload?: Record<string, never>;
    }
  | {
      agentId: string;
      command: "a2a.messageSend";
      payload: A2ASendMessageParams;
    }
  | {
      agentId: string;
      command: "a2a.tasksGet";
      payload: {
        id: string;
        contextId: string;
      };
    }
  | {
      agentId: string;
      command: "a2a.tasksCancel";
      payload: {
        id: string;
        contextId: string;
      };
    };

export function createBrowserAgentHttpTransport(): AgentHttpTransport {
  return {
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

export async function readErrorSuffix(response: Response) {
  try {
    const payload = (await response.json()) as { error?: string | { message?: string } };
    const message = getResponseErrorMessage(payload);
    return message ? `: ${message}` : "";
  } catch {
    return "";
  }
}

function getResponseErrorMessage(payload: { error?: string | { message?: string } }) {
  if (typeof payload.error === "string") return payload.error;
  if (payload.error && typeof payload.error.message === "string") return payload.error.message;
  return "";
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
