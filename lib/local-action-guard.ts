const LOCAL_ACTION_HEADER = "x-vibe-office-local-action";
const LOCAL_ACTION_VALUE = "1";

function isLocalHostname(hostname: string) {
  const normalized = hostname.toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "[::1]" || normalized === "::1";
}

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;

  try {
    const requestUrl = new URL(request.url);
    const originUrl = new URL(origin);
    if (originUrl.origin === requestUrl.origin) return true;
    return isLocalHostname(originUrl.hostname) && isLocalHostname(requestUrl.hostname) && originUrl.port === requestUrl.port;
  } catch {
    return false;
  }
}

export function assertLocalWriteRequest(request: Request) {
  if (!sameOrigin(request)) {
    return Response.json(
      {
        ok: false,
        message: "Local write request must come from this Vibe Office page."
      },
      {
        status: 403,
        headers: { "cache-control": "no-store" }
      }
    );
  }

  if (request.headers.get(LOCAL_ACTION_HEADER) !== LOCAL_ACTION_VALUE) {
    return Response.json(
      {
        ok: false,
        message: "Local write request is missing its confirmation header."
      },
      {
        status: 403,
        headers: { "cache-control": "no-store" }
      }
    );
  }

  return null;
}

export function localWriteHeaders(extra?: HeadersInit) {
  return {
    ...extra,
    [LOCAL_ACTION_HEADER]: LOCAL_ACTION_VALUE
  };
}
