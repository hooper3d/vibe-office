import { checkTigerHermesHealth, HermesTigerError } from "@/lib/hermes-tiger-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const health = await checkTigerHermesHealth();

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
    const reason = error instanceof HermesTigerError ? error.code : "unreachable";
    const message = error instanceof Error ? error.message : "Tiger Hermes is unavailable.";

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
