import { readRecentHistory, resetRunHistory } from "@/lib/run-history";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const history = await readRecentHistory();

  return Response.json(history, {
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
