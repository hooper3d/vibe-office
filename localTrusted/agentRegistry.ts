import fs from "node:fs/promises";
import path from "node:path";
import { getProviderSetupIssue } from "../src/domain/providerSetup";
import { getLocalTrustedFilePath, readLocalTrustedCredentials, writeLocalTrustedCredentials } from "./credentialStore";

function getLocalTrustedAgentRegistryPath() {
  return getLocalTrustedFilePath("agent-registry.local.json");
}

let registryUpdateQueue = Promise.resolve();

export type LocalTrustedAgentRecord = {
  id: string;
  name?: string;
  endpoint: string;
  a2aEndpoint: string;
  agentCardUrl: string;
  a2aProtocolVersion?: string;
  model: string;
  runtimeProvider: "hermes" | "openai" | "anthropic";
  apiKey?: string;
};

export type LocalTrustedAgentSafeStatus = {
  id: string;
  runtimeProvider: LocalTrustedAgentRecord["runtimeProvider"];
  model: string;
  hasCredential: boolean;
  registered: boolean;
  issues: string[];
};

export function getVerifiedTrustedAgentRecord(value: unknown): LocalTrustedAgentRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Agent registry payload is invalid.");
  }

  const agent = value as Record<string, unknown>;
  const id = String(agent.id || "").trim();
  const name = typeof agent.name === "string" && agent.name.trim() ? agent.name.trim() : undefined;
  const endpoint = String(agent.endpoint || "").trim().replace(/\/+$/, "");
  const a2aEndpoint = String(agent.a2aEndpoint || "").trim().replace(/\/+$/, "");
  const agentCardUrl = String(agent.agentCardUrl || "").trim();
  const a2aProtocolVersion = typeof agent.a2aProtocolVersion === "string" ? agent.a2aProtocolVersion.trim() : undefined;
  const model = String(agent.model || "").trim();
  const runtimeProvider = getVerifiedRuntimeProvider(agent.runtimeProvider);
  const apiKey = typeof agent.apiKey === "string" && agent.apiKey.trim() ? agent.apiKey.trim() : undefined;

  if (!id) throw new Error("Agent id is required.");
  assertHttpUrl(endpoint, "Agent endpoint");
  assertHttpUrl(a2aEndpoint, "Agent task endpoint");
  assertHttpUrl(agentCardUrl, "Agent capability URL");
  if (!model) throw new Error("Agent model is required.");

  return {
    id,
    name,
    endpoint,
    a2aEndpoint,
    agentCardUrl,
    a2aProtocolVersion,
    model,
    runtimeProvider,
    apiKey,
  };
}

export async function getLocalTrustedAgent(agentId: string) {
  const registry = await readLocalTrustedAgentRegistry();
  const agent = registry[agentId];
  if (!agent) {
    throw new Error("Agent is not registered in the local trusted layer.");
  }
  return agent;
}

export async function readLocalTrustedAgentRegistry(): Promise<Record<string, LocalTrustedAgentRecord>> {
  try {
    const [raw, credentials] = await Promise.all([
      fs.readFile(getLocalTrustedAgentRegistryPath(), "utf8"),
      readLocalTrustedCredentials(),
    ]);
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};

    const registry: Record<string, LocalTrustedAgentRecord> = {};
    Object.entries(parsed).forEach(([id, value]) => {
      try {
        const agent = getVerifiedTrustedAgentRecord({ ...(value as object), id });
        registry[agent.id] = { ...agent, apiKey: credentials[agent.id]?.apiKey ?? agent.apiKey };
      } catch {
        // Invalid records are ignored so one bad agent does not break the local trusted layer.
      }
    });
    return registry;
  } catch {
    return {};
  }
}

export async function getLocalTrustedAgentSafeStatuses(agentIds?: string[]): Promise<LocalTrustedAgentSafeStatus[]> {
  const registry = await readLocalTrustedAgentRegistry();
  const requestedIds = agentIds?.map((id) => id.trim()).filter(Boolean);
  const entries = requestedIds?.length
    ? requestedIds.map((id) => [id, registry[id]] as const)
    : Object.entries(registry);

  return entries.map(([id, agent]) => {
    const issues: string[] = [];
    if (!agent) {
      issues.push("Agent is not registered in the local trusted layer.");
      return {
        id,
        runtimeProvider: "hermes",
        model: "",
        hasCredential: false,
        registered: false,
        issues,
      };
    }
    const setupIssue = getProviderSetupIssue(agent);
    if (setupIssue) issues.push(setupIssue);
    if (agent.runtimeProvider !== "hermes" && !agent.apiKey) {
      issues.push("API key is not saved in the local trusted layer.");
    }

    return {
      id,
      runtimeProvider: agent.runtimeProvider,
      model: agent.model,
      hasCredential: Boolean(agent.apiKey),
      registered: true,
      issues,
    };
  });
}

export async function writeLocalTrustedAgentRegistry(registry: Record<string, LocalTrustedAgentRecord>) {
  const registryPath = getLocalTrustedAgentRegistryPath();
  const registryDirectory = path.dirname(registryPath);
  const temporaryPath = path.join(
    registryDirectory,
    `agent-registry.local.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`,
  );
  const metadataRegistry = Object.fromEntries(
    Object.entries(registry).map(([id, agent]) => [id, stripLocalTrustedCredential(agent)]),
  );
  const credentials = Object.fromEntries(
    Object.entries(registry)
      .filter((entry): entry is [string, LocalTrustedAgentRecord & { apiKey: string }] => Boolean(entry[1].apiKey))
      .map(([id, agent]) => [id, { apiKey: agent.apiKey }]),
  );
  const existingCredentials = await readLocalTrustedCredentials();
  const nextCredentials = Object.fromEntries(
    Object.entries(existingCredentials).filter(([id]) => Object.prototype.hasOwnProperty.call(metadataRegistry, id)),
  );

  await fs.mkdir(registryDirectory, { recursive: true });
  await fs.writeFile(temporaryPath, JSON.stringify(metadataRegistry, null, 2), "utf8");
  await fs.rename(temporaryPath, registryPath);
  await writeLocalTrustedCredentials({
    ...nextCredentials,
    ...credentials,
  });
}

export function updateLocalTrustedAgentRegistry(
  updater: (registry: Record<string, LocalTrustedAgentRecord>) => Record<string, LocalTrustedAgentRecord> | Promise<Record<string, LocalTrustedAgentRecord>>,
) {
  const update = registryUpdateQueue.then(async () => {
    const registry = await readLocalTrustedAgentRegistry();
    const nextRegistry = await updater({ ...registry });
    await writeLocalTrustedAgentRegistry(nextRegistry);
    return nextRegistry;
  });

  registryUpdateQueue = update.then(
    () => undefined,
    () => undefined,
  );

  return update;
}

function getVerifiedRuntimeProvider(value: unknown): LocalTrustedAgentRecord["runtimeProvider"] {
  if (value === "openai" || value === "anthropic") return value;
  return "hermes";
}

function stripLocalTrustedCredential(agent: LocalTrustedAgentRecord) {
  const { apiKey: _apiKey, ...metadata } = agent;
  return metadata;
}

function assertHttpUrl(value: string, label: string) {
  const parsed = new URL(value);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`${label} must use http or https.`);
  }
}
