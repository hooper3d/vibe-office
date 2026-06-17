import type { A2ATaskState } from "./a2a";

export type ProjectTaskEvent = {
  id: string;
  taskId: string;
  agentId: string;
  label: string;
  state: A2ATaskState;
  timestamp: string;
};

export type ProjectTask = {
  id: string;
  projectId: string;
  contextId: string;
  title: string;
  ownerAgentId: string;
  participantAgentIds: string[];
  state: A2ATaskState;
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
  createdAt: string;
};

export type ProjectScope = {
  projectId: string;
  namespace: string;
  taskIds: string[];
  artifactIds: string[];
};

