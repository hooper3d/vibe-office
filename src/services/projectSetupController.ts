import type { Dispatch, FormEvent, SetStateAction } from "react";
import type { Conversation, ConversationMessage, ProjectArtifact, ProjectRun, ProjectTask } from "../domain/projectScope";
import type { Project } from "../domain/types";
import type { useProjectDialogState } from "./projectDialogState";
import {
  applyProjectDelete,
  applyProjectDeleteSelection,
  applyProjectSave,
  canDeleteProject,
  type ProjectChatScope,
  type ProjectConversationMode,
} from "./projectSetupState";
import type { RequestWorkspaceState } from "./requestRuntimeStore";

type ProjectDialogController = ReturnType<typeof useProjectDialogState>;

export type ProjectSetupControllerOptions = {
  applyRequestWorkspaceState: (state: RequestWorkspaceState) => void;
  artifacts: ProjectArtifact[];
  chatScope: ProjectChatScope;
  conversations: Conversation[];
  conversationMode: ProjectConversationMode;
  freeChatEntryProjectId: string;
  messages: ConversationMessage[];
  projectDialog: ProjectDialogController;
  projects: Project[];
  runs: ProjectRun[];
  selectedProjectId: string;
  setChatScope: Dispatch<SetStateAction<ProjectChatScope>>;
  setConversationMode: Dispatch<SetStateAction<ProjectConversationMode>>;
  setProjects: Dispatch<SetStateAction<Project[]>>;
  setSelectedProjectId: Dispatch<SetStateAction<string>>;
  tasks: ProjectTask[];
};

export function useProjectSetupController({
  applyRequestWorkspaceState,
  artifacts,
  chatScope,
  conversations,
  conversationMode,
  freeChatEntryProjectId,
  messages,
  projectDialog,
  projects,
  runs,
  selectedProjectId,
  setChatScope,
  setConversationMode,
  setProjects,
  setSelectedProjectId,
  tasks,
}: ProjectSetupControllerOptions) {
  function saveProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const result = applyProjectSave({
      projects,
      editingProjectId: projectDialog.editingProjectId,
      draft: {
        name: String(form.get("name") || "").trim(),
        description: String(form.get("description") || "").trim(),
        directory: String(form.get("directory") || "").trim(),
      },
      createProjectId: () => crypto.randomUUID(),
    });

    if (result.kind === "error") {
      projectDialog.setProjectFormError(result.error);
      return;
    }

    setProjects(result.projects);
    if (result.kind === "created") {
      setSelectedProjectId(result.project.id);
      setChatScope("project");
    }
    projectDialog.closeProjectDialog();
  }

  function requestDeleteProject(projectId: string) {
    projectDialog.requestDeleteProject(projects, projectId);
  }

  function deleteProject(projectId: string) {
    if (!canDeleteProject(projects, projectId, freeChatEntryProjectId)) return;
    const nextState = applyProjectDelete({
      state: {
        projects,
        conversations,
        messages,
        runs,
        tasks,
        artifacts,
      },
      projectId,
    });
    setProjects(nextState.projects);
    applyRequestWorkspaceState(nextState);
    const nextSelection = applyProjectDeleteSelection({
      deletedProjectId: projectId,
      freeChatEntryProjectId,
      selection: { selectedProjectId, chatScope, conversationMode },
    });
    setSelectedProjectId(nextSelection.selectedProjectId);
    setChatScope(nextSelection.chatScope);
    setConversationMode(nextSelection.conversationMode);
    projectDialog.clearConfirmAction();
  }

  return {
    deleteProject,
    requestDeleteProject,
    saveProject,
  };
}
