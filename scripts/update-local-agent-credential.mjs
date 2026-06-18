import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const localTrustedHome = process.env.VIBE_OFFICE_LOCAL_TRUSTED_HOME || path.join(os.homedir(), ".vibe-office");
const registryPath = path.join(localTrustedHome, "agent-registry.local.json");
const credentialPath = path.join(localTrustedHome, "agent-credentials.local.json");

const agentId = readRequiredEnv("VIBE_AGENT_ID");
const apiKey = readRequiredEnv("VIBE_AGENT_API_KEY");
const m9Target = readOptionalM9Target(process.env.VIBE_AGENT_M9_TARGET);
const targetPreset = m9Target ? getM9TargetPreset(m9Target) : undefined;
const runtimeProvider = readOptionalRuntimeProvider(process.env.VIBE_AGENT_RUNTIME_PROVIDER || targetPreset?.runtimeProvider);
const endpoint = readOptionalHttpUrl(process.env.VIBE_AGENT_BASE_URL || targetPreset?.baseUrl, "VIBE_AGENT_BASE_URL");
const model = readOptionalEnv("VIBE_AGENT_MODEL") || targetPreset?.model || "";

const registry = await readJsonObject(registryPath);
const existingAgent = registry[agentId];
if (!existingAgent || typeof existingAgent !== "object" || Array.isArray(existingAgent)) {
  throw new Error(`Local trusted agent not found: ${agentId}`);
}

const nextAgent = {
  ...existingAgent,
  ...(runtimeProvider ? { runtimeProvider } : {}),
  ...(endpoint ? createEndpointPatch(endpoint) : {}),
  ...(model ? { model } : {}),
};
delete nextAgent.apiKey;

const credentials = await readJsonObject(credentialPath);
const nextCredentials = {
  ...credentials,
  [agentId]: { apiKey },
};

await fs.mkdir(localTrustedHome, { recursive: true });
await writeJsonAtomic(registryPath, {
  ...registry,
  [agentId]: nextAgent,
});
await writeJsonAtomic(credentialPath, nextCredentials);

console.log(
  [
    `Updated local trusted credential for ${agentId}.`,
    `provider=${nextAgent.runtimeProvider || "hermes"}`,
    `model=${nextAgent.model || "unknown"}`,
    "hasKey=true",
    ...(m9Target ? [`m9Target=${m9Target}`, `m9Readiness=${getM9Readiness(m9Target, agentId, nextAgent, true)}`] : []),
  ].join(" "),
);

function readRequiredEnv(name) {
  const value = readOptionalEnv(name);
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function readOptionalEnv(name) {
  const value = process.env[name];
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function readOptionalRuntimeProvider(value) {
  if (!value) return "";
  const normalized = value.trim().toLowerCase();
  if (normalized === "hermes" || normalized === "openai" || normalized === "anthropic") return normalized;
  throw new Error("VIBE_AGENT_RUNTIME_PROVIDER must be hermes, openai, or anthropic.");
}

function readOptionalM9Target(value) {
  if (!value) return "";
  const normalized = value.trim().toLowerCase();
  if (normalized === "hermes" || normalized === "deepseek" || normalized === "minimax") return normalized;
  throw new Error("VIBE_AGENT_M9_TARGET must be hermes, deepseek, or minimax.");
}

function getM9TargetPreset(target) {
  if (target === "deepseek") {
    return {
      runtimeProvider: "openai",
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-v4-flash",
    };
  }
  if (target === "minimax") {
    return {
      runtimeProvider: "anthropic",
      baseUrl: "https://api.minimax.io/anthropic",
      model: "MiniMax-M3",
    };
  }
  return {
    runtimeProvider: "hermes",
    baseUrl: "http://127.0.0.1:8642/v1",
    model: "hermes-agent",
  };
}

function getM9Readiness(target, id, agent, hasKey) {
  const provider = agent.runtimeProvider || "hermes";
  if (target === "deepseek") {
    if (provider !== "openai") return `PROVIDER_MISMATCH:${id}`;
    return hasKey ? `READY:${id}` : `MISSING_KEY:${id}`;
  }
  if (target === "minimax") {
    if (provider !== "anthropic") return `PROVIDER_MISMATCH:${id}`;
    return hasKey ? `READY:${id}` : `MISSING_KEY:${id}`;
  }
  if (provider !== "hermes" && provider !== "openai") return `PROVIDER_MISMATCH:${id}`;
  return provider === "openai" && !hasKey ? `MISSING_KEY:${id}` : `READY:${id}`;
}

function readOptionalHttpUrl(value, name) {
  if (!value) return "";
  const trimmed = value.trim().replace(/\/+$/, "");
  const parsed = new URL(trimmed);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`${name} must use http or https.`);
  }
  parsed.username = "";
  parsed.password = "";
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString().replace(/\/$/, "");
}

function createEndpointPatch(baseUrl) {
  const root = getRuntimeRoot(baseUrl);
  return {
    endpoint: baseUrl,
    a2aEndpoint: `${root}/a2a`,
    agentCardUrl: `${root}/.well-known/agent-card.json`,
  };
}

function getRuntimeRoot(endpoint) {
  return endpoint
    .replace(/\/v1\/messages$/i, "")
    .replace(/\/messages$/i, "")
    .replace(/\/v1\/chat\/completions$/i, "")
    .replace(/\/chat\/completions$/i, "")
    .replace(/\/v1$/i, "");
}

async function readJsonObject(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

async function writeJsonAtomic(filePath, value) {
  const temporaryPath = path.join(
    path.dirname(filePath),
    `${path.basename(filePath)}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`,
  );
  await fs.writeFile(temporaryPath, JSON.stringify(value, null, 2), "utf8");
  await fs.rename(temporaryPath, filePath);
}
