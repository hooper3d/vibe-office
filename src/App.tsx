import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Bot,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  Folder,
  Globe2,
  KeyRound,
  Loader2,
  MessageSquare,
  Moon,
  Pencil,
  Plus,
  RefreshCw,
  Sparkles,
  Sun,
  Trash2,
  UserRoundCog,
  XCircle,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
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
  setupSteps,
} from "./domain/seedData";
import type { Conversation, ConversationMessage, ProjectArtifact, ProjectRun, ProjectTask, WorkState } from "./domain/projectScope";
import type { AgentInstance, AgentStatus, Project } from "./domain/types";
import { loadConfiguredAgents, saveConfiguredAgents } from "./services/agentStorage";
import { HermesA2AAdapter } from "./services/hermesA2AAdapter";
import { loadWorkspaceState, saveWorkspaceState } from "./services/workspaceStorage";

type OutputMode = "browser" | "outputs" | "artifacts";
type ConversationMode = "single" | "task-room";
type ConnectionTestState = "idle" | "running" | "passed" | "failed";
type ThemeMode = "dark" | "light";
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

export function App() {
  const [initialWorkspace] = useState(() => loadWorkspaceState());
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
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState("default");
  const [conversationMode, setConversationMode] = useState<ConversationMode>("single");
  const [outputMode, setOutputMode] = useState<OutputMode>("browser");
  const [messageText, setMessageText] = useState("");
  const [browserUrl, setBrowserUrl] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [showSetup, setShowSetup] = useState(false);
  const [showProjectDialog, setShowProjectDialog] = useState(false);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [projectFormError, setProjectFormError] = useState("");
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [retestingAgentIds, setRetestingAgentIds] = useState<string[]>([]);
  const [testState, setTestState] = useState<ConnectionTestState>("idle");
  const [testMessage, setTestMessage] = useState("");
  const [splitPercent, setSplitPercent] = useState(54);
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    if (typeof window === "undefined") return "dark";
    return window.localStorage.getItem(THEME_STORAGE_KEY) === "light" ? "light" : "dark";
  });

  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.id === selectedAgentId) ?? agents.find((agent) => agent.isChief) ?? agents[0],
    [agents, selectedAgentId],
  );
  const selectedProject = projects.find((project) => project.id === selectedProjectId) ?? projects[0];
  const scopedTasks = useMemo(
    () => tasks.filter((task) => task.projectId === selectedProject.id),
    [selectedProject.id, tasks],
  );
  const scopedRuns = useMemo(
    () => runs.filter((run) => run.projectId === selectedProject.id),
    [selectedProject.id, runs],
  );
  const scopedArtifacts = useMemo(
    () => artifacts.filter((artifact) => artifact.projectId === selectedProject.id),
    [selectedProject.id, artifacts],
  );
  const currentConversation = useMemo(() => {
    if (!selectedAgent) return undefined;
    return conversations.find(
      (conversation) =>
        conversation.projectId === selectedProject.id &&
        conversation.mode === "direct" &&
        conversation.primaryAgentId === selectedAgent.id,
    );
  }, [conversations, selectedAgent, selectedProject.id]);
  const currentMessages = useMemo(() => {
    if (!currentConversation) return [];
    return messages.filter((message) => message.conversationId === currentConversation.id);
  }, [currentConversation, messages]);

  useEffect(() => {
    if (selectedAgent && selectedAgent.id !== selectedAgentId) {
      setSelectedAgentId(selectedAgent.id);
    }
  }, [selectedAgent, selectedAgentId]);

  useEffect(() => {
    saveConfiguredAgents(agents);
  }, [agents]);

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
    window.localStorage.setItem(THEME_STORAGE_KEY, themeMode);
  }, [themeMode]);

  function toggleTheme() {
    setThemeMode((current) => (current === "dark" ? "light" : "dark"));
  }

  async function runConnectionTest(form: FormData) {
    setTestState("running");
    setTestMessage("");

    try {
      const agent = createAgentFromHermesSetup(form);
      const apiKey = String(form.get("apiKey") || "");
      const result = await new HermesA2AAdapter({ agent, apiKey }).testConnection();

      setTestState("passed");
      setTestMessage(`${result.card.name || agent.name} connected through ${result.mode}.`);
    } catch (error) {
      setTestState("failed");
      setTestMessage(error instanceof Error ? error.message : "Unable to load A2A Agent Card.");
    }
  }

  function resetConnectionTest() {
    if (testState !== "idle") {
      setTestState("idle");
    }
    setTestMessage("");
  }

  function closeSetup() {
    setShowSetup(false);
    setTestState("idle");
    setTestMessage("");
  }

  function saveDemoAgent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const newAgent = createAgentFromHermesSetup(form);
    const normalizedEndpoint = newAgent.endpoint.replace(/\/$/, "");
    const duplicate = agents.some(
      (agent) => agent.endpoint.replace(/\/$/, "") === normalizedEndpoint && agent.model === newAgent.model,
    );

    if (duplicate) {
      setTestState("failed");
      setTestMessage("This provider and model are already connected.");
      return;
    }

    setAgents((current) => {
      const shouldBecomeChief = current.length === 0 || !current.some((agent) => agent.isChief);
      return [...current, { ...newAgent, isChief: shouldBecomeChief }];
    });
    setSelectedAgentId(newAgent.id);
    closeSetup();
  }

  function setChiefAgent(agentId: string) {
    setAgents((current) =>
      current.map((agent) => ({
        ...agent,
        isChief: agent.id === agentId,
      })),
    );
  }

  function normalizeChief(agentsToNormalize: AgentInstance[]) {
    if (agentsToNormalize.length === 0) return agentsToNormalize;
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

  async function retestAgent(agentId: string) {
    const agent = agents.find((item) => item.id === agentId);
    if (!agent || retestingAgentIds.includes(agentId)) return;

    setRetestingAgentIds((current) => [...current, agentId]);
    setAgents((current) => current.map((item) => (item.id === agentId ? { ...item, status: "checking" } : item)));

    try {
      await new HermesA2AAdapter({ agent }).testConnection();
      setAgents((current) => current.map((item) => (item.id === agentId ? { ...item, status: "online" } : item)));
    } catch {
      setAgents((current) => current.map((item) => (item.id === agentId ? { ...item, status: "offline" } : item)));
    } finally {
      setRetestingAgentIds((current) => current.filter((id) => id !== agentId));
    }
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

  function openProjectDialog() {
    setEditingProjectId(null);
    setProjectFormError("");
    setShowProjectDialog(true);
  }

  function openProjectEditor(projectId: string) {
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
    const name = String(form.get("name") || "").trim();
    const description = String(form.get("description") || "").trim();
    const editingProject = editingProjectId ? projects.find((project) => project.id === editingProjectId) : undefined;

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
    };

    setProjects((current) => [...current, project]);
    setSelectedProjectId(project.id);
    closeProjectDialog();
  }

  function requestDeleteProject(projectId: string) {
    if (projects.length <= 1) return;
    setConfirmAction({ kind: "delete-project", projectId });
  }

  function deleteProject(projectId: string) {
    if (projects.length <= 1) return;
    const remainingProjects = projects.filter((project) => project.id !== projectId);
    const fallbackProject = remainingProjects[0];
    setProjects(remainingProjects);
    setConversations((current) => current.filter((conversation) => conversation.projectId !== projectId));
    setMessages((current) => current.filter((message) => message.projectId !== projectId));
    setRuns((current) => current.filter((run) => run.projectId !== projectId));
    setTasks((current) => current.filter((task) => task.projectId !== projectId));
    setArtifacts((current) => current.filter((artifact) => artifact.projectId !== projectId));
    if (selectedProjectId === projectId && fallbackProject) {
      setSelectedProjectId(fallbackProject.id);
    }
    setConfirmAction(null);
  }

  async function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = messageText.trim();
    if (!text || !selectedAgent || conversationMode === "task-room") return;

    const targetAgent = selectedAgent;
    const now = new Date().toISOString();
    const activeConversationMode = "direct";
    const existingConversation = conversations.find(
      (item) =>
        item.projectId === selectedProject.id &&
        item.mode === activeConversationMode &&
        item.primaryAgentId === targetAgent.id,
    );
    const conversation =
      existingConversation ??
      createConversation({
        projectId: selectedProject.id,
        namespace: selectedProject.namespace,
        mode: activeConversationMode,
        title: targetAgent.name,
        primaryAgentId: targetAgent.id,
        participantAgentIds: [targetAgent.id],
        createdAt: now,
      });
    const runId = crypto.randomUUID();
    const userMessageId = crypto.randomUUID();
    const participantAgentIds = [targetAgent.id];

    const userMessage: ConversationMessage = {
      id: userMessageId,
      conversationId: conversation.id,
      projectId: selectedProject.id,
      role: "user",
      contentParts: createTextParts(text),
      runId,
      status: "sending",
      createdAt: now,
    };
    const optimisticRun: ProjectRun = {
      id: runId,
      projectId: selectedProject.id,
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
    setMessages((current) => [...current, userMessage]);
    setRuns((current) => [optimisticRun, ...current]);
    setMessageText("");
    setOutputMode("outputs");

    try {
      const remoteTask = await new HermesA2AAdapter({ agent: targetAgent }).sendProjectMessage(selectedProject, text);
      const returnedArtifacts = mapA2AArtifacts(remoteTask, selectedProject.id, targetAgent.id);
      const returnedArtifactIds = returnedArtifacts.map((artifact) => artifact.id);
      const responseSummary = extractA2ATaskText(remoteTask) ?? `${targetAgent.name} returned an A2A task state.`;
      const mappedState = mapA2AState(remoteTask.status.state);
      const shouldCreateTask = !isDirectMessageResponse(remoteTask);
      const taskId = shouldCreateTask ? remoteTask.id || crypto.randomUUID() : undefined;
      const completedAt = remoteTask.status.timestamp ?? new Date().toISOString();

      setMessages((current) =>
        current.map((message) =>
          message.id === userMessageId
            ? {
                ...message,
                status: "sent",
              }
            : message,
        ),
      );

      if (responseSummary) {
        const agentMessage: ConversationMessage = {
          id: remoteTask.status.message?.messageId ?? crypto.randomUUID(),
          conversationId: conversation.id,
          projectId: selectedProject.id,
          role: "agent",
          agentId: targetAgent.id,
          contentParts: remoteTask.status.message?.parts ?? createTextParts(responseSummary),
          a2aMessageId: remoteTask.status.message?.messageId,
          taskId,
          runId,
          status: "sent",
          createdAt: completedAt,
        };
        setMessages((current) => [...current, agentMessage]);
      }

      if (returnedArtifacts.length > 0) {
        setArtifacts((current) => [...returnedArtifacts, ...current]);
      }

      if (shouldCreateTask && taskId) {
        const projectTask: ProjectTask = {
          id: taskId,
          projectId: selectedProject.id,
          contextId: remoteTask.contextId || selectedProject.namespace,
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
              label: "Agent returned an A2A task.",
              state: mappedState,
              timestamp: completedAt,
            },
          ],
          artifactIds: returnedArtifactIds,
          updatedAt: completedAt,
        };
        setTasks((current) => [projectTask, ...current.filter((task) => task.id !== taskId)]);
      }

      setRuns((current) =>
        current.map((run) =>
          run.id === runId
            ? {
                ...run,
                taskId,
                state: mappedState,
                eventIds: [...run.eventIds, `${runId}-completed`],
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
      setMessages((current) =>
        current.map((message) =>
          message.id === userMessageId
            ? {
                ...message,
                status: "failed",
              }
            : message,
        ),
      );
      setRuns((current) =>
        current.map((run) =>
          run.id === runId
            ? {
                ...run,
                state: "failed",
                eventIds: [...run.eventIds, `${runId}-failed`],
                updatedAt: failedAt,
              }
            : run,
        ),
      );
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          conversationId: conversation.id,
          projectId: selectedProject.id,
          role: "system",
          agentId: targetAgent.id,
          contentParts: createTextParts(error instanceof Error ? error.message : "A2A message/send failed."),
          runId,
          status: "sent",
          createdAt: failedAt,
        },
      ]);
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
                  <span>Agents</span>
                  <span className="count-badge">{agents.length}</span>
                </div>
                <div className="nav-list">
            {agents.length === 0 ? (
              <div className="inline-empty">Add an agent provider to start.</div>
            ) : null}
            {agents.map((agent) => (
              <button
                className={`nav-item ${selectedAgentId === agent.id ? "active" : ""}`}
                key={agent.id}
                onClick={() => {
                  setSelectedAgentId(agent.id);
                  setConversationMode("single");
                }}
              >
                <AgentAvatar agent={agent} />
                <span className="nav-item-content">
                  <span className="nav-item-title">
                    {agent.name}
                    {agent.isChief ? <span className="chief-dot">Chief</span> : null}
                  </span>
                  <span className="nav-item-meta">
                    <StatusDot status={agent.status} />
                    {agent.tags.slice(0, 2).join(" / ")}
                  </span>
                </span>
              </button>
            ))}
          </div>
          <button className="secondary-action" onClick={() => setShowSetup(true)}>
            <Plus size={16} />
            Add agent
          </button>
        </section>

        <section className="nav-section">
          <div className="section-label">
            <span>Projects</span>
            <button className="section-icon-button" type="button" onClick={openProjectDialog} aria-label="Create project" title="Create project">
              <Plus size={14} />
            </button>
          </div>
          <div className="nav-list">
            {projects.map((project) => {
              const isActive = selectedProjectId === project.id;
              return (
                <div className={`project-row ${isActive ? "active" : ""}`} key={project.id}>
                  <button className="project-item" onClick={() => setSelectedProjectId(project.id)}>
                    <Folder size={16} />
                    <span>
                      <span className="project-name">{project.name}</span>
                      <span className="project-namespace">{project.namespace}</span>
                    </span>
                  </button>
                  <div className="row-actions" aria-label={`${project.name} project actions`}>
                    <button
                      className="icon-button mini-button"
                      type="button"
                      onClick={() => openProjectEditor(project.id)}
                      aria-label={`Rename ${project.name}`}
                      title="Rename project"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      className="icon-button mini-button danger-button"
                      type="button"
                      onClick={() => requestDeleteProject(project.id)}
                      aria-label={`Delete ${project.name}`}
                      title="Delete project"
                      disabled={projects.length <= 1}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <button className="setup-card" onClick={() => setShowSetup(true)}>
          <UserRoundCog size={18} />
          <span>
            <strong>Office Setup</strong>
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
                <h2>{conversationMode === "single" ? selectedAgent?.name ?? "No agent connected" : "Chief-led task room"}</h2>
              </div>
              <div className="panel-actions">
                <span className="namespace-pill">{selectedProject.namespace}</span>
                <button className="secondary-button compact-button" onClick={() => setConversationMode("single")}>
                  Direct chat
                </button>
                <button className="secondary-button compact-button" onClick={() => setConversationMode("task-room")} disabled={agents.length === 0}>
                  Task room
                </button>
              </div>
            </div>

            {conversationMode === "single" && selectedAgent ? (
              <DirectChat messages={currentMessages} />
            ) : conversationMode === "single" ? (
              <NoAgentState onAddAgent={() => setShowSetup(true)} />
            ) : (
              <TaskRoom agents={agents} projectTask={scopedTasks[0]} />
            )}

            <form className="composer" onSubmit={submitMessage}>
              <label className="sr-only" htmlFor="message">
                Message
              </label>
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
                        ? `Ask ${selectedAgent.name} in ${selectedProject.name}`
                        : "Add an agent provider first"
                      : "Chief-led task room is planned for the next milestone"
                  }
                  disabled={conversationMode === "task-room"}
                />
                <button
                  className="primary-icon-button composer-send-button"
                  type="submit"
                  aria-label="Send message"
                  disabled={!selectedAgent || conversationMode === "task-room" || messageText.trim().length === 0}
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
            <div className="tabs" role="tablist" aria-label="Output modes">
              <TabButton active={outputMode === "browser"} onClick={() => setOutputMode("browser")}>
                Browser
              </TabButton>
              <TabButton active={outputMode === "outputs"} onClick={() => setOutputMode("outputs")}>
                Outputs
              </TabButton>
              <TabButton active={outputMode === "artifacts"} onClick={() => setOutputMode("artifacts")}>
                Artifacts
              </TabButton>
            </div>

            {outputMode === "browser" ? (
              <BrowserPreview
                browserUrl={browserUrl}
                previewUrl={previewUrl}
                onBrowserUrlChange={setBrowserUrl}
                onOpenPreview={openPreview}
              />
            ) : null}
            {outputMode === "outputs" ? (
              <ProjectTasks agents={agents} runs={scopedRuns} tasks={scopedTasks} artifacts={scopedArtifacts} />
            ) : null}
            {outputMode === "artifacts" ? (
              <ProjectArtifacts agents={agents} artifacts={scopedArtifacts} />
            ) : null}
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
          agents={agents}
          onSetChief={setChiefAgent}
          onRetestAgent={retestAgent}
          onDeleteAgent={requestDeleteAgent}
          retestingAgentIds={retestingAgentIds}
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

function extractA2ATaskText(task: A2ATask) {
  const parts = task.status.message?.parts ?? [];
  const text = parts.find((part) => part.kind === "text")?.text;
  if (text) return text;

  const artifactText = task.artifacts
    ?.flatMap((artifact) => artifact.parts)
    .find((part) => part.kind === "text")?.text;

  return artifactText;
}

function mapA2AArtifacts(task: A2ATask, projectId: string, agentId: string): ProjectArtifact[] {
  return (task.artifacts ?? []).map((artifact, index) => {
    const text = artifact.parts.find((part) => part.kind === "text")?.text;
    const hasFile = artifact.parts.some((part) => part.kind === "file");
    return {
      id: artifact.artifactId ?? `${task.id}-artifact-${index}`,
      projectId,
      taskId: task.id,
      agentId,
      name: artifact.name ?? `Artifact ${index + 1}`,
      kind: text ? "text" : hasFile ? "file" : "json",
      summary: artifact.description ?? text ?? "A2A artifact returned by the agent.",
      contentParts: artifact.parts,
      createdAt: task.status.timestamp ?? new Date().toISOString(),
    };
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

function getPartText(parts: A2APart[]) {
  return parts
    .map((part) => {
      if (part.kind === "text") return part.text;
      if (part.kind === "data") return JSON.stringify(part.data, null, 2);
      return part.file.name ?? part.file.uri ?? "File";
    })
    .join("\n");
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

function isDirectMessageResponse(task: A2ATask) {
  return task.metadata?.responseKind === "direct-message";
}

function slugifyProjectName(name: string) {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || `project-${Date.now()}`;
}

function StatusDot({ status }: { status: AgentStatus }) {
  return <span className={`status-dot ${status}`} aria-label={`Status: ${status}`} />;
}

function AgentAvatar({ agent, size = "regular" }: { agent: AgentInstance; size?: "regular" | "small" }) {
  const fallback = agent.name.slice(0, 1).toUpperCase();

  return (
    <span className={`avatar ${size === "small" ? "small" : ""}`} aria-hidden="true">
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

function DirectChat({ messages }: { messages: ConversationMessage[] }) {
  return (
    <div className="conversation-body">
      {messages.length === 0 ? (
        <div className="empty-state compact-empty">
          <MessageSquare size={32} />
          <h3>No messages yet</h3>
          <p>Start a project-scoped direct chat with this connected agent.</p>
        </div>
      ) : (
        messages.map((message) => {
          const isUser = message.role === "user";
          const isSystem = message.role === "system";
          return (
            <div className={`message-row ${isUser ? "user-message" : "agent-message"}`} key={message.id}>
              <div className={`${isUser ? "message-bubble" : "agent-output"} ${message.status} ${isSystem ? "system" : ""}`}>
                {isUser ? <p>{getPartText(message.contentParts)}</p> : <MarkdownContent content={getPartText(message.contentParts)} />}
              </div>
            </div>
          );
        })
      )}
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

function TaskRoom({ agents, projectTask }: { agents: AgentInstance[]; projectTask?: ProjectTask }) {
  const chief = agents.find((agent) => agent.isChief);
  const participants = projectTask
    ? agents.filter((agent) => projectTask.participantAgentIds.includes(agent.id))
    : agents.filter((agent) => agent.status === "online");

  return (
    <div className="conversation-body">
      <div className="task-summary">
        <div>
          <h3>{projectTask?.title ?? `${chief?.name ?? "Chief"} task room pending`}</h3>
          <p>{projectTask?.summary ?? "Direct chat is active now. Chief-led one-round delegation is the next milestone."}</p>
        </div>
        <span className="mode-badge">{projectTask?.state ?? "unsupported"}</span>
      </div>
      <div className="assignment-list">
        {participants.map((agent) => (
          <div className="assignment-row" key={agent.id}>
            <AgentAvatar agent={agent} size="small" />
            <div>
              <strong>{agent.name}</strong>
              <span>{agent.tags.join(" / ")}</span>
            </div>
            <span className={agent.status === "online" ? "status-badge success" : "status-badge danger"}>
              {agent.status}
            </span>
          </div>
        ))}
      </div>
    </div>
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
}: {
  agents: AgentInstance[];
  runs: ProjectRun[];
  tasks: ProjectTask[];
  artifacts: ProjectArtifact[];
}) {
  if (runs.length === 0 && tasks.length === 0) {
    return (
      <div className="empty-state tall">
        <MessageSquare size={32} />
        <h3>No runs in this project</h3>
        <p>Direct messages and Chief-led tasks will appear here.</p>
      </div>
    );
  }

  return (
    <div className="output-list">
      {runs.map((run) => {
        const owner = agents.find((item) => item.id === run.ownerAgentId);
        const runArtifacts = artifacts.filter((artifact) => run.artifactIds.includes(artifact.id));
        const linkedTask = tasks.find((task) => task.id === run.taskId);
        return (
          <article className="output-item run-item" key={run.id}>
            <div className="output-title-row">
              <div>
                <h3>{linkedTask?.title ?? (run.type === "direct_message" ? "Direct message" : "Chief delegation")}</h3>
                <span>{owner?.name ?? "Agent"} / {run.type.replace("_", " ")}</span>
              </div>
              <span className={`status-badge ${run.state}`}>{run.state}</span>
            </div>
            <p>{linkedTask?.summary ?? "Project-scoped run record."}</p>
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
      {tasks.map((task) => {
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
            <p>{task.summary}</p>
            <div className="task-event-list">
              {task.events.map((event) => {
                const agent = agents.find((item) => item.id === event.agentId);
                return (
                  <div className="task-event" key={event.id}>
                    <span className={`status-dot ${event.state === "completed" ? "online" : "checking"}`} />
                    <span>{agent?.name ?? "Agent"}</span>
                    <strong>{event.label}</strong>
                  </div>
                );
              })}
            </div>
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

function ProjectArtifacts({ agents, artifacts }: { agents: AgentInstance[]; artifacts: ProjectArtifact[] }) {
  if (artifacts.length === 0) {
    return (
      <div className="empty-state tall">
        <MessageSquare size={32} />
        <h3>No artifacts in this project</h3>
        <p>A2A task artifacts stay scoped to the selected Project.</p>
      </div>
    );
  }

  return (
    <div className="output-list">
      {artifacts.map((artifact) => {
        const agent = agents.find((item) => item.id === artifact.agentId);
      return (
        <article className="output-item" key={artifact.id}>
          <div className="output-title-row">
            <div>
              <h3>{artifact.name}</h3>
                <span>{agent?.name ?? "Agent"} / {artifact.kind}</span>
            </div>
            <span className="status-badge completed">artifact</span>
          </div>
          <ArtifactPreview artifact={artifact} />
        </article>
      );
    })}
  </div>
  );
}

function ArtifactPreview({ artifact }: { artifact: ProjectArtifact }) {
  const parts = artifact.contentParts ?? createTextParts(artifact.summary);
  const imageParts = getImageFileParts(parts);
  const text = getPartText(parts);

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
            Project name
            <input name="name" defaultValue={project?.name ?? ""} required autoFocus />
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

function SetupWizard({
  testState,
  testMessage,
  onClose,
  onRunTest,
  onResetTest,
  onSaveAgent,
  agents,
  onSetChief,
  onRetestAgent,
  onDeleteAgent,
  retestingAgentIds,
}: {
  testState: ConnectionTestState;
  testMessage: string;
  onClose: () => void;
  onRunTest: (form: FormData) => void;
  onResetTest: () => void;
  onSaveAgent: (event: FormEvent<HTMLFormElement>) => void;
  agents: AgentInstance[];
  onSetChief: (agentId: string) => void;
  onRetestAgent: (agentId: string) => void;
  onDeleteAgent: (agentId: string) => void;
  retestingAgentIds: string[];
}) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="setup-dialog" role="dialog" aria-modal="true" aria-labelledby="setup-title">
        <div className="setup-header">
          <div>
            <div className="eyebrow">Office Setup</div>
            <h2 id="setup-title">Connect an agent provider</h2>
            <p>Map an existing agent into Vibe Office without copying its memory or personality.</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close setup">
            <XCircle size={18} />
          </button>
        </div>

        <div className="stepper" aria-label="Setup steps">
          {setupSteps.map((step, index) => (
            <div className="step" key={step}>
              <span>{index + 1}</span>
              {step}
            </div>
          ))}
        </div>

        <section className="agent-management" aria-label="Connected agents">
          <div className="management-heading">
            <h3>Connected agents</h3>
            <span>{agents.length}</span>
          </div>
          {agents.length === 0 ? (
            <p>No real agents connected yet.</p>
          ) : (
            <div className="management-list">
              {agents.map((agent) => (
                <div className="management-row" key={agent.id}>
                  <AgentAvatar agent={agent} size="small" />
                  <div className="management-content">
                    <strong>{agent.name}</strong>
                    <span>{agent.location} / {agent.tags.slice(0, 2).join(" / ")}</span>
                  </div>
                  <div className="management-actions">
                    {agent.isChief ? (
                      <span className="chief-dot">Chief</span>
                    ) : (
                      <button className="secondary-button compact-button" type="button" onClick={() => onSetChief(agent.id)}>
                        Set Chief
                      </button>
                    )}
                    <button
                      className="icon-button mini-button"
                      type="button"
                      onClick={() => onRetestAgent(agent.id)}
                      aria-label={`Retest ${agent.name}`}
                      title="Retest agent"
                      disabled={retestingAgentIds.includes(agent.id)}
                    >
                      {retestingAgentIds.includes(agent.id) ? <Loader2 className="spin" size={14} /> : <RefreshCw size={14} />}
                    </button>
                    <button
                      className="icon-button mini-button danger-button"
                      type="button"
                      onClick={() => onDeleteAgent(agent.id)}
                      aria-label={`Delete ${agent.name}`}
                      title="Delete agent"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <form className="setup-form" onSubmit={onSaveAgent} onChange={onResetTest}>
          <div className="form-grid">
            <label>
              Agent name
              <input name="name" defaultValue="Local Hermes" required />
              <span>Shown in the left Agent list.</span>
            </label>
            <label>
              Avatar URL
              <input name="avatarUrl" placeholder="https://..." />
              <span>Optional image used in the registry and setup views.</span>
            </label>
            <label>
              Base URL
              <input name="endpoint" defaultValue="http://127.0.0.1:8642/v1" required />
              <span>Provider API endpoint if available.</span>
            </label>
            <label>
              A2A endpoint
              <input name="a2aEndpoint" defaultValue="http://127.0.0.1:8642/a2a" required />
              <span>JSON-RPC A2A service endpoint.</span>
            </label>
            <label>
              Agent Card URL
              <input name="agentCardUrl" defaultValue="http://127.0.0.1:8642/.well-known/agent-card.json" required />
              <span>Discovery contract for skills and capabilities.</span>
            </label>
            <label>
              API key
              <input name="apiKey" type="password" required />
              <span>Stored locally and never used as UI copy.</span>
            </label>
            <label>
              Model or Agent ID
              <input name="model" defaultValue="hermes-agent" required />
              <span>The target identity inside this provider.</span>
            </label>
            <label>
              Instance location
              <input name="location" defaultValue="WSL local" required />
              <span>Used to distinguish local and remote instances.</span>
            </label>
          </div>

          <details className="advanced-settings">
            <summary>
              <ChevronDown size={16} />
              Advanced settings
            </summary>
            <div className="form-grid">
              <label>
                Namespace prefix
                <input name="namespace" defaultValue="vibe-office" />
                <span>Projects append their own memory namespace.</span>
              </label>
              <label>
                Timeout
                <input name="timeout" defaultValue="60s" />
                <span>Used for remote cloud instances.</span>
              </label>
            </div>
          </details>

          <div className="test-panel">
            <div>
              <h3>A2A connection test</h3>
              <p>Vibe Office loads the Agent Card before saving this provider.</p>
            </div>
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
              Load Agent Card
            </button>
          </div>

          <div className="diagnostics">
            <DiagnosticRow label="Agent Card reachable" state={testState} />
            <DiagnosticRow label="A2A endpoint configured" state={testState} />
            <DiagnosticRow label="Capability discovery ready" state={testState} />
            {testMessage ? <div className={`test-message ${testState}`}>{testMessage}</div> : null}
          </div>

          <div className="form-grid">
            <label>
              Responsibility
              <input name="role" defaultValue="Local Hermes agent runtime" required />
              <span>Required so Chief can dispatch the right work.</span>
            </label>
            <label>
              Capability tags
              <input name="tags" defaultValue="local, hermes, runtime" required />
              <span>Separate tags with commas.</span>
            </label>
          </div>

          <div className="setup-actions">
            <button type="button" className="secondary-button" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="primary-button" disabled={testState !== "passed"}>
              Save agent
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
