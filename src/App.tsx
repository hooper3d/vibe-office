import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, PointerEvent } from "react";
import { AppSidebar } from "./components/AppSidebar";
import { ConversationWorkspace } from "./components/ConversationWorkspace";
import { OutputPanel, type OutputMode } from "./components/OutputPanel";
import { ConfirmDialog, ProjectDialog, type ConfirmAction } from "./components/ProjectDialogs";
import { SetupWizard, type ConnectionTestState } from "./components/SetupWizard";
import type { A2APart, A2ATask } from "./domain/a2a";
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
  WorkState,
} from "./domain/projectScope";
import {
  failRunForMessage,
  failTaskRoomTaskForMessage,
  markConversationMessageFailed,
  markConversationMessageSending,
} from "./domain/requestLifecycle";
import type { AgentInstance, Project } from "./domain/types";
import { loadConfiguredAgents, saveConfiguredAgents } from "./services/agentStorage";
import { getUserFacingAgentError } from "./services/agentErrorText";
import { extractA2ATaskText, mapA2AState } from "./services/agentTaskResult";
import {
  createBackfilledMediaArtifacts,
  createTextParts,
  mapA2AArtifacts,
} from "./services/artifactState";
import { buildAgentRequestText } from "./services/agentRequestText";
import {
  completeFreeChatRequestState,
  completeProjectDirectRequestState,
  resumeProjectDirectRequestState,
  type DirectRequestResult,
  type DirectRequestState,
} from "./services/directRequestOrchestrator";
import { createA2ACompatibilityMetadata, HermesA2AAdapter, type A2ACompatibilityMetadata } from "./services/hermesA2AAdapter";
import { deleteLocalTrustedAgent, stripAgentCredential, upsertLocalTrustedAgent } from "./services/localTrustedAgentRegistry";
import { deriveProjectNameFromDirectory, slugifyProjectName } from "./services/projectNaming";
import {
  getPendingRequestMessages,
  getRespondingAgentIds,
  resolveDirectMessageRetry,
  resolvePendingRequestRecovery,
  resolveTaskRoomMessageRetry,
} from "./services/requestRecovery";
import {
  completeTaskRoomMessageRetry,
  prepareDirectMessageRetry,
  prepareTaskRoomMessageRetry,
} from "./services/requestRetryState";
import { createRequestRuntimeStore } from "./services/requestRuntimeStore";
import {
  executeTaskRoomRequestState,
  type TaskRoomRequestState,
  type TaskRoomRequestStep,
} from "./services/taskRoomOrchestrator";
import { cancelRemoteTaskLifecycle, refreshRemoteTaskLifecycle, retryRemoteProjectTask } from "./services/taskLifecycleExecutor";
import { loadThemeMode, saveThemeMode, type ThemeMode } from "./services/themeStorage";
import { loadUiState, saveUiState } from "./services/uiStateStorage";
import { loadWorkspaceState, saveWorkspaceState } from "./services/workspaceStorage";
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
const MAX_AVATAR_BYTES = 512 * 1024;

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
  const [initialWorkspace] = useState(() => loadWorkspaceState());
  const [initialUiState] = useState(() => loadUiState());
  const [agents, setAgents] = useState<AgentInstance[]>(() => loadConfiguredAgents());
  const [projects, setProjects] = useState<Project[]>(() =>
    initialWorkspace.projects.length > 0 ? initialWorkspace.projects : seedProjects,
  );
  const [conversations, setConversations] = useState<Conversation[]>(() =>
    initialWorkspace.conversations.length > 0 ? initialWorkspace.conversations : seedConversations,
  );
  const [messages, setMessages] = useState<ConversationMessage[]>(() =>
    initialWorkspace.messages.length > 0 ? initialWorkspace.messages : conversationMessages,
  );
  const [runs, setRuns] = useState<ProjectRun[]>(() =>
    initialWorkspace.runs.length > 0 ? initialWorkspace.runs : projectRuns,
  );
  const [tasks, setTasks] = useState<ProjectTask[]>(() =>
    initialWorkspace.tasks.length > 0 ? initialWorkspace.tasks : projectTasks,
  );
  const [artifacts, setArtifacts] = useState<ProjectArtifact[]>(() =>
    initialWorkspace.artifacts.length > 0 ? initialWorkspace.artifacts : projectArtifacts,
  );
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
  const [showSetup, setShowSetup] = useState(false);
  const [setupAgentId, setSetupAgentId] = useState<string | null>(null);
  const [showProjectDialog, setShowProjectDialog] = useState(false);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [projectFormError, setProjectFormError] = useState("");
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [testState, setTestState] = useState<ConnectionTestState>("idle");
  const [testMessage, setTestMessage] = useState("");
  const [lastConnectionMetadata, setLastConnectionMetadata] = useState<A2ACompatibilityMetadata | null>(null);
  const [splitPercent, setSplitPercent] = useState(54);
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => loadThemeMode());

  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.id === selectedAgentId) ?? agents.find((agent) => agent.isChief) ?? agents[0],
    [agents, selectedAgentId],
  );
  const chiefAgent = useMemo(() => agents.find((agent) => agent.isChief), [agents]);
  const availableTaskParticipants = useMemo(
    () => agents.filter((agent) => agent.id !== chiefAgent?.id && agent.status === "online"),
    [agents, chiefAgent?.id],
  );
  const selectedTaskParticipants = useMemo(
    () => availableTaskParticipants.filter((agent) => taskParticipantIds.includes(agent.id)),
    [availableTaskParticipants, taskParticipantIds],
  );
  const selectedProject = projects.find((project) => project.id === selectedProjectId);
  const selectedWorkspaceProject = selectedProject?.id === FREE_CHAT_ENTRY_PROJECT_ID ? undefined : selectedProject;
  const scopedTasks = useMemo(
    () => (selectedWorkspaceProject ? tasks.filter((task) => task.projectId === selectedWorkspaceProject.id) : []),
    [selectedWorkspaceProject, tasks],
  );
  const scopedRuns = useMemo(
    () => (selectedWorkspaceProject ? runs.filter((run) => run.projectId === selectedWorkspaceProject.id) : []),
    [selectedWorkspaceProject, runs],
  );
  const latestChiefTask = useMemo(() => {
    const latestChiefRun = scopedRuns.find((run) => run.type === "chief_delegation" && run.taskId);
    return scopedTasks.find((task) => task.id === latestChiefRun?.taskId);
  }, [scopedRuns, scopedTasks]);
  const scopedArtifacts = useMemo(
    () => (selectedWorkspaceProject ? artifacts.filter((artifact) => artifact.projectId === selectedWorkspaceProject.id) : []),
    [selectedWorkspaceProject, artifacts],
  );
  const directConversationProjectId = chatScope === "free" ? FREE_CHAT_PROJECT_ID : selectedWorkspaceProject?.id ?? "";
  const activeFreeChatConversationId = selectedAgent ? activeFreeChatConversationIds[selectedAgent.id] : undefined;
  const freeChatHistory = useMemo(() => {
    if (!selectedAgent) return [];
    return conversations
      .filter(
        (conversation) =>
          conversation.projectId === FREE_CHAT_PROJECT_ID &&
          conversation.mode === "direct" &&
          conversation.primaryAgentId === selectedAgent.id,
      )
      .map((conversation) => {
        const conversationMessages = messages.filter((message) => message.conversationId === conversation.id);
        const firstUserMessage = conversationMessages.find((message) => message.role === "user");
        return {
          conversation,
          messageCount: conversationMessages.length,
          title: firstUserMessage ? getPartText(firstUserMessage.contentParts) : conversation.title,
        };
      })
      .sort((left, right) => right.conversation.updatedAt.localeCompare(left.conversation.updatedAt));
  }, [conversations, messages, selectedAgent]);
  const currentConversation = useMemo(() => {
    if (!selectedAgent) return undefined;
    if (chatScope === "free") {
      return (
        freeChatHistory.find((item) => item.conversation.id === activeFreeChatConversationId)?.conversation ??
        freeChatHistory[0]?.conversation
      );
    }

    return conversations.find(
      (conversation) =>
        conversation.projectId === directConversationProjectId &&
        conversation.mode === "direct" &&
        conversation.primaryAgentId === selectedAgent.id,
    );
  }, [activeFreeChatConversationId, chatScope, conversations, directConversationProjectId, freeChatHistory, selectedAgent]);
  const currentMessages = useMemo(() => {
    if (!currentConversation) return [];
    return messages.filter((message) => message.conversationId === currentConversation.id);
  }, [currentConversation, messages]);
  const currentConversationHasPendingRequest = useMemo(
    () => currentMessages.some((message) => message.role === "user" && message.status === "sending"),
    [currentMessages],
  );
  const taskRoomConversation = useMemo(() => {
    if (!chiefAgent || !selectedWorkspaceProject) return undefined;
    return conversations.find(
      (conversation) =>
        conversation.projectId === selectedWorkspaceProject.id &&
        conversation.mode === "task_room" &&
        conversation.chiefAgentId === chiefAgent.id,
    );
  }, [chiefAgent, conversations, selectedWorkspaceProject]);
  const taskRoomMessages = useMemo(() => {
    if (!taskRoomConversation) return [];
    return messages.filter((message) => message.conversationId === taskRoomConversation.id);
  }, [messages, taskRoomConversation]);
  const taskRoomHasPendingRequest = useMemo(
    () => taskRoomMessages.some((message) => message.role === "user" && message.status === "sending"),
    [taskRoomMessages],
  );
  const activeComposerHasPendingRequest =
    conversationMode === "single" ? currentConversationHasPendingRequest : taskRoomHasPendingRequest;
  const respondingAgentIds = useMemo(() => getRespondingAgentIds(conversations, messages), [conversations, messages]);

  useEffect(() => {
    setAttachedWorkspaceFiles([]);
  }, [chatScope, selectedWorkspaceProject?.id]);

  useEffect(() => {
    if (chatScope === "free" && conversationMode === "task-room") {
      setConversationMode("single");
    }
  }, [chatScope, conversationMode]);

  useEffect(() => {
    setTaskParticipantIds(availableTaskParticipants.map((agent) => agent.id));
  }, [availableTaskParticipants, chiefAgent?.id, selectedWorkspaceProject?.id]);

  useEffect(() => {
    if (selectedAgent && selectedAgent.id !== selectedAgentId) {
      setSelectedAgentId(selectedAgent.id);
    }
  }, [selectedAgent, selectedAgentId]);

  useEffect(() => {
    if (selectedProjectId === FREE_CHAT_ENTRY_PROJECT_ID) return;
    if (projects.some((project) => project.id === selectedProjectId)) return;

    setSelectedProjectId(FREE_CHAT_ENTRY_PROJECT_ID);
    setChatScope("free");
    setConversationMode("single");
  }, [projects, selectedProjectId]);

  useEffect(() => {
    if (chatScope !== "free" || !selectedAgent || !currentConversation) return;
    if (activeFreeChatConversationIds[selectedAgent.id] === currentConversation.id) return;

    setActiveFreeChatConversationIds((current) => ({
      ...current,
      [selectedAgent.id]: currentConversation.id,
    }));
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
    const pendingMessages = getPendingRequestMessages(messages, requestStoreRef.current.activeRequestIds());
    if (pendingMessages.length === 0) return;

    pendingMessages.forEach((message) => {
      const recovery = resolvePendingRequestRecovery({
        message,
        conversations,
        agents,
        projects,
        freeChatProjectId: FREE_CHAT_PROJECT_ID,
      });

      if (recovery.kind === "fail") {
        if (recovery.failTaskRoom) {
          markTaskRoomMessageFailed(message, recovery.reason);
        } else {
          markInterruptedMessageFailed(message, recovery.reason);
        }
        return;
      }

      const trackedRequestId = requestStoreRef.current.begin(message);
      const preparedMessages = markConversationMessageSending(requestStoreRef.current.snapshot().messages, message.id);
      requestStoreRef.current.sync({ messages: preparedMessages });
      setMessages(preparedMessages);

      if (recovery.kind === "free-chat") {
        void completeFreeChatRequest({
          conversation: recovery.conversation,
          targetAgent: recovery.targetAgent,
          userMessageId: message.id,
          text: recovery.text,
        }).finally(() => {
          requestStoreRef.current.end(trackedRequestId);
        });
        return;
      }

      void resumeProjectDirectRequest({
        message,
        conversation: recovery.conversation,
        project: recovery.project,
        targetAgent: recovery.targetAgent,
        text: recovery.text,
      }).finally(() => {
        requestStoreRef.current.end(trackedRequestId);
      });
    });
  }, [agents, conversations, messages, projects]);

  useEffect(() => {
    const mediaLinks = createBackfilledMediaArtifacts(messages);
    if (mediaLinks.length === 0) return;

    const existingArtifactIds = new Set(artifacts.map((artifact) => artifact.id));
    const missingArtifacts = mediaLinks
      .map((link) => link.artifact)
      .filter((artifact) => !existingArtifactIds.has(artifact.id));
    const hasMissingTaskLinks = tasks.some((task) =>
      mediaLinks.some((link) => link.artifact.taskId === task.id && !task.artifactIds.includes(link.artifact.id)),
    );
    const hasMissingRunLinks = runs.some((run) =>
      mediaLinks.some((link) => link.runId === run.id && !run.artifactIds.includes(link.artifact.id)),
    );

    if (missingArtifacts.length === 0 && !hasMissingTaskLinks && !hasMissingRunLinks) return;

    if (missingArtifacts.length > 0) {
      setArtifacts((current) => [
        ...missingArtifacts.filter((artifact) => !current.some((item) => item.id === artifact.id)),
        ...current,
      ]);
    }

    if (hasMissingTaskLinks) {
      setTasks((current) =>
        current.map((task) => {
          const artifactIds = mediaLinks
            .filter((link) => link.artifact.taskId === task.id)
            .map((link) => link.artifact.id)
            .filter((artifactId) => !task.artifactIds.includes(artifactId));
          return artifactIds.length > 0 ? { ...task, artifactIds: [...task.artifactIds, ...artifactIds] } : task;
        }),
      );
    }

    if (hasMissingRunLinks) {
      setRuns((current) =>
        current.map((run) => {
          const artifactIds = mediaLinks
            .filter((link) => link.runId === run.id)
            .map((link) => link.artifact.id)
            .filter((artifactId) => !run.artifactIds.includes(artifactId));
          return artifactIds.length > 0 ? { ...run, artifactIds: [...run.artifactIds, ...artifactIds] } : run;
        }),
      );
    }
  }, [artifacts, messages, runs, tasks]);

  useEffect(() => {
    document.documentElement.dataset.theme = themeMode;
    saveThemeMode(themeMode);
  }, [themeMode]);

  useEffect(() => {
    if (!selectedWorkspaceProject) return;
    const pollableTasks = scopedTasks.filter(
      (task) =>
        isTaskActive(task.state) &&
        Boolean(getTaskLifecycleAddress(task, scopedRuns)) &&
        !hasLifecycleUnsupportedEvent(task),
    );
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
    const task = tasks.find((item) => item.id === taskId);
    if (!task) return;
    const address = getTaskLifecycleAddress(task, runs);
    if (!address) {
      recordLifecycleUnsupported(task, "This task was created by local orchestration and is not linked to a remote task.");
      return;
    }

    const owner = agents.find((agent) => agent.id === task.ownerAgentId);
    if (!owner) {
      recordLifecycleUnsupported(task, "Task owner is no longer connected.");
      return;
    }

    if (!options.silent) setTaskLifecycleBusyId(`refresh:${taskId}`);

    try {
      const remoteTask = await refreshRemoteTaskLifecycle({ agent: owner, address });
      applyLifecycleTaskUpdate(task, remoteTask, owner.id, "Task status refreshed.");
    } catch (error) {
      recordLifecycleUnsupported(task, getUserFacingAgentError(error));
    } finally {
      if (!options.silent) setTaskLifecycleBusyId("");
    }
  }

  async function cancelTaskLifecycle(taskId: string) {
    const task = tasks.find((item) => item.id === taskId);
    if (!task) return;
    const address = getTaskLifecycleAddress(task, runs);
    if (!address) {
      recordLifecycleUnsupported(task, "This task was created by local orchestration and is not linked to a remote task.");
      return;
    }

    const owner = agents.find((agent) => agent.id === task.ownerAgentId);
    if (!owner) {
      recordLifecycleUnsupported(task, "Task owner is no longer connected.");
      return;
    }

    setTaskLifecycleBusyId(`cancel:${taskId}`);
    try {
      const remoteTask = await cancelRemoteTaskLifecycle({ agent: owner, address });
      applyLifecycleTaskUpdate(task, remoteTask, owner.id, "Task cancel requested.");
    } catch (error) {
      recordCancelUnsupported(task, getUserFacingAgentError(error));
    } finally {
      setTaskLifecycleBusyId("");
    }
  }

  async function retryTaskLifecycle(taskId: string) {
    const task = tasks.find((item) => item.id === taskId);
    if (!task) return false;
    const taskProject = projects.find((project) => project.id === task.projectId);
    if (!taskProject) return false;

    const owner = agents.find((agent) => agent.id === task.ownerAgentId);
    if (!owner) {
      recordLifecycleUnsupported(task, "Task owner is no longer connected.");
      return false;
    }

    const retryAt = new Date().toISOString();
    setTaskLifecycleBusyId(`retry:${taskId}`);
    setTasks((current) =>
      current.map((item) =>
        item.id === task.id
          ? {
              ...item,
              state: "submitting",
              summary: "Retry submitted.",
              events: [
                ...item.events,
                {
                  id: `${task.id}-retry-${retryAt}`,
                  taskId: task.id,
                  agentId: owner.id,
                  label: "Retry submitted.",
                  state: "submitting",
                  timestamp: retryAt,
                },
              ],
              updatedAt: retryAt,
            }
          : item,
      ),
    );

    try {
      const remoteTask = await retryRemoteProjectTask({
        agent: owner,
        project: taskProject,
        taskTitle: task.title,
        previousFailure: task.summary,
      });
      applyLifecycleTaskUpdate(task, remoteTask, owner.id, "Retry returned a task update.");
      return mapA2AState(remoteTask.status.state) !== "failed";
    } catch (error) {
      const failedAt = new Date().toISOString();
      const errorText = getUserFacingAgentError(error);
      setTasks((current) =>
        current.map((item) =>
          item.id === task.id
            ? {
                ...item,
                state: "failed",
                summary: errorText,
                events: [
                  ...item.events,
                  {
                    id: `${task.id}-retry-failed-${failedAt}`,
                    taskId: task.id,
                    agentId: owner.id,
                    label: "Retry failed.",
                    state: "failed",
                    timestamp: failedAt,
                  },
                ],
                updatedAt: failedAt,
              }
            : item,
        ),
      );
      return false;
    } finally {
      setTaskLifecycleBusyId("");
    }
  }

  function applyLifecycleTaskUpdate(task: ProjectTask, remoteTask: A2ATask, agentId: string, label: string) {
    const updatedAt = remoteTask.status.timestamp ?? new Date().toISOString();
    const eventId = `${task.id}-lifecycle-${updatedAt}`;
    const mappedState = mapA2AState(remoteTask.status.state);
    const summary = extractA2ATaskText(remoteTask) ?? task.summary;
    const returnedArtifacts = mapA2AArtifacts(remoteTask, task.projectId, agentId);
    const returnedArtifactIds = returnedArtifacts.map((artifact) => artifact.id);

    if (returnedArtifacts.length > 0) {
      setArtifacts((current) => [
        ...returnedArtifacts.filter((artifact) => !current.some((item) => item.id === artifact.id)),
        ...current,
      ]);
    }

    setTasks((current) =>
      current.map((item) =>
        item.id === task.id ? mergeLifecycleTaskUpdate(item, remoteTask, agentId, label, mappedState, summary, eventId, updatedAt, returnedArtifactIds) : item,
      ),
    );

    setRuns((current) =>
      current.map((run) =>
        run.taskId === task.id
          ? {
              ...run,
              state: mappedState,
              eventIds: mergeIds(run.eventIds, [eventId]),
              artifactIds: mergeIds(run.artifactIds, returnedArtifactIds),
              updatedAt,
            }
          : run,
      ),
    );
  }

  function recordLifecycleUnsupported(task: ProjectTask, reason: string) {
    const at = new Date().toISOString();
    setTasks((current) =>
      current.map((item) =>
        item.id === task.id
          ? {
              ...item,
              events: hasLifecycleUnsupportedEvent(item)
                ? item.events
                : [
                    ...item.events,
                    {
                      id: `${task.id}-lifecycle-unsupported`,
                      taskId: task.id,
                      agentId: task.ownerAgentId,
                      label: `Lifecycle unsupported: ${reason}`,
                      state: "unsupported",
                      timestamp: at,
                    },
                  ],
              updatedAt: at,
            }
          : item,
      ),
    );
  }

  function recordCancelUnsupported(task: ProjectTask, reason: string) {
    const at = new Date().toISOString();
    setTasks((current) =>
      current.map((item) =>
        item.id === task.id
          ? {
              ...item,
              events: hasCancelUnsupportedEvent(item)
                ? item.events
                : [
                    ...item.events,
                    {
                      id: `${task.id}-cancel-unsupported`,
                      taskId: task.id,
                      agentId: task.ownerAgentId,
                      label: `Cancel unsupported: ${reason}`,
                      state: "unsupported",
                      timestamp: at,
                    },
                  ],
              updatedAt: at,
            }
          : item,
      ),
    );
  }

  async function runConnectionTest(form: FormData) {
    setTestState("running");
    setTestMessage("");

    try {
      const agent = createAgentFromHermesSetup(form);
      const setupIssue = getProviderSetupIssue(agent);
      if (setupIssue) {
        setTestState("failed");
        setLastConnectionMetadata(null);
        setTestMessage(setupIssue);
        return;
      }
      if (!(await persistLocalTrustedAgent(agent))) return;
      const result = await new HermesA2AAdapter({ agent: stripAgentCredential(agent) }).testConnection();

      setTestState("passed");
      setLastConnectionMetadata(createA2ACompatibilityMetadata(result));
      setTestMessage(`${result.card.name || agent.name} provider connection verified.`);
    } catch (error) {
      setTestState("failed");
      setLastConnectionMetadata(null);
      setTestMessage(getUserFacingAgentError(error));
    }
  }

  async function persistLocalTrustedAgent(agent: AgentInstance) {
    try {
      await upsertLocalTrustedAgent(agent);
      return true;
    } catch {
      setTestState("failed");
      setTestMessage("Unable to update the local trusted agent registry.");
      return false;
    }
  }

  function resetConnectionTest() {
    if (testState !== "idle") {
      setTestState("idle");
    }
    setTestMessage("");
    setLastConnectionMetadata(null);
  }

  function closeSetup() {
    setShowSetup(false);
    setSetupAgentId(null);
    setTestState("idle");
    setTestMessage("");
    setLastConnectionMetadata(null);
  }

  function openAddAgentDialog() {
    setSetupAgentId(null);
    setTestState("idle");
    setTestMessage("");
    setLastConnectionMetadata(null);
    setShowSetup(true);
  }

  function openAgentEditor(agentId: string) {
    setSetupAgentId(agentId);
    setTestState("idle");
    setTestMessage("");
    setLastConnectionMetadata(null);
    setShowSetup(true);
  }

  async function saveDemoAgent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const newAgent = createAgentFromHermesSetup(form);
    const setupIssue = getProviderSetupIssue(newAgent);
    if (setupIssue) {
      setTestState("failed");
      setLastConnectionMetadata(null);
      setTestMessage(setupIssue);
      return;
    }
    const safeNewAgent = stripAgentCredential(newAgent);

    if (setupAgentId) {
      const trustedAgent = { ...newAgent, id: setupAgentId };
      if (!(await persistLocalTrustedAgent(trustedAgent))) return;
      setAgents((current) =>
        current.map((agent) =>
          agent.id === setupAgentId
            ? {
                ...stripAgentCredential(agent),
                ...safeNewAgent,
                id: agent.id,
                avatarUrl: agent.avatarUrl,
                isChief: newAgent.officeRole === "chief",
                status: agent.status,
                ...(lastConnectionMetadata ?? {}),
              }
            : newAgent.officeRole === "chief"
              ? { ...agent, isChief: false, officeRole: agent.officeRole === "chief" ? "operator" : agent.officeRole }
              : agent,
        ),
      );
      setSelectedAgentId(setupAgentId);
      closeSetup();
      return;
    }

    const normalizedEndpoint = newAgent.endpoint.replace(/\/$/, "");
    const duplicateAgent = agents.find(
      (agent) =>
        agent.endpoint.replace(/\/$/, "") === normalizedEndpoint &&
        agent.model === newAgent.model &&
        (agent.runtimeProvider ?? "hermes") === (newAgent.runtimeProvider ?? "hermes"),
    );

    if (duplicateAgent) {
      const trustedAgent = { ...newAgent, id: duplicateAgent.id };
      if (!(await persistLocalTrustedAgent(trustedAgent))) return;
      setAgents((current) =>
        current.map((agent) =>
          agent.id === duplicateAgent.id
            ? {
                ...stripAgentCredential(agent),
                ...safeNewAgent,
                id: agent.id,
                avatarUrl: agent.avatarUrl,
                isChief: newAgent.officeRole === "chief",
                status: agent.status,
                ...(lastConnectionMetadata ?? {}),
              }
            : newAgent.officeRole === "chief"
              ? { ...agent, isChief: false, officeRole: agent.officeRole === "chief" ? "operator" : agent.officeRole }
              : agent,
        ),
      );
      closeSetup();
      return;
    }

    if (!(await persistLocalTrustedAgent(newAgent))) return;
    setAgents((current) => {
      const addedAgent = { ...safeNewAgent, ...(lastConnectionMetadata ?? {}), isChief: newAgent.officeRole === "chief" };
      if (newAgent.officeRole !== "chief") return [...current, addedAgent];
      return [...current.map((agent) => ({ ...agent, isChief: false, officeRole: agent.officeRole === "chief" ? "operator" : agent.officeRole })), addedAgent];
    });
    setSelectedAgentId(newAgent.id);
    closeSetup();
  }

  function normalizeChief(agentsToNormalize: AgentInstance[]) {
    if (agentsToNormalize.length === 0) return agentsToNormalize;
    if (agentsToNormalize.some((agent) => agent.officeRole)) {
      return agentsToNormalize.map((agent) => ({
        ...agent,
        isChief: agent.officeRole === "chief",
      }));
    }
    if (agentsToNormalize.some((agent) => agent.isChief)) {
      return agentsToNormalize.map((agent) => ({
        ...agent,
        isChief: agent.isChief === true,
      }));
    }
    return agentsToNormalize.map((agent, index) => ({
      ...agent,
      isChief: index === 0,
    }));
  }

  function requestDeleteAgent(agentId: string) {
    setConfirmAction({ kind: "delete-agent", agentId });
  }

  function deleteAgent(agentId: string) {
    void deleteLocalTrustedAgent(agentId).catch(() => {
      // A stale local registry entry is less harmful than interrupting the delete UI flow.
    });
    const remainingAgents = normalizeChief(agents.filter((agent) => agent.id !== agentId));
    const fallbackAgent = remainingAgents.find((agent) => agent.isChief) ?? remainingAgents[0];
    setAgents(remainingAgents);
    if (selectedAgentId === agentId) {
      setSelectedAgentId(fallbackAgent?.id ?? "");
    }
    setConfirmAction(null);
  }

  function updateAgentAvatar(agentId: string, avatarUrl?: string) {
    setAgents((current) => current.map((agent) => (agent.id === agentId ? { ...agent, avatarUrl } : agent)));
  }

  async function handleExistingAgentAvatar(agentId: string, file?: File) {
    const result = await readAvatarFile(file);
    if (result.error) {
      setTestState("failed");
      setTestMessage(result.error);
      return;
    }
    updateAgentAvatar(agentId, result.dataUrl);
  }

  function openProjectDialog() {
    setEditingProjectId(null);
    setProjectFormError("");
    setShowProjectDialog(true);
  }

  function openProjectEditor(projectId: string) {
    if (projectId === FREE_CHAT_ENTRY_PROJECT_ID) return;
    setEditingProjectId(projectId);
    setProjectFormError("");
    setShowProjectDialog(true);
  }

  function closeProjectDialog() {
    setProjectFormError("");
    setEditingProjectId(null);
    setShowProjectDialog(false);
  }

  function saveProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const rawName = String(form.get("name") || "").trim();
    const description = String(form.get("description") || "").trim();
    const directory = String(form.get("directory") || "").trim();
    const editingProject = editingProjectId ? projects.find((project) => project.id === editingProjectId) : undefined;
    const name = rawName || deriveProjectNameFromDirectory(directory);

    if (!editingProject && !directory) {
      setProjectFormError("Choose a project folder or paste a local path.");
      return;
    }

    if (!name) {
      setProjectFormError("Project name is required.");
      return;
    }

    const namespace = editingProject?.namespace ?? `project.${slugifyProjectName(name)}`;
    if (
      projects.some(
        (project) =>
          project.id !== editingProject?.id &&
          (project.namespace === namespace || project.name.toLowerCase() === name.toLowerCase()),
      )
    ) {
      setProjectFormError("A project with this name already exists.");
      return;
    }

    if (editingProject) {
      setProjects((current) =>
        current.map((project) =>
          project.id === editingProject.id
            ? {
                ...project,
                name,
                directory: directory || undefined,
                description: description || "Project-scoped workspace.",
              }
            : project,
        ),
      );
      closeProjectDialog();
      return;
    }

    const project: Project = {
      id: crypto.randomUUID(),
      name,
      namespace,
      description: description || "Project-scoped workspace.",
      directory: directory || undefined,
    };

    setProjects((current) => [...current, project]);
    setSelectedProjectId(project.id);
    setChatScope("project");
    closeProjectDialog();
  }

  function requestDeleteProject(projectId: string) {
    if (projectId === FREE_CHAT_ENTRY_PROJECT_ID) return;
    if (projects.length <= 1) return;
    setConfirmAction({ kind: "delete-project", projectId });
  }

  function deleteProject(projectId: string) {
    if (projects.length <= 1) return;
    const remainingProjects = projects.filter((project) => project.id !== projectId);
    setProjects(remainingProjects);
    setConversations((current) => current.filter((conversation) => conversation.projectId !== projectId));
    setMessages((current) => current.filter((message) => message.projectId !== projectId));
    setRuns((current) => current.filter((run) => run.projectId !== projectId));
    setTasks((current) => current.filter((task) => task.projectId !== projectId));
    setArtifacts((current) => current.filter((artifact) => artifact.projectId !== projectId));
    if (selectedProjectId === projectId) {
      setSelectedProjectId(FREE_CHAT_ENTRY_PROJECT_ID);
      setChatScope("free");
      setConversationMode("single");
    }
    setConfirmAction(null);
  }

  function attachWorkspaceFile(file: WorkspaceFileReadResult) {
    setAttachedWorkspaceFiles((current) => {
      if (current.some((item) => item.path === file.path)) return current;

      return [
        ...current,
        {
          path: file.path,
          content: file.content,
          size: file.size,
          updatedAt: file.updatedAt,
          attachedAt: new Date().toISOString(),
        },
      ].slice(-4);
    });
  }

  function detachWorkspaceFile(path: string) {
    setAttachedWorkspaceFiles((current) => current.filter((item) => item.path !== path));
  }

  function toggleTaskParticipant(agentId: string, checked: boolean) {
    setTaskParticipantIds((current) =>
      checked ? Array.from(new Set([...current, agentId])) : current.filter((id) => id !== agentId),
    );
  }

  function selectFreeChatConversation(conversationId: string) {
    if (!selectedAgent) return;

    setActiveFreeChatConversationIds((current) => ({
      ...current,
      [selectedAgent.id]: conversationId,
    }));
    setChatScope("free");
    setConversationMode("single");
    setSelectedProjectId(FREE_CHAT_ENTRY_PROJECT_ID);
  }

  function startNewFreeChat() {
    if (!selectedAgent) return;
    if (currentConversation && currentConversation.projectId === FREE_CHAT_PROJECT_ID && currentMessages.length === 0) {
      selectFreeChatConversation(currentConversation.id);
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
    setActiveFreeChatConversationIds((current) => ({
      ...current,
      [selectedAgent.id]: conversation.id,
    }));
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

  function markTaskRoomMessageFailed(message: ConversationMessage, reason: string) {
    const failedAt = new Date().toISOString();
    markInterruptedMessageFailed(message, reason);

    const snapshot = requestStoreRef.current.snapshot();
    const failedTasks = failTaskRoomTaskForMessage(snapshot.tasks, message, reason, failedAt);
    const failedRuns = failRunForMessage(snapshot.runs, message, failedAt, reason);
    requestStoreRef.current.sync({ tasks: failedTasks, runs: failedRuns });
    setTasks(failedTasks);
    setRuns(failedRuns);
  }

  function getDirectRequestState(): DirectRequestState {
    return requestStoreRef.current.snapshot();
  }

  function applyDirectRequestResult(result: DirectRequestResult) {
    requestStoreRef.current.replace(result.state);

    setConversations(result.state.conversations);
    setMessages(result.state.messages);
    setRuns(result.state.runs);
    setTasks(result.state.tasks);
    setArtifacts(result.state.artifacts);
    if (result.outputMode) setOutputMode(normalizeOutputMode(result.outputMode));
  }

  function getTaskRoomRequestState(): TaskRoomRequestState {
    return requestStoreRef.current.snapshot();
  }

  function applyTaskRoomRequestStep(step: TaskRoomRequestStep) {
    requestStoreRef.current.replace(step.state);

    setConversations(step.state.conversations);
    setMessages(step.state.messages);
    setRuns(step.state.runs);
    setTasks(step.state.tasks);
    setArtifacts(step.state.artifacts);
    if (step.outputMode) setOutputMode(normalizeOutputMode(step.outputMode));
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
    const now = new Date().toISOString();
    const existingConversation =
      currentConversation?.projectId === FREE_CHAT_PROJECT_ID &&
      currentConversation.mode === "direct" &&
      currentConversation.primaryAgentId === targetAgent.id
        ? currentConversation
        : undefined;
    const conversation =
      existingConversation ??
      createConversation({
        projectId: FREE_CHAT_PROJECT_ID,
        namespace: FREE_CHAT_NAMESPACE,
        mode: "direct",
        title: `${targetAgent.name} free chat`,
        primaryAgentId: targetAgent.id,
        participantAgentIds: [targetAgent.id],
        createdAt: now,
      });
    const userMessageId = crypto.randomUUID();
    const requestId = crypto.randomUUID();
    const userMessage: ConversationMessage = {
      id: userMessageId,
      conversationId: conversation.id,
      projectId: FREE_CHAT_PROJECT_ID,
      role: "user",
      contentParts: createTextParts(text),
      requestId,
      requestAttempt: 1,
      requestStartedAt: now,
      status: "sending",
      createdAt: now,
    };

    if (!existingConversation) {
      const nextConversations = [conversation, ...requestStoreRef.current.snapshot().conversations];
      requestStoreRef.current.sync({ conversations: nextConversations });
      setConversations(nextConversations);
    }
    setActiveFreeChatConversationIds((current) => ({
      ...current,
      [targetAgent.id]: conversation.id,
    }));
    requestStoreRef.current.begin(requestId);
    const nextMessages = [...requestStoreRef.current.snapshot().messages, userMessage];
    requestStoreRef.current.sync({ messages: nextMessages });
    setMessages(nextMessages);
    setMessageText("");
    setAttachedWorkspaceFiles([]);

    try {
      await completeFreeChatRequest({ conversation, targetAgent, userMessageId, text });
    } finally {
      requestStoreRef.current.end(requestId);
    }
  }

  async function retryDirectMessage(messageId: string) {
    const retry = resolveDirectMessageRetry({
      messageId,
      messages,
      conversations,
      agents,
      projects,
      freeChatProjectId: FREE_CHAT_PROJECT_ID,
    });
    if (retry.kind === "ignore") return;
    if (retry.kind === "fail") {
      markInterruptedMessageFailed(retry.message, retry.reason);
      return;
    }

    const trackedRequestId = requestStoreRef.current.begin(retry.message);
    const preparedMessages = prepareDirectMessageRetry({
      messages: requestStoreRef.current.snapshot().messages,
      message: retry.message,
      targetAgentId: retry.targetAgent.id,
    });
    requestStoreRef.current.sync({ messages: preparedMessages });
    setMessages(preparedMessages);

    try {
      if (retry.kind === "free-chat") {
        await completeFreeChatRequest({
          conversation: retry.conversation,
          targetAgent: retry.targetAgent,
          userMessageId: retry.message.id,
          text: retry.text,
        });
        return;
      }

      await resumeProjectDirectRequest({
        message: retry.message,
        conversation: retry.conversation,
        project: retry.project,
        targetAgent: retry.targetAgent,
        text: retry.text,
      });
    } finally {
      requestStoreRef.current.end(trackedRequestId);
    }
  }

  async function retryTaskRoomMessage(messageId: string) {
    const retry = resolveTaskRoomMessageRetry({
      messageId,
      messages,
      conversations,
    });
    if (retry.kind === "ignore") return;

    const trackedRequestId = requestStoreRef.current.begin(retry.message);
    const preparedMessages = prepareTaskRoomMessageRetry({ messages: requestStoreRef.current.snapshot().messages, messageId: retry.message.id });
    requestStoreRef.current.sync({ messages: preparedMessages });
    setMessages(preparedMessages);

    try {
      const succeeded = await retryTaskLifecycle(retry.taskId);
      const completedMessages = completeTaskRoomMessageRetry({
        messages: requestStoreRef.current.snapshot().messages,
        messageId: retry.message.id,
        succeeded,
      });
      requestStoreRef.current.sync({ messages: completedMessages });
      setMessages(completedMessages);
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
    const text = messageText.trim();
    if (!text) return;
    if (composerSubmittingRef.current) return;
    if (conversationMode === "task-room") {
      if (!selectedWorkspaceProject || !chiefAgent) return;
      if (selectedTaskParticipants.length === 0) return;
      composerSubmittingRef.current = true;
      setIsComposerSubmitting(true);
      try {
        await submitTaskRoomMessage(text);
      } finally {
        composerSubmittingRef.current = false;
        setIsComposerSubmitting(false);
      }
      return;
    }
    if (!selectedAgent) return;
    if (chatScope === "free") {
      composerSubmittingRef.current = true;
      setIsComposerSubmitting(true);
      try {
        await submitFreeChatMessage(text);
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
      const now = new Date().toISOString();
      const activeConversationMode = "direct";
      const existingConversation = conversations.find(
        (item) =>
          item.projectId === selectedWorkspaceProject.id &&
          item.mode === activeConversationMode &&
          item.primaryAgentId === targetAgent.id,
      );
      const conversation =
        existingConversation ??
        createConversation({
          projectId: selectedWorkspaceProject.id,
          namespace: selectedWorkspaceProject.namespace,
          mode: activeConversationMode,
          title: targetAgent.name,
          primaryAgentId: targetAgent.id,
          participantAgentIds: [targetAgent.id],
          createdAt: now,
        });
      const runId = crypto.randomUUID();
      const userMessageId = crypto.randomUUID();
      const requestId = crypto.randomUUID();
      const participantAgentIds = [targetAgent.id];
      const workspaceContext = attachedWorkspaceFiles.map((file) => ({
        path: file.path,
        size: file.size,
        attachedAt: file.attachedAt,
      }));
      const agentRequestText = buildAgentRequestText(text, selectedWorkspaceProject, attachedWorkspaceFiles);

      const userMessage: ConversationMessage = {
        id: userMessageId,
        conversationId: conversation.id,
        projectId: selectedWorkspaceProject.id,
        role: "user",
        contentParts: createTextParts(text),
        workspaceContext,
        runId,
        requestId,
        requestAttempt: 1,
        requestStartedAt: now,
        status: "sending",
        createdAt: now,
      };
      const optimisticRun: ProjectRun = {
        id: runId,
        projectId: selectedWorkspaceProject.id,
        conversationId: conversation.id,
        type: "direct_message",
        ownerAgentId: targetAgent.id,
        participantAgentIds,
        state: "submitting",
        summary: "Project chat request submitted.",
        eventIds: [`${runId}-submitted`],
        artifactIds: [],
        createdAt: now,
        updatedAt: now,
      };

      if (!existingConversation) {
        const nextConversations = [conversation, ...requestStoreRef.current.snapshot().conversations];
        requestStoreRef.current.sync({ conversations: nextConversations });
        setConversations(nextConversations);
      }
      requestStoreRef.current.begin(requestId);
      const projectDirectSnapshot = requestStoreRef.current.snapshot();
      const nextMessages = [...projectDirectSnapshot.messages, userMessage];
      const nextRuns = [optimisticRun, ...projectDirectSnapshot.runs];
      requestStoreRef.current.sync({ messages: nextMessages, runs: nextRuns });
      setMessages(nextMessages);
      setRuns(nextRuns);
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
          text,
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
    const participantAgentIds = participants.map((agent) => agent.id);
    const now = new Date().toISOString();
    const existingConversation = conversations.find(
      (item) =>
        item.projectId === selectedWorkspaceProject.id &&
        item.mode === "task_room" &&
        item.chiefAgentId === targetAgent.id,
    );
    const conversation =
      existingConversation ??
      createConversation({
        projectId: selectedWorkspaceProject.id,
        namespace: selectedWorkspaceProject.namespace,
        mode: "task_room",
        title: `${selectedWorkspaceProject.name} task room`,
        chiefAgentId: targetAgent.id,
        participantAgentIds,
        createdAt: now,
      });
    const taskId = crypto.randomUUID();
    const runId = crypto.randomUUID();
    const userMessageId = crypto.randomUUID();
    const requestId = crypto.randomUUID();
    const taskFiles = [...attachedWorkspaceFiles];
    const workspaceContext = taskFiles.map((file) => ({
      path: file.path,
      size: file.size,
      attachedAt: file.attachedAt,
    }));
    const taskTitle = text.length > 56 ? `${text.slice(0, 56)}...` : text;

    const userMessage: ConversationMessage = {
      id: userMessageId,
      conversationId: conversation.id,
      projectId: selectedWorkspaceProject.id,
      role: "user",
      contentParts: createTextParts(text),
      workspaceContext,
      taskId,
      runId,
      requestId,
      requestAttempt: 1,
      requestStartedAt: now,
      status: "sending",
      createdAt: now,
    };
    const projectTask: ProjectTask = {
      id: taskId,
      projectId: selectedWorkspaceProject.id,
      contextId: conversation.a2aContextId,
      title: taskTitle,
      ownerAgentId: targetAgent.id,
      participantAgentIds,
      state: "submitting",
      summary: "Task submitted to Chief.",
      events: [
        {
          id: `${taskId}-submitted`,
          taskId,
          agentId: targetAgent.id,
          label: "Task submitted to Chief.",
          state: "submitting",
          timestamp: now,
        },
      ],
      artifactIds: [],
      updatedAt: now,
    };
    const projectRun: ProjectRun = {
      id: runId,
      projectId: selectedWorkspaceProject.id,
      conversationId: conversation.id,
      taskId,
      type: "chief_delegation",
      ownerAgentId: targetAgent.id,
      participantAgentIds: [targetAgent.id, ...participantAgentIds],
      state: "submitting",
      summary: "Chief-led task submitted.",
      eventIds: [`${runId}-submitted`],
      artifactIds: [],
      createdAt: now,
      updatedAt: now,
    };

    if (!existingConversation) {
      const nextConversations = [conversation, ...requestStoreRef.current.snapshot().conversations];
      requestStoreRef.current.sync({ conversations: nextConversations });
      setConversations(nextConversations);
    }
    requestStoreRef.current.begin(requestId);
    const taskRoomSnapshot = requestStoreRef.current.snapshot();
    const nextMessages = [...taskRoomSnapshot.messages, userMessage];
    const nextTasks = [projectTask, ...taskRoomSnapshot.tasks.filter((task) => task.id !== taskId)];
    const nextRuns = [projectRun, ...taskRoomSnapshot.runs];
    requestStoreRef.current.sync({ messages: nextMessages, tasks: nextTasks, runs: nextRuns });
    setMessages(nextMessages);
    setTasks(nextTasks);
    setRuns(nextRuns);
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
    const next = ((clientX - rect.left) / rect.width) * 100;
    setSplitPercent(Math.min(70, Math.max(35, next)));
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
    setSplitPercent((current) => {
      const next = direction === "left" ? current - 4 : current + 4;
      return Math.min(70, Math.max(35, next));
    });
  }

  return (
    <div className="app-shell">
      <AppSidebar
        agents={agents}
        projects={projects}
        selectedAgentId={selectedAgentId}
        selectedProjectId={selectedProjectId}
        freeChatEntryProjectId={FREE_CHAT_ENTRY_PROJECT_ID}
        respondingAgentIds={respondingAgentIds}
        themeMode={themeMode}
        onAddAgent={openAddAgentDialog}
        onCreateProject={openProjectDialog}
        onDeleteProject={requestDeleteProject}
        onEditAgent={openAgentEditor}
        onEditProject={openProjectEditor}
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
            onAddAgent={() => setShowSetup(true)}
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
            onCreateProject={openProjectDialog}
            onDetachFile={detachWorkspaceFile}
            onEditProject={openProjectEditor}
            onNewFreeChat={startNewFreeChat}
            onOpenPreview={openPreview}
            onOutputModeChange={setOutputMode}
            onRefreshTask={refreshTaskLifecycle}
            onRetryTask={retryTaskLifecycle}
            onSelectFreeChatConversation={selectFreeChatConversation}
          />
        </div>
      </main>

      {showSetup ? (
        <SetupWizard
          testState={testState}
          testMessage={testMessage}
          onClose={closeSetup}
          onRunTest={runConnectionTest}
          onResetTest={resetConnectionTest}
          onSaveAgent={saveDemoAgent}
          agent={setupAgentId ? agents.find((agent) => agent.id === setupAgentId) : undefined}
          onDeleteAgent={requestDeleteAgent}
          onAgentAvatarFile={handleExistingAgentAvatar}
        />
      ) : null}
      {showProjectDialog ? (
        <ProjectDialog
          error={projectFormError}
          project={editingProjectId ? projects.find((project) => project.id === editingProjectId) : undefined}
          onClose={closeProjectDialog}
          onSaveProject={saveProject}
        />
      ) : null}
      {confirmAction ? (
        <ConfirmDialog
          action={confirmAction}
          agents={agents}
          projects={projects}
          onCancel={() => setConfirmAction(null)}
          onConfirm={() => {
            if (confirmAction.kind === "delete-project") {
              deleteProject(confirmAction.projectId);
            } else {
              deleteAgent(confirmAction.agentId);
            }
          }}
        />
      ) : null}
    </div>
  );
}

function createConversation({
  projectId,
  namespace,
  mode,
  title,
  primaryAgentId,
  chiefAgentId,
  participantAgentIds,
  createdAt,
}: {
  projectId: string;
  namespace: string;
  mode: Conversation["mode"];
  title: string;
  primaryAgentId?: string;
  chiefAgentId?: string;
  participantAgentIds: string[];
  createdAt: string;
}): Conversation {
  return {
    id: crypto.randomUUID(),
    projectId,
    mode,
    title,
    primaryAgentId,
    chiefAgentId,
    participantAgentIds,
    a2aContextId: namespace,
    createdAt,
    updatedAt: createdAt,
  };
}

function getPartText(parts: A2APart[]) {
  return parts
    .map((part) => {
      if (part.kind === "text") return part.text;
      if (part.kind === "data") return JSON.stringify(part.data, null, 2);
      return part.file.name ?? part.file.uri ?? "File";
    })
    .join("\n");
}

function mergeLifecycleTaskUpdate(
  task: ProjectTask,
  remoteTask: A2ATask,
  agentId: string,
  label: string,
  mappedState: WorkState,
  summary: string,
  eventId: string,
  updatedAt: string,
  returnedArtifactIds: string[],
) {
  const mergedArtifactIds = mergeIds(task.artifactIds, returnedArtifactIds);
  const remoteTaskId = remoteTask.id || task.remoteTaskId;
  const remoteContextId = remoteTask.contextId || task.remoteContextId;
  const shouldRecordEvent =
    !task.events.some((event) => event.id === eventId) &&
    (task.state !== mappedState ||
      task.summary !== summary ||
      task.remoteTaskId !== remoteTaskId ||
      task.remoteContextId !== remoteContextId ||
      mergedArtifactIds.length !== task.artifactIds.length);

  return {
    ...task,
    state: mappedState,
    remoteTaskId,
    remoteContextId,
    summary,
    events: shouldRecordEvent
      ? [
          ...task.events,
          {
            id: eventId,
            taskId: task.id,
            agentId,
            label,
            state: mappedState,
            timestamp: updatedAt,
          },
        ]
      : task.events,
    artifactIds: mergedArtifactIds,
    updatedAt,
  };
}

function getTaskLifecycleAddress(task: ProjectTask, runs: ProjectRun[]) {
  if (task.remoteTaskId) {
    return {
      taskId: task.remoteTaskId,
      contextId: task.remoteContextId ?? task.contextId,
    };
  }

  const linkedRun = runs.find((run) => run.taskId === task.id);
  if (linkedRun?.type === "direct_message") {
    return {
      taskId: task.id,
      contextId: task.contextId,
    };
  }

  return null;
}

function isTaskActive(state: WorkState) {
  return state === "submitting" || state === "submitted" || state === "working" || state === "input_required";
}

function isTaskTerminal(state: WorkState) {
  return state === "completed" || state === "failed" || state === "canceled" || state === "unsupported";
}

function hasLifecycleUnsupportedEvent(task: ProjectTask) {
  return task.events.some((event) => event.state === "unsupported" || event.label.startsWith("Lifecycle unsupported:"));
}

function hasCancelUnsupportedEvent(task: ProjectTask) {
  return task.events.some((event) => event.state === "unsupported" && event.label.startsWith("Cancel unsupported:"));
}

function getTaskEventDisplayLabel(label: string) {
  return label.replace("Agent returned an A2A task.", "Agent returned a task.").replace("A2A request failed", "Agent task request failed");
}

function mergeIds(first: string[], second: string[]) {
  return Array.from(new Set([...first, ...second]));
}

async function readAvatarFile(file?: File): Promise<{ dataUrl?: string; error?: string }> {
  if (!file || file.size === 0) return {};

  if (!file.type.startsWith("image/")) {
    return { error: "Avatar must be an image file." };
  }

  if (file.size > MAX_AVATAR_BYTES) {
    return { error: "Avatar image must be 512 KB or smaller." };
  }

  try {
    const dataUrl = await fileToDataUrl(file);
    return { dataUrl };
  } catch {
    return { error: "Unable to read avatar image." };
  }
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Avatar reader returned a non-text result."));
      }
    });
    reader.addEventListener("error", () => reject(reader.error ?? new Error("Avatar reader failed.")));
    reader.readAsDataURL(file);
  });
}
