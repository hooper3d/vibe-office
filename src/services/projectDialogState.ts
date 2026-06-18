import { useState } from "react";
import type { Project } from "../domain/types";
import { canDeleteProject } from "./projectSetupState";

export type ConfirmAction =
  | {
      kind: "delete-project";
      projectId: string;
    }
  | {
      kind: "delete-agent";
      agentId: string;
    };

export type ProjectDialogViewState = {
  showProjectDialog: boolean;
  editingProjectId: string | null;
  projectFormError: string;
  confirmAction: ConfirmAction | null;
};

export function createProjectDialogViewState(): ProjectDialogViewState {
  return {
    showProjectDialog: false,
    editingProjectId: null,
    projectFormError: "",
    confirmAction: null,
  };
}

export function openCreateProjectDialogState(state: ProjectDialogViewState): ProjectDialogViewState {
  return {
    ...state,
    showProjectDialog: true,
    editingProjectId: null,
    projectFormError: "",
  };
}

export function openEditProjectDialogState({
  freeChatEntryProjectId,
  projectId,
  state,
}: {
  freeChatEntryProjectId: string;
  projectId: string;
  state: ProjectDialogViewState;
}): ProjectDialogViewState {
  if (projectId === freeChatEntryProjectId) return state;
  return {
    ...state,
    showProjectDialog: true,
    editingProjectId: projectId,
    projectFormError: "",
  };
}

export function closeProjectDialogState(state: ProjectDialogViewState): ProjectDialogViewState {
  return {
    ...state,
    showProjectDialog: false,
    editingProjectId: null,
    projectFormError: "",
  };
}

export function setProjectFormErrorState(state: ProjectDialogViewState, projectFormError: string): ProjectDialogViewState {
  return {
    ...state,
    projectFormError,
  };
}

export function requestDeleteProjectConfirmState({
  freeChatEntryProjectId,
  projectId,
  projects,
  state,
}: {
  freeChatEntryProjectId: string;
  projectId: string;
  projects: Project[];
  state: ProjectDialogViewState;
}): ProjectDialogViewState {
  if (!canDeleteProject(projects, projectId, freeChatEntryProjectId)) return state;
  return {
    ...state,
    confirmAction: { kind: "delete-project", projectId },
  };
}

export function requestDeleteAgentConfirmState(state: ProjectDialogViewState, agentId: string): ProjectDialogViewState {
  return {
    ...state,
    confirmAction: { kind: "delete-agent", agentId },
  };
}

export function clearConfirmActionState(state: ProjectDialogViewState): ProjectDialogViewState {
  return {
    ...state,
    confirmAction: null,
  };
}

export function useProjectDialogState({ freeChatEntryProjectId }: { freeChatEntryProjectId: string }) {
  const [state, setState] = useState(createProjectDialogViewState);

  return {
    ...state,
    clearConfirmAction: () => setState(clearConfirmActionState),
    closeProjectDialog: () => setState(closeProjectDialogState),
    openProjectDialog: () => setState(openCreateProjectDialogState),
    openProjectEditor: (projectId: string) =>
      setState((current) =>
        openEditProjectDialogState({
          freeChatEntryProjectId,
          projectId,
          state: current,
        }),
      ),
    requestDeleteAgent: (agentId: string) => setState((current) => requestDeleteAgentConfirmState(current, agentId)),
    requestDeleteProject: (projects: Project[], projectId: string) =>
      setState((current) =>
        requestDeleteProjectConfirmState({
          freeChatEntryProjectId,
          projectId,
          projects,
          state: current,
        }),
      ),
    setProjectFormError: (error: string) => setState((current) => setProjectFormErrorState(current, error)),
  };
}
