const appUrl = normalizeBaseUrl(process.env.VIBE_OFFICE_URL || "http://127.0.0.1:5180");
const defaultTimeoutMs = readNumber(process.env.VIBE_M9_REQUEST_TIMEOUT_MS, 45_000);
const forcedTimeoutMs = readNumber(process.env.VIBE_M9_FORCED_TIMEOUT_MS, 1);
const cliArgs = new Set(process.argv.slice(2));

if (cliArgs.has("--list")) {
  await printRegisteredAgents();
  process.exit(0);
}

const providers = [
  createExistingProviderConfig({
    id: process.env.VIBE_M9_HERMES_AGENT_ID,
    label: "Hermes",
    runtimeProvider: "hermes",
  }) ??
    createProviderConfig({
      id: "m9-hermes",
      label: "Hermes",
      runtimeProvider: "hermes",
      endpoint: process.env.VIBE_M9_HERMES_BASE_URL,
      model: process.env.VIBE_M9_HERMES_MODEL,
      apiKey: process.env.VIBE_M9_HERMES_API_KEY,
    }),
  createExistingProviderConfig({
    id: process.env.VIBE_M9_DEEPSEEK_AGENT_ID,
    label: "DeepSeek OpenAI-compatible",
    runtimeProvider: "openai",
  }) ??
    createProviderConfig({
      id: "m9-deepseek",
      label: "DeepSeek OpenAI-compatible",
      runtimeProvider: "openai",
      endpoint: process.env.VIBE_M9_DEEPSEEK_BASE_URL,
      model: process.env.VIBE_M9_DEEPSEEK_MODEL,
      apiKey: process.env.VIBE_M9_DEEPSEEK_API_KEY,
    }),
  createExistingProviderConfig({
    id: process.env.VIBE_M9_MINIMAX_AGENT_ID,
    label: "MiniMax Anthropic-compatible",
    runtimeProvider: "anthropic",
  }) ??
    createProviderConfig({
      id: "m9-minimax",
      label: "MiniMax Anthropic-compatible",
      runtimeProvider: "anthropic",
      endpoint: process.env.VIBE_M9_MINIMAX_BASE_URL,
      model: process.env.VIBE_M9_MINIMAX_MODEL,
      apiKey: process.env.VIBE_M9_MINIMAX_API_KEY,
    }),
].filter(Boolean);

if (providers.length === 0) {
  console.log("No M9 provider configs found. Set existing VIBE_M9_*_AGENT_ID vars or endpoint/model VIBE_M9_* vars.");
  process.exit(2);
}

const results = [];
for (const provider of providers) {
  console.log(`\n[M9] ${provider.label}`);
  try {
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
      throw new Error(payload.error || `HTTP ${response.status}`);
    }
    return payload;
  } finally {
    clearTimeout(timeout);
  }
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
  const text = error instanceof Error ? error.message : String(error);
  return text
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/g, "Bearer [redacted]")
    .replace(/(api[_-]?key=)[^&\s]+/gi, "$1[redacted]");
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
    console.log(
      `- ${agent.id} | ${agent.name || "Unnamed"} | provider=${agent.runtimeProvider} | model=${agent.model || "unknown"} | hasKey=${agent.hasKey} | endpoint=${agent.endpoint || "unknown"}`,
    );
  }
  console.log("\nUse VIBE_M9_HERMES_AGENT_ID, VIBE_M9_DEEPSEEK_AGENT_ID, or VIBE_M9_MINIMAX_AGENT_ID with one of these ids.");
}

async function readLocalTrustedRegistry() {
  const fs = await import("node:fs/promises");
  const os = await import("node:os");
  const path = await import("node:path");
  const registryPath = path.join(os.homedir(), ".vibe-office", "agent-registry.local.json");

  try {
    const raw = await fs.readFile(registryPath, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed;
  } catch {
    return {};
  }
}
