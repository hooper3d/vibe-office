import type { FormEvent } from "react";
import type { AgentInstance, Project } from "../domain/types";
import type { useAgentSetupDialogState } from "../services/agentSetupDialogState";
import type { LocalTrustedAgentSafeStatus } from "../services/localTrustedAgentRegistry";
import type { useProjectDialogState } from "../services/projectDialogState";
import { ConfirmDialog, ProjectDialog } from "./ProjectDialogs";
import { SetupWizard } from "./SetupWizard";

type AgentSetupDialogController = ReturnType<typeof useAgentSetupDialogState>;
type ProjectDialogController = ReturnType<typeof useProjectDialogState>;

export function AppDialogs({
  activeSetupAgentId,
  agentSetup,
  agents,
  localTrustedStatus,
  projectDialog,
  projects,
  onAgentAvatarFile,
  onConfirmPendingAction,
  onDeleteAgent,
  onRunConnectionTest,
  onSaveAgent,
  onSaveProject,
}: {
  activeSetupAgentId: string;
  agentSetup: AgentSetupDialogController;
  agents: AgentInstance[];
  localTrustedStatus?: LocalTrustedAgentSafeStatus;
  projectDialog: ProjectDialogController;
  projects: Project[];
  onAgentAvatarFile: (agentId: string, file?: File) => void;
  onConfirmPendingAction: () => void;
  onDeleteAgent: (agentId: string) => void;
  onRunConnectionTest: (form: FormData) => void;
  onSaveAgent: (event: FormEvent<HTMLFormElement>) => void;
  onSaveProject: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const editingAgent = agentSetup.setupAgentId ? agents.find((agent) => agent.id === agentSetup.setupAgentId) : undefined;
  const editingProject = projectDialog.editingProjectId
    ? projects.find((project) => project.id === projectDialog.editingProjectId)
    : undefined;

  return (
    <>
      {agentSetup.showSetup ? (
        <SetupWizard
          testState={agentSetup.testState}
          testMessage={agentSetup.testMessage}
          isSaving={agentSetup.isSavingAgent}
          onClose={agentSetup.closeSetup}
          onRunTest={onRunConnectionTest}
          onResetTest={agentSetup.resetConnectionTest}
          onSaveAgent={onSaveAgent}
          agent={editingAgent}
          localTrustedStatus={activeSetupAgentId ? localTrustedStatus : undefined}
          onDeleteAgent={onDeleteAgent}
          onAgentAvatarFile={onAgentAvatarFile}
        />
      ) : null}
      {projectDialog.showProjectDialog ? (
        <ProjectDialog
          error={projectDialog.projectFormError}
          project={editingProject}
          onClose={projectDialog.closeProjectDialog}
          onSaveProject={onSaveProject}
        />
      ) : null}
      {projectDialog.confirmAction ? (
        <ConfirmDialog
          action={projectDialog.confirmAction}
          agents={agents}
          projects={projects}
          onCancel={projectDialog.clearConfirmAction}
          onConfirm={onConfirmPendingAction}
        />
      ) : null}
    </>
  );
}
