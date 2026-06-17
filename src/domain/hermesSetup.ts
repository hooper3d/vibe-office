import type { AgentInstance } from "./types";

export function createAgentFromHermesSetup(form: FormData): AgentInstance {
  const name = readFormValue(form, "name", "New Hermes Agent");
  const role = readFormValue(form, "role", "General Hermes instance");
  const model = readFormValue(form, "model", "hermes-agent");

  return {
    id: `agent-${Date.now()}`,
    name,
    role,
    location: readFormValue(form, "location", "Configured instance"),
    endpoint: readFormValue(form, "endpoint", "http://127.0.0.1:8642/v1"),
    a2aEndpoint: readFormValue(form, "a2aEndpoint", "http://127.0.0.1:8642/a2a"),
    agentCardUrl: readFormValue(form, "agentCardUrl", "http://127.0.0.1:8642/.well-known/agent-card.json"),
    apiKey: readOptionalFormValue(form, "apiKey"),
    model,
    tags: normalizeTags(readFormValue(form, "tags", "general")),
    status: "online",
  };
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

function normalizeTags(value: string) {
  const tags = value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);

  return tags.length > 0 ? tags : ["general"];
}
