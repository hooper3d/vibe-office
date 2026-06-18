import type { Dispatch, FormEvent, SetStateAction } from "react";
import { createAgentFromHermesSetup, getProviderSetupIssue } from "../domain/hermesSetup";
import type { AgentInstance } from "../domain/types";
import { readAvatarFile } from "./avatarFile";
import { runAgentConnectionTest } from "./agentConnectionTestState";
import type { useAgentSetupDialogState } from "./agentSetupDialogState";
import {
  applyAgentAvatarUpdate,
  applyAgentDelete,
  applyAgentSetupSave,
} from "./agentSetupState";
import { deleteLocalTrustedAgent, upsertLocalTrustedAgent } from "./localTrustedAgentRegistry";

type AgentSetupDialogController = ReturnType<typeof useAgentSetupDialogState>;

export type AgentSetupControllerOptions = {
  activeSetupAgentId: string;
  agents: AgentInstance[];
  clearConfirmAction: () => void;
  refreshLocalTrustedAgentIssues: (agentIds: string[]) => Promise<void> | void;
  removeLocalTrustedAgentReadiness: (agentId: string) => void;
  selectedAgentId: string;
  setAgents: Dispatch<SetStateAction<AgentInstance[]>>;
  setSelectedAgentId: Dispatch<SetStateAction<string>>;
  setupDialog: AgentSetupDialogController;
};

export function useAgentSetupController({
  activeSetupAgentId,
  agents,
  clearConfirmAction,
  refreshLocalTrustedAgentIssues,
  removeLocalTrustedAgentReadiness,
  selectedAgentId,
  setAgents,
  setSelectedAgentId,
  setupDialog,
}: AgentSetupControllerOptions) {
  async function runConnectionTest(form: FormData) {
    setupDialog.markConnectionRunning();

    const result = await runAgentConnectionTest({
      form,
      agentId: activeSetupAgentId || undefined,
      onAgentPersisted: (agent) => refreshLocalTrustedAgentIssues([agent.id]),
    });

    if (result.status === "passed") {
      setupDialog.markConnectionPassed(result.metadata, result.message);
    } else {
      setupDialog.markConnectionFailed(result.message);
    }
  }

  async function persistLocalTrustedAgent(agent: AgentInstance) {
    try {
      await upsertLocalTrustedAgent(agent);
      return true;
    } catch {
      setupDialog.markConnectionFailed("Unable to update the local trusted agent registry.");
      return false;
    }
  }

  async function saveAgent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (setupDialog.isSavingAgent) return;
    const form = new FormData(event.currentTarget);
    const newAgent = createAgentFromHermesSetup(form, { id: activeSetupAgentId || undefined });
    const setupIssue = getProviderSetupIssue(newAgent);
    if (setupIssue) {
      setupDialog.markConnectionFailed(setupIssue);
      return;
    }

    setupDialog.setIsSavingAgent(true);
    try {
      const saveResult = applyAgentSetupSave({
        agents,
        submittedAgent: newAgent,
        editingAgentId: setupDialog.setupAgentId,
        metadata: setupDialog.lastConnectionMetadata,
      });

      if (!(await persistLocalTrustedAgent(saveResult.trustedAgent))) return;
      await refreshLocalTrustedAgentIssues([saveResult.trustedAgent.id]);
      setAgents(saveResult.agents);
      if (saveResult.selectedAgentId) {
        setSelectedAgentId(saveResult.selectedAgentId);
      }
      setupDialog.closeSetup();
    } finally {
      setupDialog.setIsSavingAgent(false);
    }
  }

  function deleteAgent(agentId: string) {
    void deleteLocalTrustedAgent(agentId).catch(() => {
      // A stale local registry entry is less harmful than interrupting the delete UI flow.
    });
    const result = applyAgentDelete({ agentId, agents, selectedAgentId });
    setAgents(result.agents);
    removeLocalTrustedAgentReadiness(agentId);
    if (result.selectedAgentId !== selectedAgentId) setSelectedAgentId(result.selectedAgentId);
    clearConfirmAction();
  }

  function updateAgentAvatar(agentId: string, avatarUrl?: string) {
    setAgents((current) => applyAgentAvatarUpdate({ agents: current, agentId, avatarUrl }));
  }

  async function updateExistingAgentAvatar(agentId: string, file?: File) {
    const result = await readAvatarFile(file);
    if (result.error) {
      setupDialog.markConnectionFailed(result.error);
      return;
    }
    updateAgentAvatar(agentId, result.dataUrl);
  }

  return {
    deleteAgent,
    runConnectionTest,
    saveAgent,
    updateExistingAgentAvatar,
  };
}
