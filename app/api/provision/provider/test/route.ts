import { testProviderConnection } from "@/lib/hermes-provisioner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      providerId?: string;
      apiKey?: string;
      apiBaseUrl?: string;
      model?: string;
    };

    const result = await testProviderConnection({
      providerId: body.providerId || "",
      apiKey: body.apiKey || "",
      apiBaseUrl: body.apiBaseUrl,
      model: body.model
    });

    return Response.json(result, {
      status: result.ok ? 200 : 400,
      headers: { "cache-control": "no-store" }
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        providerId: "",
        message: error instanceof Error ? error.message : "Provider test failed."
      },
      {
        status: 400,
        headers: { "cache-control": "no-store" }
      }
    );
  }
}

