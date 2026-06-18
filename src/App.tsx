import { useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { AppSidebar } from "./components/AppSidebar";
import { ConversationWorkspace } from "./components/ConversationWorkspace";
import { OutputPanel, type OutputMode } from "./components/OutputPanel";
import { ConfirmDialog, ProjectDialog } from "./components/ProjectDialogs";
import { SetupWizard } from "./components/SetupWizard";
import type {
  Conversation,
  ConversationMessage,
  ProjectArtifact,
  ProjectRun,
  ProjectTask,
} from "./domain/projectScope";
import type { AgentInstance, Project } from "./domain/types";
import { loadConfiguredAgents } from "./services/agentStorage";
import { useLocalTrustedAgentReadiness } from "./services/agentReadinessController";
import { useAgentSetupController } from "./services/agentSetupController";
import { useAgentSetupDialogState } from "./services/agentSetupDialogState";
import { normalizeChief, resolveSelectedAgent } from "./services/agentSetupState";
import { deriveAgentReadinessIssues } from "./services/agentReadinessState";
import { useAppActionController } from "./services/appActionController";
import {
  deriveInitialChatScope,
  FREE_CHAT_ENTRY_PROJECT_ID,
  FREE_CHAT_NAMESPACE,
  FREE_CHAT_PROJECT_ID,
  normalizeOutputMode,
  seedWorkspaceDefaults,
} from "./services/appBootstrapState";
import { useAppMaintenanceController } from "./services/appMaintenanceController";
import { useAppSelectionController } from "./services/appSelectionController";
import { useAppSyncController } from "./services/appSyncController";
import { useComposerController } from "./services/composerController";
import {
  buildFreeChatHistory,
  getConversationMessages,
  hasPendingUserRequest,
  resolveCurrentDirectConversation,
  resolveTaskRoomConversation,
} from "./services/conversationSelectionState";
import { useDirectChatController } from "./services/directChatController";
import { useProjectDialogState } from "./services/projectDialogState";
import { useProjectSetupController } from "./services/projectSetupController";
import { useFreeChatController } from "./services/freeChatController";
import type { ProjectChatScope, ProjectConversationMode } from "./services/projectSetupState";
import { getRespondingAgentIds } from "./services/requestRecovery";
import { usePendingRecoveryController } from "./services/pendingRecoveryController";
import {
  createRequestRuntimeStore,
  type RequestWorkspaceState,
} from "./services/requestRuntimeStore";
import { useTaskLifecycleController } from "./services/taskLifecycleController";
import {
  getTaskEventDisplayLabel,
  isTaskTerminal,
} from "./services/taskLifecycleState";
import { useTaskRoomController } from "./services/taskRoomController";
import {
  getAvailableTaskParticipants,
  getSelectedTaskParticipants,
} from "./services/taskParticipantSelectionState";
import { loadThemeMode, type ThemeMode } from "./services/themeStorage";
import { useWorkspaceChromeController } from "./services/workspaceChromeController";
import { loadUiState } from "./services/uiStateStorage";
import { deriveWorkspaceSelection } from "./services/workspaceSelectionState";
import { applyWorkspaceStateDefaults, loadWorkspaceState } from "./services/workspaceStorage";
import {
  type WorkspaceFileAttachment,
} from "./services/workspaceFileClient";

type DirectoryPickerHandle = {
  name: string;
};

declare global {
  interface Window {
    showDirectoryPicker?: () => Promise<DirectoryPickerHandle>;
  }
}

export function App() {
  const [initialWorkspace] = useState(() => applyWorkspaceStateDefaults(loadWorkspaceState(), seedWorkspaceDefaults));
  const [initialUiState] = useState(() => loadUiState());
  const [agents, setAgents] = useState<AgentInstance[]>(() => loadConfiguredAgents());
  const [projects, setProjects] = useState<Project[]>(() => initialWorkspace.projects);
  const [conversations, setConversations] = useState<Conversation[]>(() => initialWorkspace.conversations);
  const [messages, setMessages] = useState<ConversationMessage[]>(() => initialWorkspace.messages);
  const [runs, setRuns] = useState<ProjectRun[]>(() => initialWorkspace.runs);
  const [tasks, setTasks] = useState<ProjectTask[]>(() => initialWorkspace.tasks);
  const [artifacts, setArtifacts] = useState<ProjectArtifact[]>(() => initialWorkspace.artifacts);
  const [selectedAgentId, setSelectedAgentId] = useState(initialUiState.selectedAgentId ?? "");
  const [selectedProjectId, setSelectedProjectId] = useState(initialUiState.selectedProjectId ?? FREE_CHAT_ENTRY_PROJECT_ID);
  const [chatScope, setChatScope] = useState<ProjectChatScope>(
    deriveInitialChatScope({
      freeChatEntryProjectId: FREE_CHAT_ENTRY_PROJECT_ID,
      selectedProjectId: initialUiState.selectedProjectId,
      storedChatScope: initialUiState.chatScope,
    }),
  );
  const [conversationMode, setConversationMode] = useState<ProjectConversationMode>(initialUiState.conversationMode ?? "single");
  const [outputMode, setOutputMode] = useState<OutputMode>(normalizeOutputMode(initialUiState.outputMode));
  const [activeFreeChatConversationIds, setActiveFreeChatConversationIds] = useState<Record<string, string>>(
    initialUiState.activeFreeChatConversationIds ?? {},
  );
  const [messageText, setMessageText] = useState("");
  const [browserUrl, setBrowserUrl] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [attachedWorkspaceFiles, setAttachedWorkspaceFiles] = useState<WorkspaceFileAttachment[]>([]);
  const [taskParticipantIds, setTaskParticipantIds] = useState<string[]>([]);
  const requestStoreRef = useRef(createRequestRuntimeStore({ conversations, messages, runs, tasks, artifacts }));
  const agentSetup = useAgentSetupDialogState();
  const projectDialog = useProjectDialogState({ freeChatEntryProjectId: FREE_CHAT_ENTRY_PROJECT_ID });
  const {
    localTrustedAgentIssues,
    localTrustedAgentStatuses,
    refreshLocalTrustedAgentIssues,
    removeLocalTrustedAgentReadiness,
  } = useLocalTrustedAgentReadiness();
  const [splitPercent, setSplitPercent] = useState(54);
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => loadThemeMode());

  const selectedAgent = useMemo(
    () => resolveSelectedAgent({ agents, selectedAgentId }),
    [agents, selectedAgentId],
  );
  const chiefAgent = useMemo(() => agents.find((agent) => agent.isChief), [agents]);
  const availableTaskParticipants = useMemo(
    () => getAvailableTaskParticipants({ agents, chiefAgentId: chiefAgent?.id }),
    [agents, chiefAgent?.id],
  );
  const selectedTaskParticipants = useMemo(
    () =>
      getSelectedTaskParticipants({
        availableParticipants: availableTaskParticipants,
        selectedParticipantIds: taskParticipantIds,
      }),
    [availableTaskParticipants, taskParticipantIds],
  );
  const activeSetupAgentId = agentSetup.setupAgentId ?? agentSetup.setupDraftAgentId ?? "";
  const agentSetupController = useAgentSetupController({
    activeSetupAgentId,
    agents,
    clearConfirmAction: projectDialog.clearConfirmAction,
    refreshLocalTrustedAgentIssues,
    removeLocalTrustedAgentReadiness,
    selectedAgentId,
    setAgents,
    setSelectedAgentId,
    setupDialog: agentSetup,
  });
  const {
    selectedProject,
    selectedWorkspaceProject,
    scopedTasks,
    scopedRuns,
    latestChiefTask,
    scopedArtifacts,
  } = useMemo(
    () =>
      deriveWorkspaceSelection({
        projects,
        selectedProjectId,
        freeChatEntryProjectId: FREE_CHAT_ENTRY_PROJECT_ID,
        tasks,
        runs,
        artifacts,
      }),
    [artifacts, projects, runs, selectedProjectId, tasks],
  );
  const projectSetupController = useProjectSetupController({
    applyRequestWorkspaceState,
    artifacts,
    chatScope,
    conversations,
    conversationMode,
    freeChatEntryProjectId: FREE_CHAT_ENTRY_PROJECT_ID,
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
  });
  const agentSetupIssues = useMemo(
    () => deriveAgentReadinessIssues({ agents, localTrustedIssues: localTrustedAgentIssues }),
    [agents, localTrustedAgentIssues],
  );
  const directConversationProjectId = chatScope === "free" ? FREE_CHAT_PROJECT_ID : selectedWorkspaceProject?.id ?? "";
  const activeFreeChatConversationId = selectedAgent ? activeFreeChatConversationIds[selectedAgent.id] : undefined;
  const freeChatHistory = useMemo(
    () =>
      buildFreeChatHistory({
        agent: selectedAgent,
        conversations,
        messages,
        freeChatProjectId: FREE_CHAT_PROJECT_ID,
      }),
    [conversations, messages, selectedAgent],
  );
  const currentConversation = useMemo(
    () =>
      resolveCurrentDirectConversation({
        agent: selectedAgent,
        activeFreeChatConversationId,
        chatScope,
        conversations,
        directConversationProjectId,
        freeChatHistory,
      }),
    [activeFreeChatConversationId, chatScope, conversations, directConversationProjectId, freeChatHistory, selectedAgent],
  );
  const currentMessages = useMemo(
    () => getConversationMessages({ conversation: currentConversation, messages }),
    [currentConversation, messages],
  );
  const currentConversationHasPendingRequest = useMemo(
    () => hasPendingUserRequest(currentMessages),
    [currentMessages],
  );
  const taskRoomConversation = useMemo(
    () => resolveTaskRoomConversation({ chiefAgent, conversations, project: selectedWorkspaceProject }),
    [chiefAgent, conversations, selectedWorkspaceProject],
  );
  const taskRoomMessages = useMemo(
    () => getConversationMessages({ conversation: taskRoomConversation, messages }),
    [messages, taskRoomConversation],
  );
  const taskRoomHasPendingRequest = useMemo(
    () => hasPendingUserRequest(taskRoomMessages),
    [taskRoomMessages],
  );
  const freeChatController = useFreeChatController({
    activeFreeChatConversationIds,
    chatScope,
    currentConversation,
    currentMessages,
    freeChatEntryProjectId: FREE_CHAT_ENTRY_PROJECT_ID,
    freeChatNamespace: FREE_CHAT_NAMESPACE,
    freeChatProjectId: FREE_CHAT_PROJECT_ID,
    selectedAgent,
    setActiveFreeChatConversationIds,
    setAttachedWorkspaceFiles,
    setChatScope,
    setConversationMode,
    setConversations,
    setMessageText,
    setSelectedProjectId,
  });
  const directChatController = useDirectChatController({
    agents,
    applyRequestWorkspaceState,
    attachedWorkspaceFiles,
    currentConversation,
    freeChatNamespace: FREE_CHAT_NAMESPACE,
    freeChatProjectId: FREE_CHAT_PROJECT_ID,
    projects,
    requestStore: requestStoreRef.current,
    selectedAgent,
    selectedWorkspaceProject,
    setActiveFreeChatConversationIds,
    setAttachedWorkspaceFiles,
    setMessageText,
  });
  const activeComposerHasPendingRequest =
    conversationMode === "single" ? currentConversationHasPendingRequest : taskRoomHasPendingRequest;
  const respondingAgentIds = useMemo(() => getRespondingAgentIds(conversations, messages), [conversations, messages]);
  const {
    cancelTaskLifecycle,
    refreshTaskLifecycle,
    retryTaskLifecycle,
    taskLifecycleBusyId,
  } = useTaskLifecycleController({
    agents,
    applyRequestWorkspaceState,
    getRequestWorkspaceState: () => requestStoreRef.current.snapshot(),
    projects,
    runs,
    tasks,
  });
  const taskRoomController = useTaskRoomController({
    applyRequestWorkspaceState,
    attachedWorkspaceFiles,
    chiefAgent,
    requestStore: requestStoreRef.current,
    retryTaskLifecycle,
    selectedTaskParticipants,
    selectedWorkspaceProject,
    setAttachedWorkspaceFiles,
    setMessageText,
    setOutputMode,
  });
  const composerController = useComposerController({
    chatScope,
    conversationMode,
    hasChiefAgent: Boolean(chiefAgent),
    hasSelectedAgent: Boolean(selectedAgent),
    hasSelectedWorkspaceProject: Boolean(selectedWorkspaceProject),
    messageText,
    selectedTaskParticipantCount: selectedTaskParticipants.length,
    submitFreeChatMessage: directChatController.submitFreeChatMessage,
    submitProjectDirectMessage: directChatController.submitProjectDirectMessage,
    submitTaskRoomMessage: taskRoomController.submitTaskRoomMessage,
  });
  const workspaceChromeController = useWorkspaceChromeController({
    browserUrl,
    setOutputMode,
    setPreviewUrl,
    setSplitPercent,
  });
  const appSelectionController = useAppSelectionController({
    availableTaskParticipants,
    chatScope,
    chiefAgentId: chiefAgent?.id,
    conversationMode,
    freeChatEntryProjectId: FREE_CHAT_ENTRY_PROJECT_ID,
    projects,
    selectedAgent,
    selectedAgentId,
    selectedProjectId,
    selectedWorkspaceProjectId: selectedWorkspaceProject?.id,
    setChatScope,
    setConversationMode,
    setSelectedAgentId,
    setSelectedProjectId,
    setTaskParticipantIds,
  });
  usePendingRecoveryController({
    agents,
    applyRequestWorkspaceState,
    completeFreeChatRequest: directChatController.completeFreeChatRequest,
    conversations,
    freeChatProjectId: FREE_CHAT_PROJECT_ID,
    messages,
    projects,
    requestStore: requestStoreRef.current,
    resumeProjectDirectRequest: directChatController.resumeProjectDirectRequest,
  });
  useAppSyncController({
    activeFreeChatConversationIds,
    agents,
    artifacts,
    chatScope,
    conversationMode,
    conversations,
    messages,
    outputMode,
    projects,
    refreshLocalTrustedAgentIssues,
    requestStore: requestStoreRef.current,
    runs,
    selectedAgentId,
    selectedProjectId,
    selectedWorkspaceProjectId: selectedWorkspaceProject?.id,
    setAttachedWorkspaceFiles,
    tasks,
    themeMode,
  });
  useAppMaintenanceController({
    artifacts,
    applyRequestWorkspaceState,
    getRequestWorkspaceState: () => requestStoreRef.current.snapshot(),
    messages,
    refreshTaskLifecycle,
    runs,
    scopedRuns,
    scopedTasks,
    selectedWorkspaceProject,
    tasks,
  });
  const appActionController = useAppActionController({
    confirmAction: projectDialog.confirmAction,
    deleteAgent: agentSetupController.deleteAgent,
    deleteProject: projectSetupController.deleteProject,
    requestDeleteAgent: projectDialog.requestDeleteAgent,
    setAttachedWorkspaceFiles,
    setThemeMode,
  });

  function applyRequestWorkspaceState(state: RequestWorkspaceState, outputMode?: OutputMode) {
    requestStoreRef.current.replace(state);
    setConversations(state.conversations);
    setMessages(state.messages);
    setRuns(state.runs);
    setTasks(state.tasks);
    setArtifacts(state.artifacts);
    if (outputMode) setOutputMode(normalizeOutputMode(outputMode));
  }

  return (
    <div className="app-shell">
      <AppSidebar
        agents={agents}
        projects={projects}
        selectedAgentId={selectedAgentId}
        selectedProjectId={selectedProjectId}
        freeChatEntryProjectId={FREE_CHAT_ENTRY_PROJECT_ID}
        agentSetupIssues={agentSetupIssues}
        respondingAgentIds={respondingAgentIds}
        themeMode={themeMode}
        onAddAgent={agentSetup.openAddAgentDialog}
        onCreateProject={projectDialog.openProjectDialog}
        onDeleteProject={projectSetupController.requestDeleteProject}
        onEditAgent={agentSetup.openAgentEditor}
        onEditProject={projectDialog.openProjectEditor}
        onSelectAgent={appSelectionController.selectAgent}
        onSelectProject={appSelectionController.selectProject}
        onToggleTheme={appActionController.toggleTheme}
      />

      <main className="workspace">
        <div
          className="main-split"
          style={{
            "--conversation-fr": `${splitPercent}fr`,
            "--output-fr": `${100 - splitPercent}fr`,
          } as CSSProperties}
        >
          <ConversationWorkspace
            activeComposerHasPendingRequest={activeComposerHasPendingRequest}
            agents={agents}
            attachedWorkspaceFiles={attachedWorkspaceFiles}
            chatScope={chatScope}
            chiefAgent={chiefAgent}
            conversationMode={conversationMode}
            currentConversationHasPendingRequest={currentConversationHasPendingRequest}
            currentMessages={currentMessages}
            isComposerSubmitting={composerController.isComposerSubmitting}
            latestChiefTask={latestChiefTask}
            messageText={messageText}
            selectedAgent={selectedAgent}
            selectedTaskParticipantCount={selectedTaskParticipants.length}
            selectedWorkspaceProject={selectedWorkspaceProject}
            taskParticipantIds={taskParticipantIds}
            taskRoomHasPendingRequest={taskRoomHasPendingRequest}
            taskRoomMessages={taskRoomMessages}
            onAddAgent={agentSetup.openAddAgentDialog}
            onDetachWorkspaceFile={appActionController.detachWorkspaceFile}
            onMessageTextChange={setMessageText}
            onRetryDirectMessage={directChatController.retryDirectMessage}
            onRetryTaskRoomMessage={taskRoomController.retryTaskRoomMessage}
            onSelectFreeChat={() => setChatScope("free")}
            onSubmitMessage={composerController.submitMessage}
            onToggleTaskParticipant={appSelectionController.toggleTaskParticipant}
          />

          <div
            className="splitter"
            role="separator"
            aria-label="Resize conversation and output panels"
            aria-orientation="vertical"
            aria-valuemin={35}
            aria-valuemax={70}
            aria-valuenow={Math.round(splitPercent)}
            tabIndex={0}
            onPointerDown={workspaceChromeController.startSplitDrag}
            onKeyDown={(event) => {
              if (event.key === "ArrowLeft") workspaceChromeController.nudgeSplit("left");
              if (event.key === "ArrowRight") workspaceChromeController.nudgeSplit("right");
            }}
          >
            <span />
          </div>

          <OutputPanel
            agents={agents}
            artifacts={scopedArtifacts}
            attachedWorkspaceFiles={attachedWorkspaceFiles}
            browserUrl={browserUrl}
            busyActionId={taskLifecycleBusyId}
            chatScope={chatScope}
            freeChatActiveConversationId={currentConversation?.id}
            freeChatAgent={selectedAgent}
            freeChatHistories={freeChatHistory}
            outputMode={outputMode}
            previewUrl={previewUrl}
            project={selectedWorkspaceProject}
            runs={scopedRuns}
            tasks={scopedTasks}
            onAttachFile={appActionController.attachWorkspaceFile}
            onBrowserUrlChange={setBrowserUrl}
            onCancelTask={cancelTaskLifecycle}
            onCreateProject={projectDialog.openProjectDialog}
            onDetachFile={appActionController.detachWorkspaceFile}
            onEditProject={projectDialog.openProjectEditor}
            onNewFreeChat={freeChatController.startNewConversation}
            onOpenPreview={workspaceChromeController.openPreview}
            onOutputModeChange={setOutputMode}
            onRefreshTask={refreshTaskLifecycle}
            onRetryTask={retryTaskLifecycle}
            onSelectFreeChatConversation={freeChatController.selectConversation}
          />
        </div>
      </main>

      {agentSetup.showSetup ? (
        <SetupWizard
          testState={agentSetup.testState}
          testMessage={agentSetup.testMessage}
          isSaving={agentSetup.isSavingAgent}
          onClose={agentSetup.closeSetup}
          onRunTest={agentSetupController.runConnectionTest}
          onResetTest={agentSetup.resetConnectionTest}
          onSaveAgent={agentSetupController.saveAgent}
          agent={agentSetup.setupAgentId ? agents.find((agent) => agent.id === agentSetup.setupAgentId) : undefined}
          localTrustedStatus={activeSetupAgentId ? localTrustedAgentStatuses[activeSetupAgentId] : undefined}
          onDeleteAgent={appActionController.requestDeleteAgent}
          onAgentAvatarFile={agentSetupController.updateExistingAgentAvatar}
        />
      ) : null}
      {projectDialog.showProjectDialog ? (
        <ProjectDialog
          error={projectDialog.projectFormError}
          project={projectDialog.editingProjectId ? projects.find((project) => project.id === projectDialog.editingProjectId) : undefined}
          onClose={projectDialog.closeProjectDialog}
          onSaveProject={projectSetupController.saveProject}
        />
      ) : null}
      {projectDialog.confirmAction ? (
        <ConfirmDialog
          action={projectDialog.confirmAction}
          agents={agents}
          projects={projects}
          onCancel={projectDialog.clearConfirmAction}
          onConfirm={appActionController.confirmPendingAction}
        />
      ) : null}
    </div>
  );
}
