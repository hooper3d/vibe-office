import type { Conversation, ConversationMessage, ProjectArtifact, ProjectRun, ProjectTask } from "../domain/projectScope";
import type { Project } from "../domain/types";
import { deriveProjectNameFromDirectory, slugifyProjectName } from "./projectNaming";

export type ProjectDraft = {
  name: string;
  description: string;
  directory: string;
};

export type ProjectSaveResult =
  | {
      kind: "error";
      error: string;
    }
  | {
      kind: "created";
      projects: Project[];
      project: Project;
    }
  | {
      kind: "updated";
      projects: Project[];
      project: Project;
    };

export type ProjectWorkspaceState = {
  projects: Project[];
  conversations: Conversation[];
  messages: ConversationMessage[];
  runs: ProjectRun[];
  tasks: ProjectTask[];
  artifacts: ProjectArtifact[];
};

export function applyProjectSave({
  projects,
  editingProjectId,
  draft,
  createProjectId,
}: {
  projects: Project[];
  editingProjectId?: string | null;
  draft: ProjectDraft;
  createProjectId: () => string;
}): ProjectSaveResult {
  const editingProject = editingProjectId ? projects.find((project) => project.id === editingProjectId) : undefined;
  const name = draft.name || deriveProjectNameFromDirectory(draft.directory);
  const directory = draft.directory || undefined;
  const description = draft.description || "Project-scoped workspace.";

  if (!editingProject && !draft.directory) {
    return { kind: "error", error: "Choose a project folder or paste a local path." };
  }

  if (!name) {
    return { kind: "error", error: "Project name is required." };
  }

  const namespace = editingProject?.namespace ?? `project.${slugifyProjectName(name)}`;
  if (hasDuplicateProject(projects, editingProject?.id, name, namespace)) {
    return { kind: "error", error: "A project with this name already exists." };
  }

  if (editingProject) {
    const project: Project = {
      ...editingProject,
      name,
      directory,
      description,
    };
    return {
      kind: "updated",
      project,
      projects: projects.map((item) => (item.id === editingProject.id ? project : item)),
    };
  }

  const project: Project = {
    id: createProjectId(),
    name,
    namespace,
    description,
    directory,
  };

  return {
    kind: "created",
    project,
    projects: [...projects, project],
  };
}

export function canDeleteProject(projects: Project[], projectId: string, freeChatEntryProjectId: string) {
  if (projectId === freeChatEntryProjectId) return false;
  return projects.length > 1;
}

export function applyProjectDelete({
  state,
  projectId,
}: {
  state: ProjectWorkspaceState;
  projectId: string;
}): ProjectWorkspaceState {
  return {
    projects: state.projects.filter((project) => project.id !== projectId),
    conversations: state.conversations.filter((conversation) => conversation.projectId !== projectId),
    messages: state.messages.filter((message) => message.projectId !== projectId),
    runs: state.runs.filter((run) => run.projectId !== projectId),
    tasks: state.tasks.filter((task) => task.projectId !== projectId),
    artifacts: state.artifacts.filter((artifact) => artifact.projectId !== projectId),
  };
}

function hasDuplicateProject(projects: Project[], editingProjectId: string | undefined, name: string, namespace: string) {
  return projects.some(
    (project) =>
      project.id !== editingProjectId &&
      (project.namespace === namespace || project.name.toLowerCase() === name.toLowerCase()),
  );
}
