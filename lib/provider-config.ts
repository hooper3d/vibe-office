import type { ProviderTemplate } from "@/types/provisioning";

export const providerTemplates: ProviderTemplate[] = [
  {
    id: "openai",
    name: "OpenAI",
    apiBaseUrl: "https://api.openai.com/v1",
    keyEnvName: "OPENAI_API_KEY",
    defaultModel: "gpt-4.1-mini",
    compatibleWithOpenAI: true,
    setupHint: "Use an OpenAI platform API key. Vibe Office will test /v1/models."
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    apiBaseUrl: "https://openrouter.ai/api/v1",
    keyEnvName: "OPENROUTER_API_KEY",
    defaultModel: "openai/gpt-4.1-mini",
    compatibleWithOpenAI: true,
    setupHint: "Use an OpenRouter API key. This is a good BYOK option for multiple model providers."
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    apiBaseUrl: "https://api.deepseek.com/v1",
    keyEnvName: "DEEPSEEK_API_KEY",
    defaultModel: "deepseek-v4-flash",
    compatibleWithOpenAI: true,
    setupHint: "Use a DeepSeek API key. Vibe Office treats it as an OpenAI-compatible provider."
  },
  {
    id: "kimi",
    name: "Kimi",
    apiBaseUrl: "https://api.moonshot.cn/v1",
    keyEnvName: "KIMI_API_KEY",
    defaultModel: "moonshot-v1-8k",
    compatibleWithOpenAI: true,
    setupHint: "Use a Moonshot/Kimi API key. Vibe Office tests it through the OpenAI-compatible API."
  },
  {
    id: "custom-openai",
    name: "Custom OpenAI-compatible",
    keyEnvName: "CUSTOM_MODEL_API_KEY",
    defaultModel: "custom-model",
    compatibleWithOpenAI: true,
    setupHint: "Provide a base URL that exposes /v1/models or a compatible models endpoint."
  }
];

export function getProviderTemplate(providerId: string) {
  return providerTemplates.find((provider) => provider.id === providerId);
}
