import { ensureHermesApiServerKey, writeHermesEnvValues } from "@/lib/hermes-api-key";
import { assertLocalWriteRequest } from "@/lib/local-action-guard";
import { getProviderTemplate } from "@/lib/provider-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RuntimeModelKeyRequest = {
  providerId?: string;
  apiKey?: string;
  apiBaseUrl?: string;
  model?: string;
};

function hermesEnvForProvider(input: Required<Pick<RuntimeModelKeyRequest, "providerId" | "apiKey">> & {
  apiBaseUrl?: string;
  model?: string;
}) {
  const provider = getProviderTemplate(input.providerId);
  if (!provider) throw new Error("Unknown provider.");

  if (input.providerId === "custom-openai") {
    if (!input.apiBaseUrl?.trim()) throw new Error("A base URL is required for a custom provider.");
    return {
      provider,
      values: {
        OPENAI_API_KEY: input.apiKey,
        OPENAI_BASE_URL: input.apiBaseUrl.trim(),
        HERMES_MODEL: input.model?.trim() || provider.defaultModel
      }
    };
  }

  const baseUrlNameByProvider: Record<string, string> = {
    openai: "OPENAI_BASE_URL",
    openrouter: "OPENROUTER_BASE_URL",
    deepseek: "DEEPSEEK_BASE_URL",
    kimi: "KIMI_BASE_URL"
  };
  const baseUrlName = baseUrlNameByProvider[input.providerId];
  const values: Record<string, string> = {
    [provider.keyEnvName]: input.apiKey,
    HERMES_MODEL: input.model?.trim() || provider.defaultModel
  };

  if (baseUrlName && provider.apiBaseUrl) {
    values[baseUrlName] = provider.apiBaseUrl;
  }

  return {
    provider,
    values
  };
}

export async function POST(request: Request) {
  const blocked = assertLocalWriteRequest(request);
  if (blocked) return blocked;

  try {
    const body = (await request.json()) as RuntimeModelKeyRequest;
    const providerId = body.providerId?.trim() || "";
    const apiKey = body.apiKey?.trim() || "";

    if (!providerId) {
      return Response.json({ ok: false, message: "Choose a model provider." }, { status: 400 });
    }

    if (apiKey.length < 8) {
      return Response.json({ ok: false, message: "This model key looks incomplete." }, { status: 400 });
    }

    const { provider, values } = hermesEnvForProvider({
      providerId,
      apiKey,
      apiBaseUrl: body.apiBaseUrl,
      model: body.model
    });
    const apiServerKey = await ensureHermesApiServerKey();

    await writeHermesEnvValues({
      API_SERVER_ENABLED: "true",
      API_SERVER_HOST: "127.0.0.1",
      API_SERVER_PORT: "8642",
      ...values
    });

    return Response.json(
      {
        ok: true,
        providerId: provider.id,
        providerName: provider.name,
        apiServerKeyCreated: apiServerKey.created,
        restartRequired: true,
        message: "Model key saved for local Hermes. Restart Agent Engine if it is already running."
      },
      {
        headers: { "cache-control": "no-store" }
      }
    );
  } catch (error) {
    return Response.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Could not save the model key."
      },
      {
        status: 400,
        headers: { "cache-control": "no-store" }
      }
    );
  }
}
