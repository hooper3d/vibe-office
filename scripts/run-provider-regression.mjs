const appUrl = normalizeBaseUrl(process.env.VIBE_OFFICE_URL || "http://127.0.0.1:5180");
const defaultTimeoutMs = readNumber(process.env.VIBE_M9_REQUEST_TIMEOUT_MS, 45_000);
const forcedTimeoutMs = readNumber(process.env.VIBE_M9_FORCED_TIMEOUT_MS, 1);
const cliArgs = new Set(process.argv.slice(2));
const m9Targets = [
  {
    label: "Hermes",
    envName: "VIBE_M9_HERMES_AGENT_ID",
    runtimeProvider: "hermes",
    allowedRuntimeProviders: ["hermes", "openai"],
    requiresKey: false,
    hints: ["hermes", "8642", "hooper.ink"],
  },
  {
    label: "DeepSeek OpenAI-compatible",
    envName: "VIBE_M9_DEEPSEEK_AGENT_ID",
    runtimeProvider: "openai",
    allowedRuntimeProviders: ["openai"],
    requiresKey: true,
    hints: ["deepseek"],
  },
  {
    label: "MiniMax Anthropic-compatible",
    envName: "VIBE_M9_MINIMAX_AGENT_ID",
    runtimeProvider: "anthropic",
    allowedRuntimeProviders: ["anthropic"],
    requiresKey: true,
    hints: ["minimax", "minimaxi"],
  },
];

if (cliArgs.has("--list")) {
  await printRegisteredAgents();
  process.exit(0);
}

const registeredAgents = await readLocalTrustedRegistry();
const providers = m9Targets
  .map((target) => createProviderConfigForTarget(target, registeredAgents))
  .filter(Boolean);

if (providers.length === 0) {
  console.log("No M9 provider configs found. Set existing VIBE_M9_*_AGENT_ID vars or endpoint/model VIBE_M9_* vars.");
  process.exit(2);
}

const results = [];
for (const provider of providers) {
  console.log(`\n[M9] ${provider.label}`);
  try {
    await assertExistingProviderReady(provider);
    await upsertProvider(provider);
    results.push(await runCheck(provider, "connection", () => runConnectionCheck(provider)));
    results.push(await runCheck(provider, "free-chat", () => runFreeChatCheck(provider)));
    results.push(await runCheck(provider, "project-chat", () => runProjectChatCheck(provider)));
    results.push(await runCheck(provider, "timeout-failure", () => runTimeoutFailureCheck(provider)));
    results.push(await runCheck(provider, "retry-after-timeout", () => runRetryCheck(provider)));
    results.push(await runCheck(provider, "chinese-context", () => runChineseContextCheck(provider)));
  } catch (error) {
    results.push({ provider: provider.label, check: "setup", ok: false, detail: sanitizeError(error) });
    console.log(`  setup: FAIL ${sanitizeError(error)}`);
  }
}

const failed = results.filter((result) => !result.ok);
console.log("\n[M9] Provider regression summary");
for (const result of results) {
  console.log(`  ${result.ok ? "PASS" : "FAIL"} ${result.provider} / ${result.check}${result.detail ? ` - ${result.detail}` : ""}`);
}

if (failed.length > 0) {
  process.exit(1);
}

async function runCheck(provider, check, run) {
  try {
    const detail = await run();
    console.log(`  ${check}: PASS${detail ? ` ${detail}` : ""}`);
    return { provider: provider.label, check, ok: true, detail };
  } catch (error) {
    const detail = sanitizeError(error);
    console.log(`  ${check}: FAIL ${detail}`);
    return { provider: provider.label, check, ok: false, detail };
  }
}

async function runConnectionCheck(provider) {
  const text = await sendProviderMessage(provider, {
    messages: [{ role: "user", content: "Reply with exactly: ok" }],
    maxTokens: 16,
  });
  if (!text.trim()) throw new Error("empty provider response");
  return truncate(text);
}

async function runFreeChatCheck(provider) {
  const text = await sendProviderMessage(provider, {
    messages: [{ role: "user", content: "用一句中文回复：M9 free chat ok" }],
    maxTokens: 128,
  });
  if (!text.trim()) throw new Error("empty free chat response");
  return truncate(text);
}

async function runProjectChatCheck(provider) {
  const text = await sendProviderMessage(provider, {
    system: "Vibe Office project namespace: m9-regression. Keep this task scoped to this project.",
    messages: [{ role: "user", content: "用一句中文说明你正在进行 Vibe Office M9 project regression。" }],
    maxTokens: 160,
  });
  if (!text.trim()) throw new Error("empty project chat response");
  return truncate(text);
}

async function runTimeoutFailureCheck(provider) {
  try {
    await sendProviderMessage(
      provider,
      {
        messages: [{ role: "user", content: "Reply with exactly: timeout probe" }],
        maxTokens: 16,
      },
      forcedTimeoutMs,
    );
  } catch (error) {
    if (error.name === "AbortError" || String(error.message || "").toLowerCase().includes("abort")) {
      return `aborted at ${forcedTimeoutMs}ms`;
    }
    throw error;
  }
  throw new Error(`request completed before forced timeout (${forcedTimeoutMs}ms)`);
}

async function runRetryCheck(provider) {
  const text = await sendProviderMessage(provider, {
    messages: [{ role: "user", content: "用中文回复：M9 retry recovered" }],
    maxTokens: 128,
  });
  if (!text.trim()) throw new Error("empty retry response");
  return truncate(text);
}

async function runChineseContextCheck(provider) {
  const text = await sendProviderMessage(provider, {
    messages: [
      { role: "user", content: "请记住暗号：海盐柠檬。只回复：记住了。" },
      { role: "assistant", content: "记住了。" },
      { role: "user", content: "刚才暗号是什么？请只回答暗号。" },
    ],
    maxTokens: 64,
  });
  if (!/海盐|柠檬/.test(text)) {
    throw new Error(`context phrase missing from response: ${truncate(text)}`);
  }
  return truncate(text);
}

async function sendProviderMessage(provider, { system, messages, maxTokens }, timeoutMs = defaultTimeoutMs) {
  const command =
    provider.runtimeProvider === "anthropic"
      ? {
          agentId: provider.id,
          command: "anthropic.messages",
          payload: {
            ...(system ? { system } : {}),
            messages: messages.filter((message) => message.role !== "system"),
            maxTokens,
          },
        }
      : {
          agentId: provider.id,
          command: "openai.chatCompletions",
          payload: {
            messages: [...(system ? [{ role: "system", content: system }] : []), ...messages],
            maxTokens,
          },
        };

  const payload = await postJson(`${appUrl}/agent-local/command`, command, timeoutMs);
  if (provider.runtimeProvider === "anthropic") {
    return (
      payload.content
        ?.filter((part) => part.type === "text" && typeof part.text === "string")
        .map((part) => part.text)
        .join("\n\n")
        .trim() || ""
    );
  }

  return payload.choices?.[0]?.message?.content?.trim() || "";
}

async function upsertProvider(provider) {
  if (provider.usesExistingAgent) return;

  await postJson(`${appUrl}/agent-local/agents/upsert`, {
    agent: {
      id: provider.id,
      name: provider.label,
      role: "M9 provider regression",
      officeRole: "operator",
      location: "M9 regression",
      endpoint: provider.endpoint,
      a2aEndpoint: provider.a2aEndpoint,
      agentCardUrl: provider.agentCardUrl,
      model: provider.model,
      runtimeProvider: provider.runtimeProvider,
      apiKey: provider.apiKey,
      tags: ["regression"],
      status: "online",
    },
  });
}

async function assertExistingProviderReady(provider) {
  if (!provider.usesExistingAgent) return;

  const agent = registeredAgents[provider.id];
  if (!agent) {
    throw new Error(`registered agent not found: ${provider.id}`);
  }
  const runtimeProvider = getAgentRuntimeProvider(agent, "hermes");
  if (runtimeProvider !== provider.runtimeProvider) {
    throw new Error(`registered agent provider mismatch: expected ${provider.runtimeProvider}, got ${runtimeProvider}`);
  }
  if (provider.runtimeProvider !== "hermes" && !(typeof agent.apiKey === "string" && agent.apiKey.length > 0)) {
    throw new Error("registered provider is missing an API key in the local trusted registry");
  }
}

async function postJson(url, body, timeoutMs = defaultTimeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    const payload = text ? JSON.parse(text) : {};
    if (!response.ok) {
      throw new Error(formatProviderErrorPayload(payload, `HTTP ${response.status}`));
    }
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

function createProviderConfigForTarget(target, registry) {
  const existing = createExistingProviderConfigForTarget(target, registry);
  if (existing) return existing;

  const envPrefix = target.envName.replace(/^VIBE_M9_/, "").replace(/_AGENT_ID$/, "");
  return createProviderConfig({
    id: `m9-${envPrefix.toLowerCase()}`,
    label: target.label,
    runtimeProvider: target.runtimeProvider,
    endpoint: process.env[`VIBE_M9_${envPrefix}_BASE_URL`],
    model: process.env[`VIBE_M9_${envPrefix}_MODEL`],
    apiKey: process.env[`VIBE_M9_${envPrefix}_API_KEY`],
  });
}

function createExistingProviderConfigForTarget(target, registry) {
  const configuredId = String(process.env[target.envName] || "").trim();
  if (configuredId) {
    const agent = registry[configuredId];
    return createExistingProviderConfig({
      id: configuredId,
      label: target.label,
      runtimeProvider: getAgentRuntimeProvider(agent, target.runtimeProvider),
    });
  }

  const agents = Object.entries(registry)
    .map(([id, agent]) => ({
      id,
      name: typeof agent.name === "string" ? agent.name : "",
      runtimeProvider: getAgentRuntimeProvider(agent, target.runtimeProvider),
      model: typeof agent.model === "string" ? agent.model : "",
      endpoint: typeof agent.endpoint === "string" ? agent.endpoint : "",
      hasKey: typeof agent.apiKey === "string" && agent.apiKey.length > 0,
    }))
    .filter((agent) => matchesTargetHints(agent, target))
    .filter((agent) => isRuntimeProviderAllowed(target, agent.runtimeProvider))
    .filter((agent) => hasRequiredCredentials(target, agent))
    .sort((left, right) => Number(right.hasKey) - Number(left.hasKey) || left.id.localeCompare(right.id));

  const agent = agents[0];
  if (!agent) return null;

  return createExistingProviderConfig({
    id: agent.id,
    label: target.label,
    runtimeProvider: agent.runtimeProvider,
  });
}

function createExistingProviderConfig({ id, label, runtimeProvider }) {
  const agentId = String(id || "").trim();
  if (!agentId) return null;
  return {
    id: agentId,
    label: `${label} (${agentId})`,
    runtimeProvider,
    usesExistingAgent: true,
  };
}

function createProviderConfig({ id, label, runtimeProvider, endpoint, model, apiKey }) {
  if (!endpoint || !model) return null;
  const root = getRuntimeRoot(endpoint);
  return {
    id,
    label,
    runtimeProvider,
    endpoint,
    model,
    apiKey,
    a2aEndpoint: `${root}/a2a`,
    agentCardUrl: `${root}/.well-known/agent-card.json`,
  };
}

function getRuntimeRoot(endpoint) {
  const trimmed = endpoint.trim().replace(/\/+$/, "");
  return trimmed
    .replace(/\/v1\/messages$/i, "")
    .replace(/\/messages$/i, "")
    .replace(/\/v1\/chat\/completions$/i, "")
    .replace(/\/chat\/completions$/i, "")
    .replace(/\/v1$/i, "");
}

function normalizeBaseUrl(value) {
  return value.replace(/\/+$/, "");
}

function readNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function sanitizeError(error) {
  const text = error instanceof Error ? error.message : formatProviderErrorPayload(error, String(error));
  return text
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/g, "Bearer [redacted]")
    .replace(/(api[_-]?key=)[^&\s]+/gi, "$1[redacted]");
}

function formatProviderErrorPayload(payload, fallback) {
  if (typeof payload === "string") return payload || fallback;
  if (!payload || typeof payload !== "object") return fallback;

  const error = payload.error;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const message = typeof error.message === "string" ? error.message : "";
    const type = typeof error.type === "string" ? error.type : "";
    const code = typeof error.code === "string" || typeof error.code === "number" ? String(error.code) : "";
    const status = typeof error.status === "string" || typeof error.status === "number" ? String(error.status) : "";
    const parts = [status, code, type, message].filter(Boolean);
    if (parts.length > 0) return parts.join(" ");
  }

  const message = typeof payload.message === "string" ? payload.message : "";
  if (message) return message;

  try {
    return JSON.stringify(payload);
  } catch {
    return fallback;
  }
}

function truncate(value) {
  return value.replace(/\s+/g, " ").trim().slice(0, 120);
}

async function printRegisteredAgents() {
  const registry = await readLocalTrustedRegistry();
  const agents = Object.entries(registry)
    .map(([id, agent]) => ({
      id,
      name: typeof agent.name === "string" ? agent.name : "",
      runtimeProvider: agent.runtimeProvider || "hermes",
      model: typeof agent.model === "string" ? agent.model : "",
      endpoint: typeof agent.endpoint === "string" ? agent.endpoint : "",
      hasKey: typeof agent.apiKey === "string" && agent.apiKey.length > 0,
    }))
    .sort((left, right) => left.id.localeCompare(right.id));

  if (agents.length === 0) {
    console.log("No registered local trusted agents found.");
    return;
  }

  console.log("Registered local trusted agents:");
  for (const agent of agents) {
    const displayName = agent.name || inferAgentDisplayName(agent);
    console.log(
      `- ${agent.id} | ${displayName} | provider=${agent.runtimeProvider} | model=${agent.model || "unknown"} | hasKey=${agent.hasKey} | endpoint=${sanitizeUrlForDisplay(agent.endpoint) || "unknown"}`,
    );
  }
  console.log("\nM9 readiness:");
  for (const target of m9Targets) {
    const readiness = getTargetReadiness(target, agents);
    console.log(`- ${target.label}: ${readiness}`);
  }
  console.log("\nUse VIBE_M9_HERMES_AGENT_ID, VIBE_M9_DEEPSEEK_AGENT_ID, or VIBE_M9_MINIMAX_AGENT_ID with a ready id.");
}

async function readLocalTrustedRegistry() {
  const fs = await import("node:fs/promises");
  const os = await import("node:os");
  const path = await import("node:path");
  const localTrustedHome = process.env.VIBE_OFFICE_LOCAL_TRUSTED_HOME || path.join(os.homedir(), ".vibe-office");
  const registryPath = path.join(localTrustedHome, "agent-registry.local.json");
  const credentialPath = path.join(localTrustedHome, "agent-credentials.local.json");

  try {
    const [raw, credentials] = await Promise.all([
      fs.readFile(registryPath, "utf8"),
      readJsonFile(fs, credentialPath),
    ]);
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).map(([id, agent]) => [
        id,
        {
          ...agent,
          apiKey: typeof credentials[id]?.apiKey === "string" ? credentials[id].apiKey : agent.apiKey,
        },
      ]),
    );
  } catch {
    return {};
  }
}

async function readJsonFile(fs, filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function getTargetReadiness(target, agents) {
  const configuredId = String(process.env[target.envName] || "").trim();
  const candidates = configuredId
    ? agents.filter((agent) => agent.id === configuredId)
    : agents.filter((agent) => matchesTargetHints(agent, target));

  if (configuredId && candidates.length === 0) {
    return `NOT_FOUND ${target.envName}=${configuredId}`;
  }

  const ready = candidates
    .filter((agent) => isRuntimeProviderAllowed(target, agent.runtimeProvider))
    .filter((agent) => hasRequiredCredentials(target, agent))
    .sort((left, right) => Number(right.hasKey) - Number(left.hasKey) || left.id.localeCompare(right.id))[0];
  if (ready) return `READY ${ready.id}`;

  const providerMismatch = candidates.find((agent) => !isRuntimeProviderAllowed(target, agent.runtimeProvider));
  if (providerMismatch) {
    return `PROVIDER_MISMATCH ${providerMismatch.id} expected=${getRuntimeProviderLabel(target)} actual=${providerMismatch.runtimeProvider}`;
  }

  const missingKey = candidates.find((agent) => !hasRequiredCredentials(target, agent));
  if (missingKey) return `MISSING_KEY ${missingKey.id}`;

  return "NOT_FOUND";
}

function isRuntimeProviderAllowed(target, runtimeProvider) {
  return (target.allowedRuntimeProviders || [target.runtimeProvider]).includes(runtimeProvider);
}

function hasRequiredCredentials(target, agent) {
  if (target.requiresKey) return agent.hasKey;
  if (agent.runtimeProvider === "openai" || agent.runtimeProvider === "anthropic") return agent.hasKey;
  return true;
}

function getRuntimeProviderLabel(target) {
  return (target.allowedRuntimeProviders || [target.runtimeProvider]).join("|");
}

function getAgentRuntimeProvider(agent, fallback) {
  const value = agent?.runtimeProvider;
  return value === "openai" || value === "anthropic" || value === "hermes" ? value : fallback;
}

function matchesTargetHints(agent, target) {
  const haystack = [agent.id, agent.name, agent.model, agent.endpoint].join(" ").toLowerCase();
  return target.hints.some((hint) => haystack.includes(hint));
}

function inferAgentDisplayName(agent) {
  const model = agent.model || "";
  const endpoint = agent.endpoint || "";
  if (/deepseek/i.test(`${model} ${endpoint}`)) return "DeepSeek";
  if (/minimax|minimaxi/i.test(`${model} ${endpoint}`)) return "MiniMax";
  if (/hermes|8642|hooper\.ink/i.test(`${model} ${endpoint}`)) return "Hermes";
  return model || "Unnamed";
}

function sanitizeUrlForDisplay(value) {
  if (!value) return "";
  try {
    const url = new URL(value);
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return value.replace(/[?#].*$/, "");
  }
}
