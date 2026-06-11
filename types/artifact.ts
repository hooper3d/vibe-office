import type { AgentName, ProjectId } from "@/types/agent";

export type ArtifactType = "image" | "file" | "url" | "markdown";
export type ArtifactOwner = AgentName | "User";

export type Artifact = {
  id: string;
  type: ArtifactType;
  title: string;
  owner: ArtifactOwner;
  projectId: ProjectId;
  createdAt: string;
  sourceUrl?: string;
  path?: string;
  accessUrl?: string;
  mimeType?: string;
  size?: number;
  description?: string;
  runId?: string;
  messageId?: string;
  archivedAt?: string;
};

export type ArtifactInput = {
  type?: ArtifactType;
  title?: string;
  owner: ArtifactOwner;
  projectId: ProjectId;
  sourceUrl?: string;
  path?: string;
  mimeType?: string;
  size?: number;
  description?: string;
  runId?: string;
  messageId?: string;
};
