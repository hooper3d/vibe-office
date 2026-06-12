import { promises as fs } from "fs";
import os from "os";
import path from "path";
import type { HermesResponsesInput } from "@/lib/hermes-multimodal";

const DEFAULT_HERMES_BASE_URL = "http://127.0.0.1:8642/v1";
const DEFAULT_CONVERSATION = "ag-ui-lucy";

export type HermesLucyErrorCode = "not_configured" | "unreachable" | "unauthorized" | "bad_response";

export class HermesLucyError extends Error {
  code: HermesLucyErrorCode;
  status?: number;

  constructor(code: HermesLucyErrorCode, message: string, status?: number) {
    super(message);
    this.name = "HermesLucyError";
    this.code = code;
    this.status = status;
  }
}

export type HermesLucyResponse = {
  text: string;
  raw: unknown;
};

type HermesEnv = Record<string, string>;

function normalizeBaseUrl(value?: string) {
  return (value || DEFAULT_HERMES_BASE_URL).replace(/\/+$/, "");
}

async function readHermesEnv(): Promise<HermesEnv> {
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

async function getHermesConfig() {
  const fileEnv = await readHermesEnv();
  const baseUrl = normalizeBaseUrl(process.env.HERMES_API_BASE_URL || fileEnv.HERMES_API_BASE_URL);
  const apiKey = process.env.HERMES_API_SERVER_KEY || process.env.API_SERVER_KEY || fileEnv.API_SERVER_KEY;
  const model = process.env.HERMES_LUCY_MODEL || fileEnv.HERMES_LUCY_MODEL;

  if (!apiKey) {
    throw new HermesLucyError(
      "not_configured",
      "Hermes API key is not configured. Set API_SERVER_KEY in ~/.hermes/.env or HERMES_API_SERVER_KEY in the Next.js environment."
    );
  }

  return { baseUrl, apiKey, model };
}

function headers(apiKey: string) {
  return {
    authorization: `Bearer ${apiKey}`,
    "content-type": "application/json"
  };
}

function extractText(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const response = value as {
    output_text?: unknown;
    text?: unknown;
    message?: { content?: unknown };
    choices?: Array<{ message?: { content?: unknown }; text?: unknown }>;
    output?: Array<{ content?: Array<{ text?: unknown; type?: string; value?: unknown }> }>;
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

export async function checkHermesHealth() {
  const { baseUrl, apiKey } = await getHermesConfig();
  const healthUrls = [baseUrl.replace(/\/v1$/, "/health"), `${baseUrl}/health`];
  let lastError = "";

  for (const url of healthUrls) {
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: { authorization: `Bearer ${apiKey}` },
        cache: "no-store"
      });

      if (response.status === 401 || response.status === 403) {
        throw new HermesLucyError("unauthorized", "Hermes rejected the configured API key.", response.status);
      }

      if (response.ok) return { ok: true, url };
      lastError = `Hermes health check returned ${response.status} at ${url}.`;
    } catch (error) {
      if (error instanceof HermesLucyError) throw error;
      lastError = error instanceof Error ? error.message : "Hermes health check failed.";
    }
  }

  throw new HermesLucyError("unreachable", lastError || "Hermes API Server is unreachable.");
}

export async function sendLucyResponse(input: {
  message: string;
  responsesInput?: HermesResponsesInput;
  conversation?: string;
  context?: string;
}): Promise<HermesLucyResponse> {
  const { baseUrl, apiKey, model } = await getHermesConfig();
  const body: Record<string, unknown> = {
    conversation: input.conversation || DEFAULT_CONVERSATION,
    input: input.context ? `${input.context}\n\n用户需求：\n${input.message}` : input.message
  };

  if (input.responsesInput) body.input = input.responsesInput;
  if (model) body.model = model;

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/responses`, {
      method: "POST",
      headers: headers(apiKey),
      body: JSON.stringify(body),
      cache: "no-store"
    });
  } catch (error) {
    throw new HermesLucyError(
      "unreachable",
      error instanceof Error ? error.message : "Hermes API Server is unreachable."
    );
  }

  if (response.status === 401 || response.status === 403) {
    throw new HermesLucyError("unauthorized", "Hermes rejected the configured API key.", response.status);
  }

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new HermesLucyError(
      "bad_response",
      `Hermes /v1/responses returned ${response.status}${details ? `: ${details.slice(0, 300)}` : ""}`,
      response.status
    );
  }

  const raw = (await response.json().catch(() => null)) as unknown;
  const text = extractText(raw).trim();

  if (!text) {
    throw new HermesLucyError("bad_response", "Hermes returned a response without readable text.");
  }

  return { text, raw };
}
