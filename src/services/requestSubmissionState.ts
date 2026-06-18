import type { Conversation, ConversationMessage, ProjectRun, ProjectTask } from "../domain/projectScope";
import type { AgentInstance, Project } from "../domain/types";
import { createTextParts } from "./artifactState";
import { buildAgentRequestText } from "./agentRequestText";
import type { RequestWorkspaceState } from "./requestRuntimeStore";
import type { WorkspaceFileAttachment } from "./workspaceFileClient";

export type IdFactory = () => string;

export type CreateConversationOptions = {
  projectId: string;
  namespace: string;
  mode: Conversation["mode"];
  title: string;
  primaryAgentId?: string;
  chiefAgentId?: string;
  participantAgentIds: string[];
  createdAt: string;
};

export function createConversation({
  projectId,
  namespace,
  mode,
  title,
  primaryAgentId,
  chiefAgentId,
  participantAgentIds,
  createdAt,
}: CreateConversationOptions): Conversation {
  return {
    id: crypto.randomUUID(),
    projectId,
    mode,
    title,
    primaryAgentId,
    chiefAgentId,
    participantAgentIds,
    a2aContextId: namespace,
    createdAt,
    updatedAt: createdAt,
  };
}

export function prepareFreeChatSubmission({
  state,
  currentConversation,
  targetAgent,
  text,
  freeChatProjectId,
  freeChatNamespace,
  now = () => new Date().toISOString(),
  createId = () => crypto.randomUUID(),
}: {
  state: RequestWorkspaceState;
  currentConversation?: Conversation;
  targetAgent: AgentInstance;
  text: string;
  freeChatProjectId: string;
  freeChatNamespace: string;
  now?: () => string;
  createId?: IdFactory;
}) {
  const createdAt = now();
  const existingConversation =
    currentConversation?.projectId === freeChatProjectId &&
    currentConversation.mode === "direct" &&
    currentConversation.primaryAgentId === targetAgent.id
      ? currentConversation
      : undefined;
  const conversation =
    existingConversation ??
    createConversation({
      projectId: freeChatProjectId,
      namespace: freeChatNamespace,
      mode: "direct",
      title: `${targetAgent.name} free chat`,
      primaryAgentId: targetAgent.id,
      participantAgentIds: [targetAgent.id],
      createdAt,
    });
  const userMessageId = createId();
  const requestId = createId();
  const userMessage: ConversationMessage = {
    id: userMessageId,
    conversationId: conversation.id,
    projectId: freeChatProjectId,
    role: "user",
    contentParts: createTextParts(text),
    requestId,
    requestAttempt: 1,
    requestStartedAt: createdAt,
    status: "sending",
    createdAt,
  };

  return {
    state: {
      ...state,
      conversations: existingConversation ? state.conversations : [conversation, ...state.conversations],
      messages: [...state.messages, userMessage],
    },
    conversation,
    requestId,
    userMessageId,
  };
}

export function prepareProjectDirectSubmission({
  state,
  project,
  targetAgent,
  text,
  files,
  now = () => new Date().toISOString(),
  createId = () => crypto.randomUUID(),
}: {
  state: RequestWorkspaceState;
  project: Project;
  targetAgent: AgentInstance;
  text: string;
  files: WorkspaceFileAttachment[];
  now?: () => string;
  createId?: IdFactory;
}) {
  const createdAt = now();
  const existingConversation = state.conversations.find(
    (item) => item.projectId === project.id && item.mode === "direct" && item.primaryAgentId === targetAgent.id,
  );
  const conversation =
    existingConversation ??
    createConversation({
      projectId: project.id,
      namespace: project.namespace,
      mode: "direct",
      title: targetAgent.name,
      primaryAgentId: targetAgent.id,
      participantAgentIds: [targetAgent.id],
      createdAt,
    });
  const runId = createId();
  const userMessageId = createId();
  const requestId = createId();
  const participantAgentIds = [targetAgent.id];
  const workspaceContext = files.map((file) => ({
    path: file.path,
    size: file.size,
    attachedAt: file.attachedAt,
  }));
  const userMessage: ConversationMessage = {
    id: userMessageId,
    conversationId: conversation.id,
    projectId: project.id,
    role: "user",
    contentParts: createTextParts(text),
    workspaceContext,
    runId,
    requestId,
    requestAttempt: 1,
    requestStartedAt: createdAt,
    status: "sending",
    createdAt,
  };
  const optimisticRun: ProjectRun = {
    id: runId,
    projectId: project.id,
    conversationId: conversation.id,
    type: "direct_message",
    ownerAgentId: targetAgent.id,
    participantAgentIds,
    state: "submitting",
    summary: "Project chat request submitted.",
    eventIds: [`${runId}-submitted`],
    artifactIds: [],
    createdAt,
    updatedAt: createdAt,
  };

  return {
    state: {
      ...state,
      conversations: existingConversation ? state.conversations : [conversation, ...state.conversations],
      messages: [...state.messages, userMessage],
      runs: [optimisticRun, ...state.runs],
    },
    agentRequestText: buildAgentRequestText(text, project, files),
    conversation,
    participantAgentIds,
    requestId,
    runId,
    userMessageId,
  };
}

export function prepareTaskRoomSubmission({
  state,
  project,
  chief,
  participants,
  text,
  files,
  now = () => new Date().toISOString(),
  createId = () => crypto.randomUUID(),
}: {
  state: RequestWorkspaceState;
  project: Project;
  chief: AgentInstance;
  participants: AgentInstance[];
  text: string;
  files: WorkspaceFileAttachment[];
  now?: () => string;
  createId?: IdFactory;
}) {
  const createdAt = now();
  const participantAgentIds = participants.map((agent) => agent.id);
  const existingConversation = state.conversations.find(
    (item) => item.projectId === project.id && item.mode === "task_room" && item.chiefAgentId === chief.id,
  );
  const conversation =
    existingConversation ??
    createConversation({
      projectId: project.id,
      namespace: project.namespace,
      mode: "task_room",
      title: `${project.name} task room`,
      chiefAgentId: chief.id,
      participantAgentIds,
      createdAt,
    });
  const taskId = createId();
  const runId = createId();
  const userMessageId = createId();
  const requestId = createId();
  const workspaceContext = files.map((file) => ({
    path: file.path,
    size: file.size,
    attachedAt: file.attachedAt,
  }));
  const taskTitle = text.length > 56 ? `${text.slice(0, 56)}...` : text;
  const userMessage: ConversationMessage = {
    id: userMessageId,
    conversationId: conversation.id,
    projectId: project.id,
    role: "user",
    contentParts: createTextParts(text),
    workspaceContext,
    taskId,
    runId,
    requestId,
    requestAttempt: 1,
    requestStartedAt: createdAt,
    status: "sending",
    createdAt,
  };
  const projectTask: ProjectTask = {
    id: taskId,
    projectId: project.id,
    contextId: conversation.a2aContextId,
    title: taskTitle,
    ownerAgentId: chief.id,
    participantAgentIds,
    state: "submitting",
    summary: "Task submitted to Chief.",
    events: [
      {
        id: `${taskId}-submitted`,
        taskId,
        agentId: chief.id,
        label: "Task submitted to Chief.",
        state: "submitting",
        timestamp: createdAt,
      },
    ],
    artifactIds: [],
    updatedAt: createdAt,
  };
  const projectRun: ProjectRun = {
    id: runId,
    projectId: project.id,
    conversationId: conversation.id,
    taskId,
    type: "chief_delegation",
    ownerAgentId: chief.id,
    participantAgentIds: [chief.id, ...participantAgentIds],
    state: "submitting",
    summary: "Chief-led task submitted.",
    eventIds: [`${runId}-submitted`],
    artifactIds: [],
    createdAt,
    updatedAt: createdAt,
  };

  return {
    state: {
      ...state,
      conversations: existingConversation ? state.conversations : [conversation, ...state.conversations],
      messages: [...state.messages, userMessage],
      tasks: [projectTask, ...state.tasks.filter((task) => task.id !== taskId)],
      runs: [projectRun, ...state.runs],
    },
    conversation,
    participantAgentIds,
    requestId,
    runId,
    taskId,
    userMessageId,
  };
}
