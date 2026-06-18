import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Bot,
  FileText,
  Folder,
  Loader2,
  MessageSquare,
  Moon,
  Paperclip,
  Pencil,
  Plus,
  RefreshCw,
  Settings,
  Sparkles,
  Sun,
  Trash2,
  UserRoundCog,
  X,
  XCircle,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, PointerEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { AgentAvatar, StatusDot } from "./components/AgentPrimitives";
import { BrowserPreview, ProjectOutputs } from "./components/OutputWorkspace";
import { WorkspaceFiles } from "./components/WorkspaceFiles";
import { SetupWizard, type ConnectionTestState } from "./components/SetupWizard";
import type { A2APart, A2ATask } from "./domain/a2a";
import { getOfficeRoleLabel } from "./domain/agentProfile";
import { createAgentFromHermesSetup } from "./domain/hermesSetup";
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
  ConversationFailureKind,
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
import type { AgentInstance, AgentRuntimeProvider, Project } from "./domain/types";
import { loadConfiguredAgents, saveConfiguredAgents } from "./services/agentStorage";
import { getUserFacingAgentError, sanitizeAgentErrorText } from "./services/agentErrorText";
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

type OutputMode = "workspace" | "browser" | "outputs";
type ConversationMode = "single" | "task-room";
type ChatScope = "free" | "project";
type DirectoryPickerHandle = {
  name: string;
};
type ConfirmAction =
  | {
      kind: "delete-project";
      projectId: string;
    }
  | {
      kind: "delete-agent";
      agentId: string;
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
      const apiKey = String(form.get("apiKey") || "");
      if (!(await persistLocalTrustedAgent({ ...agent, apiKey: apiKey || agent.apiKey }))) return;
      const result = await new HermesA2AAdapter({ agent, apiKey }).testConnection();

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
      <aside className="sidebar" aria-label="Vibe Office navigation">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            <Sparkles size={18} />
          </div>
          <div>
            <div className="brand-title">Vibe Office</div>
          </div>
          <button
            className="theme-toggle"
            type="button"
            onClick={toggleTheme}
            aria-label={themeMode === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            title={themeMode === "dark" ? "Light theme" : "Dark theme"}
          >
            {themeMode === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>

        <section className="nav-section">
          <div className="section-label">
            <span className="section-title">
              <Bot size={14} />
              Agents
            </span>
            <span className="count-badge">{agents.length}</span>
          </div>
          <div className="nav-list">
            {agents.length === 0 ? (
              <div className="inline-empty">Add an agent provider to start.</div>
            ) : null}
            {agents.map((agent) => {
              const isActive = selectedAgentId === agent.id;
              const isResponding = respondingAgentIds.has(agent.id);
              return (
                <div className={`agent-row ${isActive ? "active" : ""}`} key={agent.id}>
                  <button
                    className="nav-item agent-item"
                    onClick={() => {
                      setSelectedAgentId(agent.id);
                      setConversationMode("single");
                    }}
                  >
                    <AgentAvatar agent={agent} />
                    <span className="nav-item-content">
                      <span className="nav-item-title">
                        <span className="nav-item-name">{agent.name}</span>
                        <span className="chief-dot">{getOfficeRoleLabel(agent.officeRole, agent.isChief)}</span>
                      </span>
                      <span className="nav-item-meta">
                        <StatusDot status={isResponding ? "checking" : agent.status} />
                        {isResponding ? "responding" : agent.tags.slice(0, 2).join(" / ")}
                      </span>
                    </span>
                  </button>
                  <div className="row-actions agent-row-actions" aria-label={`${agent.name} agent actions`}>
                    <button
                      className="icon-button mini-button"
                      type="button"
                      onClick={() => openAgentEditor(agent.id)}
                      aria-label={`Edit ${agent.name}`}
                      title="Edit agent"
                    >
                      <Pencil size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <button className="secondary-action" onClick={openAddAgentDialog}>
            <Plus size={16} />
            Add agent
          </button>
        </section>

        <section className="nav-section">
          <div className="section-label">
            <span className="section-title">
              <Folder size={14} />
              Projects
            </span>
            <button className="section-icon-button" type="button" onClick={openProjectDialog} aria-label="Create project" title="Create project">
              <Plus size={14} />
            </button>
          </div>
          <div className="nav-list">
            {projects.map((project) => {
              const isActive = selectedProjectId === project.id;
              const isFreeChatProject = project.id === FREE_CHAT_ENTRY_PROJECT_ID;
              const projectName = isFreeChatProject ? "Free Chat" : project.name;
              const projectMeta = isFreeChatProject ? "personal conversations" : project.directory ?? project.namespace;
              return (
                <div className={`project-row ${isActive ? "active" : ""}`} key={project.id}>
                  <button
                    className="project-item"
                    onClick={() => {
                      setSelectedProjectId(project.id);
                      setChatScope(isFreeChatProject ? "free" : "project");
                      setConversationMode("single");
                    }}
                  >
                      <span className="project-icon" aria-hidden="true">
                        {isFreeChatProject ? <MessageSquare size={15} /> : <Folder size={15} />}
                      </span>
                      <span>
                        <span className="project-name">{projectName}</span>
                        <span className="project-namespace">{projectMeta}</span>
                      </span>
                    </button>
                  {!isFreeChatProject ? (
                    <div className="row-actions" aria-label={`${projectName} project actions`}>
                      <button
                        className="icon-button mini-button"
                        type="button"
                        onClick={() => openProjectEditor(project.id)}
                        aria-label={`Rename ${projectName}`}
                        title="Rename project"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        className="icon-button mini-button danger-button"
                        type="button"
                        onClick={() => requestDeleteProject(project.id)}
                        aria-label={`Delete ${projectName}`}
                        title="Delete project"
                        disabled={projects.length <= 1}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>

        <button className="setup-card" onClick={openAddAgentDialog}>
          <Settings size={18} />
          <span>
            <strong>Settings</strong>
          </span>
        </button>
      </aside>

      <main className="workspace">
        <div
          className="main-split"
          style={{
            "--conversation-fr": `${splitPercent}fr`,
            "--output-fr": `${100 - splitPercent}fr`,
          } as CSSProperties}
        >
          <section className="conversation-panel" aria-label="Conversation">
            <div className="panel-header">
              <div>
                <h2>{conversationMode === "task-room" ? "Coordinate agents" : selectedAgent?.name ?? "No agent connected"}</h2>
              </div>
            </div>

            {conversationMode === "single" && selectedAgent ? (
              <DirectChat
                messages={currentMessages}
                scope={chatScope}
                isResponding={isComposerSubmitting || currentConversationHasPendingRequest}
                onRetryMessage={retryDirectMessage}
              />
            ) : conversationMode === "single" ? (
              <NoAgentState onAddAgent={() => setShowSetup(true)} />
            ) : selectedWorkspaceProject ? (
              <TaskRoom
                agents={agents}
                chief={chiefAgent}
                messages={taskRoomMessages}
                participantIds={taskParticipantIds}
                projectTask={latestChiefTask}
                isResponding={isComposerSubmitting || taskRoomHasPendingRequest}
                onToggleParticipant={toggleTaskParticipant}
                onRetryMessage={retryTaskRoomMessage}
              />
            ) : (
              <NoProjectState onSelectProject={() => setChatScope("free")} />
            )}

            <form className="composer" onSubmit={submitMessage}>
              <label className="sr-only" htmlFor="message">
                Message
              </label>
              {attachedWorkspaceFiles.length > 0 ? (
                <div className="attached-context-row" aria-label="Attached workspace context">
                  {attachedWorkspaceFiles.map((file) => (
                    <span className="attached-context-chip" key={file.path}>
                      <Paperclip size={13} />
                      <span>{file.path}</span>
                      <button type="button" onClick={() => detachWorkspaceFile(file.path)} aria-label={`Remove ${file.path}`}>
                        <X size={13} />
                      </button>
                    </span>
                  ))}
                </div>
              ) : null}
              <div className="composer-row">
                <textarea
                  id="message"
                  value={messageText}
                  onChange={(event) => setMessageText(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      event.currentTarget.form?.requestSubmit();
                    }
                  }}
                  placeholder={
                    conversationMode === "single"
                      ? selectedAgent
                        ? chatScope === "free"
                          ? `Chat with ${selectedAgent.name}`
                          : selectedWorkspaceProject
                            ? `Ask ${selectedAgent.name} in ${selectedWorkspaceProject.name}`
                            : "Select a project first"
                        : "Add an agent provider first"
                      : !selectedWorkspaceProject
                        ? "Select a project first"
                        : !chiefAgent
                        ? "Assign one connected agent as Chief first"
                        : selectedTaskParticipants.length === 0
                          ? "Select at least one participant first"
                          : `Start a Chief-led task in ${selectedWorkspaceProject.name}`
                  }
                  disabled={isComposerSubmitting || activeComposerHasPendingRequest}
                />
                <button
                  className="primary-icon-button composer-send-button"
                  type="submit"
                  aria-label="Send message"
                  disabled={
                    isComposerSubmitting ||
                    activeComposerHasPendingRequest ||
                    (conversationMode === "single"
                      ? !selectedAgent || (chatScope === "project" && !selectedWorkspaceProject)
                      : !selectedWorkspaceProject || !chiefAgent || selectedTaskParticipants.length === 0) ||
                    messageText.trim().length === 0
                  }
                >
                  <ArrowUp size={18} />
                </button>
              </div>
            </form>
          </section>

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

          <aside className="output-panel" aria-label="Output Workspace">
            {chatScope === "free" ? (
              <FreeChatHistoryPanel
                agent={selectedAgent}
                activeConversationId={currentConversation?.id}
                histories={freeChatHistory}
                onNewChat={startNewFreeChat}
                onSelectConversation={selectFreeChatConversation}
              />
            ) : selectedWorkspaceProject ? (
              <>
                <div className="tabs" role="tablist" aria-label="Output modes">
                  <TabButton active={outputMode === "workspace"} onClick={() => setOutputMode("workspace")}>
                    Workspace
                  </TabButton>
                  <TabButton active={outputMode === "browser"} onClick={() => setOutputMode("browser")}>
                    Browser
                  </TabButton>
                  <TabButton active={outputMode === "outputs"} onClick={() => setOutputMode("outputs")}>
                    Outputs
                  </TabButton>
                </div>

                {outputMode === "workspace" ? (
                  <div className="workspace-mode">
                    <WorkspaceFiles
                      project={selectedWorkspaceProject}
                      attachedFiles={attachedWorkspaceFiles}
                      onAttachFile={attachWorkspaceFile}
                      onDetachFile={detachWorkspaceFile}
                      onEditProject={() => openProjectEditor(selectedWorkspaceProject.id)}
                    />
                  </div>
                ) : null}
                {outputMode === "browser" ? (
                  <BrowserPreview
                    browserUrl={browserUrl}
                    previewUrl={previewUrl}
                    onBrowserUrlChange={setBrowserUrl}
                    onOpenPreview={openPreview}
                  />
                ) : null}
                {outputMode === "outputs" ? (
                  <ProjectOutputs
                    agents={agents}
                    runs={scopedRuns}
                    tasks={scopedTasks}
                    artifacts={scopedArtifacts}
                    previewUrl={previewUrl}
                    busyActionId={taskLifecycleBusyId}
                    onCancelTask={cancelTaskLifecycle}
                    onRefreshTask={refreshTaskLifecycle}
                    onRetryTask={retryTaskLifecycle}
                    onShowBrowser={() => setOutputMode("browser")}
                  />
                ) : null}
              </>
            ) : (
              <ProjectSelectionPanel onCreateProject={openProjectDialog} />
            )}
          </aside>
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

function getDataPartContent(parts: A2APart[]) {
  return parts
    .filter((part) => part.kind === "data")
    .map((part) => JSON.stringify(part.data, null, 2))
    .join("\n\n");
}

function MarkdownContent({ content }: { content: string }) {
  return (
    <div className="markdown-content">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
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

function slugifyProjectName(name: string) {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || `project-${Date.now()}`;
}

function deriveProjectNameFromDirectory(directory: string) {
  return directory
    .trim()
    .replace(/[\\/]+$/, "")
    .split(/[\\/]/)
    .filter(Boolean)
    .pop() ?? "";
}

function TabButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: string;
  onClick: () => void;
}) {
  return (
    <button className={`tab-button ${active ? "active" : ""}`} onClick={onClick} role="tab" aria-selected={active}>
      {children}
    </button>
  );
}

function DirectChat({
  messages,
  scope,
  isResponding,
  onRetryMessage,
}: {
  messages: ConversationMessage[];
  scope: ChatScope;
  isResponding: boolean;
  onRetryMessage: (messageId: string) => void;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const latestMessageId = messages[messages.length - 1]?.id;

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: "smooth" });
  }, [latestMessageId, isResponding]);

  return (
    <div className="conversation-body" ref={bodyRef}>
      {messages.length === 0 && !isResponding ? (
        <div className="empty-state compact-empty">
          <MessageSquare size={32} />
          <h3>No messages yet</h3>
          <p>{scope === "free" ? "Start a free chat with this agent. No project context is attached." : "Start a project-scoped chat with this connected agent."}</p>
        </div>
      ) : (
        <>
          <MessageRows messages={messages} onRetryMessage={onRetryMessage} />
          {isResponding ? <TypingIndicator /> : null}
        </>
      )}
    </div>
  );
}

function FreeChatHistoryPanel({
  agent,
  activeConversationId,
  histories,
  onNewChat,
  onSelectConversation,
}: {
  agent?: AgentInstance;
  activeConversationId?: string;
  histories: Array<{
    conversation: Conversation;
    messageCount: number;
    title: string;
  }>;
  onNewChat: () => void;
  onSelectConversation: (conversationId: string) => void;
}) {
  return (
    <section className="free-chat-panel" aria-label="Chat history">
      <div className="free-chat-header">
        <div className="free-chat-title">
          <span className="profile-block-icon">
            <MessageSquare size={18} />
          </span>
          <div>
            <h3>Chat history</h3>
            <p>{agent ? `${agent.name} free chats` : "Select an agent"}</p>
          </div>
        </div>
        <button type="button" className="icon-text-button" onClick={onNewChat} disabled={!agent}>
          <Plus size={15} />
          New chat
        </button>
      </div>
      <div className="free-chat-history-list">
        {histories.length > 0 ? (
          histories.map((item) => (
            <button
              type="button"
              className={`free-chat-history-item ${item.conversation.id === activeConversationId ? "active" : ""}`}
              key={item.conversation.id}
              onClick={() => onSelectConversation(item.conversation.id)}
            >
              <strong>{item.title}</strong>
              <span>{item.messageCount} messages</span>
            </button>
          ))
        ) : (
          <div className="inline-empty">No free chat history yet.</div>
        )}
      </div>
    </section>
  );
}

function ProjectSelectionPanel({ onCreateProject }: { onCreateProject: () => void }) {
  return (
    <section className="free-chat-panel" aria-label="Project workspace selection">
      <div className="free-chat-header">
        <span className="profile-block-icon">
          <Folder size={18} />
        </span>
        <div>
          <h3>No project selected</h3>
          <p>Select a project from the left list when you are ready to work with project scope.</p>
        </div>
      </div>
      <button className="secondary-button" type="button" onClick={onCreateProject}>
        <Plus size={16} />
        Create project
      </button>
    </section>
  );
}

function NoProjectState({ onSelectProject }: { onSelectProject: () => void }) {
  return (
    <div className="conversation-body">
      <div className="empty-state compact-empty">
        <Folder size={32} />
        <h3>No project selected</h3>
        <p>Select a project from the left list, or continue in Free chat.</p>
        <button className="secondary-button" type="button" onClick={onSelectProject}>
          Free chat
        </button>
      </div>
    </div>
  );
}

function getDisplayMessageText(message: ConversationMessage) {
  const text = getPartText(message.contentParts);
  return message.role === "system" ? sanitizeAgentErrorText(text) : text;
}

function getFailureKindLabel(kind?: ConversationFailureKind) {
  if (kind === "timeout") return "Timeout";
  if (kind === "network") return "Network";
  if (kind === "auth") return "Auth";
  if (kind === "not_found") return "Endpoint";
  if (kind === "context") return "Context";
  if (kind === "interrupted") return "Interrupted";
  return "Failed";
}

function MessageRows({
  messages,
  onRetryMessage,
}: {
  messages: ConversationMessage[];
  onRetryMessage?: (messageId: string) => void;
}) {
  return messages.map((message) => {
    const isUser = message.role === "user";
    const isSystem = message.role === "system";
    const content = getDisplayMessageText(message);
    const canRetry = isUser && message.status === "failed" && Boolean(onRetryMessage);
    const failureLabel = message.status === "failed" && message.errorText ? getFailureKindLabel(message.errorKind) : "";
    return (
      <div className={`message-row ${isUser ? "user-message" : "agent-message"}`} key={message.id}>
        <div className={`${isUser ? "message-bubble" : "agent-output"} ${message.status} ${isSystem ? "system" : ""}`}>
          {isUser ? <p>{content}</p> : <MarkdownContent content={content} />}
          {message.errorText ? (
            <div className="message-error-meta">
              {failureLabel ? <span className="message-error-kind">{failureLabel}</span> : null}
              <p className="message-error-text">{sanitizeAgentErrorText(message.errorText)}</p>
            </div>
          ) : null}
          {message.workspaceContext && message.workspaceContext.length > 0 ? (
            <div className="message-context-strip" aria-label="Workspace files sent with this message">
              {message.workspaceContext.map((file) => (
                <span className="message-context-chip" key={`${message.id}-${file.path}`}>
                  <FileText size={12} />
                  {file.path}
                </span>
              ))}
            </div>
          ) : null}
          {canRetry ? (
            <button
              className="message-retry-button"
              type="button"
              onClick={() => onRetryMessage?.(message.id)}
            >
              <RefreshCw size={13} />
              Retry
            </button>
          ) : null}
        </div>
      </div>
    );
  });
}

function TypingIndicator() {
  return (
    <div className="message-row agent-message typing-row" role="status" aria-label="Agent is responding">
      <div className="agent-output typing-indicator" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}

function NoAgentState({ onAddAgent }: { onAddAgent: () => void }) {
  return (
    <div className="conversation-body">
      <div className="empty-state compact-empty">
        <UserRoundCog size={32} />
        <h3>No agents connected</h3>
        <p>Connect a real agent provider before starting direct chat or Chief-led tasks.</p>
        <button className="secondary-button" onClick={onAddAgent}>
          Add agent
        </button>
      </div>
    </div>
  );
}

function TaskRoom({
  agents,
  chief,
  messages,
  participantIds,
  projectTask,
  isResponding,
  onToggleParticipant,
  onRetryMessage,
}: {
  agents: AgentInstance[];
  chief?: AgentInstance;
  messages: ConversationMessage[];
  participantIds: string[];
  projectTask?: ProjectTask;
  isResponding: boolean;
  onToggleParticipant: (agentId: string, checked: boolean) => void;
  onRetryMessage: (messageId: string) => void;
}) {
  const participants = agents.filter((agent) => agent.id !== chief?.id && agent.status === "online");
  const bodyRef = useRef<HTMLDivElement>(null);
  const latestMessageId = messages[messages.length - 1]?.id;

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: "smooth" });
  }, [latestMessageId, projectTask?.updatedAt, isResponding]);

  return (
    <div className="conversation-body" ref={bodyRef}>
      <div className="task-summary">
        <div>
          <h3>{projectTask?.title ?? `${chief?.name ?? "Chief"} task room`}</h3>
          <p>
            {projectTask?.summary ??
              (chief ? "Submit a project-scoped task to Chief and choose the participant agents for the first round." : "Assign one connected agent as Chief before starting a task room.")}
          </p>
        </div>
        <span className="mode-badge">{projectTask?.state ?? (chief ? "idle" : "unsupported")}</span>
      </div>
      {chief ? (
        <div className="assignment-row chief-assignment">
          <AgentAvatar agent={chief} size="small" />
          <div>
            <strong>{chief.name}</strong>
            <span>Chief owner</span>
          </div>
          <span className={chief.status === "online" ? "status-badge success" : "status-badge danger"}>{chief.status}</span>
        </div>
      ) : null}
      <div className="assignment-list">
        {participants.length > 0 ? (
          participants.map((agent) => (
            <label className="assignment-row selectable-assignment" key={agent.id}>
              <AgentAvatar agent={agent} size="small" />
              <div>
                <strong>{agent.name}</strong>
                <span>{agent.tags.join(" / ")}</span>
              </div>
              <input
                type="checkbox"
                checked={participantIds.includes(agent.id)}
                onChange={(event) => onToggleParticipant(agent.id, event.currentTarget.checked)}
                aria-label={`Select ${agent.name} for task room`}
              />
            </label>
          ))
        ) : (
          <div className="inline-empty">Connect another online agent to delegate Task Room work.</div>
        )}
      </div>
      <div className="task-room-transcript">
        {messages.length > 0 || isResponding ? (
          <>
            <MessageRows messages={messages} onRetryMessage={onRetryMessage} />
            {isResponding ? <TypingIndicator /> : null}
          </>
        ) : (
          <div className="inline-empty">Task Room messages will appear here after you submit a Chief-led task.</div>
        )}
      </div>
    </div>
  );
}

function ProjectDialog({
  error,
  project,
  onClose,
  onSaveProject,
}: {
  error: string;
  project?: Project;
  onClose: () => void;
  onSaveProject: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const isEditing = Boolean(project);
  const [projectName, setProjectName] = useState(project?.name ?? "");
  const [directory, setDirectory] = useState(project?.directory ?? "");
  const [folderError, setFolderError] = useState("");

  function updateDirectory(value: string) {
    setDirectory(value);
    setFolderError("");
    if (!projectName.trim()) {
      setProjectName(deriveProjectNameFromDirectory(value));
    }
  }

  function chooseProjectFolder() {
    setFolderError("Browser folder picker cannot expose a full local path here. Paste the absolute path instead.");
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="project-dialog" role="dialog" aria-modal="true" aria-labelledby="project-title">
        <div className="setup-header">
          <div>
            <div className="eyebrow">Project Scope</div>
            <h2 id="project-title">{isEditing ? "Rename project" : "Create project"}</h2>
            <p>{isEditing ? "Keep the namespace stable while changing the label." : "Keep conversations, runs, tasks, and artifacts isolated."}</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close project dialog">
            <XCircle size={18} />
          </button>
        </div>

        <form className="setup-form" onSubmit={onSaveProject}>
          <label>
            Project directory
            <div className="folder-picker-row">
              <input
                name="directory"
                value={directory}
                placeholder="Paste a local path or browse"
                onChange={(event) => updateDirectory(event.currentTarget.value)}
              />
              <button type="button" className="secondary-button folder-picker-button" onClick={chooseProjectFolder}>
                <Folder size={16} />
                Browse
              </button>
            </div>
            <span>{folderError || "Used as the local workspace reference for this project."}</span>
          </label>
          <label>
            Project name
            <input
              name="name"
              value={projectName}
              placeholder="Auto from folder if empty"
              onChange={(event) => setProjectName(event.currentTarget.value)}
              autoFocus={!isEditing}
            />
            <span>{isEditing ? `Namespace stays ${project?.namespace}.` : "Used in the sidebar and project namespace."}</span>
          </label>
          <label>
            Description
            <input name="description" defaultValue={project?.description ?? ""} />
            <span>Optional short context for this workspace.</span>
          </label>
          {error ? <div className="form-error">{error}</div> : null}
          <div className="setup-actions">
            <button type="button" className="secondary-button" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="primary-button">
              {isEditing ? "Save changes" : "Create project"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function ConfirmDialog({
  action,
  agents,
  projects,
  onCancel,
  onConfirm,
}: {
  action: ConfirmAction;
  agents: AgentInstance[];
  projects: Project[];
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const project = action.kind === "delete-project" ? projects.find((item) => item.id === action.projectId) : undefined;
  const agent = action.kind === "delete-agent" ? agents.find((item) => item.id === action.agentId) : undefined;
  const title = action.kind === "delete-project" ? "Delete project" : "Delete agent";
  const targetName = project?.name ?? agent?.name ?? "this item";
  const body =
    action.kind === "delete-project"
      ? "This removes the project and its conversations, messages, runs, tasks, and artifacts from local storage."
      : "This removes the agent from the registry. Existing project history stays in place.";

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
        <div className="setup-header">
          <div>
            <div className="eyebrow">Confirm</div>
            <h2 id="confirm-title">{title}</h2>
            <p>{targetName}</p>
          </div>
          <button className="icon-button" onClick={onCancel} aria-label="Close confirmation">
            <XCircle size={18} />
          </button>
        </div>
        <p className="confirm-copy">{body}</p>
        <div className="setup-actions">
          <button type="button" className="secondary-button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="danger-action-button" onClick={onConfirm}>
            Delete
          </button>
        </div>
      </section>
    </div>
  );
}
