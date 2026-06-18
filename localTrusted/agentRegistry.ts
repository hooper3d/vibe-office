import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const LOCAL_TRUSTED_AGENT_REGISTRY_PATH = path.join(os.homedir(), ".vibe-office", "agent-registry.local.json");
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
    const raw = await fs.readFile(LOCAL_TRUSTED_AGENT_REGISTRY_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};

    return Object.fromEntries(
      Object.entries(parsed)
        .map(([id, value]) => {
          try {
            const agent = getVerifiedTrustedAgentRecord({ ...(value as object), id });
            return [agent.id, agent] as const;
          } catch {
            return null;
          }
        })
        .filter((entry): entry is readonly [string, LocalTrustedAgentRecord] => Boolean(entry)),
    );
  } catch {
    return {};
  }
}

export async function writeLocalTrustedAgentRegistry(registry: Record<string, LocalTrustedAgentRecord>) {
  const registryDirectory = path.dirname(LOCAL_TRUSTED_AGENT_REGISTRY_PATH);
  const temporaryPath = path.join(
    registryDirectory,
    `agent-registry.local.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`,
  );

  await fs.mkdir(registryDirectory, { recursive: true });
  await fs.writeFile(temporaryPath, JSON.stringify(registry, null, 2), "utf8");
  await fs.rename(temporaryPath, LOCAL_TRUSTED_AGENT_REGISTRY_PATH);
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

function assertHttpUrl(value: string, label: string) {
  const parsed = new URL(value);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`${label} must use http or https.`);
  }
}
