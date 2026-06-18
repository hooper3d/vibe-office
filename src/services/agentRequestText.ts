import type { Project } from "../domain/types";
import type { WorkspaceFileAttachment } from "./workspaceFileClient";

export function buildAgentRequestText(text: string, project: Project, files: WorkspaceFileAttachment[]) {
  if (files.length === 0) return text;

  const fileContext = files
    .map((file) => `--- file: ${file.path} (${formatBytes(file.size)}) ---\n${file.content}`)
    .join("\n\n");

  return `${text}\n\nWorkspace context explicitly attached by the user for ${project.name} (${project.namespace}). The remote agent cannot access the local filesystem. Use only the file excerpts below when they are relevant.\n\n${fileContext}`;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
