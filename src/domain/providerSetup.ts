import type { AgentRuntimeProvider } from "./types";

export type ProviderSetupTarget = {
  endpoint: string;
  runtimeProvider?: AgentRuntimeProvider;
  model?: string;
};

export function getProviderSetupIssue(agent: ProviderSetupTarget) {
  const runtimeProvider = agent.runtimeProvider ?? "hermes";
  const endpoint = agent.endpoint.trim().toLowerCase();
  const model = agent.model?.trim().toLowerCase() ?? "";
  if (!endpoint) return "Base URL is required.";

  if (runtimeProvider === "openai" && (endpoint.includes("/anthropic") || endpoint.endsWith("/messages") || endpoint.includes("/messages?"))) {
    return "Provider type is OpenAI-compatible, but this Base URL looks Anthropic-compatible. Switch Provider type to Anthropic-compatible or use an OpenAI-compatible /v1 endpoint.";
  }

  if (runtimeProvider === "openai" && isMiniMaxAnthropicTarget(endpoint, model)) {
    return "MiniMax M3 should be configured as Anthropic-compatible for the M9 target. Switch Provider type to Anthropic-compatible and use the Anthropic-compatible endpoint.";
  }

  if (runtimeProvider === "anthropic" && (endpoint.endsWith("/chat/completions") || endpoint.includes("/chat/completions?"))) {
    return "Provider type is Anthropic-compatible, but this Base URL looks OpenAI-compatible. Switch Provider type to OpenAI-compatible or use an Anthropic-compatible endpoint.";
  }

  return null;
}

function isMiniMaxAnthropicTarget(endpoint: string, model: string) {
  return /minimax|minimaxi/.test(`${endpoint} ${model}`) && /(^|[-_\s])m3($|[-_\s])|minimax-m3/.test(model);
}
