import { getOfficeTemplate } from "@/lib/office-templates";
import { getProviderTemplate } from "@/lib/provider-config";
import type {
  HermesTestResult,
  ProviderTestResult,
  ProvisioningMode,
  ProvisioningPlan,
  ProvisioningUserPath
} from "@/types/provisioning";

const DEFAULT_PROFILE_PORT = 8642;
const REQUEST_TIMEOUT_MS = 10_000;

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.trim().replace(/\/+$/, "");
}

function endpointUrl(baseUrl: string, endpoint: "models" | "responses" | "chat/completions") {
  const clean = normalizeBaseUrl(baseUrl);
  return `${clean}/${endpoint}`;
}

function withTimeout() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  return { controller, timeout };
}

async function fetchJsonWithBearer(input: { url: string; apiKey: string }) {
  const startedAt = Date.now();
  const { controller, timeout } = withTimeout();

  try {
    const response = await fetch(input.url, {
      headers: {
        authorization: `Bearer ${input.apiKey}`,
        "content-type": "application/json"
      },
      signal: controller.signal
    });
    const text = await response.text();
    let data: unknown = null;
    if (text) {
      try {
        data = JSON.parse(text) as unknown;
      } catch {
        data = text;
      }
    }
    return {
      ok: response.ok,
      status: response.status,
      latencyMs: Date.now() - startedAt,
      data
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function probeEndpoint(input: { url: string; apiKey?: string; method?: "GET" | "OPTIONS" | "POST"; body?: unknown }) {
  const startedAt = Date.now();
  const { controller, timeout } = withTimeout();

  try {
    const response = await fetch(input.url, {
      method: input.method || "GET",
      headers: {
        ...(input.apiKey ? { authorization: `Bearer ${input.apiKey}` } : {}),
        "content-type": "application/json"
      },
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: controller.signal
    });
    const text = await response.text().catch(() => "");
    let data: unknown = null;
    if (text) {
      try {
        data = JSON.parse(text) as unknown;
      } catch {
        data = text;
      }
    }
    return {
      reachable: true,
      ok: response.ok,
      status: response.status,
      latencyMs: Date.now() - startedAt,
      data,
      message: response.ok ? "Reachable." : `HTTP ${response.status}.`
    };
  } catch (error) {
    return {
      reachable: false,
      ok: false,
      latencyMs: Date.now() - startedAt,
      message: error instanceof Error ? error.message : "Endpoint is unreachable."
    };
  } finally {
    clearTimeout(timeout);
  }
}

function extractModelIds(data: unknown) {
  if (!data || typeof data !== "object") return [];
  const maybeData = (data as { data?: unknown }).data;
  if (!Array.isArray(maybeData)) return [];

  return maybeData
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const id = (item as { id?: unknown }).id;
      return typeof id === "string" ? id : null;
    })
    .filter((id): id is string => Boolean(id))
    .slice(0, 8);
}

export async function listProviderModels(input: {
  providerId: string;
  apiKey: string;
  apiBaseUrl?: string;
}): Promise<ProviderTestResult & { models?: string[] }> {
  const provider = getProviderTemplate(input.providerId);
  if (!provider) {
    return {
      ok: false,
      providerId: input.providerId,
      message: "没有找到这个模型服务商。"
    };
  }

  if (!input.apiKey || input.apiKey.trim().length < 8) {
    return {
      ok: false,
      providerId: provider.id,
      providerName: provider.name,
      message: "这个 Key 看起来不完整，请检查后重新输入。"
    };
  }

  const baseUrl = normalizeBaseUrl(input.apiBaseUrl || provider.apiBaseUrl || "");
  if (!baseUrl) {
    return {
      ok: false,
      providerId: provider.id,
      providerName: provider.name,
      message: "自定义模型服务需要填写 Base URL。"
    };
  }

  try {
    const result = await fetchJsonWithBearer({
      url: endpointUrl(baseUrl, "models"),
      apiKey: input.apiKey.trim()
    });
    const models = extractModelIds(result.data);

    return {
      ok: result.ok && models.length > 0,
      providerId: provider.id,
      providerName: provider.name,
      latencyMs: result.latencyMs,
      status: result.status,
      models,
      message:
        result.ok && models.length > 0
          ? "已获取模型列表。"
          : `获取模型列表失败：服务返回 ${result.status || "无法连接"}。请检查 Key、服务商或 Base URL。`
    };
  } catch (error) {
    return {
      ok: false,
      providerId: provider.id,
      providerName: provider.name,
      message: error instanceof Error ? error.message : "获取模型列表失败。"
    };
  }
}

export async function testProviderConnection(input: {
  providerId: string;
  apiKey: string;
  apiBaseUrl?: string;
  model?: string;
}): Promise<ProviderTestResult> {
  const provider = getProviderTemplate(input.providerId);
  if (!provider) {
    return {
      ok: false,
      providerId: input.providerId,
      message: "没有找到这个模型服务商。"
    };
  }

  if (!input.apiKey || input.apiKey.trim().length < 8) {
    return {
      ok: false,
      providerId: provider.id,
      providerName: provider.name,
      model: input.model || provider.defaultModel,
      message: "这个 Key 看起来不完整，请检查后重新输入。"
    };
  }

  const baseUrl = normalizeBaseUrl(input.apiBaseUrl || provider.apiBaseUrl || "");
  if (!baseUrl) {
    return {
      ok: false,
      providerId: provider.id,
      providerName: provider.name,
      model: input.model || provider.defaultModel,
      message: "自定义模型服务需要填写 Base URL。"
    };
  }

  try {
    const modelsProbe = await fetchJsonWithBearer({
      url: endpointUrl(baseUrl, "models"),
      apiKey: input.apiKey.trim()
    });
    const model = input.model?.trim() || provider.defaultModel;
    const chatProbe = await probeEndpoint({
      url: endpointUrl(baseUrl, "chat/completions"),
      apiKey: input.apiKey.trim(),
      method: "POST",
      body: {
        model,
        stream: false,
        max_tokens: 8,
        messages: [
          {
            role: "user",
            content: "Reply with OK."
          }
        ]
      }
    });
    return {
      ok: chatProbe.ok,
      providerId: provider.id,
      providerName: provider.name,
      model,
      latencyMs: chatProbe.latencyMs || modelsProbe.latencyMs,
      status: chatProbe.status || modelsProbe.status,
      message: chatProbe.ok
        ? "模型连接成功。"
        : `模型连接失败：服务返回 ${chatProbe.status || modelsProbe.status || "无法连接"}。请检查 Key、模型名称、服务商或 Base URL。`
    };
  } catch (error) {
    return {
      ok: false,
      providerId: provider.id,
      providerName: provider.name,
      model: input.model || provider.defaultModel,
      message: error instanceof Error ? error.message : "模型连接失败。"
    };
  }
}

export async function testHermesConnection(input: { baseUrl: string; apiKey: string }): Promise<HermesTestResult> {
  const baseUrl = normalizeBaseUrl(input.baseUrl || "");
  if (!baseUrl) {
    return {
      ok: false,
      baseUrl,
      models: [],
      canCreateProfiles: false,
      diagnosticCode: "missing_base_url",
      message: "Hermes API address is required.",
      notes: [],
      nextSteps: [
        "Use the default local address: http://127.0.0.1:8642/v1.",
        "If that fails, try http://localhost:8642/v1.",
        "Then run Diagnose local Hermes."
      ]
    };
  }

  const apiKey = input.apiKey?.trim() || "";
  const modelsUrl = endpointUrl(baseUrl, "models");
  const responsesUrl = endpointUrl(baseUrl, "responses");

  if (apiKey.length < 8) {
    const modelsProbe = await probeEndpoint({ url: modelsUrl });
    const responsesProbe = await probeEndpoint({ url: responsesUrl, method: "OPTIONS" });
    const endpointReachable = modelsProbe.reachable || responsesProbe.reachable;

    return {
      ok: false,
      baseUrl,
      models: modelsProbe.ok ? extractModelIds(modelsProbe.data) : [],
      latencyMs: modelsProbe.latencyMs,
      canCreateProfiles: false,
      diagnosticCode: endpointReachable ? "api_reachable_key_required" : "api_unreachable",
      checkedEndpoints: [
        {
          label: "/models",
          url: modelsUrl,
          ok: modelsProbe.ok,
          status: modelsProbe.status,
          message: modelsProbe.reachable
            ? modelsProbe.ok
              ? "Models endpoint responded without a key."
              : "Hermes API responded. A Hermes access key is required."
            : "Could not reach this endpoint."
        },
        {
          label: "/responses",
          url: responsesUrl,
          ok: responsesProbe.ok,
          status: responsesProbe.status,
          message: responsesProbe.reachable
            ? responsesProbe.ok
              ? "Responses endpoint responded without a key."
              : "Hermes API responded. A Hermes access key is required."
            : "Could not reach this endpoint."
        }
      ],
      message: endpointReachable
        ? "Hermes API is running, but an access key is required."
        : "Hermes framework may be installed, but API is not reachable.",
      notes: endpointReachable
        ? ["No Chief Agent was connected. The endpoint check only confirms the API responded."]
        : ["No Chief Agent was connected."],
      nextSteps: endpointReachable
        ? [
            "Open Hermes on this computer.",
            "Ask Hermes to enable its API server.",
            "Ask Hermes to generate or return API_SERVER_KEY.",
            "Paste the key Hermes gives you here."
          ]
        : [
            "Start Hermes on this computer.",
            "Ask Hermes to enable its API server.",
            "Ask Hermes to generate API_SERVER_KEY if needed.",
            "Hermes may restart the gateway and disconnect for about 10 seconds.",
            "Run Diagnose local Hermes again."
          ]
    };
  }

  try {
    const result = await fetchJsonWithBearer({
      url: modelsUrl,
      apiKey
    });
    const models = extractModelIds(result.data);
    const responseModel = models[0] || "hermes-agent";
    const responsesProbe = await probeEndpoint({
      url: responsesUrl,
      apiKey,
      method: "POST",
      body: {
        model: responseModel,
        input: "ping"
      }
    });
    const unauthorized = result.status === 401 || result.status === 403;
    const connected = result.ok && responsesProbe.ok;
    const responsesUnavailable = result.ok && !responsesProbe.ok;

    return {
      ok: connected,
      baseUrl,
      models,
      latencyMs: result.latencyMs,
      canCreateProfiles: false,
      diagnosticCode: connected
        ? "connected"
        : unauthorized
          ? "unauthorized_key"
          : responsesUnavailable
            ? "responses_unavailable"
            : "bad_response",
      checkedEndpoints: [
        {
          label: "/models",
          url: modelsUrl,
          ok: result.ok,
          status: result.status,
          message: result.ok ? "Models endpoint accepted the key." : `HTTP ${result.status}.`
        },
        {
          label: "/responses",
          url: responsesUrl,
          ok: responsesProbe.ok,
          status: responsesProbe.status,
          message: responsesProbe.ok
            ? "Responses endpoint accepted a test prompt."
            : responsesProbe.reachable
              ? "Responses endpoint is not ready."
            : "Could not reach this endpoint."
        }
      ],
      message: connected
        ? "Hermes Agent is connected. Review activation before it goes online."
        : unauthorized
          ? "Hermes rejected this key. Use a Hermes access key, not your model provider key."
          : responsesUnavailable
            ? "Responses endpoint is not ready. Enable the API server and restart Hermes."
            : `Hermes responded with HTTP ${result.status}.`,
      notes: connected
        ? [
            "Vibe Office can connect to this Hermes instance.",
            "Creating separate office members still needs local permission."
          ]
        : ["No Chief Agent was connected."],
      nextSteps: connected
        ? ["Review activation before the Chief Agent goes online."]
        : unauthorized
          ? [
              "Ask Hermes for the API_SERVER_KEY.",
              "Paste the key Hermes gives you here.",
              "Run Check Hermes Agent again."
            ]
          : responsesUnavailable
            ? [
                "Ask Hermes to restart the gateway.",
                "Ask Hermes to confirm its API server is ready for responses.",
                "Return here and run Check Hermes Agent again."
              ]
            : [
                "Confirm this address points to the local Hermes /v1 API.",
                "Check whether the Hermes API server is enabled.",
                "Restart Hermes, then run Diagnose local Hermes again."
            ]
    };
  } catch (error) {
    return {
      ok: false,
      baseUrl,
      models: [],
      canCreateProfiles: false,
      diagnosticCode: "api_unreachable",
      checkedEndpoints: [
        {
          label: "/models",
          url: modelsUrl,
          ok: false,
          message: "Could not reach this endpoint."
        },
        {
          label: "/responses",
          url: responsesUrl,
          ok: false,
          message: "Not checked because /models failed."
        }
      ],
      message: "Hermes framework may be installed, but API is not reachable.",
      notes: ["No office members were created."],
      nextSteps: [
        "Start Hermes on this computer.",
        "Ask Hermes to enable its API server.",
        "Ask Hermes to generate API_SERVER_KEY if needed.",
        "Hermes may restart the gateway and disconnect for about 10 seconds.",
        "Restart Hermes, then run Diagnose local Hermes again."
      ]
    };
  }
}

export function createProvisioningPlan(input: {
  userPath: ProvisioningUserPath;
  mode?: ProvisioningMode;
  providerId?: string;
  officeTemplateId?: string;
  hermesBaseUrl?: string;
}): ProvisioningPlan {
  const officeTemplate = getOfficeTemplate(input.officeTemplateId || "default-product-team") || getOfficeTemplate("default-product-team");
  if (!officeTemplate) {
    throw new Error("Office template not found.");
  }

  const provider = input.providerId ? getProviderTemplate(input.providerId) : undefined;
  const mode: ProvisioningMode =
    input.mode || (input.userPath === "existing_hermes" ? "connect_existing" : "dry_run");
  const baseUrl = input.hermesBaseUrl ? normalizeBaseUrl(input.hermesBaseUrl) : undefined;
  const agents =
    input.userPath === "existing_hermes" && mode === "connect_existing"
      ? [
          {
            ...officeTemplate.agents[0],
            profileName: "existing-hermes",
            displayName: "Chief",
            role: "Coordinates agents and context",
            isChief: true
          }
        ]
      : officeTemplate.agents;

  return {
    providerId: provider?.id,
    providerName: provider?.name,
    officeTemplateId: officeTemplate.id,
    officeTemplateName: officeTemplate.name,
    mode,
    userPath: input.userPath,
    agents: agents.map((agent, index) => ({
      profileName: agent.profileName,
      displayName: agent.displayName,
      role: agent.role,
      isChief: Boolean(agent.isChief),
      apiBaseUrl: baseUrl || `http://127.0.0.1:${DEFAULT_PROFILE_PORT + index}/v1`,
      port: baseUrl ? undefined : DEFAULT_PROFILE_PORT + index,
      status: "planned",
      contextFiles: agent.contextFiles,
      soulTemplate: agent.soulTemplate
    })),
    commands: buildPlanCommands({
      userPath: input.userPath,
      mode,
      providerId: provider?.id,
      providerEnvName: provider?.keyEnvName,
      agents
    }),
    warnings: buildPlanWarnings({
      userPath: input.userPath,
      mode,
      hasProvider: Boolean(provider),
      hasHermesBaseUrl: Boolean(baseUrl)
    }),
    nextSteps: buildNextSteps(input.userPath, mode)
  };
}

function buildPlanCommands(input: {
  userPath: ProvisioningUserPath;
  mode: ProvisioningMode;
  providerId?: string;
  providerEnvName?: string;
  agents: Array<{ profileName: string; displayName: string }>;
}) {
  if (input.userPath === "existing_hermes" && input.mode === "connect_existing") {
    return ["# Connect existing Hermes API as Chief Agent.", "# No profile creation command will run in this mode."];
  }

  const lines = [
    "# Dry-run preview. Commands are not executed by Phase 0.",
    input.providerEnvName ? `$env:${input.providerEnvName}=\"<customer-model-api-key>\"` : "# Set provider API key."
  ];

  for (const agent of input.agents) {
    lines.push(`hermes profile create ${agent.profileName} --clone`);
    lines.push(`# write ${agent.displayName} SOUL.md and Vibe Office context injection rules`);
  }

  lines.push("# generate API_SERVER_KEY values for each profile");
  lines.push("# start each profile API server / gateway after explicit authorization");
  return lines;
}

function buildPlanWarnings(input: {
  userPath: ProvisioningUserPath;
  mode: ProvisioningMode;
  hasProvider: boolean;
  hasHermesBaseUrl: boolean;
}) {
  const warnings: string[] = [];

  if (input.userPath === "model_key_only" && !input.hasProvider) {
    warnings.push("Check the model key before creating this office.");
  }

  if (input.userPath === "existing_hermes" && !input.hasHermesBaseUrl) {
    warnings.push("Add the Hermes address before connecting your existing instance.");
  }

  if (input.userPath === "existing_hermes" && input.mode === "connect_existing") {
    warnings.push("Vibe Office can connect to this Hermes. Creating separate office members needs local permission.");
  }

  warnings.push("This is a preview. Nothing will be installed or changed.");
  return warnings;
}

function buildNextSteps(userPath: ProvisioningUserPath, mode: ProvisioningMode) {
  if (userPath === "existing_hermes" && mode === "connect_existing") {
    return [
      "Connect this Hermes instance as the first office leader.",
      "Ask for permission before creating separate office members.",
      "Attach Project Context Hub so the office can share project memory."
    ];
  }

  return [
    "Prepare the office member instructions.",
    "Ask for permission before creating anything locally.",
    "Create the office members for planning, building, publishing, and operations.",
    "Connect the leader to Project Context Hub."
  ];
}
