import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, PointerEvent } from "react";
import { AppSidebar } from "./components/AppSidebar";
import { ConversationWorkspace } from "./components/ConversationWorkspace";
import { OutputPanel, type OutputMode } from "./components/OutputPanel";
import { ConfirmDialog, ProjectDialog } from "./components/ProjectDialogs";
import { SetupWizard } from "./components/SetupWizard";
import type { A2ATask } from "./domain/a2a";
import { createAgentFromHermesSetup, getProviderSetupIssue } from "./domain/hermesSetup";
import {
  conversationMessages,
  conversations as seedConversations,
  projectArtifacts,
  projectRuns,
  projectTasks,
  projects as seedProjects,
} from "./domain/seedData";
import type {
  Conversation,
  ConversationMessage,
  ProjectArtifact,
  ProjectRun,
  ProjectTask,
} from "./domain/projectScope";
import { markConversationMessageFailed } from "./domain/requestLifecycle";
import type { AgentInstance, Project } from "./domain/types";
import { loadConfiguredAgents, saveConfiguredAgents } from "./services/agentStorage";
import { getUserFacingAgentError } from "./services/agentErrorText";
import { applyMediaArtifactBackfillState } from "./services/artifactBackfillState";
import { readAvatarFile } from "./services/avatarFile";
import { useAgentSetupDialogState } from "./services/agentSetupDialogState";
import {
  applyAgentAvatarUpdate,
  applyAgentDelete,
  applyAgentSetupSave,
  normalizeChief,
  resolveSelectedAgent,
} from "./services/agentSetupState";
import {
  applyLocalTrustedAgentStatusMap,
  applyLocalTrustedAgentStatuses,
  deriveAgentReadinessIssues,
  removeAgentReadinessIssues,
  removeAgentReadinessStatus,
  type LocalTrustedAgentStatusById,
} from "./services/agentReadinessState";
import { resolveComposerSubmissionIntent } from "./services/composerSubmissionState";
import {
  applyActiveFreeChatConversation,
  buildFreeChatHistory,
  getConversationMessages,
  hasPendingUserRequest,
  resolveCurrentDirectConversation,
  resolveTaskRoomConversation,
  shouldReuseEmptyFreeChat,
} from "./services/conversationSelectionState";
import {
  completeFreeChatRequestState,
  completeProjectDirectRequestState,
  resumeProjectDirectRequestState,
  type DirectRequestResult,
  type DirectRequestState,
} from "./services/directRequestOrchestrator";
import { createA2ACompatibilityMetadata, HermesA2AAdapter } from "./services/hermesA2AAdapter";
import {
  deleteLocalTrustedAgent,
  getLocalTrustedAgentStatuses,
  stripAgentCredential,
  upsertLocalTrustedAgent,
} from "./services/localTrustedAgentRegistry";
import { useProjectDialogState } from "./services/projectDialogState";
import {
  applyMissingProjectSelection,
  applyProjectDelete,
  applyProjectDeleteSelection,
  applyProjectSave,
  canDeleteProject,
  normalizeConversationModeForScope,
} from "./services/projectSetupState";
import { getRespondingAgentIds } from "./services/requestRecovery";
import { getNextPendingRecoverySubmission } from "./services/requestRecoverySubmissionState";
import {
  completeTaskRoomRetrySubmission,
  prepareDirectRetrySubmission,
  prepareTaskRoomRetrySubmission,
} from "./services/requestRetrySubmissionState";
import { createRequestRuntimeStore, type RequestWorkspaceState } from "./services/requestRuntimeStore";
import {
  executeTaskRoomRequestState,
  type TaskRoomRequestState,
  type TaskRoomRequestStep,
} from "./services/taskRoomOrchestrator";
import {
  createConversation,
  prepareFreeChatSubmission,
  prepareProjectDirectSubmission,
  prepareTaskRoomSubmission,
} from "./services/requestSubmissionState";
import { cancelRemoteTaskLifecycle, refreshRemoteTaskLifecycle, retryRemoteProjectTask } from "./services/taskLifecycleExecutor";
import {
  applyTaskLifecycleWorkspaceUpdate,
  getPollableTasks,
  resolveTaskLifecycleRequest,
  resolveTaskRetryRequest,
} from "./services/taskLifecycleRequestState";
import {
  failTaskRetry,
  getRemoteTaskWorkState,
  getTaskEventDisplayLabel,
  getTaskLifecycleBusyId,
  isTaskTerminal,
  prepareTaskRetrySubmitting,
  recordCancelUnsupportedState,
  recordLifecycleUnsupportedState,
} from "./services/taskLifecycleState";
import {
  getAvailableTaskParticipants,
  getSelectedTaskParticipants,
  toggleTaskParticipantSelection,
} from "./services/taskParticipantSelectionState";
import { loadThemeMode, saveThemeMode, type ThemeMode } from "./services/themeStorage";
import { getSplitPercentFromClientX, nudgeSplitPercent } from "./services/splitPaneState";
import { loadUiState, saveUiState } from "./services/uiStateStorage";
import { attachWorkspaceFileState, detachWorkspaceFileState } from "./services/workspaceAttachmentState";
import { deriveWorkspaceSelection } from "./services/workspaceSelectionState";
import { applyWorkspaceStateDefaults, loadWorkspaceState, saveWorkspaceState } from "./services/workspaceStorage";
import {
  type WorkspaceFileAttachment,
  type WorkspaceFileReadResult,
} from "./services/workspaceFileClient";

type ConversationMode = "single" | "task-room";
type ChatScope = "free" | "project";
type DirectoryPickerHandle = {
  name: string;
};

const FREE_CHAT_ENTRY_PROJECT_ID = "default";
const FREE_CHAT_PROJECT_ID = "__free_chat__";
const FREE_CHAT_NAMESPACE = "free-chat";
const seedWorkspaceDefaults = {
  projects: seedProjects,
  conversations: seedConversations,
  messages: conversationMessages,
  runs: projectRuns,
  tasks: projectTasks,
  artifacts: projectArtifacts,
};

function normalizeOutputMode(mode?: string): OutputMode {
  if (mode === "workspace" || mode === "browser" || mode === "outputs") return mode;
  if (mode === "runs" || mode === "artifacts") return "outputs";
  return "workspace";
}

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
  const [chatScope, setChatScope] = useState<ChatScope>(
    initialUiState.chatScope ?? (initialUiState.selectedProjectId && initialUiState.selectedProjectId !== FREE_CHAT_ENTRY_PROJECT_ID ? "project" : "free"),
  );
  const [conversationMode, setConversationMode] = useState<ConversationMode>(initialUiState.conversationMode ?? "single");
  const [outputMode, setOutputMode] = useState<OutputMode>(normalizeOutputMode(initialUiState.outputMode));
  const [activeFreeChatConversationIds, setActiveFreeChatConversationIds] = useState<Record<string, string>>(
    initialUiState.activeFreeChatConversationIds ?? {},
  );
  const [messageText, setMessageText] = useState("");
  const [browserUrl, setBrowserUrl] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [attachedWorkspaceFiles, setAttachedWorkspaceFiles] = useState<WorkspaceFileAttachment[]>([]);
  const [taskParticipantIds, setTaskParticipantIds] = useState<string[]>([]);
  const [isComposerSubmitting, setIsComposerSubmitting] = useState(false);
  const [taskLifecycleBusyId, setTaskLifecycleBusyId] = useState("");
  const composerSubmittingRef = useRef(false);
  const requestStoreRef = useRef(createRequestRuntimeStore({ conversations, messages, runs, tasks, artifacts }));
  const agentSetup = useAgentSetupDialogState();
  const projectDialog = useProjectDialogState({ freeChatEntryProjectId: FREE_CHAT_ENTRY_PROJECT_ID });
  const [localTrustedAgentIssues, setLocalTrustedAgentIssues] = useState<Record<string, string[]>>({});
  const [localTrustedAgentStatuses, setLocalTrustedAgentStatuses] = useState<LocalTrustedAgentStatusById>({});
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
  const activeComposerHasPendingRequest =
    conversationMode === "single" ? currentConversationHasPendingRequest : taskRoomHasPendingRequest;
  const respondingAgentIds = useMemo(() => getRespondingAgentIds(conversations, messages), [conversations, messages]);

  useEffect(() => {
    setAttachedWorkspaceFiles([]);
  }, [chatScope, selectedWorkspaceProject?.id]);

  useEffect(() => {
    const nextSelection = normalizeConversationModeForScope({ selectedProjectId, chatScope, conversationMode });
    if (nextSelection.conversationMode !== conversationMode) setConversationMode(nextSelection.conversationMode);
  }, [chatScope, conversationMode, selectedProjectId]);

  useEffect(() => {
    setTaskParticipantIds(availableTaskParticipants.map((agent) => agent.id));
  }, [availableTaskParticipants, chiefAgent?.id, selectedWorkspaceProject?.id]);

  useEffect(() => {
    if (selectedAgent && selectedAgent.id !== selectedAgentId) {
      setSelectedAgentId(selectedAgent.id);
    }
  }, [selectedAgent, selectedAgentId]);

  useEffect(() => {
    const nextSelection = applyMissingProjectSelection({
      projects,
      freeChatEntryProjectId: FREE_CHAT_ENTRY_PROJECT_ID,
      selection: { selectedProjectId, chatScope, conversationMode },
    });
    if (nextSelection.selectedProjectId !== selectedProjectId) setSelectedProjectId(nextSelection.selectedProjectId);
    if (nextSelection.chatScope !== chatScope) setChatScope(nextSelection.chatScope);
    if (nextSelection.conversationMode !== conversationMode) setConversationMode(nextSelection.conversationMode);
  }, [chatScope, conversationMode, projects, selectedProjectId]);

  useEffect(() => {
    if (chatScope !== "free" || !selectedAgent || !currentConversation) return;
    if (activeFreeChatConversationIds[selectedAgent.id] === currentConversation.id) return;

    setActiveFreeChatConversationIds((current) =>
      applyActiveFreeChatConversation({
        activeConversationIds: current,
        agentId: selectedAgent.id,
        conversationId: currentConversation.id,
      }),
    );
  }, [activeFreeChatConversationIds, chatScope, currentConversation, selectedAgent]);

  useEffect(() => {
    requestStoreRef.current.sync({ conversations });
  }, [conversations]);

  useEffect(() => {
    requestStoreRef.current.sync({ messages });
  }, [messages]);

  useEffect(() => {
    requestStoreRef.current.sync({ runs });
  }, [runs]);

  useEffect(() => {
    requestStoreRef.current.sync({ tasks });
  }, [tasks]);

  useEffect(() => {
    requestStoreRef.current.sync({ artifacts });
  }, [artifacts]);

  useEffect(() => {
    agents.forEach((agent) => {
      void upsertLocalTrustedAgent(agent).catch(() => {
        // Local registry sync is recoverable; connection tests and requests surface actionable errors.
      });
    });
    saveConfiguredAgents(agents);
  }, [agents]);

  useEffect(() => {
    let cancelled = false;
    const agentIds = agents.map((agent) => agent.id);
    if (agentIds.length === 0) {
      setLocalTrustedAgentIssues({});
      setLocalTrustedAgentStatuses({});
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
      activeFreeChatConversationIds,
    });
  }, [activeFreeChatConversationIds, chatScope, conversationMode, outputMode, selectedAgentId, selectedProjectId]);

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
    const submission = getNextPendingRecoverySubmission({
      activeRequestIds: requestStoreRef.current.activeRequestIds(),
      agents,
      freeChatProjectId: FREE_CHAT_PROJECT_ID,
      projects,
      state: requestStoreRef.current.snapshot(),
    });
    if (submission.kind === "none") return;

    if (submission.kind === "fail") {
      applyRequestWorkspaceState(submission.state);
      return;
    }

    const trackedRequestId = requestStoreRef.current.begin(submission.message);
    applyRequestWorkspaceState(submission.state);

    if (submission.recovery.kind === "free-chat") {
      void completeFreeChatRequest({
        conversation: submission.recovery.conversation,
        targetAgent: submission.recovery.targetAgent,
        userMessageId: submission.message.id,
        text: submission.recovery.text,
      }).finally(() => {
        requestStoreRef.current.end(trackedRequestId);
      });
      return;
    }

    void resumeProjectDirectRequest({
      message: submission.message,
      conversation: submission.recovery.conversation,
      project: submission.recovery.project,
      targetAgent: submission.recovery.targetAgent,
      text: submission.recovery.text,
    }).finally(() => {
      requestStoreRef.current.end(trackedRequestId);
    });
  }, [agents, conversations, messages, projects]);

  useEffect(() => {
    const backfilled = applyMediaArtifactBackfillState(requestStoreRef.current.snapshot());
    if (backfilled.changed) applyRequestWorkspaceState(backfilled.state);
  }, [artifacts, messages, runs, tasks]);

  useEffect(() => {
    document.documentElement.dataset.theme = themeMode;
    saveThemeMode(themeMode);
  }, [themeMode]);

  useEffect(() => {
    if (!selectedWorkspaceProject) return;
    const pollableTasks = getPollableTasks({ runs: scopedRuns, tasks: scopedTasks });
    if (pollableTasks.length === 0) return;

    const interval = window.setInterval(() => {
      pollableTasks.forEach((task) => {
        void refreshTaskLifecycle(task.id, { silent: true });
      });
    }, 15000);

    return () => window.clearInterval(interval);
  }, [agents, scopedRuns, scopedTasks, selectedWorkspaceProject]);

  function toggleTheme() {
    setThemeMode((current) => (current === "dark" ? "light" : "dark"));
  }

  async function refreshTaskLifecycle(taskId: string, options: { silent?: boolean } = {}) {
    const request = resolveTaskLifecycleRequest({ agents, runs, taskId, tasks });
    if (request.kind === "ignore") return;
    if (request.kind === "unsupported") {
      recordLifecycleUnsupported(request.task, request.reason);
      return;
    }

    if (!options.silent) setTaskLifecycleBusyId(getTaskLifecycleBusyId("refresh", taskId));

    try {
      const remoteTask = await refreshRemoteTaskLifecycle({ agent: request.owner, address: request.address });
      applyLifecycleTaskUpdate(request.task, remoteTask, request.owner.id, "Task status refreshed.");
    } catch (error) {
      recordLifecycleUnsupported(request.task, getUserFacingAgentError(error));
    } finally {
      if (!options.silent) setTaskLifecycleBusyId("");
    }
  }

  async function cancelTaskLifecycle(taskId: string) {
    const request = resolveTaskLifecycleRequest({ agents, runs, taskId, tasks });
    if (request.kind === "ignore") return;
    if (request.kind === "unsupported") {
      recordLifecycleUnsupported(request.task, request.reason);
      return;
    }

    setTaskLifecycleBusyId(getTaskLifecycleBusyId("cancel", taskId));
    try {
      const remoteTask = await cancelRemoteTaskLifecycle({ agent: request.owner, address: request.address });
      applyLifecycleTaskUpdate(request.task, remoteTask, request.owner.id, "Task cancel requested.");
    } catch (error) {
      recordCancelUnsupported(request.task, getUserFacingAgentError(error));
    } finally {
      setTaskLifecycleBusyId("");
    }
  }

  async function retryTaskLifecycle(taskId: string) {
    const request = resolveTaskRetryRequest({ agents, projects, taskId, tasks });
    if (request.kind === "ignore") return false;
    if (request.kind === "unsupported") {
      recordLifecycleUnsupported(request.task, request.reason);
      return false;
    }

    const retryAt = new Date().toISOString();
    setTaskLifecycleBusyId(getTaskLifecycleBusyId("retry", taskId));
    setTasks((current) =>
      prepareTaskRetrySubmitting({ tasks: current, task: request.task, ownerAgentId: request.owner.id, retryAt }),
    );

    try {
      const remoteTask = await retryRemoteProjectTask({
        agent: request.owner,
        project: request.project,
        taskTitle: request.task.title,
        previousFailure: request.task.summary,
      });
      applyLifecycleTaskUpdate(request.task, remoteTask, request.owner.id, "Retry returned a task update.");
      return getRemoteTaskWorkState(remoteTask) !== "failed";
    } catch (error) {
      const failedAt = new Date().toISOString();
      const errorText = getUserFacingAgentError(error);
      setTasks((current) =>
        failTaskRetry({
          tasks: current,
          task: request.task,
          ownerAgentId: request.owner.id,
          errorText,
          failedAt,
        }),
      );
      return false;
    } finally {
      setTaskLifecycleBusyId("");
    }
  }

  function applyLifecycleTaskUpdate(task: ProjectTask, remoteTask: A2ATask, agentId: string, label: string) {
    const snapshot = requestStoreRef.current.snapshot();
    const nextState = applyTaskLifecycleWorkspaceUpdate({
      state: {
        artifacts: snapshot.artifacts,
        runs: snapshot.runs,
        tasks: snapshot.tasks,
      },
      task,
      remoteTask,
      agentId,
      label,
      now: () => new Date().toISOString(),
    });
    requestStoreRef.current.sync({
      artifacts: nextState.artifacts,
      runs: nextState.runs,
      tasks: nextState.tasks,
    });
    setArtifacts(nextState.artifacts);
    setTasks(nextState.tasks);
    setRuns(nextState.runs);
  }

  function recordLifecycleUnsupported(task: ProjectTask, reason: string) {
    const at = new Date().toISOString();
    setTasks((current) => recordLifecycleUnsupportedState({ tasks: current, task, reason, at }));
  }

  function recordCancelUnsupported(task: ProjectTask, reason: string) {
    const at = new Date().toISOString();
    setTasks((current) => recordCancelUnsupportedState({ tasks: current, task, reason, at }));
  }

  async function runConnectionTest(form: FormData) {
    agentSetup.markConnectionRunning();

    try {
      const agent = createAgentFromHermesSetup(form, { id: activeSetupAgentId || undefined });
      const setupIssue = getProviderSetupIssue(agent);
      if (setupIssue) {
        agentSetup.markConnectionFailed(setupIssue);
        return;
      }
      if (!(await persistLocalTrustedAgent(agent))) return;
      await refreshLocalTrustedAgentIssues([agent.id]);
      const result = await new HermesA2AAdapter({ agent: stripAgentCredential(agent) }).testConnection();

      agentSetup.markConnectionPassed(
        createA2ACompatibilityMetadata(result),
        `${result.card.name || agent.name} provider connection verified.`,
      );
    } catch (error) {
      agentSetup.markConnectionFailed(getUserFacingAgentError(error));
    }
  }

  async function persistLocalTrustedAgent(agent: AgentInstance) {
    try {
      await upsertLocalTrustedAgent(agent);
      return true;
    } catch {
      agentSetup.markConnectionFailed("Unable to update the local trusted agent registry.");
      return false;
    }
  }

  async function refreshLocalTrustedAgentIssues(
    agentIds: string[],
    options: { replace?: boolean; isCancelled?: () => boolean } = {},
  ) {
    if (agentIds.length === 0) {
      setLocalTrustedAgentIssues({});
      setLocalTrustedAgentStatuses({});
      return;
    }

    try {
      const statuses = await getLocalTrustedAgentStatuses(agentIds);
      if (options.isCancelled?.()) return;
      setLocalTrustedAgentStatuses((current) =>
        applyLocalTrustedAgentStatusMap({ currentStatuses: current, replace: options.replace, statuses }),
      );
      setLocalTrustedAgentIssues((current) =>
        applyLocalTrustedAgentStatuses({ currentIssues: current, replace: options.replace, statuses }),
      );
    } catch {
      if (options.isCancelled?.()) return;
      if (options.replace) {
        setLocalTrustedAgentIssues({});
        setLocalTrustedAgentStatuses({});
      }
    }
  }

  async function saveDemoAgent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (agentSetup.isSavingAgent) return;
    const form = new FormData(event.currentTarget);
    const newAgent = createAgentFromHermesSetup(form, { id: activeSetupAgentId || undefined });
    const setupIssue = getProviderSetupIssue(newAgent);
    if (setupIssue) {
      agentSetup.markConnectionFailed(setupIssue);
      return;
    }

    agentSetup.setIsSavingAgent(true);
    try {
      const saveResult = applyAgentSetupSave({
        agents,
        submittedAgent: newAgent,
        editingAgentId: agentSetup.setupAgentId,
        metadata: agentSetup.lastConnectionMetadata,
      });

      if (!(await persistLocalTrustedAgent(saveResult.trustedAgent))) return;
      await refreshLocalTrustedAgentIssues([saveResult.trustedAgent.id]);
      setAgents(saveResult.agents);
      if (saveResult.selectedAgentId) {
        setSelectedAgentId(saveResult.selectedAgentId);
      }
      agentSetup.closeSetup();
    } finally {
      agentSetup.setIsSavingAgent(false);
    }
  }

  function requestDeleteAgent(agentId: string) {
    projectDialog.requestDeleteAgent(agentId);
  }

  function deleteAgent(agentId: string) {
    void deleteLocalTrustedAgent(agentId).catch(() => {
      // A stale local registry entry is less harmful than interrupting the delete UI flow.
    });
    const result = applyAgentDelete({ agentId, agents, selectedAgentId });
    setAgents(result.agents);
    setLocalTrustedAgentIssues((current) => removeAgentReadinessIssues(current, agentId));
    setLocalTrustedAgentStatuses((current) => removeAgentReadinessStatus(current, agentId));
    if (result.selectedAgentId !== selectedAgentId) setSelectedAgentId(result.selectedAgentId);
    projectDialog.clearConfirmAction();
  }

  function updateAgentAvatar(agentId: string, avatarUrl?: string) {
    setAgents((current) => applyAgentAvatarUpdate({ agents: current, agentId, avatarUrl }));
  }

  async function handleExistingAgentAvatar(agentId: string, file?: File) {
    const result = await readAvatarFile(file);
    if (result.error) {
      agentSetup.markConnectionFailed(result.error);
      return;
    }
    updateAgentAvatar(agentId, result.dataUrl);
  }

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
    if (!canDeleteProject(projects, projectId, FREE_CHAT_ENTRY_PROJECT_ID)) return;
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
      freeChatEntryProjectId: FREE_CHAT_ENTRY_PROJECT_ID,
      selection: { selectedProjectId, chatScope, conversationMode },
    });
    setSelectedProjectId(nextSelection.selectedProjectId);
    setChatScope(nextSelection.chatScope);
    setConversationMode(nextSelection.conversationMode);
    projectDialog.clearConfirmAction();
  }

  function confirmPendingAction() {
    const action = projectDialog.confirmAction;
    if (!action) return;
    if (action.kind === "delete-project") {
      deleteProject(action.projectId);
    } else {
      deleteAgent(action.agentId);
    }
  }

  function attachWorkspaceFile(file: WorkspaceFileReadResult) {
    setAttachedWorkspaceFiles((current) =>
      attachWorkspaceFileState({ attachments: current, file, attachedAt: new Date().toISOString() }),
    );
  }

  function detachWorkspaceFile(path: string) {
    setAttachedWorkspaceFiles((current) => detachWorkspaceFileState({ attachments: current, path }));
  }

  function toggleTaskParticipant(agentId: string, checked: boolean) {
    setTaskParticipantIds((current) =>
      toggleTaskParticipantSelection({
        selectedParticipantIds: current,
        agentId,
        checked,
      }),
    );
  }

  function selectFreeChatConversation(conversationId: string) {
    if (!selectedAgent) return;

    setActiveFreeChatConversationIds((current) =>
      applyActiveFreeChatConversation({
        activeConversationIds: current,
        agentId: selectedAgent.id,
        conversationId,
      }),
    );
    setChatScope("free");
    setConversationMode("single");
    setSelectedProjectId(FREE_CHAT_ENTRY_PROJECT_ID);
  }

  function startNewFreeChat() {
    if (!selectedAgent) return;
    const reusableConversation = currentConversation;
    if (
      reusableConversation &&
      shouldReuseEmptyFreeChat({
        conversation: reusableConversation,
        messageCount: currentMessages.length,
        freeChatProjectId: FREE_CHAT_PROJECT_ID,
      })
    ) {
      selectFreeChatConversation(reusableConversation.id);
      return;
    }

    const now = new Date().toISOString();
    const conversation = createConversation({
      projectId: FREE_CHAT_PROJECT_ID,
      namespace: FREE_CHAT_NAMESPACE,
      mode: "direct",
      title: "New chat",
      primaryAgentId: selectedAgent.id,
      participantAgentIds: [selectedAgent.id],
      createdAt: now,
    });

    setConversations((current) => [conversation, ...current]);
    setActiveFreeChatConversationIds((current) =>
      applyActiveFreeChatConversation({
        activeConversationIds: current,
        agentId: selectedAgent.id,
        conversationId: conversation.id,
      }),
    );
    setChatScope("free");
    setConversationMode("single");
    setSelectedProjectId(FREE_CHAT_ENTRY_PROJECT_ID);
    setMessageText("");
    setAttachedWorkspaceFiles([]);
  }

  function markInterruptedMessageFailed(message: ConversationMessage, reason: string) {
    const failedMessages = markConversationMessageFailed(requestStoreRef.current.snapshot().messages, message.id, reason);
    requestStoreRef.current.sync({ messages: failedMessages });
    setMessages(failedMessages);
  }

  function applyRequestWorkspaceState(state: RequestWorkspaceState, outputMode?: OutputMode) {
    requestStoreRef.current.replace(state);
    setConversations(state.conversations);
    setMessages(state.messages);
    setRuns(state.runs);
    setTasks(state.tasks);
    setArtifacts(state.artifacts);
    if (outputMode) setOutputMode(normalizeOutputMode(outputMode));
  }

  function getDirectRequestState(): DirectRequestState {
    return requestStoreRef.current.snapshot();
  }

  function applyDirectRequestResult(result: DirectRequestResult) {
    applyRequestWorkspaceState(result.state, result.outputMode);
  }

  function getTaskRoomRequestState(): TaskRoomRequestState {
    return requestStoreRef.current.snapshot();
  }

  function applyTaskRoomRequestStep(step: TaskRoomRequestStep) {
    applyRequestWorkspaceState(step.state, step.outputMode);
  }

  async function completeFreeChatRequest({
    conversation,
    targetAgent,
    userMessageId,
    text,
  }: {
    conversation: Conversation;
    targetAgent: AgentInstance;
    userMessageId: string;
    text: string;
  }) {
    applyDirectRequestResult(
      await completeFreeChatRequestState({
        state: getDirectRequestState(),
        conversation,
        targetAgent,
        userMessageId,
        text,
        freeChatProjectId: FREE_CHAT_PROJECT_ID,
      }),
    );
  }

  async function submitFreeChatMessage(text: string) {
    if (!selectedAgent) return;

    const targetAgent = selectedAgent;
    const submission = prepareFreeChatSubmission({
      state: requestStoreRef.current.snapshot(),
      currentConversation,
      targetAgent,
      text,
      freeChatProjectId: FREE_CHAT_PROJECT_ID,
      freeChatNamespace: FREE_CHAT_NAMESPACE,
    });
    const { conversation, requestId, userMessageId } = submission;

    setActiveFreeChatConversationIds((current) => ({
      ...current,
      [targetAgent.id]: conversation.id,
    }));
    requestStoreRef.current.begin(requestId);
    applyRequestWorkspaceState(submission.state);
    setMessageText("");
    setAttachedWorkspaceFiles([]);

    try {
      await completeFreeChatRequest({ conversation, targetAgent, userMessageId, text });
    } finally {
      requestStoreRef.current.end(requestId);
    }
  }

  async function retryDirectMessage(messageId: string) {
    const retry = prepareDirectRetrySubmission({
      state: requestStoreRef.current.snapshot(),
      messageId,
      agents,
      projects,
      freeChatProjectId: FREE_CHAT_PROJECT_ID,
    });
    if (retry.kind === "ignore") return;
    if (retry.kind === "fail") {
      markInterruptedMessageFailed(retry.message, retry.reason);
      return;
    }

    const trackedRequestId = requestStoreRef.current.begin(retry.retry.message);
    applyRequestWorkspaceState(retry.state);

    try {
      if (retry.retry.kind === "free-chat") {
        await completeFreeChatRequest({
          conversation: retry.retry.conversation,
          targetAgent: retry.retry.targetAgent,
          userMessageId: retry.retry.message.id,
          text: retry.retry.text,
        });
        return;
      }

      await resumeProjectDirectRequest({
        message: retry.retry.message,
        conversation: retry.retry.conversation,
        project: retry.retry.project,
        targetAgent: retry.retry.targetAgent,
        text: retry.retry.text,
      });
    } finally {
      requestStoreRef.current.end(trackedRequestId);
    }
  }

  async function retryTaskRoomMessage(messageId: string) {
    const retry = prepareTaskRoomRetrySubmission({
      state: requestStoreRef.current.snapshot(),
      messageId,
    });
    if (retry.kind === "ignore") return;

    const trackedRequestId = requestStoreRef.current.begin(retry.retry.message);
    applyRequestWorkspaceState(retry.state);

    try {
      const succeeded = await retryTaskLifecycle(retry.retry.taskId);
      const completedState = completeTaskRoomRetrySubmission({
        state: requestStoreRef.current.snapshot(),
        messageId: retry.retry.message.id,
        succeeded,
      });
      applyRequestWorkspaceState(completedState);
    } finally {
      requestStoreRef.current.end(trackedRequestId);
    }
  }

  async function resumeProjectDirectRequest({
    message,
    conversation,
    project,
    targetAgent,
    text,
  }: {
    message: ConversationMessage;
    conversation: Conversation;
    project: Project;
    targetAgent: AgentInstance;
    text: string;
  }) {
    applyDirectRequestResult(
      await resumeProjectDirectRequestState({
        state: getDirectRequestState(),
        message,
        conversation,
        project,
        targetAgent,
        text,
      }),
    );
  }

  async function completeProjectDirectRequest({
    project,
    conversation,
    targetAgent,
    userMessageId,
    runId,
    participantAgentIds,
    text,
    agentRequestText,
  }: {
    project: Project;
    conversation: Conversation;
    targetAgent: AgentInstance;
    userMessageId: string;
    runId: string;
    participantAgentIds: string[];
    text: string;
    agentRequestText: string;
  }) {
    applyDirectRequestResult(
      await completeProjectDirectRequestState({
        state: getDirectRequestState(),
        project,
        conversation,
        targetAgent,
        userMessageId,
        runId,
        participantAgentIds,
        text,
        agentRequestText,
      }),
    );
  }

  async function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const intent = resolveComposerSubmissionIntent({
      chatScope,
      conversationMode,
      hasChiefAgent: Boolean(chiefAgent),
      hasSelectedAgent: Boolean(selectedAgent),
      hasSelectedWorkspaceProject: Boolean(selectedWorkspaceProject),
      isBusy: composerSubmittingRef.current,
      selectedTaskParticipantCount: selectedTaskParticipants.length,
      text: messageText,
    });
    if (intent.kind === "ignore") return;

    if (intent.kind === "task-room") {
      if (!selectedWorkspaceProject || !chiefAgent) return;
      composerSubmittingRef.current = true;
      setIsComposerSubmitting(true);
      try {
        await submitTaskRoomMessage(intent.text);
      } finally {
        composerSubmittingRef.current = false;
        setIsComposerSubmitting(false);
      }
      return;
    }

    if (!selectedAgent) return;
    if (intent.kind === "free-chat") {
      composerSubmittingRef.current = true;
      setIsComposerSubmitting(true);
      try {
        await submitFreeChatMessage(intent.text);
      } finally {
        composerSubmittingRef.current = false;
        setIsComposerSubmitting(false);
      }
      return;
    }

    if (!selectedWorkspaceProject) return;

    composerSubmittingRef.current = true;
    setIsComposerSubmitting(true);
    try {
      const targetAgent = selectedAgent;
      const submission = prepareProjectDirectSubmission({
        state: requestStoreRef.current.snapshot(),
        project: selectedWorkspaceProject,
        targetAgent,
        text: intent.text,
        files: attachedWorkspaceFiles,
      });
      const {
        agentRequestText,
        conversation,
        participantAgentIds,
        requestId,
        runId,
        userMessageId,
      } = submission;

      requestStoreRef.current.begin(requestId);
      applyRequestWorkspaceState(submission.state);
      setMessageText("");
      setAttachedWorkspaceFiles([]);

      try {
        await completeProjectDirectRequest({
          project: selectedWorkspaceProject,
          conversation,
          targetAgent,
          userMessageId,
          runId,
          participantAgentIds,
          text: intent.text,
          agentRequestText,
        });
      } finally {
        requestStoreRef.current.end(requestId);
      }
    } finally {
      composerSubmittingRef.current = false;
      setIsComposerSubmitting(false);
    }
  }

  async function submitTaskRoomMessage(text: string) {
    if (!selectedWorkspaceProject || !chiefAgent) return;

    const targetAgent = chiefAgent;
    const participants = selectedTaskParticipants;
    const taskFiles = [...attachedWorkspaceFiles];
    const submission = prepareTaskRoomSubmission({
      state: requestStoreRef.current.snapshot(),
      project: selectedWorkspaceProject,
      chief: targetAgent,
      participants,
      text,
      files: taskFiles,
    });
    const { conversation, requestId, runId, taskId, userMessageId } = submission;

    requestStoreRef.current.begin(requestId);
    applyRequestWorkspaceState(submission.state);
    setMessageText("");
    setAttachedWorkspaceFiles([]);
    setOutputMode("outputs");

    try {
      await executeTaskRoomRequestState({
        state: getTaskRoomRequestState(),
        conversation,
        project: selectedWorkspaceProject,
        chief: targetAgent,
        participants,
        text,
        files: taskFiles,
        taskId,
        runId,
        userMessageId,
        onStep: applyTaskRoomRequestStep,
      });
    } finally {
      requestStoreRef.current.end(requestId);
    }
  }

  function openPreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPreviewUrl(browserUrl.trim());
    setOutputMode("browser");
  }

  function updateSplitFromClientX(container: HTMLElement, clientX: number) {
    const rect = container.getBoundingClientRect();
    setSplitPercent(getSplitPercentFromClientX({ clientX, left: rect.left, width: rect.width }));
  }

  function startSplitDrag(event: PointerEvent<HTMLDivElement>) {
    const container = event.currentTarget.parentElement;
    if (!container) return;

    event.preventDefault();
    document.body.classList.add("is-resizing");

    const handlePointerMove = (moveEvent: globalThis.PointerEvent) => {
      updateSplitFromClientX(container, moveEvent.clientX);
    };
    const stopDrag = () => {
      document.body.classList.remove("is-resizing");
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopDrag);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopDrag, { once: true });
  }

  function nudgeSplit(direction: "left" | "right") {
    setSplitPercent((current) => nudgeSplitPercent(current, direction));
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
        onDeleteProject={requestDeleteProject}
        onEditAgent={agentSetup.openAgentEditor}
        onEditProject={projectDialog.openProjectEditor}
        onSelectAgent={(agentId) => {
          setSelectedAgentId(agentId);
          setConversationMode("single");
        }}
        onSelectProject={(projectId, scope) => {
          setSelectedProjectId(projectId);
          setChatScope(scope);
          setConversationMode("single");
        }}
        onToggleTheme={toggleTheme}
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
            isComposerSubmitting={isComposerSubmitting}
            latestChiefTask={latestChiefTask}
            messageText={messageText}
            selectedAgent={selectedAgent}
            selectedTaskParticipantCount={selectedTaskParticipants.length}
            selectedWorkspaceProject={selectedWorkspaceProject}
            taskParticipantIds={taskParticipantIds}
            taskRoomHasPendingRequest={taskRoomHasPendingRequest}
            taskRoomMessages={taskRoomMessages}
            onAddAgent={agentSetup.openAddAgentDialog}
            onDetachWorkspaceFile={detachWorkspaceFile}
            onMessageTextChange={setMessageText}
            onRetryDirectMessage={retryDirectMessage}
            onRetryTaskRoomMessage={retryTaskRoomMessage}
            onSelectFreeChat={() => setChatScope("free")}
            onSubmitMessage={submitMessage}
            onToggleTaskParticipant={toggleTaskParticipant}
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
            onPointerDown={startSplitDrag}
            onKeyDown={(event) => {
              if (event.key === "ArrowLeft") nudgeSplit("left");
              if (event.key === "ArrowRight") nudgeSplit("right");
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
            onAttachFile={attachWorkspaceFile}
            onBrowserUrlChange={setBrowserUrl}
            onCancelTask={cancelTaskLifecycle}
            onCreateProject={projectDialog.openProjectDialog}
            onDetachFile={detachWorkspaceFile}
            onEditProject={projectDialog.openProjectEditor}
            onNewFreeChat={startNewFreeChat}
            onOpenPreview={openPreview}
            onOutputModeChange={setOutputMode}
            onRefreshTask={refreshTaskLifecycle}
            onRetryTask={retryTaskLifecycle}
            onSelectFreeChatConversation={selectFreeChatConversation}
          />
        </div>
      </main>

      {agentSetup.showSetup ? (
        <SetupWizard
          testState={agentSetup.testState}
          testMessage={agentSetup.testMessage}
          isSaving={agentSetup.isSavingAgent}
          onClose={agentSetup.closeSetup}
          onRunTest={runConnectionTest}
          onResetTest={agentSetup.resetConnectionTest}
          onSaveAgent={saveDemoAgent}
          agent={agentSetup.setupAgentId ? agents.find((agent) => agent.id === agentSetup.setupAgentId) : undefined}
          localTrustedStatus={activeSetupAgentId ? localTrustedAgentStatuses[activeSetupAgentId] : undefined}
          onDeleteAgent={requestDeleteAgent}
          onAgentAvatarFile={handleExistingAgentAvatar}
        />
      ) : null}
      {projectDialog.showProjectDialog ? (
        <ProjectDialog
          error={projectDialog.projectFormError}
          project={projectDialog.editingProjectId ? projects.find((project) => project.id === projectDialog.editingProjectId) : undefined}
          onClose={projectDialog.closeProjectDialog}
          onSaveProject={saveProject}
        />
      ) : null}
      {projectDialog.confirmAction ? (
        <ConfirmDialog
          action={projectDialog.confirmAction}
          agents={agents}
          projects={projects}
          onCancel={projectDialog.clearConfirmAction}
          onConfirm={confirmPendingAction}
        />
      ) : null}
    </div>
  );
}
