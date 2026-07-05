import { useMemo, useRef, useState } from "react";
import { AppDialogs } from "./components/AppDialogs";
import { AppSidebar } from "./components/AppSidebar";
import { MainWorkspace, type OutputMode } from "./components/MainWorkspace";
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
import { useAppActionController } from "./services/appActionController";
import { deriveAppAgentViewState } from "./services/appAgentViewState";
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
import { deriveAppConversationViewState } from "./services/appConversationViewState";
import { useDirectChatController } from "./services/directChatController";
import { useProjectDialogState } from "./services/projectDialogState";
import { useProjectSetupController } from "./services/projectSetupController";
import { useFreeChatController } from "./services/freeChatController";
import type { ProjectChatScope, ProjectConversationMode } from "./services/projectSetupState";
import { usePendingRecoveryController } from "./services/pendingRecoveryController";
import {
  createRequestRuntimeStore,
  type RequestWorkspaceState,
} from "./services/requestRuntimeStore";
import { useTaskLifecycleController } from "./services/taskLifecycleController";
import { useTaskRoomController } from "./services/taskRoomController";
import { loadThemeMode, type ThemeMode } from "./services/themeStorage";
import { useWorkspaceChromeController, type BrowserPreviewOutput } from "./services/workspaceChromeController";
import { loadUiState } from "./services/uiStateStorage";
import { deriveWorkspaceSelection } from "./services/workspaceSelectionState";
import { applyWorkspaceStateDefaults, loadWorkspaceState } from "./services/workspaceStorage";
import {
  type WorkspaceFileAttachment,
} from "./services/workspaceFileClient";

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
  const [browserUrl, setBrowserUrl] = useState(initialUiState.browserUrl ?? initialUiState.previewOutput?.url ?? "");
  const [previewOutput, setPreviewOutput] = useState<BrowserPreviewOutput | undefined>(initialUiState.previewOutput);
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

  const agentView = useMemo(
    () =>
      deriveAppAgentViewState({
        agents,
        conversations,
        localTrustedAgentIssues,
        messages,
        selectedAgentId,
        taskParticipantIds,
      }),
    [agents, conversations, localTrustedAgentIssues, messages, selectedAgentId, taskParticipantIds],
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
  const conversationView = useMemo(
    () =>
      deriveAppConversationViewState({
        activeFreeChatConversationIds,
        chatScope,
        chiefAgent: agentView.chiefAgent,
        conversations,
        conversationMode,
        freeChatProjectId: FREE_CHAT_PROJECT_ID,
        messages,
        selectedAgent: agentView.selectedAgent,
        selectedWorkspaceProject,
      }),
    [
      activeFreeChatConversationIds,
      chatScope,
      agentView.chiefAgent,
      conversations,
      conversationMode,
      messages,
      agentView.selectedAgent,
      selectedWorkspaceProject,
    ],
  );
  const freeChatController = useFreeChatController({
    activeFreeChatConversationIds,
    chatScope,
    conversations,
    currentConversation: conversationView.currentConversation,
    currentMessages: conversationView.currentMessages,
    freeChatEntryProjectId: FREE_CHAT_ENTRY_PROJECT_ID,
    freeChatNamespace: FREE_CHAT_NAMESPACE,
    freeChatProjectId: FREE_CHAT_PROJECT_ID,
    selectedAgent: agentView.selectedAgent,
    setActiveFreeChatConversationIds,
    setAttachedWorkspaceFiles,
    setChatScope,
    setConversationMode,
    setConversations,
    setMessages,
    setMessageText,
    setSelectedProjectId,
  });
  const directChatController = useDirectChatController({
    agents,
    applyRequestWorkspaceState,
    attachedWorkspaceFiles,
    currentConversation: conversationView.currentConversation,
    freeChatNamespace: FREE_CHAT_NAMESPACE,
    freeChatProjectId: FREE_CHAT_PROJECT_ID,
    projects,
    requestStore: requestStoreRef.current,
    selectedAgent: agentView.selectedAgent,
    selectedWorkspaceProject,
    setActiveFreeChatConversationIds,
    setAttachedWorkspaceFiles,
    setMessageText,
  });
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
    chiefAgent: agentView.chiefAgent,
    requestStore: requestStoreRef.current,
    retryTaskLifecycle,
    selectedTaskParticipants: agentView.selectedTaskParticipants,
    selectedWorkspaceProject,
    setAttachedWorkspaceFiles,
    setMessageText,
    setOutputMode,
  });
  const composerController = useComposerController({
    chatScope,
    conversationMode,
    hasChiefAgent: Boolean(agentView.chiefAgent),
    hasSelectedAgent: Boolean(agentView.selectedAgent),
    hasSelectedWorkspaceProject: Boolean(selectedWorkspaceProject),
    messageText,
    selectedTaskParticipantCount: agentView.selectedTaskParticipants.length,
    submitFreeChatMessage: directChatController.submitFreeChatMessage,
    submitProjectDirectMessage: directChatController.submitProjectDirectMessage,
    submitTaskRoomMessage: taskRoomController.submitTaskRoomMessage,
  });
  const workspaceChromeController = useWorkspaceChromeController({
    browserUrl,
    selectedAgentId: agentView.selectedAgent?.id,
    setOutputMode,
    setPreviewOutput,
    setSplitPercent,
  });
  const appSelectionController = useAppSelectionController({
    availableTaskParticipants: agentView.availableTaskParticipants,
    chatScope,
    chiefAgentId: agentView.chiefAgent?.id,
    conversationMode,
    freeChatEntryProjectId: FREE_CHAT_ENTRY_PROJECT_ID,
    projects,
    selectedAgent: agentView.selectedAgent,
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
    browserUrl,
    chatScope,
    conversationMode,
    conversations,
    messages,
    outputMode,
    previewOutput,
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
        agentSetupIssues={agentView.agentSetupIssues}
        respondingAgentIds={agentView.respondingAgentIds}
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

      <MainWorkspace
        activeComposerHasPendingRequest={conversationView.activeComposerHasPendingRequest}
        agents={agents}
        attachedWorkspaceFiles={attachedWorkspaceFiles}
        browserUrl={browserUrl}
        busyActionId={taskLifecycleBusyId}
        chatScope={chatScope}
        chiefAgent={agentView.chiefAgent}
        conversationMode={conversationMode}
        currentConversation={conversationView.currentConversation}
        currentConversationHasPendingRequest={conversationView.currentConversationHasPendingRequest}
        currentMessages={conversationView.currentMessages}
        freeChatAgent={agentView.selectedAgent}
        freeChatHistories={conversationView.freeChatHistory}
        isComposerSubmitting={composerController.isComposerSubmitting}
        latestChiefTask={latestChiefTask}
        messageText={messageText}
        outputMode={outputMode}
        previewOwnerAgentId={previewOutput?.ownerAgentId}
        previewUrl={previewOutput?.url ?? ""}
        project={selectedWorkspaceProject}
        runs={scopedRuns}
        scopedArtifacts={scopedArtifacts}
        selectedAgent={agentView.selectedAgent}
        selectedTaskParticipantCount={agentView.selectedTaskParticipants.length}
        splitPercent={splitPercent}
        taskParticipantIds={taskParticipantIds}
        taskRoomHasPendingRequest={conversationView.taskRoomHasPendingRequest}
        taskRoomMessages={conversationView.taskRoomMessages}
        tasks={scopedTasks}
        onAddAgent={agentSetup.openAddAgentDialog}
        onAttachFile={appActionController.attachWorkspaceFile}
        onBrowserUrlChange={setBrowserUrl}
        onCancelTask={cancelTaskLifecycle}
        onCreateProject={projectDialog.openProjectDialog}
        onDetachWorkspaceFile={appActionController.detachWorkspaceFile}
        onEditProject={projectDialog.openProjectEditor}
        onMessageTextChange={setMessageText}
        onNewFreeChat={freeChatController.startNewConversation}
        onOpenPreview={workspaceChromeController.openPreview}
        onOutputModeChange={setOutputMode}
        onRefreshTask={refreshTaskLifecycle}
        onRenameFreeChatConversation={freeChatController.renameConversation}
        onRetryDirectMessage={directChatController.retryDirectMessage}
        onRetryTask={retryTaskLifecycle}
        onRetryTaskRoomMessage={taskRoomController.retryTaskRoomMessage}
        onSelectFreeChat={() => setChatScope("free")}
        onSelectFreeChatConversation={freeChatController.selectConversation}
        onDeleteFreeChatConversation={freeChatController.deleteConversation}
        onSplitterKeyNudge={workspaceChromeController.nudgeSplit}
        onSplitterPointerDown={workspaceChromeController.startSplitDrag}
        onSubmitMessage={composerController.submitMessage}
        onToggleTaskParticipant={appSelectionController.toggleTaskParticipant}
      />

      <AppDialogs
        activeSetupAgentId={activeSetupAgentId}
        agentSetup={agentSetup}
        agents={agents}
        localTrustedStatus={activeSetupAgentId ? localTrustedAgentStatuses[activeSetupAgentId] : undefined}
        projectDialog={projectDialog}
        projects={projects}
        onAgentAvatarFile={agentSetupController.updateExistingAgentAvatar}
        onConfirmPendingAction={appActionController.confirmPendingAction}
        onDeleteAgent={appActionController.requestDeleteAgent}
        onRunConnectionTest={agentSetupController.runConnectionTest}
        onSaveAgent={agentSetupController.saveAgent}
        onSaveProject={projectSetupController.saveProject}
      />
    </div>
  );
}
