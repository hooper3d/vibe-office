import type { A2APart } from "./a2a";

export type WorkState =
  | "idle"
  | "submitting"
  | "submitted"
  | "working"
  | "input_required"
  | "completed"
  | "failed"
  | "canceled"
  | "unsupported";

export type ConversationMode = "direct" | "task_room";

export type Conversation = {
  id: string;
  projectId: string;
  mode: ConversationMode;
  title: string;
  primaryAgentId?: string;
  chiefAgentId?: string;
  participantAgentIds: string[];
  a2aContextId: string;
  createdAt: string;
  updatedAt: string;
};

export type ConversationMessage = {
  id: string;
  conversationId: string;
  projectId: string;
  role: "user" | "agent" | "system";
  agentId?: string;
  contentParts: A2APart[];
  workspaceContext?: WorkspaceContextReference[];
  a2aMessageId?: string;
  taskId?: string;
  runId?: string;
  status: "sending" | "sent" | "failed";
  createdAt: string;
};

export type WorkspaceContextReference = {
  path: string;
  size: number;
  attachedAt: string;
};

export type ProjectRunType = "direct_message" | "a2a_task" | "chief_delegation";

export type ProjectRun = {
  id: string;
  projectId: string;
  conversationId: string;
  taskId?: string;
  type: ProjectRunType;
  ownerAgentId: string;
  participantAgentIds: string[];
  state: WorkState;
  eventIds: string[];
  artifactIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type ProjectTaskEvent = {
  id: string;
  taskId: string;
  agentId: string;
  label: string;
  state: WorkState;
  timestamp: string;
};

export type ProjectTask = {
  id: string;
  projectId: string;
  contextId: string;
  title: string;
  ownerAgentId: string;
  participantAgentIds: string[];
  state: WorkState;
  summary: string;
  events: ProjectTaskEvent[];
  artifactIds: string[];
  updatedAt: string;
};

export type ProjectArtifactKind = "text" | "file" | "json" | "url";

export type ProjectArtifact = {
  id: string;
  projectId: string;
  taskId: string;
  agentId: string;
  name: string;
  kind: ProjectArtifactKind;
  summary: string;
  contentParts: A2APart[];
  createdAt: string;
};

export type ProjectScope = {
  projectId: string;
  namespace: string;
  conversationIds: string[];
  runIds: string[];
  taskIds: string[];
  artifactIds: string[];
};
