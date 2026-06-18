import type { Conversation, ConversationMessage } from "../domain/projectScope";
import type { AgentInstance, Project } from "../domain/types";
import { getMessageTextContent } from "./messageContent";

export type PendingRequestRecovery =
  | {
      kind: "fail";
      reason: string;
      failTaskRoom: boolean;
    }
  | {
      kind: "free-chat";
      conversation: Conversation;
      targetAgent: AgentInstance;
      text: string;
    }
  | {
      kind: "project-chat";
      conversation: Conversation;
      project: Project;
      targetAgent: AgentInstance;
      text: string;
    };

export type DirectMessageRetry =
  | {
      kind: "ignore";
    }
  | {
      kind: "fail";
      message: ConversationMessage;
      reason: string;
    }
  | {
      kind: "free-chat";
      message: ConversationMessage;
      conversation: Conversation;
      targetAgent: AgentInstance;
      text: string;
    }
  | {
      kind: "project-chat";
      message: ConversationMessage;
      conversation: Conversation;
      project: Project;
      targetAgent: AgentInstance;
      text: string;
    };

export type TaskRoomMessageRetry =
  | {
      kind: "ignore";
    }
  | {
      kind: "retry";
      message: ConversationMessage;
      taskId: string;
    };

export function getPendingRequestMessages(
  messages: ConversationMessage[],
  activeMessageIds: ReadonlySet<string>,
) {
  return messages.filter(
    (message) =>
      message.role === "user" &&
      message.status === "sending" &&
      !activeMessageIds.has(message.id),
  );
}

export function getRespondingAgentIds(conversations: Conversation[], messages: ConversationMessage[]) {
  const agentIds = new Set<string>();
  const conversationById = new Map(conversations.map((conversation) => [conversation.id, conversation]));

  messages.forEach((message) => {
    if (message.role !== "user" || message.status !== "sending") return;

    const conversation = conversationById.get(message.conversationId);
    if (!conversation) return;

    if (conversation.mode === "task_room") {
      if (conversation.chiefAgentId) agentIds.add(conversation.chiefAgentId);
      return;
    }

    if (conversation.primaryAgentId) agentIds.add(conversation.primaryAgentId);
  });

  return agentIds;
}

export function resolvePendingRequestRecovery({
  message,
  conversations,
  agents,
  projects,
  freeChatProjectId,
}: {
  message: ConversationMessage;
  conversations: Conversation[];
  agents: AgentInstance[];
  projects: Project[];
  freeChatProjectId: string;
}): PendingRequestRecovery {
  const conversation = conversations.find((item) => item.id === message.conversationId);
  if (!conversation) {
    return {
      kind: "fail",
      reason: "Conversation no longer exists. Please resend this message.",
      failTaskRoom: false,
    };
  }

  if (conversation.mode !== "direct") {
    return {
      kind: "fail",
      reason: "Task Room was interrupted before the agent returned. You can retry this request.",
      failTaskRoom: true,
    };
  }

  const targetAgent = agents.find((item) => item.id === conversation.primaryAgentId);
  if (!targetAgent) {
    return {
      kind: "fail",
      reason: "Agent no longer exists. Please resend this message after reconnecting the agent.",
      failTaskRoom: false,
    };
  }

  const text = getMessageTextContent(message).trim();
  if (!text) {
    return {
      kind: "fail",
      reason: "Message content could not be restored. Please resend it.",
      failTaskRoom: false,
    };
  }

  if (conversation.projectId === freeChatProjectId) {
    return {
      kind: "free-chat",
      conversation,
      targetAgent,
      text,
    };
  }

  const project = projects.find((item) => item.id === conversation.projectId);
  if (!project) {
    return {
      kind: "fail",
      reason: "Project no longer exists. Please resend this message.",
      failTaskRoom: false,
    };
  }

  return {
    kind: "project-chat",
    conversation,
    project,
    targetAgent,
    text,
  };
}

export function resolveDirectMessageRetry({
  messageId,
  messages,
  conversations,
  agents,
  projects,
  freeChatProjectId,
}: {
  messageId: string;
  messages: ConversationMessage[];
  conversations: Conversation[];
  agents: AgentInstance[];
  projects: Project[];
  freeChatProjectId: string;
}): DirectMessageRetry {
  const message = messages.find((item) => item.id === messageId);
  if (!message || message.role !== "user" || message.status !== "failed") {
    return { kind: "ignore" };
  }

  const conversation = conversations.find((item) => item.id === message.conversationId);
  if (!conversation || conversation.mode !== "direct") {
    return { kind: "ignore" };
  }

  const targetAgent = agents.find((item) => item.id === conversation.primaryAgentId);
  if (!targetAgent) {
    return {
      kind: "fail",
      message,
      reason: "Agent no longer exists. Please reconnect the agent before retrying.",
    };
  }

  const text = getMessageTextContent(message).trim();
  if (!text) {
    return {
      kind: "fail",
      message,
      reason: "Message content could not be restored. Please send a new message.",
    };
  }

  if (conversation.projectId === freeChatProjectId) {
    return {
      kind: "free-chat",
      message,
      conversation,
      targetAgent,
      text,
    };
  }

  const project = projects.find((item) => item.id === conversation.projectId);
  if (!project) {
    return {
      kind: "fail",
      message,
      reason: "Project no longer exists. Please send a new message.",
    };
  }

  return {
    kind: "project-chat",
    message,
    conversation,
    project,
    targetAgent,
    text,
  };
}

export function resolveTaskRoomMessageRetry({
  messageId,
  messages,
  conversations,
}: {
  messageId: string;
  messages: ConversationMessage[];
  conversations: Conversation[];
}): TaskRoomMessageRetry {
  const message = messages.find((item) => item.id === messageId);
  if (!message || message.role !== "user" || message.status !== "failed" || !message.taskId) {
    return { kind: "ignore" };
  }

  const conversation = conversations.find((item) => item.id === message.conversationId);
  if (!conversation || conversation.mode !== "task_room") {
    return { kind: "ignore" };
  }

  return {
    kind: "retry",
    message,
    taskId: message.taskId,
  };
}
