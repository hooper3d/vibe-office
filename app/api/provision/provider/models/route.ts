import { listProviderModels } from "@/lib/hermes-provisioner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      providerId?: string;
      apiKey?: string;
      apiBaseUrl?: string;
    };

    const result = await listProviderModels({
      providerId: body.providerId || "",
      apiKey: body.apiKey || "",
      apiBaseUrl: body.apiBaseUrl
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
        models: [],
        message: error instanceof Error ? error.message : "获取模型列表失败。"
      },
      {
        status: 400,
        headers: { "cache-control": "no-store" }
      }
    );
  }
}
