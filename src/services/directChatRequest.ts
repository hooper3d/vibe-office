import type { ConversationMessage } from "../domain/projectScope";
import type { AgentInstance, Project } from "../domain/types";
import { executeFreeChatRequest, executeProjectAgentRequest } from "./agentRequestExecutor";
import { buildChatCompletionHistory } from "./messageContent";

export async function executeFreeChatTurn({
  agent,
  text,
  messages,
  conversationId,
  userMessageId,
}: {
  agent: AgentInstance;
  text: string;
  messages: ConversationMessage[];
  conversationId: string;
  userMessageId: string;
}) {
  const history = buildChatCompletionHistory({
    messages,
    conversationId,
    pendingMessageId: userMessageId,
  });

  return executeFreeChatRequest({
    agent,
    text,
    history,
  });
}

export async function executeProjectDirectTurn({
  agent,
  project,
  agentRequestText,
  messages,
  conversationId,
  userMessageId,
}: {
  agent: AgentInstance;
  project: Project;
  agentRequestText: string;
  messages: ConversationMessage[];
  conversationId: string;
  userMessageId: string;
}) {
  const history = buildChatCompletionHistory({
    messages,
    conversationId,
    pendingMessageId: userMessageId,
  });

  return executeProjectAgentRequest({
    agent,
    project,
    text: agentRequestText,
    history,
    fallbackSummary: `${agent.name} returned a task update.`,
  });
}
