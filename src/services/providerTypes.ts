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
