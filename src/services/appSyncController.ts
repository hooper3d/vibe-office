import { useEffect, type Dispatch, type SetStateAction } from "react";
import type { Conversation, ConversationMessage, ProjectArtifact, ProjectRun, ProjectTask } from "../domain/projectScope";
import type { AgentInstance, Project } from "../domain/types";
import { syncConfiguredAgents } from "./agentStorage";
import type { ProjectChatScope, ProjectConversationMode } from "./projectSetupState";
import { syncRequestRuntimeWorkspaceState, type RequestRuntimeStore } from "./requestRuntimeStore";
import { saveThemeMode, type ThemeMode } from "./themeStorage";
import { saveUiState, type StoredUiState } from "./uiStateStorage";
import type { WorkspaceFileAttachment } from "./workspaceFileClient";
import type { BrowserPreviewOutput } from "./workspaceChromeController";
import { saveWorkspaceState } from "./workspaceStorage";

export type AppSyncControllerOptions = {
  activeFreeChatConversationIds: Record<string, string>;
  agents: AgentInstance[];
  artifacts: ProjectArtifact[];
  browserUrl: string;
  chatScope: ProjectChatScope;
  conversationMode: ProjectConversationMode;
  conversations: Conversation[];
  messages: ConversationMessage[];
  outputMode: StoredUiState["outputMode"];
  previewOutput?: BrowserPreviewOutput;
  projects: Project[];
  refreshLocalTrustedAgentIssues: (
    agentIds: string[],
    options?: { replace?: boolean; isCancelled?: () => boolean },
  ) => Promise<void> | void;
  requestStore: RequestRuntimeStore;
  runs: ProjectRun[];
  selectedAgentId: string;
  selectedProjectId: string;
  selectedWorkspaceProjectId?: string;
  setAttachedWorkspaceFiles: Dispatch<SetStateAction<WorkspaceFileAttachment[]>>;
  tasks: ProjectTask[];
  themeMode: ThemeMode;
};

export function useAppSyncController({
  activeFreeChatConversationIds,
  agents,
  artifacts,
  browserUrl,
  chatScope,
  conversationMode,
  conversations,
  messages,
  outputMode,
  previewOutput,
  projects,
  refreshLocalTrustedAgentIssues,
  requestStore,
  runs,
  selectedAgentId,
  selectedProjectId,
  selectedWorkspaceProjectId,
  setAttachedWorkspaceFiles,
  tasks,
  themeMode,
}: AppSyncControllerOptions) {
  useEffect(() => {
    setAttachedWorkspaceFiles([]);
  }, [chatScope, selectedWorkspaceProjectId, setAttachedWorkspaceFiles]);

  useEffect(() => {
    syncRequestRuntimeWorkspaceState(requestStore, {
      conversations,
      messages,
      runs,
      tasks,
      artifacts,
    });
  }, [artifacts, conversations, messages, requestStore, runs, tasks]);

  useEffect(() => {
    syncConfiguredAgents({ agents });
  }, [agents]);

  useEffect(() => {
    let cancelled = false;
    const agentIds = agents.map((agent) => agent.id);
    if (agentIds.length === 0) {
      void refreshLocalTrustedAgentIssues([]);
      return () => {
        cancelled = true;
      };
    }

    void refreshLocalTrustedAgentIssues(agentIds, {
      replace: true,
      isCancelled: () => cancelled,
    });

    return () => {
      cancelled = true;
    };
  }, [agents]);

  useEffect(() => {
    saveUiState({
      selectedAgentId,
      selectedProjectId,
      chatScope,
      conversationMode,
      outputMode,
      browserUrl,
      previewOutput,
      activeFreeChatConversationIds,
    });
  }, [activeFreeChatConversationIds, browserUrl, chatScope, conversationMode, outputMode, previewOutput, selectedAgentId, selectedProjectId]);

  useEffect(() => {
    saveWorkspaceState({
      projects,
      conversations,
      messages,
      runs,
      tasks,
      artifacts,
    });
  }, [artifacts, conversations, messages, projects, runs, tasks]);

  useEffect(() => {
    document.documentElement.dataset.theme = themeMode;
    saveThemeMode(themeMode);
  }, [themeMode]);
}
