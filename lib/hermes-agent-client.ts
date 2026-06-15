import { promises as fs } from "fs";
import os from "os";
import path from "path";
import type { AgentName } from "@/types/agent";
import type { HermesResponsesInput } from "@/lib/hermes-multimodal";

const DEFAULT_RESPONSE_TIMEOUT_MS = Number(process.env.AG_UI_HERMES_RESPONSE_TIMEOUT_MS || 180_000);

type LegacyAgentConfig = {
  defaultBaseUrl: string;
  defaultConversation: string;
  baseUrlEnv?: string;
  apiKeyEnv?: string;
  modelEnv?: string;
  readDefaultHermesEnv?: boolean;
};

const legacyAgentConfigs: Record<Exclude<AgentName, "Ray">, LegacyAgentConfig> = {
  Lucy: {
    defaultBaseUrl: "http://127.0.0.1:8642/v1",
    defaultConversation: "ag-ui-chief",
    baseUrlEnv: "HERMES_API_BASE_URL",
    apiKeyEnv: "HERMES_API_SERVER_KEY",
    modelEnv: "HERMES_LUCY_MODEL",
    readDefaultHermesEnv: true
  },
  Tiger: {
    defaultBaseUrl: "http://127.0.0.1:18643/v1",
    defaultConversation: "ag-ui-writer",
    baseUrlEnv: "TIGER_HERMES_API_BASE_URL",
    apiKeyEnv: "TIGER_HERMES_API_SERVER_KEY",
    modelEnv: "TIGER_HERMES_MODEL"
  },
  Musk: {
    defaultBaseUrl: "http://127.0.0.1:18642/v1",
    defaultConversation: "ag-ui-operator",
    baseUrlEnv: "MUSK_HERMES_API_BASE_URL",
    apiKeyEnv: "MUSK_HERMES_API_SERVER_KEY",
    modelEnv: "MUSK_HERMES_MODEL"
  }
};

export type HermesAgentErrorCode = "not_configured" | "unreachable" | "unauthorized" | "bad_response";

export class HermesAgentError extends Error {
  code: HermesAgentErrorCode;
  status?: number;

  constructor(code: HermesAgentErrorCode, message: string, status?: number) {
    super(message);
    this.name = "HermesAgentError";
    this.code = code;
    this.status = status;
  }
}

export type HermesAgentResponse = {
  text: string;
  raw: unknown;
};

type HermesEnv = Record<string, string>;

function normalizeBaseUrl(value?: string) {
  return value?.trim().replace(/\/+$/, "") || "";
}

async function readDefaultHermesEnv(): Promise<HermesEnv> {
  const envPath = path.join(os.homedir(), ".hermes", ".env");

  try {
    const content = await fs.readFile(envPath, "utf8");
    return Object.fromEntries(
      content
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#") && line.includes("="))
        .map((line) => {
          const [key, ...rest] = line.split("=");
          return [key.trim(), rest.join("=").trim().replace(/^["']|["']$/g, "")];
        })
    );
  } catch (error) {
    const code = error instanceof Error && "code" in error ? (error as NodeJS.ErrnoException).code : undefined;
    if (code === "ENOENT") return {};
    throw error;
  }
}

async function getHermesAgentConfig(agentName: AgentName) {
  if (agentName === "Ray") {
    throw new HermesAgentError("not_configured", "Ray uses the local code runner, not a remote Hermes profile client.");
  }

  const config = legacyAgentConfigs[agentName];
  const fileEnv = config.readDefaultHermesEnv ? await readDefaultHermesEnv() : {};
  const baseUrl = normalizeBaseUrl(
    (config.baseUrlEnv ? process.env[config.baseUrlEnv] : undefined) ||
      (config.baseUrlEnv ? fileEnv[config.baseUrlEnv] : undefined) ||
      config.defaultBaseUrl
  );
  const apiKey =
    (config.apiKeyEnv ? process.env[config.apiKeyEnv] : undefined) ||
    process.env.API_SERVER_KEY ||
    (config.apiKeyEnv ? fileEnv[config.apiKeyEnv] : undefined) ||
    fileEnv.API_SERVER_KEY;
  const model = (config.modelEnv ? process.env[config.modelEnv] : undefined) || (config.modelEnv ? fileEnv[config.modelEnv] : undefined);

  if (!apiKey) {
    throw new HermesAgentError(
      "not_configured",
      `${agentName} Hermes API key is not configured. Set an API server key in the matching profile environment.`
    );
  }

  return {
    baseUrl,
    apiKey,
    model,
    defaultConversation: config.defaultConversation
  };
}

function headers(apiKey: string) {
  return {
    authorization: `Bearer ${apiKey}`,
    "content-type": "application/json"
  };
}

function timeoutSignal(ms: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timeout)
  };
}

function extractText(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const response = value as {
    output_text?: unknown;
    text?: unknown;
    message?: { content?: unknown };
    choices?: Array<{ message?: { content?: unknown }; text?: unknown }>;
    output?: Array<{ content?: Array<{ text?: unknown; value?: unknown }> }>;
  };

  if (typeof response.output_text === "string") return response.output_text;
  if (typeof response.text === "string") return response.text;
  if (typeof response.message?.content === "string") return response.message.content;

  const choice = response.choices?.[0];
  if (typeof choice?.message?.content === "string") return choice.message.content;
  if (typeof choice?.text === "string") return choice.text;

  const outputText = response.output
    ?.flatMap((item) => item.content || [])
    .map((content) => {
      if (typeof content.text === "string") return content.text;
      if (typeof content.value === "string") return content.value;
      return "";
    })
    .filter(Boolean)
    .join("\n");

  return outputText || "";
}

export async function sendHermesAgentResponse(
  agentName: AgentName,
  input: {
    message: string;
    responsesInput?: HermesResponsesInput;
    conversation?: string;
    context?: string;
  }
): Promise<HermesAgentResponse> {
  const { baseUrl, apiKey, model, defaultConversation } = await getHermesAgentConfig(agentName);
  const body: Record<string, unknown> = {
    conversation: input.conversation || defaultConversation,
    input: input.responsesInput || (input.context ? `${input.context}\n\nUser request:\n${input.message}` : input.message)
  };

  if (model) body.model = model;

  let response: Response;
  const timeout = timeoutSignal(DEFAULT_RESPONSE_TIMEOUT_MS);
  try {
    response = await fetch(`${baseUrl}/responses`, {
      method: "POST",
      headers: headers(apiKey),
      body: JSON.stringify(body),
      cache: "no-store",
      signal: timeout.signal
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new HermesAgentError("unreachable", `${agentName} Hermes response timed out after ${DEFAULT_RESPONSE_TIMEOUT_MS}ms.`);
    }
    throw new HermesAgentError(
      "unreachable",
      error instanceof Error ? error.message : `${agentName} Hermes API Server is unreachable.`
    );
  } finally {
    timeout.clear();
  }

  if (response.status === 401 || response.status === 403) {
    throw new HermesAgentError("unauthorized", `${agentName} Hermes rejected the configured API key.`, response.status);
  }

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new HermesAgentError(
      "bad_response",
      `${agentName} Hermes /v1/responses returned ${response.status}${details ? `: ${details.slice(0, 300)}` : ""}`,
      response.status
    );
  }

  const raw = (await response.json().catch(() => null)) as unknown;
  const text = extractText(raw).trim();

  if (!text) {
    throw new HermesAgentError("bad_response", `${agentName} Hermes returned a response without readable text.`);
  }

  return { text, raw };
}
