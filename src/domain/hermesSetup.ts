import type { AgentInstance, AgentOfficeRole, AgentRuntimeProvider } from "./types";

export function createAgentFromHermesSetup(form: FormData): AgentInstance {
  const name = readFormValue(form, "name", "New Agent");
  const role = readFormValue(form, "role", "");
  const model = readFormValue(form, "model", "");

  return {
    id: `agent-${Date.now()}`,
    name,
    role,
    officeRole: readOfficeRole(form),
    location: readFormValue(form, "location", ""),
    endpoint: readFormValue(form, "endpoint", ""),
    a2aEndpoint: readFormValue(form, "a2aEndpoint", ""),
    agentCardUrl: readFormValue(form, "agentCardUrl", ""),
    apiKey: readOptionalFormValue(form, "apiKey"),
    avatarUrl: readOptionalFormValue(form, "avatarUrl"),
    ipAddress: readOptionalFormValue(form, "ipAddress"),
    model,
    runtimeProvider: readRuntimeProvider(form),
    timeoutSeconds: readTimeoutSeconds(form),
    tags: normalizeTags(readFormValues(form, "tags")),
    status: "online",
  };
}

export function getProviderSetupIssue(agent: Pick<AgentInstance, "endpoint" | "runtimeProvider">) {
  const runtimeProvider = agent.runtimeProvider ?? "hermes";
  const endpoint = agent.endpoint.trim().toLowerCase();
  if (!endpoint) return "Base URL is required.";

  if (runtimeProvider === "openai" && (endpoint.includes("/anthropic") || endpoint.endsWith("/messages") || endpoint.includes("/messages?"))) {
    return "Provider type is OpenAI-compatible, but this Base URL looks Anthropic-compatible. Switch Provider type to Anthropic-compatible or use an OpenAI-compatible /v1 endpoint.";
  }

  if (runtimeProvider === "anthropic" && (endpoint.endsWith("/chat/completions") || endpoint.includes("/chat/completions?"))) {
    return "Provider type is Anthropic-compatible, but this Base URL looks OpenAI-compatible. Switch Provider type to OpenAI-compatible or use an Anthropic-compatible endpoint.";
  }

  return null;
}

function readRuntimeProvider(form: FormData): AgentRuntimeProvider {
  const value = readFormValue(form, "runtimeProvider", "hermes");
  if (value === "openai" || value === "anthropic") return value;
  return "hermes";
}

function readOfficeRole(form: FormData): AgentOfficeRole {
  const value = readFormValue(form, "officeRole", "operator");
  if (value === "chief" || value === "builder" || value === "writer") return value;
  return "operator";
}

function readFormValue(form: FormData, key: string, fallback: string) {
  const value = form.get(key);
  if (typeof value !== "string") return fallback;
  return value.trim() || fallback;
}

function readOptionalFormValue(form: FormData, key: string) {
  const value = form.get(key);
  if (typeof value !== "string") return undefined;
  return value.trim() || undefined;
}

function readTimeoutSeconds(form: FormData) {
  const raw = readOptionalFormValue(form, "timeout");
  if (!raw) return undefined;

  const normalized = raw.trim().toLowerCase();
  const parsed = Number.parseInt(normalized.replace(/s$/, ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return Math.min(parsed, 300);
}

function readFormValues(form: FormData, key: string) {
  return form
    .getAll(key)
    .flatMap((value) => (typeof value === "string" ? value.split(",") : []));
}

function normalizeTags(values: string[]) {
  const tags = values
    .map((tag) => tag.trim())
    .filter(Boolean);

  return tags;
}
