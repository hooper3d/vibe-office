import { getLocalTrustedAgent, type LocalTrustedAgentRecord } from "./agentRegistry";

export type LocalTrustedProviderRequest = {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
  agentId?: string;
};

export function getVerifiedProviderRequest(body: Record<string, unknown>): LocalTrustedProviderRequest {
  const url = String(body.url || "").trim();
  const method = String(body.method || "GET").trim().toUpperCase();
  const agentId = String(body.agentId || "").trim();
  const parsed = new URL(url);

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Provider requests must use http or https.");
  }

  if (!["GET", "POST"].includes(method)) {
    throw new Error("Provider request method is not supported.");
  }

  return {
    url,
    method,
    agentId,
    headers: getVerifiedProviderHeaders(body.headers),
    body: typeof body.body === "string" && method !== "GET" ? body.body : undefined,
  };
}

export async function getVerifiedProviderCommandRequest(body: Record<string, unknown>): Promise<LocalTrustedProviderRequest> {
  const agentId = String(body.agentId || "").trim();
  const command = String(body.command || "").trim();
  if (!agentId) throw new Error("Agent id is required.");

  const agent = await getLocalTrustedAgent(agentId);
  if (command === "openai.chatCompletions") {
    if (agent.runtimeProvider === "anthropic") throw new Error("OpenAI-compatible command does not match this agent provider.");
    return createOpenAIChatCompletionsRequest(agent, body.payload);
  }
  if (command === "anthropic.messages") {
    if (agent.runtimeProvider !== "anthropic") throw new Error("Anthropic command does not match this agent provider.");
    return createAnthropicMessagesRequest(agent, body.payload);
  }
  if (command === "a2a.getAgentCard") {
    if (agent.runtimeProvider !== "hermes") throw new Error("A2A capability command does not match this agent provider.");
    return createA2AAgentCardRequest(agent);
  }
  if (command === "a2a.messageSend") {
    if (agent.runtimeProvider !== "hermes") throw new Error("A2A message command does not match this agent provider.");
    return createA2ARpcRequest(agent, "message/send", getVerifiedA2AMessageSendPayload(body.payload));
  }
  if (command === "a2a.tasksGet") {
    if (agent.runtimeProvider !== "hermes") throw new Error("A2A task command does not match this agent provider.");
    return createA2ARpcRequest(agent, "tasks/get", getVerifiedA2ATaskAddressPayload(body.payload));
  }
  if (command === "a2a.tasksCancel") {
    if (agent.runtimeProvider !== "hermes") throw new Error("A2A cancel command does not match this agent provider.");
    return createA2ARpcRequest(agent, "tasks/cancel", getVerifiedA2ATaskAddressPayload(body.payload));
  }
  throw new Error("Provider command is not supported.");
}

export function assertProviderTargetBelongsToAgent(url: string, agent: LocalTrustedAgentRecord) {
  const target = new URL(url);
  const allowedBases = [agent.endpoint, agent.a2aEndpoint, agent.agentCardUrl];
  if (allowedBases.some((base) => isUrlInsideBase(target, base))) return;
  throw new Error("Provider request target does not match the registered agent.");
}

export function injectLocalTrustedCredential(headers: Record<string, string>, agent: LocalTrustedAgentRecord) {
  if (!agent.apiKey) return;

  if (agent.runtimeProvider === "anthropic") {
    headers["x-api-key"] = agent.apiKey;
  }
  headers.Authorization = `Bearer ${agent.apiKey}`;
}

function getVerifiedProviderHeaders(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  const headers: Record<string, string> = {};
  for (const [rawKey, rawValue] of Object.entries(value)) {
    const key = rawKey.toLowerCase();
    if (!isForwardableProviderHeader(key)) continue;
    if (typeof rawValue !== "string") continue;
    headers[rawKey] = rawValue;
  }

  return headers;
}

function isForwardableProviderHeader(key: string) {
  return [
    "accept",
    "a2a-version",
    "authorization",
    "anthropic-version",
    "content-type",
    "x-api-key",
  ].includes(key);
}

function createOpenAIChatCompletionsRequest(agent: LocalTrustedAgentRecord, payload: unknown) {
  const commandPayload = getVerifiedCommandPayload(payload);
  const messages = getVerifiedCommandMessages(commandPayload.messages, ["system", "user", "assistant"]);
  const headers = createProviderJsonHeaders();
  injectLocalTrustedCredential(headers, agent);

  return {
    url: toOpenAIChatCompletionsUrl(agent.endpoint),
    method: "POST",
    headers,
    body: JSON.stringify({
      model: agent.model,
      messages,
      ...(commandPayload.maxTokens ? { max_tokens: commandPayload.maxTokens } : {}),
    }),
  };
}

function createAnthropicMessagesRequest(agent: LocalTrustedAgentRecord, payload: unknown) {
  const commandPayload = getVerifiedCommandPayload(payload);
  const messages = getVerifiedCommandMessages(commandPayload.messages, ["user", "assistant"]);
  const headers = createProviderJsonHeaders({
    "anthropic-version": "2023-06-01",
  });
  injectLocalTrustedCredential(headers, agent);

  return {
    url: toAnthropicMessagesUrl(agent.endpoint),
    method: "POST",
    headers,
    body: JSON.stringify({
      model: agent.model,
      max_tokens: commandPayload.maxTokens ?? 4096,
      ...(typeof commandPayload.system === "string" && commandPayload.system.trim() ? { system: commandPayload.system.trim() } : {}),
      messages,
    }),
  };
}

function createA2AAgentCardRequest(agent: LocalTrustedAgentRecord) {
  const headers = createProviderAcceptHeaders();
  injectLocalTrustedCredential(headers, agent);

  return {
    url: agent.agentCardUrl,
    method: "GET",
    headers,
    body: undefined,
  };
}

function createA2ARpcRequest(agent: LocalTrustedAgentRecord, method: string, params: unknown) {
  const headers = createProviderJsonHeaders();
  injectLocalTrustedCredential(headers, agent);
  injectA2AVersionHeader(headers, agent);

  return {
    url: agent.a2aEndpoint,
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: createLocalRequestId(),
      method,
      params,
    }),
  };
}

function getVerifiedA2AMessageSendPayload(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("A2A message payload is invalid.");
  }
  const value = payload as Record<string, unknown>;
  const message = value.message;
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    throw new Error("A2A message is required.");
  }
  if (!Array.isArray((message as Record<string, unknown>).parts)) {
    throw new Error("A2A message parts are required.");
  }
  return {
    message,
    configuration: value.configuration,
    metadata: value.metadata,
  };
}

function getVerifiedA2ATaskAddressPayload(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("A2A task payload is invalid.");
  }
  const value = payload as Record<string, unknown>;
  const id = String(value.id || "").trim();
  const contextId = String(value.contextId || "").trim();
  if (!id || !contextId) {
    throw new Error("A2A task id and context id are required.");
  }
  return { id, contextId };
}

function getVerifiedCommandPayload(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Provider command payload is invalid.");
  }
  const value = payload as Record<string, unknown>;
  return {
    messages: value.messages,
    system: value.system,
    maxTokens: getVerifiedMaxTokens(value.maxTokens),
  };
}

function getVerifiedCommandMessages(value: unknown, allowedRoles: Array<"system" | "user" | "assistant">) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("Provider command messages are required.");
  }

  return value.map((message) => {
    if (!message || typeof message !== "object" || Array.isArray(message)) {
      throw new Error("Provider command message is invalid.");
    }
    const role = String((message as Record<string, unknown>).role || "");
    const content = String((message as Record<string, unknown>).content || "");
    if (!allowedRoles.includes(role as "system" | "user" | "assistant")) {
      throw new Error("Provider command message role is not supported.");
    }
    if (!content.trim()) {
      throw new Error("Provider command message content is required.");
    }
    return {
      role,
      content,
    };
  });
}

function getVerifiedMaxTokens(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("Provider command max tokens value is invalid.");
  }
  return Math.min(Math.floor(parsed), 100_000);
}

function createProviderJsonHeaders(extra: Record<string, string> = {}) {
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    ...extra,
  };
}

function createProviderAcceptHeaders(extra: Record<string, string> = {}) {
  return {
    Accept: "application/json",
    ...extra,
  };
}

function injectA2AVersionHeader(headers: Record<string, string>, agent: LocalTrustedAgentRecord) {
  if (agent.a2aProtocolVersion && agent.a2aProtocolVersion !== "compatibility") {
    headers["A2A-Version"] = agent.a2aProtocolVersion;
  }
}

function createLocalRequestId() {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
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

function isUrlInsideBase(target: URL, base: string) {
  const parsed = new URL(base);
  const basePath = parsed.pathname.replace(/\/+$/, "");
  return (
    target.origin === parsed.origin &&
    (target.pathname === basePath || target.pathname.startsWith(`${basePath}/`))
  );
}
