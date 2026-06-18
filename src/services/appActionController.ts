import type { Dispatch, SetStateAction } from "react";
import type { WorkspaceFileAttachment, WorkspaceFileReadResult } from "./workspaceFileClient";
import { attachWorkspaceFileState, detachWorkspaceFileState } from "./workspaceAttachmentState";
import type { ConfirmAction } from "./projectDialogState";
import type { ThemeMode } from "./themeStorage";

export type AppActionControllerOptions = {
  confirmAction: ConfirmAction | null;
  deleteAgent: (agentId: string) => void;
  deleteProject: (projectId: string) => void;
  requestDeleteAgent: (agentId: string) => void;
  setAttachedWorkspaceFiles: Dispatch<SetStateAction<WorkspaceFileAttachment[]>>;
  setThemeMode: Dispatch<SetStateAction<ThemeMode>>;
};

export function useAppActionController({
  confirmAction,
  deleteAgent,
  deleteProject,
  requestDeleteAgent,
  setAttachedWorkspaceFiles,
  setThemeMode,
}: AppActionControllerOptions) {
  function toggleTheme() {
    setThemeMode((current) => (current === "dark" ? "light" : "dark"));
  }

  function confirmPendingAction() {
    if (!confirmAction) return;
    if (confirmAction.kind === "delete-project") {
      deleteProject(confirmAction.projectId);
    } else {
      deleteAgent(confirmAction.agentId);
    }
  }

  function attachWorkspaceFile(file: WorkspaceFileReadResult) {
    setAttachedWorkspaceFiles((current) =>
      attachWorkspaceFileState({ attachments: current, file, attachedAt: new Date().toISOString() }),
    );
  }

  function detachWorkspaceFile(path: string) {
    setAttachedWorkspaceFiles((current) => detachWorkspaceFileState({ attachments: current, path }));
  }

  return {
    attachWorkspaceFile,
    confirmPendingAction,
    detachWorkspaceFile,
    requestDeleteAgent,
    toggleTheme,
  };
}
