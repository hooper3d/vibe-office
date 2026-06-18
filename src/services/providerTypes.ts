import type { A2AAgentCard, A2ATask } from "../domain/a2a";
import type { AgentInstance, Project } from "../domain/types";

export type ChatHistoryMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ProviderConnectionMode = "native-a2a" | "hermes-adapter" | "openai-compatible" | "anthropic-compatible";

export type ProviderConnectionTestResult = {
  card: A2AAgentCard;
  mode: ProviderConnectionMode;
};

export type ProviderAdapter = {
  testConnection(): Promise<ProviderConnectionTestResult>;
  sendProjectMessage(project: Project, text: string, history?: ChatHistoryMessage[]): Promise<A2ATask>;
  sendFreeChatMessage(text: string, history?: ChatHistoryMessage[]): Promise<A2ATask>;
};

export type A2ACompatibilityMetadata = Pick<
  AgentInstance,
  | "a2aLastCompatibilityCheckAt"
  | "a2aProtocolVersion"
  | "a2aSelectedInterface"
  | "a2aSupportedInterfaces"
  | "a2aTransportBinding"
  | "supportsCancel"
  | "supportsTaskLifecycle"
>;

export type ProviderMessageRequest = {
  contextId: string;
  text: string;
  history: ChatHistoryMessage[];
  systemContent?: string;
  metadata: Record<string, unknown>;
};

export function createSyntheticAgentCard(agent: AgentInstance, providerLabel = "Model-compatible"): A2AAgentCard {
  return {
    name: agent.name,
    description: agent.role || providerLabel,
    url: agent.a2aEndpoint,
    version: "0.1.0",
    protocolVersion: "1.0",
    capabilities: {
      streaming: false,
      pushNotifications: false,
      stateTransitionHistory: true,
    },
    skills: agent.tags.map((tag) => ({
      id: tag,
      name: tag,
      tags: [tag],
    })),
  };
}

export function createCompletedTextTask({
  contextId,
  content,
  metadata,
}: {
  contextId: string;
  content: string;
  metadata: Record<string, unknown>;
}): A2ATask {
  const now = new Date().toISOString();

  return {
    id: crypto.randomUUID(),
    contextId,
    status: {
      state: "completed",
      timestamp: now,
      message: {
        messageId: crypto.randomUUID(),
        role: "agent",
        contextId,
        parts: [
          {
            kind: "text",
            text: content,
          },
        ],
      },
    },
    metadata,
  };
}

export function getFreeChatContextId(agent: AgentInstance) {
  return `free-chat:${agent.id}`;
}

export function getProjectSystemContent(project: Project) {
  return `Vibe Office project namespace: ${project.namespace}. Keep this task scoped to this project.`;
}

export function createA2ACompatibilityMetadata(result: ProviderConnectionTestResult): A2ACompatibilityMetadata {
  const nativeA2A = result.mode === "native-a2a";
  const providerInterfaces: Record<ProviderConnectionMode, string[]> = {
    "native-a2a": ["message/send", "tasks/get", "tasks/cancel"],
    "hermes-adapter": ["chat/completions"],
    "openai-compatible": ["chat/completions"],
    "anthropic-compatible": ["messages"],
  };
  const providerTransport: Record<ProviderConnectionMode, string> = {
    "native-a2a": "json-rpc/http",
    "hermes-adapter": "hermes-compatible-http",
    "openai-compatible": "openai-compatible-http",
    "anthropic-compatible": "anthropic-compatible-http",
  };
  const providerSelectedInterface: Record<ProviderConnectionMode, string> = {
    "native-a2a": "message/send + tasks/get",
    "hermes-adapter": "Hermes compatibility",
    "openai-compatible": "OpenAI chat completions",
    "anthropic-compatible": "Anthropic messages",
  };

  return {
    a2aProtocolVersion: result.card.protocolVersion ?? (nativeA2A ? "unknown" : "compatibility"),
    a2aTransportBinding: providerTransport[result.mode],
    a2aSupportedInterfaces: providerInterfaces[result.mode],
    a2aSelectedInterface: providerSelectedInterface[result.mode],
    a2aLastCompatibilityCheckAt: new Date().toISOString(),
    supportsTaskLifecycle: nativeA2A,
    supportsCancel: nativeA2A ? undefined : false,
  };
}
