export type JsonResponseLike = {
  statusCode: number;
  setHeader: (name: string, value: string) => void;
  end: (body: string) => void;
};

export type BinaryResponseLike = {
  statusCode: number;
  setHeader: (name: string, value: string) => void;
  end: (body: Buffer) => void;
};

export type ProviderForwardRequest = {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
};

export function readJsonBody(req: NodeJS.ReadableStream) {
  return new Promise<Record<string, unknown>>((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error("Invalid JSON request."));
      }
    });
    req.on("error", reject);
  });
}

export function sendJson(res: JsonResponseLike, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

export function sendSafeError(res: JsonResponseLike, status: number, error: unknown, fallback = "Local trusted request failed.") {
  sendJson(res, status, {
    error: {
      message: getSafeErrorMessage(error, fallback),
    },
  });
}

export function sendBinary(
  res: BinaryResponseLike,
  status: number,
  body: Buffer,
  contentType: string,
) {
  res.statusCode = status;
  res.setHeader("Content-Type", contentType);
  res.setHeader("Cache-Control", "no-store");
  res.end(body);
}

export async function forwardProviderRequest(
  res: {
    statusCode: number;
    setHeader: (name: string, value: string) => void;
    end: (body: string) => void;
  },
  providerRequest: ProviderForwardRequest,
) {
  const response = await fetch(providerRequest.url, {
    method: providerRequest.method,
    headers: providerRequest.headers,
    body: providerRequest.body,
  });
  const contentType = response.headers.get("content-type") || "application/json";
  const responseBody = await response.text();
  const safeResponseBody = response.ok ? responseBody : redactSensitiveText(responseBody);

  res.statusCode = response.status;
  res.setHeader("Content-Type", contentType);
  res.setHeader("Cache-Control", "no-store");
  res.end(safeResponseBody);
}

export function getSafeErrorMessage(error: unknown, fallback = "Workspace file request failed.") {
  return redactSensitiveText(error instanceof Error ? error.message : fallback);
}

export function redactSensitiveText(text: string) {
  return text
    .replace(/("(?:apiKey|api_key|x-api-key|token|access_token)"\s*:\s*")[^"]+(")/gi, "$1[redacted]$2")
    .replace(/(authorization\s*[:=]\s*(?:Bearer\s+)?["']?)[^&\s"',;}]+/gi, "$1[redacted]")
    .replace(/((?:x-api-key|api[_-]?key|apikey|token|access_token)\s*[:=]\s*["']?)[^&\s"',;}]+/gi, "$1[redacted]")
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, "$1[redacted]")
    .replace(/([?&](?:api[_-]?key|apikey|token|access_token)=)[^&\s]+/gi, "$1[redacted]")
    .replace(/(https?:\/\/)([^/\s:@]+):([^@\s/]+)@/gi, "$1[redacted]@");
}
