import { readRecentHistory, resetRunHistory } from "@/lib/run-history";
import { getCodexExecStatus } from "@/lib/codex-exec-adapter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const history = await readRecentHistory();

  return Response.json({
    ...history,
    runnerStatus: getCodexExecStatus()
  }, {
    headers: {
      "cache-control": "no-store"
    }
  });
}

export async function DELETE() {
  await resetRunHistory();

  return Response.json(
    {
      ok: true
    },
    {
      headers: {
        "cache-control": "no-store"
      }
    }
  );
}
