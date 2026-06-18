import type { ConversationMessage } from "../domain/projectScope";
import type { Project } from "../domain/types";
import { readWorkspaceFile, type WorkspaceFileAttachment } from "./workspaceFileClient";

export async function restoreWorkspaceAttachments(
  project: Project,
  message: ConversationMessage,
): Promise<WorkspaceFileAttachment[]> {
  const references = message.workspaceContext ?? [];
  if (references.length === 0) return [];
  if (!project.directory) {
    throw new Error("Project directory is not available.");
  }

  return Promise.all(
    references.map(async (reference) => {
      const file = await readWorkspaceFile(project.directory ?? "", reference.path);
      return {
        path: file.path,
        content: file.content,
        size: file.size,
        updatedAt: file.updatedAt,
        attachedAt: reference.attachedAt,
      };
    }),
  );
}
