import { checkHermesHealth, HermesLucyError } from "@/lib/hermes-lucy-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const health = await checkHermesHealth();

    return Response.json(
      {
        connected: true,
        status: "online",
        healthUrl: health.url
      },
      {
        headers: {
          "cache-control": "no-store"
        }
      }
    );
  } catch (error) {
    const reason = error instanceof HermesLucyError ? error.code : "unreachable";
    const message = error instanceof Error ? error.message : "Hermes Lucy is unavailable.";

    return Response.json(
      {
        connected: false,
        status: "offline",
        reason,
        message
      },
      {
        status: 200,
        headers: {
          "cache-control": "no-store"
        }
      }
    );
  }
}
