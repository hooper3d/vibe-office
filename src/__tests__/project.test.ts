import assert from "node:assert/strict";
import test from "node:test";
import {
  clearConfirmActionState,
  closeProjectDialogState,
  createProjectDialogViewState,
  openCreateProjectDialogState,
  openEditProjectDialogState,
  requestDeleteAgentConfirmState,
  requestDeleteProjectConfirmState,
  setProjectFormErrorState,
} from "../services/projectDialogState";
import {
  applyMissingProjectSelection,
  applyProjectDelete,
  applyProjectDeleteSelection,
  applyProjectSave,
  canDeleteProject,
  normalizeConversationModeForScope,
} from "../services/projectSetupState";
import { deriveWorkspaceSelection } from "../services/workspaceSelectionState";

import { agent, artifact, at, conversation, freeChatProjectId, project, run, task, userMessage } from "./testSupport";

test("project setup save creates, validates, and updates projects", () => {
  const created = applyProjectSave({
    projects: [project],
    draft: {
      name: "",
      description: "",
      directory: "C:\\Projects\\New Office",
    },
    createProjectId: () => "project-new-office",
  });

  assert.equal(created.kind, "created");
  if (created.kind !== "created") throw new Error("Expected created project");
  assert.equal(created.project.name, "New Office");
  assert.equal(created.project.namespace, "project.new-office");
  assert.equal(created.project.description, "Project-scoped workspace.");
  assert.equal(created.project.directory, "C:\\Projects\\New Office");
  assert.equal(created.projects.length, 2);

  const duplicate = applyProjectSave({
    projects: created.projects,
    draft: {
      name: "Vibe Office",
      description: "",
      directory: "C:\\Projects\\Other",
    },
    createProjectId: () => "project-other",
  });
  assert.equal(duplicate.kind, "error");

  const updated = applyProjectSave({
    projects: created.projects,
    editingProjectId: project.id,
    draft: {
      name: "Vibe Office Renamed",
      description: "Updated workspace.",
      directory: "",
    },
    createProjectId: () => "unused",
  });

  assert.equal(updated.kind, "updated");
  if (updated.kind !== "updated") throw new Error("Expected updated project");
  assert.equal(updated.project.id, project.id);
  assert.equal(updated.project.namespace, project.namespace);
  assert.equal(updated.project.directory, undefined);
  assert.equal(updated.project.description, "Updated workspace.");
});

test("project delete clears scoped records and protects free chat entry", () => {
  assert.equal(canDeleteProject([project], project.id, "default"), false);
  assert.equal(canDeleteProject([project, { ...project, id: "project-two" }], "default", "default"), false);
  assert.equal(canDeleteProject([project, { ...project, id: "project-two" }], project.id, "default"), true);

  const otherProject = { ...project, id: "project-two", namespace: "project-two", name: "Two" };
  const nextState = applyProjectDelete({
    projectId: project.id,
    state: {
      projects: [project, otherProject],
      conversations: [conversation(), conversation({ id: "conversation-two", projectId: otherProject.id })],
      messages: [userMessage(), userMessage({ id: "message-two", projectId: otherProject.id })],
      runs: [run(), run({ id: "run-two", projectId: otherProject.id })],
      tasks: [task(), task({ id: "task-two", projectId: otherProject.id })],
      artifacts: [
        {
          id: "artifact-1",
          projectId: project.id,
          taskId: "task-1",
          agentId: agent.id,
          name: "Result",
          kind: "text",
          summary: "Scoped artifact.",
          contentParts: [],
          createdAt: at,
        },
        {
          id: "artifact-two",
          projectId: otherProject.id,
          taskId: "task-two",
          agentId: agent.id,
          name: "Other",
          kind: "text",
          summary: "Other artifact.",
          contentParts: [],
          createdAt: at,
        },
      ],
    },
  });

  assert.deepEqual(nextState.projects.map((item) => item.id), [otherProject.id]);
  assert.deepEqual(nextState.conversations.map((item) => item.projectId), [otherProject.id]);
  assert.deepEqual(nextState.messages.map((item) => item.projectId), [otherProject.id]);
  assert.deepEqual(nextState.runs.map((item) => item.projectId), [otherProject.id]);
  assert.deepEqual(nextState.tasks.map((item) => item.projectId), [otherProject.id]);
  assert.deepEqual(nextState.artifacts.map((item) => item.projectId), [otherProject.id]);
});

test("project delete selection returns to free chat only when the selected project is deleted", () => {
  const currentSelection = {
    selectedProjectId: project.id,
    chatScope: "project" as const,
    conversationMode: "task-room" as const,
  };

  assert.deepEqual(
    applyProjectDeleteSelection({
      deletedProjectId: project.id,
      freeChatEntryProjectId: "default",
      selection: currentSelection,
    }),
    {
      selectedProjectId: "default",
      chatScope: "free",
      conversationMode: "single",
    },
  );
  assert.deepEqual(
    applyProjectDeleteSelection({
      deletedProjectId: "project-two",
      freeChatEntryProjectId: "default",
      selection: currentSelection,
    }),
    currentSelection,
  );
});

test("project selection recovery returns missing projects and invalid free chat modes to free chat", () => {
  const projectSelection = {
    selectedProjectId: project.id,
    chatScope: "project" as const,
    conversationMode: "task-room" as const,
  };

  assert.deepEqual(
    applyMissingProjectSelection({
      projects: [project],
      freeChatEntryProjectId: freeChatProjectId,
      selection: projectSelection,
    }),
    projectSelection,
  );
  assert.deepEqual(
    applyMissingProjectSelection({
      projects: [],
      freeChatEntryProjectId: freeChatProjectId,
      selection: projectSelection,
    }),
    {
      selectedProjectId: freeChatProjectId,
      chatScope: "free",
      conversationMode: "single",
    },
  );
  assert.deepEqual(
    normalizeConversationModeForScope({
      selectedProjectId: freeChatProjectId,
      chatScope: "free",
      conversationMode: "task-room",
    }),
    {
      selectedProjectId: freeChatProjectId,
      chatScope: "free",
      conversationMode: "single",
    },
  );
});

test("workspace selection scopes project work and keeps free chat empty", () => {
  const otherProject = { ...project, id: "project-two", namespace: "project-two", name: "Two" };
  const selectedTask = task();
  const selectedRun = run();
  const selectedArtifact = artifact();
  const freeSelection = deriveWorkspaceSelection({
    projects: [project, otherProject],
    selectedProjectId: freeChatProjectId,
    freeChatEntryProjectId: freeChatProjectId,
    tasks: [selectedTask],
    runs: [selectedRun],
    artifacts: [selectedArtifact],
  });

  assert.equal(freeSelection.selectedWorkspaceProject, undefined);
  assert.deepEqual(freeSelection.scopedTasks, []);
  assert.deepEqual(freeSelection.scopedRuns, []);
  assert.deepEqual(freeSelection.scopedArtifacts, []);

  const workspaceSelection = deriveWorkspaceSelection({
    projects: [project, otherProject],
    selectedProjectId: project.id,
    freeChatEntryProjectId: freeChatProjectId,
    tasks: [selectedTask, task({ id: "task-two", projectId: otherProject.id })],
    runs: [selectedRun, run({ id: "run-two", projectId: otherProject.id, taskId: "task-two" })],
    artifacts: [selectedArtifact, artifact({ id: "artifact-two", projectId: otherProject.id })],
  });

  assert.equal(workspaceSelection.selectedWorkspaceProject?.id, project.id);
  assert.deepEqual(workspaceSelection.scopedTasks.map((item) => item.id), ["task-1"]);
  assert.deepEqual(workspaceSelection.scopedRuns.map((item) => item.id), ["run-1"]);
  assert.equal(workspaceSelection.latestChiefTask?.id, "task-1");
  assert.deepEqual(workspaceSelection.scopedArtifacts.map((item) => item.id), ["artifact-1"]);
});

test("project dialog state opens, resets errors, and protects free chat entry", () => {
  const initial = createProjectDialogViewState();
  const creating = openCreateProjectDialogState(setProjectFormErrorState(initial, "Old error"));
  assert.equal(creating.showProjectDialog, true);
  assert.equal(creating.editingProjectId, null);
  assert.equal(creating.projectFormError, "");

  const editing = openEditProjectDialogState({
    freeChatEntryProjectId: "default",
    projectId: "project-vibe",
    state: creating,
  });
  assert.equal(editing.showProjectDialog, true);
  assert.equal(editing.editingProjectId, "project-vibe");

  const protectedFreeChat = openEditProjectDialogState({
    freeChatEntryProjectId: "default",
    projectId: "default",
    state: editing,
  });
  assert.equal(protectedFreeChat, editing);

  const closed = closeProjectDialogState(setProjectFormErrorState(editing, "Required."));
  assert.equal(closed.showProjectDialog, false);
  assert.equal(closed.editingProjectId, null);
  assert.equal(closed.projectFormError, "");
});

test("project dialog state prepares confirm actions for deletable items", () => {
  const initial = createProjectDialogViewState();
  const protectedProject = requestDeleteProjectConfirmState({
    freeChatEntryProjectId: "default",
    projectId: "default",
    projects: [project],
    state: initial,
  });
  assert.equal(protectedProject.confirmAction, null);

  const deletableProject = requestDeleteProjectConfirmState({
    freeChatEntryProjectId: "default",
    projectId: project.id,
    projects: [project, { ...project, id: "default" }],
    state: initial,
  });
  assert.deepEqual(deletableProject.confirmAction, { kind: "delete-project", projectId: project.id });

  const agentConfirm = requestDeleteAgentConfirmState(deletableProject, agent.id);
  assert.deepEqual(agentConfirm.confirmAction, { kind: "delete-agent", agentId: agent.id });
  assert.equal(clearConfirmActionState(agentConfirm).confirmAction, null);
});
