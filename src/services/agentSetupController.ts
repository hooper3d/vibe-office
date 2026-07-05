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
import { getUserFacingAgentError } from "./agentErrorText";
import { assertLocalTrustedAgentCredential, deleteLocalTrustedAgent, upsertLocalTrustedAgent } from "./localTrustedAgentRegistry";

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
      await assertLocalTrustedAgentCredential(agent);
      return true;
    } catch (error) {
      setupDialog.markConnectionFailed(getUserFacingAgentError(error));
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
      if (setupDialog.setupAgentId && newAgent.apiKey) {
        setupDialog.setIsSavingAgent(true);
        try {
          const savedCredential = await persistBlockedProviderCredential({
            agent: newAgent,
            persistAgent: persistLocalTrustedAgent,
            refreshLocalTrustedAgentIssues,
          });
          if (!savedCredential) return;
          setupDialog.markConnectionFailed(`${setupIssue} The API key was saved locally for this agent.`);
        } finally {
          setupDialog.setIsSavingAgent(false);
        }
        return;
      }
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

export async function persistBlockedProviderCredential({
  agent,
  persistAgent,
  refreshLocalTrustedAgentIssues,
}: {
  agent: AgentInstance;
  persistAgent: (agent: AgentInstance) => Promise<boolean>;
  refreshLocalTrustedAgentIssues: (agentIds: string[]) => Promise<void> | void;
}) {
  if (!agent.apiKey) return false;
  const savedCredential = await persistAgent(agent);
  if (!savedCredential) return false;
  await refreshLocalTrustedAgentIssues([agent.id]);
  return true;
}
