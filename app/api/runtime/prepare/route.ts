import { prepareLocalRuntime } from "@/lib/local-workspace";
import { assertLocalWriteRequest } from "@/lib/local-action-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const blocked = assertLocalWriteRequest(request);
  if (blocked) return blocked;

  try {
    const snapshot = await prepareLocalRuntime();
    return Response.json(
      {
        ok: true,
        config: snapshot.config,
        user: snapshot.user,
        health: snapshot.health,
        quickStart: snapshot.quickStart
      },
      {
        headers: { "cache-control": "no-store" }
      }
    );
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to prepare runtime."
      },
      {
        status: 500,
        headers: { "cache-control": "no-store" }
      }
    );
  }
}
