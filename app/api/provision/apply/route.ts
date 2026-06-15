export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const enabled = process.env.AG_UI_ENABLE_HERMES_PROVISIONING === "1";

  if (!enabled) {
    return Response.json(
      {
        ok: false,
        status: "dry_run_only",
        message:
          "Real Hermes provisioning is disabled. Set AG_UI_ENABLE_HERMES_PROVISIONING=1 after adding an explicit authorization flow."
      },
      {
        status: 403,
        headers: { "cache-control": "no-store" }
      }
    );
  }

  return Response.json(
    {
      ok: false,
      status: "not_implemented",
      message: "The apply step is intentionally blocked in Phase 0."
    },
    {
      status: 501,
      headers: { "cache-control": "no-store" }
    }
  );
}

