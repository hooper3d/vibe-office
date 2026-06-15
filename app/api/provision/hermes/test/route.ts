import { testHermesConnection } from "@/lib/hermes-provisioner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      baseUrl?: string;
      apiKey?: string;
    };

    const result = await testHermesConnection({
      baseUrl: body.baseUrl || "",
      apiKey: body.apiKey || ""
    });

    return Response.json(result, {
      status: result.ok ? 200 : 400,
      headers: { "cache-control": "no-store" }
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        baseUrl: "",
        models: [],
        canCreateProfiles: false,
        message: error instanceof Error ? error.message : "Hermes test failed.",
        notes: []
      },
      {
        status: 400,
        headers: { "cache-control": "no-store" }
      }
    );
  }
}

