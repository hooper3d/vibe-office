import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Bot,
  CheckCircle2,
  ChevronDown,
  Copy,
  Download,
  Eye,
  CircleHelp,
  ExternalLink,
  FileText,
  Folder,
  Globe2,
  KeyRound,
  Loader2,
  MapPin,
  MessageSquare,
  Moon,
  Pencil,
  Paperclip,
  Plus,
  RefreshCw,
  Search,
  Server,
  Settings,
  Sparkles,
  Sun,
  Tags,
  Trash2,
  UserRound,
  UserRoundCog,
  X,
  XCircle,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, PointerEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { A2APart, A2ATask, A2ATaskState } from "./domain/a2a";
import { createAgentFromHermesSetup } from "./domain/hermesSetup";
import {
  conversationMessages,
  conversations as seedConversations,
  projectArtifacts,
  projectRuns,
  projectTasks,
  projects as seedProjects,
} from "./domain/seedData";
import type { Conversation, ConversationMessage, ProjectArtifact, ProjectRun, ProjectTask, WorkState } from "./domain/projectScope";
import {
  failRunById,
  failRunForMessage,
  failTaskRoomTaskForMessage,
  markConversationMessageFailed,
  markConversationMessageSending,
  markConversationMessageSent,
} from "./domain/requestLifecycle";
import type { AgentInstance, AgentOfficeRole, AgentRuntimeProvider, AgentStatus, Project } from "./domain/types";
import { loadConfiguredAgents, saveConfiguredAgents } from "./services/agentStorage";
import { executeFreeChatRequest, executeProjectAgentRequest } from "./services/agentRequestExecutor";
import { createAgentMessageFromTask, extractA2ATaskText, getA2ATaskTimestamp, isDirectMessageResponse } from "./services/agentTaskResult";
import { HermesA2AAdapter, type ChatHistoryMessage, type HermesConnectionTestResult } from "./services/hermesA2AAdapter";
import { loadWorkspaceState, saveWorkspaceState } from "./services/workspaceStorage";
import {
  listWorkspaceFiles,
  mediaFileUrl,
  readWorkspaceFile,
  searchWorkspaceFiles,
  type WorkspaceFileAttachment,
  type WorkspaceFileEntry,
  type WorkspaceFileListResult,
  type WorkspaceFileReadResult,
  type WorkspaceFileSearchMatch,
} from "./services/workspaceFileClient";

type OutputMode = "workspace" | "browser" | "runs" | "artifacts";
type ConversationMode = "single" | "task-room";
type ChatScope = "free" | "project";
type ConnectionTestState = "idle" | "running" | "passed" | "failed";
type ThemeMode = "dark" | "light";
type ParticipantTaskResult = {
  agentId: string;
  agentName: string;
  state: WorkState;
  summary: string;
};
type A2ACompatibilityMetadata = Pick<
  AgentInstance,
  | "a2aLastCompatibilityCheckAt"
  | "a2aProtocolVersion"
  | "a2aSelectedInterface"
  | "a2aSupportedInterfaces"
  | "a2aTransportBinding"
  | "supportsCancel"
  | "supportsTaskLifecycle"
>;
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

const THEME_STORAGE_KEY = "vibe-office.theme";
const UI_STATE_STORAGE_KEY = "vibe-office.ui.v1";
const FREE_CHAT_ENTRY_PROJECT_ID = "default";
const FREE_CHAT_PROJECT_ID = "__free_chat__";
const FREE_CHAT_NAMESPACE = "free-chat";
const MAX_AVATAR_BYTES = 512 * 1024;
const NON_CAPABILITY_TAGS = ["local", "hermes", "runtime"];
const CAPABILITY_TAG_OPTIONS = [
  "drafts",
  "releases",
  "summaries",
  "editing",
  "artifacts",
  "browser",
  "code",
  "planning",
];
const OFFICE_ROLE_OPTIONS: Array<{ label: string; value: AgentOfficeRole }> = [
  { label: "Chief", value: "chief" },
  { label: "Builder", value: "builder" },
  { label: "Writer", value: "writer" },
  { label: "Operator", value: "operator" },
];

type StoredUiState = {
  selectedAgentId?: string;
  selectedProjectId?: string;
  chatScope?: ChatScope;
  conversationMode?: ConversationMode;
  outputMode?: OutputMode;
};

function loadUiState(): StoredUiState {
  if (typeof window === "undefined") return {};

  try {
    const raw = window.localStorage.getItem(UI_STATE_STORAGE_KEY);
    if (!raw) return {};

    const parsed = JSON.parse(raw) as StoredUiState;
    return {
      selectedAgentId: typeof parsed.selectedAgentId === "string" ? parsed.selectedAgentId : undefined,
      selectedProjectId: typeof parsed.selectedProjectId === "string" ? parsed.selectedProjectId : undefined,
      chatScope: parsed.chatScope === "project" ? "project" : parsed.chatScope === "free" ? "free" : undefined,
      conversationMode: parsed.conversationMode === "task-room" ? "task-room" : parsed.conversationMode === "single" ? "single" : undefined,
      outputMode: ["workspace", "browser", "runs", "artifacts"].includes(parsed.outputMode ?? "") ? parsed.outputMode : undefined,
    };
  } catch {
    return {};
  }
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
  const [outputMode, setOutputMode] = useState<OutputMode>(initialUiState.outputMode ?? "workspace");
  const [messageText, setMessageText] = useState("");
  const [browserUrl, setBrowserUrl] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [attachedWorkspaceFiles, setAttachedWorkspaceFiles] = useState<WorkspaceFileAttachment[]>([]);
  const [taskParticipantIds, setTaskParticipantIds] = useState<string[]>([]);
  const [isComposerSubmitting, setIsComposerSubmitting] = useState(false);
  const [taskLifecycleBusyId, setTaskLifecycleBusyId] = useState("");
  const composerSubmittingRef = useRef(false);
  const activeRequestMessageIdsRef = useRef(new Set<string>());
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
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    if (typeof window === "undefined") return "dark";
    return window.localStorage.getItem(THEME_STORAGE_KEY) === "light" ? "light" : "dark";
  });

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
  const currentConversation = useMemo(() => {
    if (!selectedAgent) return undefined;
    return conversations.find(
      (conversation) =>
        conversation.projectId === directConversationProjectId &&
        conversation.mode === "direct" &&
        conversation.primaryAgentId === selectedAgent.id,
    );
  }, [conversations, directConversationProjectId, selectedAgent]);
  const currentMessages = useMemo(() => {
    if (!currentConversation) return [];
    return messages.filter((message) => message.conversationId === currentConversation.id);
  }, [currentConversation, messages]);
  const currentConversationHasPendingRequest = useMemo(
    () => currentMessages.some((message) => message.role === "user" && message.status === "sending"),
    [currentMessages],
  );
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
    saveConfiguredAgents(agents);
  }, [agents]);

  useEffect(() => {
    window.localStorage.setItem(
      UI_STATE_STORAGE_KEY,
      JSON.stringify({
        selectedAgentId,
        selectedProjectId,
        chatScope,
        conversationMode,
        outputMode,
      }),
    );
  }, [chatScope, conversationMode, outputMode, selectedAgentId, selectedProjectId]);

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
    const pendingMessages = messages.filter(
      (message) =>
        message.role === "user" &&
        message.status === "sending" &&
        !activeRequestMessageIdsRef.current.has(message.id),
    );
    if (pendingMessages.length === 0) return;

    pendingMessages.forEach((message) => {
      const conversation = conversations.find((item) => item.id === message.conversationId);
      if (!conversation) {
        markInterruptedMessageFailed(message, "Conversation no longer exists. Please resend this message.");
        return;
      }

      if (conversation.mode !== "direct") {
        markTaskRoomMessageFailed(message, "Task Room was interrupted before the agent returned. You can retry this request.");
        return;
      }

      const agent = agents.find((item) => item.id === conversation.primaryAgentId);
      if (!agent) {
        markInterruptedMessageFailed(message, "Agent no longer exists. Please resend this message after reconnecting the agent.");
        return;
      }

      const text = getTextPartContent(message.contentParts).trim();
      if (!text) {
        markInterruptedMessageFailed(message, "Message content could not be restored. Please resend it.");
        return;
      }

      activeRequestMessageIdsRef.current.add(message.id);

      if (conversation.projectId === FREE_CHAT_PROJECT_ID) {
        void completeFreeChatRequest({
          conversation,
          targetAgent: agent,
          userMessageId: message.id,
          text,
        }).finally(() => {
          activeRequestMessageIdsRef.current.delete(message.id);
        });
        return;
      }

      const project = projects.find((item) => item.id === conversation.projectId);
      if (!project) {
        activeRequestMessageIdsRef.current.delete(message.id);
        markInterruptedMessageFailed(message, "Project no longer exists. Please resend this message.");
        return;
      }

      void resumeProjectDirectRequest({
        message,
        conversation,
        project,
        targetAgent: agent,
        text,
      }).finally(() => {
        activeRequestMessageIdsRef.current.delete(message.id);
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
    window.localStorage.setItem(THEME_STORAGE_KEY, themeMode);
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
      const remoteTask = await new HermesA2AAdapter({ agent: owner }).getProjectTask(address.taskId, address.contextId);
      applyLifecycleTaskUpdate(task, remoteTask, owner.id, "Task status refreshed.");
    } catch (error) {
      recordLifecycleUnsupported(task, error instanceof Error ? error.message : "Task lifecycle refresh is unsupported.");
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
      const remoteTask = await new HermesA2AAdapter({ agent: owner }).cancelProjectTask(address.taskId, address.contextId);
      applyLifecycleTaskUpdate(task, remoteTask, owner.id, "Task cancel requested.");
    } catch (error) {
      recordCancelUnsupported(task, error instanceof Error ? error.message : "Task cancel is unsupported by this provider.");
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
      const remoteTask = await new HermesA2AAdapter({ agent: owner }).sendProjectMessage(
        taskProject,
        ["Retry this failed project task.", "", `Task title: ${task.title}`, "", "Previous failure:", task.summary].join("\n"),
      );
      applyLifecycleTaskUpdate(task, remoteTask, owner.id, "Retry returned a task update.");
      return mapA2AState(remoteTask.status.state) !== "failed";
    } catch (error) {
      const failedAt = new Date().toISOString();
      setTasks((current) =>
        current.map((item) =>
          item.id === task.id
            ? {
                ...item,
                state: "failed",
                summary: error instanceof Error ? error.message : "Retry failed.",
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
      const result = await new HermesA2AAdapter({ agent, apiKey }).testConnection();

      setTestState("passed");
      setLastConnectionMetadata(createA2ACompatibilityMetadata(result));
      setTestMessage(`${result.card.name || agent.name} provider connection verified.`);
    } catch (error) {
      setTestState("failed");
      setLastConnectionMetadata(null);
      setTestMessage(error instanceof Error ? error.message : "Unable to verify provider connection.");
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

    if (setupAgentId) {
      setAgents((current) =>
        current.map((agent) =>
          agent.id === setupAgentId
            ? {
                ...agent,
                ...newAgent,
                id: agent.id,
                apiKey: newAgent.apiKey ?? agent.apiKey,
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
      setAgents((current) =>
        current.map((agent) =>
          agent.id === duplicateAgent.id
            ? {
                ...agent,
                ...newAgent,
                id: agent.id,
                apiKey: newAgent.apiKey ?? agent.apiKey,
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

    setAgents((current) => {
      const addedAgent = { ...newAgent, ...(lastConnectionMetadata ?? {}), isChief: newAgent.officeRole === "chief" };
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

  function markInterruptedMessageFailed(message: ConversationMessage, reason: string) {
    setMessages((current) => markConversationMessageFailed(current, message.id, reason));
  }

  function markTaskRoomMessageFailed(message: ConversationMessage, reason: string) {
    const failedAt = new Date().toISOString();
    markInterruptedMessageFailed(message, reason);

    setTasks((current) => failTaskRoomTaskForMessage(current, message, reason, failedAt));
    setRuns((current) => failRunForMessage(current, message, failedAt));
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
    try {
      const chatHistory = buildChatCompletionHistory(messages, conversation.id, userMessageId);
      const result = await executeFreeChatRequest({
        agent: targetAgent,
        text,
        history: chatHistory,
      });

      setMessages((current) => markConversationMessageSent(current, userMessageId));

      setMessages((current) => [
        ...current,
        createAgentMessageFromTask({
          task: result.task,
          conversationId: conversation.id,
          projectId: FREE_CHAT_PROJECT_ID,
          agentId: targetAgent.id,
          fallbackText: result.summary,
          createdAt: result.completedAt,
        }),
      ]);
      setConversations((current) =>
        current.map((item) =>
          item.id === conversation.id
            ? {
                ...item,
                updatedAt: result.completedAt,
              }
            : item,
        ),
      );
    } catch (error) {
      setMessages((current) => markConversationMessageFailed(current, userMessageId, getUserFacingAgentError(error)));
    }
  }

  async function submitFreeChatMessage(text: string) {
    if (!selectedAgent) return;

    const targetAgent = selectedAgent;
    const now = new Date().toISOString();
    const existingConversation = conversations.find(
      (item) =>
        item.projectId === FREE_CHAT_PROJECT_ID &&
        item.mode === "direct" &&
        item.primaryAgentId === targetAgent.id,
    );
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
    const userMessage: ConversationMessage = {
      id: userMessageId,
      conversationId: conversation.id,
      projectId: FREE_CHAT_PROJECT_ID,
      role: "user",
      contentParts: createTextParts(text),
      status: "sending",
      createdAt: now,
    };

    if (!existingConversation) {
      setConversations((current) => [conversation, ...current]);
    }
    activeRequestMessageIdsRef.current.add(userMessageId);
    setMessages((current) => [...current, userMessage]);
    setMessageText("");
    setAttachedWorkspaceFiles([]);

    try {
      await completeFreeChatRequest({ conversation, targetAgent, userMessageId, text });
    } finally {
      activeRequestMessageIdsRef.current.delete(userMessageId);
    }
  }

  async function retryDirectMessage(messageId: string) {
    const message = messages.find((item) => item.id === messageId);
    if (!message || message.role !== "user" || message.status !== "failed") return;

    const conversation = conversations.find((item) => item.id === message.conversationId);
    if (!conversation || conversation.mode !== "direct") return;

    const targetAgent = agents.find((item) => item.id === conversation.primaryAgentId);
    if (!targetAgent) {
      markInterruptedMessageFailed(message, "Agent no longer exists. Please reconnect the agent before retrying.");
      return;
    }

    const text = getTextPartContent(message.contentParts).trim();
    if (!text) {
      markInterruptedMessageFailed(message, "Message content could not be restored. Please send a new message.");
      return;
    }

    activeRequestMessageIdsRef.current.add(message.id);
    setMessages((current) =>
      markConversationMessageSending(
        current.filter(
          (item) =>
            !(
              item.role === "system" &&
              item.conversationId === message.conversationId &&
              item.createdAt >= message.createdAt &&
              (message.runId ? item.runId === message.runId : item.agentId === targetAgent.id)
            ),
        ),
        message.id,
      ),
    );

    try {
      if (conversation.projectId === FREE_CHAT_PROJECT_ID) {
        await completeFreeChatRequest({
          conversation,
          targetAgent,
          userMessageId: message.id,
          text,
        });
        return;
      }

      const project = projects.find((item) => item.id === conversation.projectId);
      if (!project) {
        markInterruptedMessageFailed(message, "Project no longer exists. Please send a new message.");
        return;
      }

      await resumeProjectDirectRequest({
        message,
        conversation,
        project,
        targetAgent,
        text,
      });
    } finally {
      activeRequestMessageIdsRef.current.delete(message.id);
    }
  }

  async function retryTaskRoomMessage(messageId: string) {
    const message = messages.find((item) => item.id === messageId);
    if (!message || message.role !== "user" || message.status !== "failed" || !message.taskId) return;

    const conversation = conversations.find((item) => item.id === message.conversationId);
    if (!conversation || conversation.mode !== "task_room") return;

    activeRequestMessageIdsRef.current.add(message.id);
    setMessages((current) => markConversationMessageSending(current, message.id));

    try {
      const succeeded = await retryTaskLifecycle(message.taskId);
      setMessages((current) =>
        succeeded
          ? markConversationMessageSent(current, message.id)
          : markConversationMessageFailed(current, message.id, "Retry failed. Check the task activity for details."),
      );
    } finally {
      activeRequestMessageIdsRef.current.delete(message.id);
    }
  }

  async function restoreWorkspaceAttachments(project: Project, message: ConversationMessage) {
    const references = message.workspaceContext ?? [];
    if (references.length === 0) return [];
    if (!project.directory) {
      throw new Error("Project directory is not available.");
    }

    const restoredFiles = await Promise.all(
      references.map(async (reference) => {
        const file = await readWorkspaceFile(project.directory ?? "", reference.path);
        return {
          path: file.path,
          content: file.content,
          size: file.size,
          updatedAt: file.updatedAt,
          attachedAt: reference.attachedAt,
        };
      }),
    );

    return restoredFiles;
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
    let restoredFiles: WorkspaceFileAttachment[] = [];

    try {
      restoredFiles = await restoreWorkspaceAttachments(project, message);
    } catch {
      markInterruptedMessageFailed(message, "Workspace files from the interrupted request could not be restored. Please resend it.");
      return;
    }

    const runId = message.runId ?? crypto.randomUUID();
    const participantAgentIds = [targetAgent.id];
    const existingRun = runs.find((run) => run.id === runId);
    if (!existingRun) {
      const now = new Date().toISOString();
      setRuns((current) => [
        {
          id: runId,
          projectId: project.id,
          conversationId: conversation.id,
          type: "direct_message",
          ownerAgentId: targetAgent.id,
          participantAgentIds,
          state: "submitting",
          eventIds: [`${runId}-restored`],
          artifactIds: [],
          createdAt: message.createdAt,
          updatedAt: now,
        },
        ...current,
      ]);
    }

    await completeProjectDirectRequest({
      project,
      conversation,
      targetAgent,
      userMessageId: message.id,
      runId,
      participantAgentIds,
      text,
      agentRequestText: buildAgentRequestText(text, project, restoredFiles),
    });
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
    try {
      const chatHistory = buildChatCompletionHistory(messages, conversation.id, userMessageId);
      const result = await executeProjectAgentRequest({
        agent: targetAgent,
        project,
        text: agentRequestText,
        history: chatHistory,
        fallbackSummary: `${targetAgent.name} returned a task update.`,
      });
      const remoteTask = result.task;
      const responseSummary = result.summary;
      const completedAt = result.completedAt;
      const mediaArtifact = createMediaArtifactFromText({
        projectId: project.id,
        taskId: remoteTask.id || runId,
        agentId: targetAgent.id,
        name: `${targetAgent.name} media`,
        text: responseSummary,
        createdAt: completedAt,
      });
      const returnedArtifacts = [
        ...mapA2AArtifacts(remoteTask, project.id, targetAgent.id),
        ...(mediaArtifact ? [mediaArtifact] : []),
      ];
      const returnedArtifactIds = returnedArtifacts.map((artifact) => artifact.id);
      const mappedState = mapA2AState(remoteTask.status.state);
      const shouldCreateTask = !isDirectMessageResponse(remoteTask);
      const taskId = shouldCreateTask ? remoteTask.id || crypto.randomUUID() : undefined;

      setMessages((current) => markConversationMessageSent(current, userMessageId, { runId }));

      if (responseSummary) {
        const agentMessage = createAgentMessageFromTask({
          task: remoteTask,
          conversationId: conversation.id,
          projectId: project.id,
          agentId: targetAgent.id,
          fallbackText: responseSummary,
          taskId,
          runId,
          createdAt: completedAt,
        });
        setMessages((current) => [...current, agentMessage]);
      }

      if (returnedArtifacts.length > 0) {
        setArtifacts((current) => [...returnedArtifacts, ...current]);
        setOutputMode("artifacts");
      }

      if (shouldCreateTask && taskId) {
        const projectTask: ProjectTask = {
          id: taskId,
          projectId: project.id,
          contextId: remoteTask.contextId || project.namespace,
          remoteTaskId: remoteTask.id || taskId,
          remoteContextId: remoteTask.contextId || project.namespace,
          title: text.length > 56 ? `${text.slice(0, 56)}...` : text,
          ownerAgentId: targetAgent.id,
          participantAgentIds,
          state: mappedState,
          summary: responseSummary,
          events: [
            {
              id: `${taskId}-accepted`,
              taskId,
              agentId: targetAgent.id,
              label: "Agent returned a task.",
              state: mappedState,
              timestamp: completedAt,
            },
          ],
          artifactIds: returnedArtifactIds,
          updatedAt: completedAt,
        };
        setTasks((current) => [projectTask, ...current.filter((task) => task.id !== taskId)]);
        setOutputMode("runs");
      }

      setRuns((current) =>
        current.map((run) =>
          run.id === runId
            ? {
                ...run,
                taskId,
                state: mappedState,
                eventIds: mergeIds(run.eventIds, [`${runId}-completed`]),
                artifactIds: returnedArtifactIds,
                updatedAt: completedAt,
              }
            : run,
        ),
      );
      setConversations((current) =>
        current.map((item) =>
          item.id === conversation.id
            ? {
                ...item,
                updatedAt: completedAt,
              }
            : item,
        ),
      );
    } catch (error) {
      const failedAt = new Date().toISOString();
      const errorText = getUserFacingAgentError(error);
      setMessages((current) => markConversationMessageFailed(current, userMessageId, errorText, { runId }));
      setRuns((current) => failRunById(current, runId, failedAt));
      setOutputMode("runs");
    }
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
        eventIds: [`${runId}-submitted`],
        artifactIds: [],
        createdAt: now,
        updatedAt: now,
      };

      if (!existingConversation) {
        setConversations((current) => [conversation, ...current]);
      }
      activeRequestMessageIdsRef.current.add(userMessageId);
      setMessages((current) => [...current, userMessage]);
      setRuns((current) => [optimisticRun, ...current]);
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
        activeRequestMessageIdsRef.current.delete(userMessageId);
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
    const taskFiles = [...attachedWorkspaceFiles];
    const workspaceContext = taskFiles.map((file) => ({
      path: file.path,
      size: file.size,
      attachedAt: file.attachedAt,
    }));
    const chiefRequestText = buildChiefTaskRequestText(text, selectedWorkspaceProject, targetAgent, participants, taskFiles);
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
      eventIds: [`${runId}-submitted`],
      artifactIds: [],
      createdAt: now,
      updatedAt: now,
    };

    if (!existingConversation) {
      setConversations((current) => [conversation, ...current]);
    }
    setMessages((current) => [...current, userMessage]);
    setTasks((current) => [projectTask, ...current.filter((task) => task.id !== taskId)]);
    setRuns((current) => [projectRun, ...current]);
    setMessageText("");
    setAttachedWorkspaceFiles([]);
    setOutputMode("runs");

    const taskArtifactIds: string[] = [];

    try {
      const chiefPlanTask = await new HermesA2AAdapter({ agent: targetAgent }).sendProjectMessage(selectedWorkspaceProject, chiefRequestText);
      const chiefPlan = extractA2ATaskText(chiefPlanTask) ?? `${targetAgent.name} returned a Chief task plan.`;
      const chiefPlanAt = getA2ATaskTimestamp(chiefPlanTask);

      setMessages((current) => markConversationMessageSent(current, userMessageId));

      const agentMessage = createAgentMessageFromTask({
        task: chiefPlanTask,
        conversationId: conversation.id,
        projectId: selectedWorkspaceProject.id,
        agentId: targetAgent.id,
        fallbackText: chiefPlan,
        taskId,
        runId,
        createdAt: chiefPlanAt,
      });
      setMessages((current) => [...current, agentMessage]);

      const chiefMediaArtifact = createMediaArtifactFromText({
        projectId: selectedWorkspaceProject.id,
        taskId,
        agentId: targetAgent.id,
        name: "Chief media",
        text: chiefPlan,
        createdAt: chiefPlanAt,
      });
      if (chiefMediaArtifact) {
        taskArtifactIds.push(chiefMediaArtifact.id);
        setArtifacts((current) => [chiefMediaArtifact, ...current]);
        setOutputMode("artifacts");
      }

      setTasks((current) =>
        current.map((task) =>
          task.id === taskId
            ? {
                ...task,
                state: "working",
                summary: "Chief plan ready. Delegating to selected participants.",
                events: [
                  ...task.events,
                  {
                    id: `${taskId}-chief-response`,
                    taskId,
                    agentId: targetAgent.id,
                    label: "Chief returned the first task-room plan.",
                    state: "working",
                    timestamp: chiefPlanAt,
                  },
                ],
                artifactIds: [...taskArtifactIds],
                updatedAt: chiefPlanAt,
              }
            : task,
        ),
      );
      setRuns((current) =>
        current.map((run) =>
          run.id === runId
            ? {
                ...run,
                state: "working",
                eventIds: [...run.eventIds, `${runId}-chief-response`],
                artifactIds: [...taskArtifactIds],
                updatedAt: chiefPlanAt,
              }
            : run,
        ),
      );

      const participantResults: ParticipantTaskResult[] = [];

      for (const participant of participants) {
        const delegatedAt = new Date().toISOString();
        setTasks((current) =>
          current.map((task) =>
            task.id === taskId
              ? {
                  ...task,
                  state: "working",
                  summary: `Delegated to ${participant.name}.`,
                  events: [
                    ...task.events,
                    {
                      id: `${taskId}-${participant.id}-delegated`,
                      taskId,
                      agentId: participant.id,
                      label: `Delegated to ${participant.name}.`,
                      state: "submitted",
                      timestamp: delegatedAt,
                    },
                  ],
                  updatedAt: delegatedAt,
                }
              : task,
          ),
        );

        let participantSummary = "";
        let participantState: WorkState = "completed";
        let participantAt = new Date().toISOString();

        try {
          const participantTask = await new HermesA2AAdapter({ agent: participant }).sendProjectMessage(
            selectedWorkspaceProject,
            buildParticipantTaskRequestText(text, selectedWorkspaceProject, targetAgent, participant, chiefPlan, taskFiles),
          );
          participantSummary = extractA2ATaskText(participantTask) ?? `${participant.name} returned a task result.`;
          participantState = mapA2AState(participantTask.status.state);
          participantAt = participantTask.status.timestamp ?? participantAt;
        } catch (error) {
          participantState = "failed";
          participantSummary = error instanceof Error ? error.message : `${participant.name} task failed.`;
          participantAt = new Date().toISOString();
        }

        const participantArtifact = createTextArtifact({
          projectId: selectedWorkspaceProject.id,
          taskId,
          agentId: participant.id,
          name: `${participant.name} result`,
          text: participantSummary,
          createdAt: participantAt,
        });
        taskArtifactIds.push(participantArtifact.id);
        participantResults.push({
          agentId: participant.id,
          agentName: participant.name,
          state: participantState,
          summary: participantSummary,
        });
        setArtifacts((current) => [participantArtifact, ...current]);
        setTasks((current) =>
          current.map((task) =>
            task.id === taskId
              ? {
                  ...task,
                  state: "working",
                  summary: `${participant.name} returned a result.`,
                  events: [
                    ...task.events,
                    {
                      id: `${taskId}-${participant.id}-result`,
                      taskId,
                      agentId: participant.id,
                      label: participantState === "failed" ? `${participant.name} failed.` : `${participant.name} returned a result.`,
                      state: participantState,
                      timestamp: participantAt,
                    },
                  ],
                  artifactIds: [...taskArtifactIds],
                  updatedAt: participantAt,
                }
              : task,
          ),
        );
      }

      const aggregateRequestText = buildChiefAggregationRequestText(text, selectedWorkspaceProject, targetAgent, chiefPlan, participantResults, taskFiles);
      let finalSummary = "";
      let finalState: WorkState = "completed";
      let finalAt = new Date().toISOString();

      try {
        const aggregateTask = await new HermesA2AAdapter({ agent: targetAgent }).sendProjectMessage(selectedWorkspaceProject, aggregateRequestText);
        finalSummary = extractA2ATaskText(aggregateTask) ?? `${targetAgent.name} aggregated the participant results.`;
        finalState = mapA2AState(aggregateTask.status.state);
        finalAt = getA2ATaskTimestamp(aggregateTask);
        const aggregateMessage = createAgentMessageFromTask({
          task: aggregateTask,
          conversationId: conversation.id,
          projectId: selectedWorkspaceProject.id,
          agentId: targetAgent.id,
          fallbackText: finalSummary,
          taskId,
          runId,
          createdAt: finalAt,
        });
        setMessages((current) => [...current, aggregateMessage]);
      } catch (error) {
        finalState = "failed";
        finalSummary = getUserFacingAgentError(error);
        finalAt = new Date().toISOString();
        setMessages((current) => markConversationMessageFailed(current, userMessageId, finalSummary));
      }

      const finalArtifact = createTextArtifact({
        projectId: selectedWorkspaceProject.id,
        taskId,
        agentId: targetAgent.id,
        name: "Chief summary",
        text: finalSummary,
        createdAt: finalAt,
      });
      const finalArtifactIds = [...taskArtifactIds, finalArtifact.id];
      setArtifacts((current) => [finalArtifact, ...current]);
      setTasks((current) =>
        current.map((task) =>
          task.id === taskId
            ? {
                ...task,
                state: finalState,
                summary: finalSummary,
                events: [
                  ...task.events,
                  {
                    id: `${taskId}-chief-aggregate`,
                    taskId,
                    agentId: targetAgent.id,
                    label: finalState === "failed" ? "Chief aggregation failed." : "Chief aggregated participant results.",
                    state: finalState,
                    timestamp: finalAt,
                  },
                ],
                artifactIds: finalArtifactIds,
                updatedAt: finalAt,
              }
            : task,
        ),
      );
      setRuns((current) =>
        current.map((run) =>
          run.id === runId
            ? {
                ...run,
                state: finalState,
                eventIds: [...run.eventIds, `${runId}-completed`],
                artifactIds: finalArtifactIds,
                updatedAt: finalAt,
              }
            : run,
        ),
      );
      setConversations((current) =>
        current.map((item) =>
          item.id === conversation.id
            ? {
                ...item,
                participantAgentIds,
                updatedAt: finalAt,
              }
            : item,
        ),
      );
      setOutputMode(finalArtifactIds.length > 0 ? "artifacts" : "runs");
    } catch (error) {
      const failedAt = new Date().toISOString();
      const errorMessage = getUserFacingAgentError(error);
      setMessages((current) => markConversationMessageFailed(current, userMessageId, errorMessage));
      setTasks((current) =>
        current.map((task) =>
          task.id === taskId
            ? {
                ...task,
                state: "failed",
                summary: errorMessage,
                events: [
                  ...task.events,
                  {
                    id: `${taskId}-failed`,
                    taskId,
                    agentId: targetAgent.id,
                    label: "Chief task request failed.",
                    state: "failed",
                    timestamp: failedAt,
                  },
                ],
                updatedAt: failedAt,
              }
            : task,
        ),
      );
      setRuns((current) => failRunById(current, runId, failedAt));
      setOutputMode("runs");
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
                        <StatusDot status={agent.status} />
                        {agent.tags.slice(0, 2).join(" / ")}
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
                  disabled={isComposerSubmitting}
                />
                <button
                  className="primary-icon-button composer-send-button"
                  type="submit"
                  aria-label="Send message"
                  disabled={
                    isComposerSubmitting ||
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
                  <TabButton active={outputMode === "runs"} onClick={() => setOutputMode("runs")}>
                    Tasks
                  </TabButton>
                  <TabButton active={outputMode === "artifacts"} onClick={() => setOutputMode("artifacts")}>
                    Artifacts
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
                {outputMode === "runs" ? (
                  <ProjectTasks
                    agents={agents}
                    runs={scopedRuns}
                    tasks={scopedTasks}
                    artifacts={scopedArtifacts}
                    busyActionId={taskLifecycleBusyId}
                    onCancelTask={cancelTaskLifecycle}
                    onRefreshTask={refreshTaskLifecycle}
                    onRetryTask={retryTaskLifecycle}
                  />
                ) : null}
                {outputMode === "artifacts" ? (
                  <ProjectArtifacts agents={agents} artifacts={scopedArtifacts} />
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

function mapA2AArtifacts(task: A2ATask, projectId: string, agentId: string): ProjectArtifact[] {
  return (task.artifacts ?? []).map((artifact, index) => {
    const text = artifact.parts.find((part) => part.kind === "text")?.text;
    const contentParts = addMediaPartsToParts(artifact.parts);
    const hasFile = contentParts.some((part) => part.kind === "file");
    return {
      id: artifact.artifactId ?? `${task.id}-artifact-${index}`,
      projectId,
      taskId: task.id,
      agentId,
      name: artifact.name ?? `Artifact ${index + 1}`,
      kind: hasFile ? "file" : text ? "text" : "json",
      summary: artifact.description ?? text ?? "Artifact returned by the agent.",
      contentParts,
      createdAt: task.status.timestamp ?? new Date().toISOString(),
    };
  });
}

function createTextArtifact({
  projectId,
  taskId,
  agentId,
  name,
  text,
  createdAt,
}: {
  projectId: string;
  taskId: string;
  agentId: string;
  name: string;
  text: string;
  createdAt: string;
}): ProjectArtifact {
  const contentParts = createMediaAwareParts(text);
  return {
    id: crypto.randomUUID(),
    projectId,
    taskId,
    agentId,
    name,
    kind: getImageFileParts(contentParts).length > 0 ? "file" : "text",
    summary: text,
    contentParts,
    createdAt,
  };
}

function createMediaArtifactFromText({
  projectId,
  taskId,
  agentId,
  name,
  text,
  createdAt,
}: {
  projectId: string;
  taskId: string;
  agentId: string;
  name: string;
  text: string;
  createdAt: string;
}) {
  if (extractMediaReferences(text).length === 0) return undefined;
  return createTextArtifact({ projectId, taskId, agentId, name, text, createdAt });
}

function createBackfilledMediaArtifacts(messages: ConversationMessage[]) {
  return messages.flatMap((message) => {
    if (message.role !== "agent" || !message.agentId || !message.taskId) return [];

    const text = getPartText(message.contentParts);
    return extractMediaReferences(text).map((reference, index) => ({
      runId: message.runId,
      artifact: {
        id: `${message.id}-media-${index}`,
        projectId: message.projectId,
        taskId: message.taskId ?? message.runId ?? message.id,
        agentId: message.agentId ?? "",
        name: index === 0 ? "Generated media" : `Generated media ${index + 1}`,
        kind: "file" as const,
        summary: text,
        contentParts: createMediaAwareParts(text),
        createdAt: message.createdAt,
      },
    }));
  });
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

function createTextParts(text: string): A2APart[] {
  return [
    {
      kind: "text",
      text,
    },
  ];
}

function createMediaAwareParts(text: string): A2APart[] {
  return addMediaPartsToParts(createTextParts(text));
}

function addMediaPartsToParts(parts: A2APart[]) {
  const mediaParts = parts.flatMap((part) => (part.kind === "text" ? createMediaFileParts(part.text) : []));
  if (mediaParts.length === 0) return parts;

  const existingUris = new Set(
    parts.flatMap((part) => (part.kind === "file" && part.file.uri ? [part.file.uri] : [])),
  );
  const uniqueMediaParts = mediaParts.filter((part) => part.file.uri && !existingUris.has(part.file.uri));
  return uniqueMediaParts.length > 0 ? [...parts, ...uniqueMediaParts] : parts;
}

function createMediaFileParts(text: string): Extract<A2APart, { kind: "file" }>[] {
  return extractMediaReferences(text).map((reference) => ({
    kind: "file",
    file: {
      name: reference.name,
      mimeType: reference.mimeType,
      uri: mediaFileUrl(reference.path),
    },
  }));
}

function extractMediaReferences(text: string) {
  const references: Array<{ path: string; name: string; mimeType: string }> = [];
  const seen = new Set<string>();
  const mediaLinePattern = /(?:^|\s)MEDIA:\s*([^\r\n]+)/gi;
  let match: RegExpExecArray | null;

  while ((match = mediaLinePattern.exec(text)) !== null) {
    const mediaPath = cleanMediaPath(match[1]);
    const mimeType = getImageMimeTypeFromPath(mediaPath);
    if (!mediaPath || !mimeType || seen.has(mediaPath)) continue;

    seen.add(mediaPath);
    references.push({
      path: mediaPath,
      name: getFileNameFromPath(mediaPath),
      mimeType,
    });
  }

  return references;
}

function cleanMediaPath(value: string) {
  const [pathToken = ""] = value.trim().split(/\s+/);
  return pathToken
    .trim()
    .replace(/^["'`]+|["'`,.;]+$/g, "")
    .trim();
}

function getFileNameFromPath(filePath: string) {
  return filePath.split(/[\\/]/).filter(Boolean).pop() ?? "media artifact";
}

function getImageMimeTypeFromPath(filePath: string) {
  const extension = filePath.split(/[?#]/)[0]?.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
  if (extension === "png") return "image/png";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "gif") return "image/gif";
  if (extension === "webp") return "image/webp";
  if (extension === "avif") return "image/avif";
  if (extension === "bmp") return "image/bmp";
  if (extension === "svg") return "image/svg+xml";
  return "";
}

function buildAgentRequestText(text: string, project: Project, files: WorkspaceFileAttachment[]) {
  if (files.length === 0) return text;

  const fileContext = files
    .map(
      (file) =>
        `--- file: ${file.path} (${formatBytes(file.size)}) ---\n${file.content}`,
    )
    .join("\n\n");

  return `${text}\n\nWorkspace context explicitly attached by the user for ${project.name} (${project.namespace}). The remote agent cannot access the local filesystem. Use only the file excerpts below when they are relevant.\n\n${fileContext}`;
}

function buildChiefTaskRequestText(
  text: string,
  project: Project,
  chief: AgentInstance,
  participants: AgentInstance[],
  files: WorkspaceFileAttachment[],
) {
  const participantList =
    participants.length > 0
      ? participants
          .map((agent) => `- ${agent.name}: ${agent.tags.length > 0 ? agent.tags.join(", ") : "no capability tags"}`)
          .join("\n")
      : "- No participant agents selected. Treat this as a Chief-only task.";
  const taskRequest = [
    `You are the Chief agent for Vibe Office project "${project.name}" (${project.namespace}).`,
    "Handle this as a project-scoped Task Room request.",
    "Use one planning/coordination round only. Do not assume direct access to local files or other agents.",
    `Chief: ${chief.name}`,
    "Selected participant agents:",
    participantList,
    "",
    "Task:",
    text,
  ].join("\n");

  return buildAgentRequestText(taskRequest, project, files);
}

function buildParticipantTaskRequestText(
  text: string,
  project: Project,
  chief: AgentInstance,
  participant: AgentInstance,
  chiefPlan: string,
  files: WorkspaceFileAttachment[],
) {
  const request = [
    `You are ${participant.name}, a selected participant agent in Vibe Office project "${project.name}" (${project.namespace}).`,
    `Chief agent: ${chief.name}.`,
    "Handle only your assigned portion of this one-round task. Do not delegate recursively.",
    "",
    "Original task:",
    text,
    "",
    "Chief plan:",
    chiefPlan,
    "",
    "Return your result clearly and concisely for Chief aggregation.",
  ].join("\n");

  return buildAgentRequestText(request, project, files);
}

function buildChiefAggregationRequestText(
  text: string,
  project: Project,
  chief: AgentInstance,
  chiefPlan: string,
  participantResults: ParticipantTaskResult[],
  files: WorkspaceFileAttachment[],
) {
  const resultList = participantResults
    .map((result) => `## ${result.agentName} (${result.state})\n${result.summary}`)
    .join("\n\n");
  const request = [
    `You are ${chief.name}, the Chief agent for Vibe Office project "${project.name}" (${project.namespace}).`,
    "Aggregate this one-round Task Room result into a final project-scoped answer.",
    "",
    "Original task:",
    text,
    "",
    "Your initial plan:",
    chiefPlan,
    "",
    "Participant results:",
    resultList || "No participant results were returned.",
    "",
    "Return the final summary, note any failed participant work, and do not create new delegations.",
  ].join("\n");

  return buildAgentRequestText(request, project, files);
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

function getTextPartContent(parts: A2APart[]) {
  return parts
    .filter((part) => part.kind === "text")
    .map((part) => part.text)
    .join("\n");
}

function buildChatCompletionHistory(
  allMessages: ConversationMessage[],
  conversationId: string,
  pendingMessageId: string,
  maxMessages = 20,
): ChatHistoryMessage[] {
  return allMessages
    .filter(
      (message) =>
        message.conversationId === conversationId &&
        message.id !== pendingMessageId &&
        message.status === "sent" &&
        (message.role === "user" || message.role === "agent"),
    )
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    .slice(-maxMessages)
    .map((message): ChatHistoryMessage => ({
      role: message.role === "agent" ? "assistant" : "user",
      content: getTextPartContent(message.contentParts),
    }))
    .filter((message) => message.content.trim().length > 0);
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

function getImageFileParts(parts: A2APart[]) {
  return parts.filter(
    (part) =>
      part.kind === "file" &&
      Boolean(part.file.uri) &&
      (part.file.mimeType?.startsWith("image/") || isImageUrl(part.file.uri ?? "")),
  );
}

function isImageUrl(uri: string) {
  return /\.(png|jpe?g|gif|webp|svg|bmp|avif)(\?.*)?$/i.test(uri) || uri.startsWith("data:image/");
}

function mapA2AState(state: A2ATaskState): WorkState {
  if (state === "input-required") return "input_required";
  if (state === "rejected" || state === "auth-required" || state === "unknown") return "failed";
  return state;
}

function createA2ACompatibilityMetadata(result: HermesConnectionTestResult): A2ACompatibilityMetadata {
  const nativeA2A = result.mode === "native-a2a";
  const providerInterfaces: Record<HermesConnectionTestResult["mode"], string[]> = {
    "native-a2a": ["message/send", "tasks/get", "tasks/cancel"],
    "hermes-adapter": ["chat/completions"],
    "openai-compatible": ["chat/completions"],
    "anthropic-compatible": ["messages"],
  };
  const providerTransport: Record<HermesConnectionTestResult["mode"], string> = {
    "native-a2a": "json-rpc/http",
    "hermes-adapter": "hermes-compatible-http",
    "openai-compatible": "openai-compatible-http",
    "anthropic-compatible": "anthropic-compatible-http",
  };
  const providerSelectedInterface: Record<HermesConnectionTestResult["mode"], string> = {
    "native-a2a": "message/send + tasks/get",
    "hermes-adapter": "Hermes compatibility",
    "openai-compatible": "OpenAI chat completions",
    "anthropic-compatible": "Anthropic messages",
  };
  return {
    a2aProtocolVersion: result.card.protocolVersion ?? (nativeA2A ? "unknown" : "compatibility"),
    a2aTransportBinding: providerTransport[result.mode],
    a2aSupportedInterfaces: providerInterfaces[result.mode],
    a2aSelectedInterface: providerSelectedInterface[result.mode],
    a2aLastCompatibilityCheckAt: new Date().toISOString(),
    supportsTaskLifecycle: nativeA2A,
    supportsCancel: nativeA2A ? undefined : false,
  };
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

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatWorkspacePath(result: WorkspaceFileListResult | null) {
  if (!result) return "Root";
  if (!result.path) return result.rootName || "Root";
  return `/ ${result.path}`;
}

function StatusDot({ status }: { status: AgentStatus }) {
  return <span className={`status-dot ${status}`} aria-label={`Status: ${status}`} />;
}

function getOfficeRoleLabel(role?: AgentOfficeRole, isChief?: boolean) {
  const value = role ?? (isChief ? "chief" : "operator");
  return OFFICE_ROLE_OPTIONS.find((option) => option.value === value)?.label ?? "Operator";
}

function AgentAvatar({ agent, size = "regular" }: { agent: AgentInstance; size?: "regular" | "small" | "large" }) {
  const fallback = agent.name.slice(0, 1).toUpperCase();

  return (
    <span className={`avatar ${size === "small" ? "small" : size === "large" ? "large" : ""}`} aria-hidden="true">
      {agent.avatarUrl ? <img alt="" src={agent.avatarUrl} /> : fallback}
    </span>
  );
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
}: {
  agent?: AgentInstance;
  activeConversationId?: string;
  histories: Array<{
    conversation: Conversation;
    messageCount: number;
    title: string;
  }>;
}) {
  return (
    <section className="free-chat-panel" aria-label="Chat history">
      <div className="free-chat-header">
        <span className="profile-block-icon">
          <MessageSquare size={18} />
        </span>
        <div>
          <h3>Chat history</h3>
          <p>{agent ? `${agent.name} free chats` : "Select an agent"}</p>
        </div>
      </div>
      <div className="free-chat-history-list">
        {histories.length > 0 ? (
          histories.map((item) => (
            <div
              className={`free-chat-history-item ${item.conversation.id === activeConversationId ? "active" : ""}`}
              key={item.conversation.id}
            >
              <strong>{item.title}</strong>
              <span>{item.messageCount} messages</span>
            </div>
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

function getUserFacingAgentError(error: unknown) {
  return sanitizeAgentErrorText(error instanceof Error ? error.message : "Agent request failed.");
}

function sanitizeAgentErrorText(text: string) {
  if (text.includes("Agent did not respond before the timeout") || text.includes("Hermes chat completion timed out")) {
    return "Agent did not respond before the timeout. You can retry, or increase this agent's timeout in Advanced settings.";
  }
  if (text.includes("OpenAI-compatible chat failed")) {
    return text.replace("OpenAI-compatible chat failed", "Agent request failed");
  }
  if (text.includes("Anthropic-compatible message failed")) {
    return text.replace("Anthropic-compatible message failed", "Agent request failed");
  }
  if (text.includes("Hermes chat completion failed")) {
    return text.replace("Hermes chat completion failed", "Agent request failed");
  }
  if (text.includes("OpenAI-compatible chat auth failed")) {
    return text.replace("OpenAI-compatible chat auth failed", "Agent authentication failed");
  }
  if (text.includes("Anthropic-compatible message auth failed")) {
    return text.replace("Anthropic-compatible message auth failed", "Agent authentication failed");
  }
  if (text.includes("Hermes chat completion auth failed")) {
    return text.replace("Hermes chat completion auth failed", "Agent authentication failed");
  }
  return text;
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
    return (
      <div className={`message-row ${isUser ? "user-message" : "agent-message"}`} key={message.id}>
        <div className={`${isUser ? "message-bubble" : "agent-output"} ${message.status} ${isSystem ? "system" : ""}`}>
          {isUser ? <p>{content}</p> : <MarkdownContent content={content} />}
          {message.errorText ? <p className="message-error-text">{sanitizeAgentErrorText(message.errorText)}</p> : null}
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

function WorkspaceFiles({
  project,
  attachedFiles,
  onAttachFile,
  onDetachFile,
  onEditProject,
}: {
  project: Project;
  attachedFiles: WorkspaceFileAttachment[];
  onAttachFile: (file: WorkspaceFileReadResult) => void;
  onDetachFile: (path: string) => void;
  onEditProject: () => void;
}) {
  const [currentPath, setCurrentPath] = useState("");
  const [listResult, setListResult] = useState<WorkspaceFileListResult | null>(null);
  const [selectedFile, setSelectedFile] = useState<WorkspaceFileReadResult | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchMatches, setSearchMatches] = useState<WorkspaceFileSearchMatch[]>([]);
  const [searchTruncated, setSearchTruncated] = useState(false);
  const [loadingState, setLoadingState] = useState<"idle" | "listing" | "reading" | "searching">("idle");
  const [error, setError] = useState("");
  const projectDirectory = project.directory?.trim() ?? "";
  const hasDirectory = projectDirectory.length > 0;
  const selectedFileIsAttached = selectedFile ? attachedFiles.some((file) => file.path === selectedFile.path) : false;

  useEffect(() => {
    setCurrentPath("");
    setListResult(null);
    setSelectedFile(null);
    setSearchQuery("");
    setSearchMatches([]);
    setSearchTruncated(false);
    setError("");
  }, [project.id]);

  useEffect(() => {
    if (!hasDirectory) return;
    void loadDirectory(currentPath);
    // Directory loading is intentionally driven by project/path changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectDirectory, currentPath]);

  async function loadDirectory(path: string) {
    if (!hasDirectory) return;
    setLoadingState("listing");
    setError("");

    try {
      const result = await listWorkspaceFiles(projectDirectory, path);
      setListResult(result);
      setSelectedFile(null);
    } catch (error) {
      setListResult(null);
      setError(error instanceof Error ? error.message : "Unable to list workspace files.");
    } finally {
      setLoadingState("idle");
    }
  }

  function openDirectory(path: string) {
    setSearchMatches([]);
    setSearchTruncated(false);
    setCurrentPath(path);
  }

  async function openEntry(entry: WorkspaceFileEntry) {
    if (entry.type === "directory") {
      openDirectory(entry.path);
      return;
    }

    setLoadingState("reading");
    setError("");
    try {
      setSelectedFile(await readWorkspaceFile(projectDirectory, entry.path));
    } catch (error) {
      setSelectedFile(null);
      setError(error instanceof Error ? error.message : "Unable to read file.");
    } finally {
      setLoadingState("idle");
    }
  }

  async function openSearchMatch(match: WorkspaceFileSearchMatch) {
    await openEntry({
      name: match.path.split("/").pop() ?? match.path,
      path: match.path,
      type: "file",
    });
  }

  async function runSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hasDirectory || searchQuery.trim().length < 2) return;

    setLoadingState("searching");
    setError("");
    try {
      const result = await searchWorkspaceFiles(projectDirectory, searchQuery);
      setSearchMatches(result.matches);
      setSearchTruncated(result.truncated);
    } catch (error) {
      setSearchMatches([]);
      setSearchTruncated(false);
      setError(error instanceof Error ? error.message : "Unable to search workspace files.");
    } finally {
      setLoadingState("idle");
    }
  }

  if (!hasDirectory) {
    return (
      <section className="workspace-files-panel" aria-label="Project files">
        <div className="workspace-files-header">
          <div>
            <div className="eyebrow">Project files</div>
            <h3>Bind a local folder</h3>
            <p>Files are listed by the local trusted layer before anything is sent to an agent.</p>
          </div>
          <button className="secondary-button compact-button" type="button" onClick={onEditProject}>
            <Folder size={16} />
            Bind folder
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="workspace-files-panel" aria-label="Project files">
      <div className="workspace-files-header">
        <div>
          <div className="eyebrow">Project files</div>
          <h3>{project.name}</h3>
          <p>{projectDirectory}</p>
        </div>
        <button className="secondary-button compact-button" type="button" onClick={() => void loadDirectory(currentPath)}>
          {loadingState === "listing" ? <Loader2 className="spin" size={16} /> : <RefreshCw size={16} />}
          Refresh
        </button>
      </div>

      <form className="workspace-search" onSubmit={runSearch}>
        <label className="sr-only" htmlFor="workspace-search">
          Search files
        </label>
        <input
          id="workspace-search"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.currentTarget.value)}
          placeholder="Search files"
        />
        <button className="secondary-button compact-button" type="submit" disabled={loadingState === "searching" || searchQuery.trim().length < 2}>
          {loadingState === "searching" ? <Loader2 className="spin" size={16} /> : <Search size={16} />}
          Search
        </button>
      </form>

      {error ? <div className="form-error">{error}</div> : null}

      <div className="workspace-file-grid">
        <div className="workspace-file-list" aria-label="Workspace file list">
          <div className="workspace-path-row">
            <button
              className="icon-button mini-button"
              data-testid="workspace-parent-folder"
              type="button"
              disabled={listResult?.parentPath === undefined}
              onClick={() => {
                if (listResult?.parentPath !== undefined) openDirectory(listResult.parentPath);
              }}
              aria-label="Go to parent folder"
              title="Go to parent folder"
            >
              <ArrowLeft size={14} />
            </button>
            {listResult?.path ? (
              <button className="breadcrumb-root" type="button" onClick={() => openDirectory("")}>
                {listResult.rootName}
              </button>
            ) : null}
            <span>{formatWorkspacePath(listResult)}</span>
          </div>
          {loadingState === "listing" && !listResult ? (
            <div className="inline-empty">Loading workspace files.</div>
          ) : listResult?.entries.length ? (
            listResult.entries.map((entry) => (
              <button className="workspace-file-row" key={entry.path} type="button" onClick={() => void openEntry(entry)}>
                {entry.type === "directory" ? <Folder size={15} /> : <FileText size={15} />}
                <span>
                  <strong>{entry.name}</strong>
                  <small>{entry.type === "file" && entry.size !== undefined ? formatBytes(entry.size) : "Folder"}</small>
                </span>
              </button>
            ))
          ) : (
            <div className="inline-empty">No files in this folder.</div>
          )}
        </div>

        <div className="workspace-preview" aria-label="Workspace file preview">
          {selectedFile ? (
            <>
              <div className="workspace-preview-header">
                <div>
                  <strong>{selectedFile.path}</strong>
                  <span>{formatBytes(selectedFile.size)}</span>
                </div>
                {selectedFileIsAttached ? (
                  <button className="secondary-button compact-button" type="button" onClick={() => onDetachFile(selectedFile.path)}>
                    <X size={16} />
                    Remove
                  </button>
                ) : (
                  <button className="primary-button compact-button" type="button" onClick={() => onAttachFile(selectedFile)}>
                    <Paperclip size={16} />
                    Attach
                  </button>
                )}
              </div>
              <pre className="workspace-file-preview">{selectedFile.content}</pre>
            </>
          ) : (
            <div className="inline-empty">Select a file to preview it before attaching context.</div>
          )}
        </div>
      </div>

      {searchMatches.length > 0 || searchTruncated ? (
        <div className="workspace-search-results" aria-label="Search results">
          {searchMatches.map((match) => (
            <button className="workspace-search-result" key={`${match.path}-${match.lineNumber}`} type="button" onClick={() => void openSearchMatch(match)}>
              <FileText size={14} />
              <span>
                <strong>{match.path}:{match.lineNumber}</strong>
                <small>{match.preview}</small>
              </span>
            </button>
          ))}
          {searchTruncated ? <div className="inline-empty">Showing the first matches. Narrow the query for more precision.</div> : null}
        </div>
      ) : searchQuery.trim().length >= 2 && loadingState !== "searching" ? (
        <div className="inline-empty">No matches yet.</div>
      ) : null}
    </section>
  );
}

function BrowserPreview({
  browserUrl,
  previewUrl,
  onBrowserUrlChange,
  onOpenPreview,
}: {
  browserUrl: string;
  previewUrl: string;
  onBrowserUrlChange: (value: string) => void;
  onOpenPreview: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const hasPreview = previewUrl.length > 0;
  const canEmbed = previewUrl.startsWith("http://localhost") || previewUrl.startsWith("http://127.0.0.1");

  return (
    <div className="browser-workspace">
      <form className="browser-toolbar" id="browser-url-form" onSubmit={onOpenPreview}>
        <button type="button" className="icon-button" aria-label="Go back">
          <ArrowLeft size={16} />
        </button>
        <button type="button" className="icon-button" aria-label="Go forward">
          <ArrowRight size={16} />
        </button>
        <button type="submit" className="icon-button" aria-label="Refresh preview">
          <RefreshCw size={16} />
        </button>
        <label className="url-input">
          <input
            aria-label="Preview URL"
            value={browserUrl}
            onChange={(event) => onBrowserUrlChange(event.target.value)}
            placeholder="Open URL"
          />
        </label>
        <a className="icon-button" href={previewUrl} target="_blank" rel="noreferrer" aria-label="Open externally">
          <ExternalLink size={16} />
        </a>
      </form>

      <div className="browser-frame">
        {!hasPreview ? (
          <div className="empty-state">
            <Globe2 size={32} />
            <button className="secondary-button" type="submit" form="browser-url-form">
              Open URL
            </button>
          </div>
        ) : canEmbed ? (
          <iframe title="Browser preview" src={previewUrl} />
        ) : (
          <div className="empty-state">
            <Globe2 size={32} />
            <a className="secondary-button" href={previewUrl} target="_blank" rel="noreferrer">
              Open external
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

function ProjectTasks({
  agents,
  runs,
  tasks,
  artifacts,
  busyActionId,
  onCancelTask,
  onRefreshTask,
  onRetryTask,
}: {
  agents: AgentInstance[];
  runs: ProjectRun[];
  tasks: ProjectTask[];
  artifacts: ProjectArtifact[];
  busyActionId: string;
  onCancelTask: (taskId: string) => void;
  onRefreshTask: (taskId: string) => void;
  onRetryTask: (taskId: string) => void;
}) {
  const visibleRuns = runs.filter(
    (run) => run.type !== "direct_message" || run.state !== "completed" || run.artifactIds.length > 0 || Boolean(run.taskId),
  );
  const visibleRunTaskIds = new Set(visibleRuns.map((run) => run.taskId).filter(Boolean));
  const standaloneTasks = tasks.filter((task) => !visibleRunTaskIds.has(task.id));

  if (visibleRuns.length === 0 && standaloneTasks.length === 0) {
    return (
      <div className="empty-state tall">
        <MessageSquare size={32} />
        <h3>No tasks yet</h3>
        <p>Direct chat stays in the conversation. Tasks appear here when work needs tracking.</p>
      </div>
    );
  }

  return (
    <div className="output-list">
      {visibleRuns.map((run) => {
        const owner = agents.find((item) => item.id === run.ownerAgentId);
        const runArtifacts = artifacts.filter((artifact) => run.artifactIds.includes(artifact.id));
        const linkedTask = tasks.find((task) => task.id === run.taskId);
        const lifecycleTask = linkedTask;
        return (
          <article className="output-item run-item" key={run.id}>
            <div className="output-title-row">
              <div>
                <h3>{linkedTask?.title ?? (run.type === "direct_message" ? "Direct message" : "Chief delegation")}</h3>
                <span>{owner?.name ?? "Agent"} / {run.type.replace("_", " ")}</span>
              </div>
              <span className={`status-badge ${run.state}`}>{run.state}</span>
            </div>
            {lifecycleTask ? (
              <TaskLifecycleActions
                busyActionId={busyActionId}
                lifecycleLinked={Boolean(getTaskLifecycleAddress(lifecycleTask, runs))}
                onCancelTask={onCancelTask}
                onRefreshTask={onRefreshTask}
                onRetryTask={onRetryTask}
                owner={owner}
                task={lifecycleTask}
              />
            ) : null}
            <p>{linkedTask?.summary ?? "Project-scoped run record."}</p>
            {linkedTask ? <TaskEventList agents={agents} events={linkedTask.events} /> : null}
            <div className="artifact-strip">
              {runArtifacts.length > 0 ? (
                runArtifacts.map((artifact) => (
                  <span className="artifact-chip" key={artifact.id}>
                    {artifact.name}
                  </span>
                ))
              ) : (
                <span className="artifact-chip muted">No artifact</span>
              )}
            </div>
          </article>
        );
      })}
      {standaloneTasks.map((task) => {
        const owner = agents.find((item) => item.id === task.ownerAgentId);
        const taskArtifacts = artifacts.filter((artifact) => task.artifactIds.includes(artifact.id));
        return (
          <article className="output-item" key={task.id}>
            <div className="output-title-row">
              <div>
                <h3>{task.title}</h3>
                <span>{owner?.name ?? "Agent"} / {task.contextId}</span>
              </div>
              <span className={`status-badge ${task.state}`}>{task.state}</span>
            </div>
            <TaskLifecycleActions
              busyActionId={busyActionId}
              lifecycleLinked={Boolean(getTaskLifecycleAddress(task, runs))}
              onCancelTask={onCancelTask}
              onRefreshTask={onRefreshTask}
              onRetryTask={onRetryTask}
              owner={owner}
              task={task}
            />
            <p>{task.summary}</p>
            <TaskEventList agents={agents} events={task.events} />
            <div className="artifact-strip">
              {taskArtifacts.map((artifact) => (
                <span className="artifact-chip" key={artifact.id}>
                  {artifact.name}
                </span>
              ))}
            </div>
          </article>
        );
      })}
    </div>
  );
}

function TaskEventList({ agents, events }: { agents: AgentInstance[]; events: ProjectTask["events"] }) {
  return (
    <div className="task-event-list">
      {events.map((event) => {
        const agent = agents.find((item) => item.id === event.agentId);
        return (
          <div className="task-event" key={event.id}>
            <span className={`status-dot ${event.state === "completed" ? "online" : event.state === "failed" ? "offline" : "checking"}`} />
            <span>{agent?.name ?? "Agent"}</span>
            <strong>{getTaskEventDisplayLabel(event.label)}</strong>
          </div>
        );
      })}
    </div>
  );
}

function TaskLifecycleActions({
  busyActionId,
  lifecycleLinked,
  onCancelTask,
  onRefreshTask,
  onRetryTask,
  owner,
  task,
}: {
  busyActionId: string;
  lifecycleLinked: boolean;
  onCancelTask: (taskId: string) => void;
  onRefreshTask: (taskId: string) => void;
  onRetryTask: (taskId: string) => void;
  owner?: AgentInstance;
  task: ProjectTask;
}) {
  const active = isTaskActive(task.state);
  const failed = task.state === "failed";
  const terminal = isTaskTerminal(task.state);
  const unsupported = hasLifecycleUnsupportedEvent(task);
  const cancelUnsupported = hasCancelUnsupportedEvent(task);
  const lifecycleKnownUnsupported = !lifecycleLinked || unsupported || owner?.supportsTaskLifecycle === false;
  const cancelKnownUnsupported = !lifecycleLinked || unsupported || cancelUnsupported || owner?.supportsCancel === false;
  const refreshBusy = busyActionId === `refresh:${task.id}`;
  const retryBusy = busyActionId === `retry:${task.id}`;
  const cancelBusy = busyActionId === `cancel:${task.id}`;

  return (
    <div className="task-lifecycle-actions" aria-label="Task lifecycle actions">
      <button
        aria-label="Refresh task status"
        className="icon-button mini-button"
        disabled={terminal || lifecycleKnownUnsupported || Boolean(busyActionId)}
        onClick={() => onRefreshTask(task.id)}
        title={!lifecycleLinked ? "No remote lifecycle link" : lifecycleKnownUnsupported ? "Lifecycle unsupported" : "Refresh status"}
        type="button"
      >
        {refreshBusy ? <Loader2 size={14} /> : <RefreshCw size={14} />}
      </button>
      <button
        aria-label="Retry failed task"
        className="icon-button mini-button"
        disabled={!failed || Boolean(busyActionId)}
        onClick={() => onRetryTask(task.id)}
        title="Retry failed task"
        type="button"
      >
        {retryBusy ? <Loader2 size={14} /> : <ArrowRight size={14} />}
      </button>
      <button
        aria-label="Cancel task"
        className="icon-button mini-button danger-button"
        disabled={!active || cancelKnownUnsupported || Boolean(busyActionId)}
        onClick={() => onCancelTask(task.id)}
        title={cancelKnownUnsupported ? "Cancel unsupported" : "Cancel task"}
        type="button"
      >
        {cancelBusy ? <Loader2 size={14} /> : <XCircle size={14} />}
      </button>
      {lifecycleKnownUnsupported ? (
        <span className="lifecycle-note">{lifecycleLinked ? "Lifecycle unsupported" : "No remote lifecycle link"}</span>
      ) : null}
      {cancelUnsupported && !lifecycleKnownUnsupported ? <span className="lifecycle-note">Cancel unsupported</span> : null}
      <TaskLifecycleMetadata lifecycleLinked={lifecycleLinked} owner={owner} task={task} />
    </div>
  );
}

function TaskLifecycleMetadata({
  lifecycleLinked,
  owner,
  task,
}: {
  lifecycleLinked: boolean;
  owner?: AgentInstance;
  task: ProjectTask;
}) {
  const taskReference = task.remoteTaskId ? "Remote task" : "Local task";
  const trackingState =
    owner?.supportsTaskLifecycle === false || hasLifecycleUnsupportedEvent(task)
      ? "Status tracking unavailable"
      : lifecycleLinked
        ? "Status tracking"
        : "Local progress";
  const cancelState =
    owner?.supportsCancel === false || hasCancelUnsupportedEvent(task)
      ? "Cancel unavailable"
      : owner?.supportsCancel === true
        ? "Cancel available"
        : lifecycleLinked
          ? "Cancel unknown"
          : "Cancel unavailable";

  return (
    <div className="lifecycle-meta" aria-label="Task lifecycle metadata">
      <span>{taskReference}</span>
      <span>{trackingState}</span>
      <span>{cancelState}</span>
    </div>
  );
}

function ProjectArtifacts({ agents, artifacts }: { agents: AgentInstance[]; artifacts: ProjectArtifact[] }) {
  const [selectedArtifactId, setSelectedArtifactId] = useState(artifacts[0]?.id ?? "");
  const [copyState, setCopyState] = useState<"idle" | "copied" | "manual">("idle");
  const selectedArtifact = artifacts.find((artifact) => artifact.id === selectedArtifactId) ?? artifacts[0];

  useEffect(() => {
    if (artifacts.length === 0) {
      setSelectedArtifactId("");
      return;
    }
    if (!artifacts.some((artifact) => artifact.id === selectedArtifactId)) {
      setSelectedArtifactId(artifacts[0].id);
    }
  }, [artifacts, selectedArtifactId]);

  if (artifacts.length === 0) {
    return (
      <div className="empty-state tall">
        <MessageSquare size={32} />
        <h3>No artifacts in this project</h3>
        <p>Agent outputs stay scoped to the selected Project.</p>
      </div>
    );
  }

  async function copyArtifactContent(artifact: ProjectArtifact) {
    const content = getArtifactCopyText(artifact);
    if (!content) return;

    try {
      await copyTextToClipboard(content);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 1500);
    } catch {
      setCopyState("manual");
    }
  }

  async function downloadArtifact(artifact: ProjectArtifact) {
    const filePart = getDownloadableFilePart(artifact);
    if (filePart?.kind === "file" && filePart.file.uri) {
      await downloadUri(filePart.file.uri, filePart.file.name ?? `${artifact.name}.bin`);
      return;
    }

    const content = getArtifactCopyText(artifact);
    const extension = artifact.kind === "json" ? "json" : "txt";
    downloadText(content, `${safeFileName(artifact.name)}.${extension}`, artifact.kind === "json" ? "application/json" : "text/plain");
  }

  function openArtifactUrl(artifact: ProjectArtifact) {
    const url = getOpenableArtifactUrl(artifact);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  }

  const selectedAgent = selectedArtifact ? agents.find((item) => item.id === selectedArtifact.agentId) : undefined;
  const openableUrl = selectedArtifact ? getOpenableArtifactUrl(selectedArtifact) : "";
  const canDownload = Boolean(selectedArtifact && (getDownloadableFilePart(selectedArtifact) || getArtifactCopyText(selectedArtifact)));
  const canCopy = Boolean(selectedArtifact && getArtifactCopyText(selectedArtifact));

  return (
    <div className="artifact-viewer">
      <div className="artifact-browser" aria-label="Project artifacts">
        {artifacts.map((artifact) => {
          const agent = agents.find((item) => item.id === artifact.agentId);
          const isSelected = artifact.id === selectedArtifact?.id;
          return (
            <button
              className={`artifact-list-item ${isSelected ? "selected" : ""}`}
              key={artifact.id}
              onClick={() => {
                setSelectedArtifactId(artifact.id);
                setCopyState("idle");
              }}
              type="button"
            >
              <div>
                <h3>{artifact.name}</h3>
                <span>{agent?.name ?? "Agent"} / {artifact.kind}</span>
              </div>
              <Eye size={15} aria-hidden="true" />
            </button>
          );
        })}
      </div>

      {selectedArtifact ? (
        <article className="artifact-detail" aria-label="Artifact viewer">
          <div className="artifact-detail-header">
            <div>
              <div className="eyebrow">Artifact Viewer</div>
              <h3>{selectedArtifact.name}</h3>
              <span>{selectedAgent?.name ?? "Agent"} / {selectedArtifact.kind}</span>
            </div>
            <div className="artifact-actions">
              <button
                aria-label="Copy artifact content"
                className="icon-button mini-button"
                disabled={!canCopy}
                onClick={() => copyArtifactContent(selectedArtifact)}
                title="Copy content"
                type="button"
              >
                <Copy size={15} />
              </button>
              <button
                aria-label="Download artifact"
                className="icon-button mini-button"
                disabled={!canDownload}
                onClick={() => downloadArtifact(selectedArtifact)}
                title="Download"
                type="button"
              >
                <Download size={15} />
              </button>
              <button
                aria-label="Open artifact URL"
                className="icon-button mini-button"
                disabled={!openableUrl}
                onClick={() => openArtifactUrl(selectedArtifact)}
                title="Open URL"
                type="button"
              >
                <ExternalLink size={15} />
              </button>
            </div>
          </div>
          {copyState !== "idle" ? <span className={`copy-status ${copyState}`}>{copyState === "copied" ? "Copied" : "Select and copy"}</span> : null}
          {copyState === "manual" ? (
            <textarea
              className="copy-fallback"
              onFocus={(event) => event.currentTarget.select()}
              readOnly
              value={getArtifactCopyText(selectedArtifact)}
            />
          ) : null}
          <ArtifactPreview artifact={selectedArtifact} />
        </article>
      ) : null}
    </div>
  );
}

function ArtifactPreview({ artifact }: { artifact: ProjectArtifact }) {
  const parts = artifact.contentParts ?? createTextParts(artifact.summary);
  const imageParts = getImageFileParts(parts);
  const text = getTextPartContent(parts);
  const data = getDataPartContent(parts);

  return (
    <div className="artifact-preview">
      {imageParts.map((part, index) =>
        part.kind === "file" && part.file.uri ? (
          <img
            alt={part.file.name ?? `${artifact.name} image ${index + 1}`}
            className="artifact-image"
            key={`${artifact.id}-image-${index}`}
            src={part.file.uri}
          />
        ) : null,
      )}
      {text ? <MarkdownContent content={text} /> : null}
      {data ? (
        <pre className="artifact-json">
          <code>{data}</code>
        </pre>
      ) : null}
    </div>
  );
}

function getArtifactCopyText(artifact: ProjectArtifact) {
  const parts = artifact.contentParts ?? createTextParts(artifact.summary);
  const text = getTextPartContent(parts);
  const data = getDataPartContent(parts);
  const files = parts
    .flatMap((part) => (part.kind === "file" && part.file.uri ? [part.file.uri] : []))
    .join("\n");
  return [text, data, files].filter(Boolean).join("\n\n");
}

function getDownloadableFilePart(artifact: ProjectArtifact) {
  const parts = artifact.contentParts ?? [];
  return parts.find((part): part is Extract<A2APart, { kind: "file" }> => part.kind === "file" && Boolean(part.file.uri));
}

function getOpenableArtifactUrl(artifact: ProjectArtifact) {
  const parts = artifact.contentParts ?? [];
  const fileUri = parts.find((part) => part.kind === "file" && isOpenableUrl(part.file.uri ?? ""));
  if (fileUri?.kind === "file") return fileUri.file.uri ?? "";

  const textUrl = getTextPartContent(parts)
    .split(/\s+/)
    .find((value) => isOpenableUrl(value));
  if (textUrl) return textUrl;

  return artifact.kind === "url" && isOpenableUrl(artifact.summary) ? artifact.summary : "";
}

function isOpenableUrl(value?: string) {
  return Boolean(value && (/^https?:\/\//i.test(value) || value.startsWith("/workspace-local/media")));
}

async function downloadUri(uri: string, fileName: string) {
  const response = await fetch(uri);
  if (!response.ok) throw new Error("Unable to download artifact.");
  const blob = await response.blob();
  downloadBlob(blob, safeFileName(fileName));
}

async function copyTextToClipboard(content: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(content);
      return;
    } catch {
      // Fall back to a local textarea copy for browsers that deny clipboard writes.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = content;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, content.length);
  const copied = document.execCommand("copy");
  textarea.remove();

  if (!copied) {
    throw new Error("Copy failed.");
  }
}

function downloadText(content: string, fileName: string, type: string) {
  downloadBlob(new Blob([content], { type }), fileName);
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function safeFileName(value: string) {
  const cleaned = value.trim().replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "-").replace(/\s+/g, " ");
  return cleaned || "artifact";
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

function FieldLabel({ help, label }: { help: string; label: string }) {
  return (
    <span className="field-label">
      {label}
      <span className="field-help" tabIndex={0} title={help} aria-label={help}>
        <CircleHelp size={13} />
      </span>
    </span>
  );
}

function CapabilityTagSelector({ options, selectedTags }: { options: string[]; selectedTags: string[] }) {
  const [currentTags, setCurrentTags] = useState(selectedTags);
  const selectedSummary = currentTags.length > 0 ? currentTags.join(", ") : "Select capabilities";

  function toggleTag(tag: string, checked: boolean) {
    setCurrentTags((current) => (checked ? Array.from(new Set([...current, tag])) : current.filter((item) => item !== tag)));
  }

  return (
    <div className="capability-selector" role="group" aria-label="Capability tags">
      <FieldLabel help="For filtering and your own reference only." label="Capability tags" />
      <details className="capability-select">
        <summary>
          <span className="selected-capabilities">{selectedSummary}</span>
          <ChevronDown size={16} />
        </summary>
        <div className="capability-options">
          {options.map((tag) => (
            <label className="capability-option" key={tag}>
              <input
                checked={currentTags.includes(tag)}
                name="tags"
                type="checkbox"
                value={tag}
                onChange={(event) => toggleTag(tag, event.currentTarget.checked)}
              />
              <span>{tag}</span>
            </label>
          ))}
        </div>
      </details>
    </div>
  );
}

function OfficeRoleSelector({ selectedRole }: { selectedRole?: AgentOfficeRole }) {
  const [currentRole, setCurrentRole] = useState<AgentOfficeRole | "">(selectedRole ?? "");
  const selectedLabel = currentRole ? getOfficeRoleLabel(currentRole) : "Select role";

  useEffect(() => {
    setCurrentRole(selectedRole ?? "");
  }, [selectedRole]);

  function selectRole(role: AgentOfficeRole, details: HTMLElement | null) {
    setCurrentRole(role);
    details?.removeAttribute("open");
  }

  return (
    <div className="office-role-selector">
      <FieldLabel help="Office identity for routing and your own organization." label="Office role" />
      <details className="capability-select single-select">
        <summary>
          <span className="selected-capabilities">{selectedLabel}</span>
          <ChevronDown size={16} />
        </summary>
        <div className="capability-options role-options">
          {OFFICE_ROLE_OPTIONS.map((option) => (
            <label className="capability-option role-option" key={option.value}>
              <input
                checked={currentRole === option.value}
                name="officeRole"
                required
                type="radio"
                value={option.value}
                onChange={(event) => selectRole(option.value, event.currentTarget.closest("details"))}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
      </details>
    </div>
  );
}

function getRuntimeRoot(endpoint: string) {
  const trimmed = endpoint.trim().replace(/\/+$/, "");
  return trimmed
    .replace(/\/v1\/messages$/i, "")
    .replace(/\/messages$/i, "")
    .replace(/\/v1\/chat\/completions$/i, "")
    .replace(/\/chat\/completions$/i, "")
    .replace(/\/v1$/i, "");
}

function getGeneratedA2AEndpoint(endpoint: string) {
  const root = getRuntimeRoot(endpoint);
  return root ? `${root}/a2a` : "";
}

function getGeneratedAgentCardUrl(endpoint: string) {
  const root = getRuntimeRoot(endpoint);
  return root ? `${root}/.well-known/agent-card.json` : "";
}

function SetupWizard({
  testState,
  testMessage,
  onClose,
  onRunTest,
  onResetTest,
  onSaveAgent,
  agent,
  onDeleteAgent,
  onAgentAvatarFile,
}: {
  testState: ConnectionTestState;
  testMessage: string;
  onClose: () => void;
  onRunTest: (form: FormData) => void;
  onResetTest: () => void;
  onSaveAgent: (event: FormEvent<HTMLFormElement>) => void;
  agent?: AgentInstance;
  onDeleteAgent: (agentId: string) => void;
  onAgentAvatarFile: (agentId: string, file?: File) => void;
}) {
  const profileAgent = agent;
  const profileName = profileAgent?.name ?? "New Agent";
  const profileNote = profileAgent?.role ?? "";
  const profileOfficeRole = profileAgent?.officeRole ?? (profileAgent ? (profileAgent.isChief ? "chief" : "operator") : undefined);
  const profileRuntimeProvider: AgentRuntimeProvider = profileAgent?.runtimeProvider ?? "hermes";
  const profileTags = (profileAgent?.tags ?? []).filter((tag) => !NON_CAPABILITY_TAGS.includes(tag));
  const capabilityOptions = Array.from(new Set([...CAPABILITY_TAG_OPTIONS, ...profileTags]));
  const defaultRuntimeBaseUrl = profileAgent?.endpoint ?? "";
  const [runtimeBaseUrl, setRuntimeBaseUrl] = useState(defaultRuntimeBaseUrl);
  const generatedA2AEndpoint = getGeneratedA2AEndpoint(runtimeBaseUrl);
  const generatedAgentCardUrl = getGeneratedAgentCardUrl(runtimeBaseUrl);

  useEffect(() => {
    setRuntimeBaseUrl(defaultRuntimeBaseUrl);
  }, [defaultRuntimeBaseUrl, profileAgent?.id]);

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="setup-dialog" role="dialog" aria-modal="true" aria-labelledby="setup-title">
        <div className="setup-header agent-dialog-header">
          <div>
            <h2 id="setup-title">{profileAgent ? "Edit Agent" : "Add Agent"}</h2>
            <p>
              {profileAgent
                ? "Update this model-backed agent and its optional runtime details."
                : "Connect a model-backed agent. Add richer runtime capabilities later."}
            </p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label={profileAgent ? "Close Edit Agent" : "Close Add Agent"}>
            <XCircle size={18} />
          </button>
        </div>

        <form className="setup-form" onSubmit={onSaveAgent} onChange={onResetTest}>
          <section className="profile-section" aria-label="Agent profile">
            <div className="profile-panel">
              <section className="profile-block identity-block" aria-label="Basic setup">
                <div className="profile-block-title">
                  <span className="profile-title-line">
                    <span className="profile-block-icon">
                      <UserRound size={18} />
                    </span>
                    <span>Basic setup</span>
                  </span>
                  <span className="avatar-stack">
                    {profileAgent ? (
                      <label className="avatar-edit" aria-label={`Change avatar for ${profileAgent.name}`} title="Change avatar">
                        <AgentAvatar agent={profileAgent} size="large" />
                        <input
                          accept="image/*"
                          className="file-input"
                          name={`avatarFile-${profileAgent.id}`}
                          type="file"
                          onChange={(event) => {
                            onAgentAvatarFile(profileAgent.id, event.currentTarget.files?.[0]);
                            event.currentTarget.value = "";
                          }}
                        />
                      </label>
                    ) : (
                      <span className="avatar large empty-avatar" aria-hidden="true">
                        <UserRound size={24} />
                      </span>
                    )}
                    <span className="avatar-status">
                      <StatusDot status={profileAgent?.status ?? "offline"} />
                      {profileAgent?.status ?? "offline"}
                    </span>
                  </span>
                </div>
                <div className="profile-block-content identity-content">
                  <div className="identity-fields">
                    <label>
                      <FieldLabel help="Shown in the left Agent list." label="Agent name" />
                      <input name="name" defaultValue={profileName} placeholder="New Agent" required />
                    </label>
                    <OfficeRoleSelector selectedRole={profileOfficeRole} />
                    <CapabilityTagSelector options={capabilityOptions} selectedTags={profileTags} />
                  </div>
                </div>
              </section>

              <section className="profile-block" aria-label="Behavior">
                <div className="profile-block-title">
                  <span className="profile-title-line">
                    <span className="profile-block-icon">
                      <Tags size={18} />
                    </span>
                    <span>Behavior</span>
                  </span>
                </div>
                <div className="profile-block-content">
                  <label className="notes-field">
                    <FieldLabel help="Local responsibility note for routing and future prompt behavior." label="Role note" />
                    <textarea name="role" defaultValue={profileNote} placeholder="What should this agent do, avoid, or hand off?" />
                  </label>
                </div>
              </section>

              <section className="profile-block" aria-label="Instance address">
                <div className="profile-block-title">
                  <span className="profile-title-line">
                    <span className="profile-block-icon">
                      <MapPin size={18} />
                    </span>
                    <span>Instance address</span>
                  </span>
                </div>
                <div className="profile-block-content form-grid compact-grid">
                  <label>
                    Instance location
                    <input name="location" defaultValue={profileAgent?.location ?? ""} placeholder="Remote site, office, or region" />
                  </label>
                  <label>
                    Host / IP
                    <input name="ipAddress" defaultValue={profileAgent?.ipAddress ?? ""} placeholder="Public or private IP, optional" />
                  </label>
                </div>
              </section>

              <section className="profile-block runtime-block" aria-label="Model provider">
                <div className="profile-block-title">
                  <span className="profile-title-line">
                    <span className="profile-block-icon">
                      <Server size={18} />
                    </span>
                    <span>Model provider</span>
                  </span>
                </div>
                <div className="profile-block-content runtime-content">
                  <div className="runtime-group">
                    <span className="runtime-group-title">Connection</span>
                    <div className="form-grid runtime-user-fields">
                      <label>
                        Provider type
                        <select name="runtimeProvider" defaultValue={profileRuntimeProvider} aria-label="Runtime type">
                          <option value="hermes">Hermes</option>
                          <option value="openai">OpenAI</option>
                          <option value="anthropic">Anthropic</option>
                        </select>
                      </label>
                      <label>
                        Model or Agent ID
                        <input name="model" defaultValue={profileAgent?.model ?? ""} placeholder="Remote model or agent id" required />
                      </label>
                      <label>
                        Base URL
                        <input
                          name="endpoint"
                          value={runtimeBaseUrl}
                          onChange={(event) => setRuntimeBaseUrl(event.currentTarget.value)}
                          placeholder="https://agent.example.com/v1"
                          required
                        />
                      </label>
                      <label>
                        API key
                        <input name="apiKey" type="password" defaultValue={profileAgent?.apiKey ?? ""} placeholder="Optional API key" />
                      </label>
                    </div>
                  </div>

                  <details className="advanced-runtime-settings">
                    <summary>Advanced settings</summary>
                    <div className="runtime-group">
                      <span className="runtime-group-title">Local runtime</span>
                      <div className="form-grid technical-fields">
                        <label>
                          Namespace prefix
                          <input name="namespace" defaultValue={profileAgent ? "vibe-office" : ""} placeholder="Optional namespace prefix" />
                        </label>
                        <label>
                          Timeout
                          <input name="timeout" defaultValue={profileAgent?.timeoutSeconds ? `${profileAgent.timeoutSeconds}s` : "60s"} placeholder="60s" />
                        </label>
                      </div>
                    </div>
                    <div className="runtime-group">
                      <span className="runtime-group-title">Generated integration endpoints</span>
                      <div className="form-grid technical-fields">
                        <label>
                          Task endpoint
                          <input name="a2aEndpoint" value={generatedA2AEndpoint} placeholder="Generated after Base URL" readOnly required />
                        </label>
                        <label>
                          Capability URL
                          <input name="agentCardUrl" value={generatedAgentCardUrl} placeholder="Generated after Base URL" readOnly required />
                        </label>
                      </div>
                    </div>
                  </details>

                  <div className="runtime-status-row">
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={(event) => {
                        const form = event.currentTarget.form;
                        if (!form || !form.reportValidity()) return;
                        onRunTest(new FormData(form));
                      }}
                      disabled={testState === "running"}
                    >
                      {testState === "running" ? <Loader2 className="spin" size={16} /> : <KeyRound size={16} />}
                      Test connection
                    </button>
                  </div>

                  <div className="diagnostics">
                    <DiagnosticRow label="Provider reachable" state={testState} />
                    <DiagnosticRow label="Model response ready" state={testState} />
                    <DiagnosticRow label="Profile metadata ready" state={testState} />
                    {testMessage ? <div className={`test-message ${testState}`}>{testMessage}</div> : null}
                  </div>
                </div>
              </section>
            </div>
          </section>

          <div className="setup-actions">
            {profileAgent ? (
              <button type="button" className="danger-action-button" onClick={() => onDeleteAgent(profileAgent.id)}>
                <Trash2 size={16} />
                Delete agent
              </button>
            ) : null}
            <span className="setup-action-spacer" />
            <button type="button" className="secondary-button" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="primary-button" disabled={!profileAgent && testState !== "passed"}>
              {profileAgent ? "Save changes" : "Add agent"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function DiagnosticRow({ label, state }: { label: string; state: "idle" | "running" | "passed" | "failed" }) {
  const icon =
    state === "passed" ? (
      <CheckCircle2 size={16} />
    ) : state === "failed" ? (
      <XCircle size={16} />
    ) : state === "running" ? (
      <Loader2 className="spin" size={16} />
    ) : (
      <Bot size={16} />
    );
  return (
    <div className={`diagnostic-row ${state}`}>
      {icon}
      <span>{label}</span>
    </div>
  );
}
