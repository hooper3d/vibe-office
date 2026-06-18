import type {
  WorkspaceFileAttachment,
  WorkspaceFileReadResult,
} from "./workspaceFileClient";

export function attachWorkspaceFileState({
  attachments,
  file,
  attachedAt,
  limit = 4,
}: {
  attachments: WorkspaceFileAttachment[];
  file: WorkspaceFileReadResult;
  attachedAt: string;
  limit?: number;
}): WorkspaceFileAttachment[] {
  if (attachments.some((item) => item.path === file.path)) return attachments;

  return [
    ...attachments,
    {
      path: file.path,
      content: file.content,
      size: file.size,
      updatedAt: file.updatedAt,
      attachedAt,
    },
  ].slice(-limit);
}

export function detachWorkspaceFileState({
  attachments,
  path,
}: {
  attachments: WorkspaceFileAttachment[];
  path: string;
}): WorkspaceFileAttachment[] {
  return attachments.filter((item) => item.path !== path);
}
