export function getUserFacingAgentError(error: unknown) {
  return sanitizeAgentErrorText(error instanceof Error ? error.message : "Agent request failed.");
}

export function sanitizeAgentErrorText(text: string) {
  if (text.includes("API key is missing in the local trusted layer")) {
    return "Agent API key is missing. Open this agent's settings, save the API key again, then retry.";
  }
  if (text.includes("Agent did not respond before the timeout") || text.includes("Hermes chat completion timed out")) {
    return "Agent did not respond before the timeout. You can retry, or increase this agent's timeout in Advanced settings.";
  }
  if (text.includes("Failed to fetch") || text.includes("NetworkError")) {
    return "Agent network request failed. Check the provider URL and network connection, then retry.";
  }
  if (text.includes("OpenAI-compatible chat failed") || text.includes("OpenAI chat failed")) {
    return normalizeProviderStatus(text.replace(/OpenAI-compatible chat failed|OpenAI chat failed/, "Agent request failed"));
  }
  if (text.includes("Anthropic-compatible message failed") || text.includes("Anthropic message failed")) {
    return normalizeProviderStatus(text.replace(/Anthropic-compatible message failed|Anthropic message failed/, "Agent request failed"));
  }
  if (text.includes("Hermes chat completion failed")) {
    return normalizeProviderStatus(text.replace("Hermes chat completion failed", "Agent request failed"));
  }
  if (text.includes("OpenAI-compatible chat auth failed") || text.includes("OpenAI chat auth failed")) {
    return normalizeProviderStatus(
      text.replace(/OpenAI-compatible chat auth failed|OpenAI chat auth failed/, "Agent authentication failed"),
    );
  }
  if (text.includes("Anthropic-compatible message auth failed") || text.includes("Anthropic message auth failed")) {
    return normalizeProviderStatus(
      text.replace(/Anthropic-compatible message auth failed|Anthropic message auth failed/, "Agent authentication failed"),
    );
  }
  if (text.includes("Hermes chat completion auth failed")) {
    return normalizeProviderStatus(text.replace("Hermes chat completion auth failed", "Agent authentication failed"));
  }
  return text;
}

function normalizeProviderStatus(text: string) {
  if (/\b(401|403)\b/.test(text)) {
    return "Agent authentication failed. Check this agent's API key or provider permissions, then retry.";
  }
  if (/\b404\b/.test(text)) {
    return "Agent endpoint was not found. Check this agent's Base URL and provider type, then retry.";
  }
  return text;
}
