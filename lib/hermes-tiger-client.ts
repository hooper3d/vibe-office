const DEFAULT_TIGER_BASE_URL = "http://127.0.0.1:18643/v1";
const DEFAULT_CONVERSATION = "ag-ui-tiger";

export type HermesTigerErrorCode = "not_configured" | "unreachable" | "unauthorized" | "bad_response";

export class HermesTigerError extends Error {
  code: HermesTigerErrorCode;
  status?: number;

  constructor(code: HermesTigerErrorCode, message: string, status?: number) {
    super(message);
    this.name = "HermesTigerError";
    this.code = code;
    this.status = status;
  }
}

export type HermesTigerResponse = {
  text: string;
  raw: unknown;
};

function normalizeBaseUrl(value?: string) {
  return (value || DEFAULT_TIGER_BASE_URL).replace(/\/+$/, "");
}

function getTigerHermesConfig() {
  const baseUrl = normalizeBaseUrl(process.env.TIGER_HERMES_API_BASE_URL);
  const apiKey = process.env.TIGER_HERMES_API_SERVER_KEY;
  const model = process.env.TIGER_HERMES_MODEL;

  if (!apiKey) {
    throw new HermesTigerError(
      "not_configured",
      "Tiger Hermes API key is not configured. Set TIGER_HERMES_API_SERVER_KEY in .env.local or the deployment environment."
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

export async function checkTigerHermesHealth() {
  const { baseUrl, apiKey } = getTigerHermesConfig();
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
        throw new HermesTigerError("unauthorized", "Tiger Hermes rejected the configured API key.", response.status);
      }

      if (response.ok) return { ok: true, url };
      lastError = `Tiger Hermes health check returned ${response.status} at ${url}.`;
    } catch (error) {
      if (error instanceof HermesTigerError) throw error;
      lastError = error instanceof Error ? error.message : "Tiger Hermes health check failed.";
    }
  }

  throw new HermesTigerError("unreachable", lastError || "Tiger Hermes API Server is unreachable.");
}

export async function sendTigerResponse(input: {
  message: string;
  conversation?: string;
  context?: string;
}): Promise<HermesTigerResponse> {
  const { baseUrl, apiKey, model } = getTigerHermesConfig();
  const body: Record<string, unknown> = {
    conversation: input.conversation || DEFAULT_CONVERSATION,
    input: input.context ? `${input.context}\n\nUser request:\n${input.message}` : input.message
  };

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
    throw new HermesTigerError(
      "unreachable",
      error instanceof Error ? error.message : "Tiger Hermes API Server is unreachable."
    );
  }

  if (response.status === 401 || response.status === 403) {
    throw new HermesTigerError("unauthorized", "Tiger Hermes rejected the configured API key.", response.status);
  }

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new HermesTigerError(
      "bad_response",
      `Tiger Hermes /v1/responses returned ${response.status}${details ? `: ${details.slice(0, 300)}` : ""}`,
      response.status
    );
  }

  const raw = (await response.json().catch(() => null)) as unknown;
  const text = extractText(raw).trim();

  if (!text) {
    throw new HermesTigerError("bad_response", "Tiger Hermes returned a response without readable text.");
  }

  return { text, raw };
}
