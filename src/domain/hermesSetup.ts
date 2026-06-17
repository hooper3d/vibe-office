import type { AgentInstance, AgentOfficeRole } from "./types";

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
    tags: normalizeTags(readFormValues(form, "tags")),
    status: "online",
  };
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
