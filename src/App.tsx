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
  Plus,
  RefreshCw,
  Sparkles,
  Sun,
  UserRoundCog,
  XCircle,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import type { CSSProperties, PointerEvent } from "react";
import type { A2ATask } from "./domain/a2a";
import { createAgentFromHermesSetup } from "./domain/hermesSetup";
import { projectArtifacts, projectTasks, projects, setupSteps } from "./domain/seedData";
import type { ProjectArtifact, ProjectTask } from "./domain/projectScope";
import type { AgentInstance, AgentStatus } from "./domain/types";
import { loadConfiguredAgents, saveConfiguredAgents } from "./services/agentStorage";
import { HermesA2AAdapter } from "./services/hermesA2AAdapter";

type OutputMode = "browser" | "outputs" | "artifacts";
type ConversationMode = "single" | "task-room";
type ConnectionTestState = "idle" | "running" | "passed" | "failed";
type ThemeMode = "dark" | "light";

const THEME_STORAGE_KEY = "vibe-office.theme";

export function App() {
  const [agents, setAgents] = useState<AgentInstance[]>(() => loadConfiguredAgents());
  const [tasks, setTasks] = useState<ProjectTask[]>(projectTasks);
  const [artifacts, setArtifacts] = useState<ProjectArtifact[]>(projectArtifacts);
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState("default");
  const [conversationMode, setConversationMode] = useState<ConversationMode>("single");
  const [outputMode, setOutputMode] = useState<OutputMode>("browser");
  const [messageText, setMessageText] = useState("");
  const [browserUrl, setBrowserUrl] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [showSetup, setShowSetup] = useState(false);
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
  const scopedArtifacts = useMemo(
    () => artifacts.filter((artifact) => artifact.projectId === selectedProject.id),
    [selectedProject.id, artifacts],
  );

  useEffect(() => {
    if (selectedAgent && selectedAgent.id !== selectedAgentId) {
      setSelectedAgentId(selectedAgent.id);
    }
  }, [selectedAgent, selectedAgentId]);

  useEffect(() => {
    saveConfiguredAgents(agents);
  }, [agents]);

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

  async function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = messageText.trim();
    if (!text || !selectedAgent) return;

    const targetAgent =
      conversationMode === "task-room"
        ? agents.find((agent) => agent.isChief) ?? selectedAgent
        : selectedAgent;
    const taskId = `task-${Date.now()}`;
    const now = new Date().toISOString();
    const participantAgentIds =
      conversationMode === "task-room"
        ? agents.filter((agent) => agent.status === "online").map((agent) => agent.id)
        : [targetAgent.id];

    const optimisticTask: ProjectTask = {
      id: taskId,
      projectId: selectedProject.id,
      contextId: selectedProject.namespace,
      title: text.length > 56 ? `${text.slice(0, 56)}...` : text,
      ownerAgentId: targetAgent.id,
      participantAgentIds,
      state: "submitted",
      summary:
        conversationMode === "task-room"
          ? "Chief will coordinate this as a project-scoped A2A task."
          : `${targetAgent.name} received this as a direct A2A task.`,
      events: [
        {
          id: `${taskId}-submitted`,
          taskId,
          agentId: targetAgent.id,
          label: `Submitted through ${selectedProject.namespace}.`,
          state: "submitted",
          timestamp: now,
        },
      ],
      artifactIds: [],
      updatedAt: now,
    };

    setTasks((current) => [optimisticTask, ...current]);
    setMessageText("");
    setOutputMode("outputs");

    try {
      const remoteTask = await new HermesA2AAdapter({ agent: targetAgent }).sendProjectMessage(selectedProject, text);
      const returnedArtifacts = mapA2AArtifacts(remoteTask, selectedProject.id, targetAgent.id);
      const returnedArtifactIds = returnedArtifacts.map((artifact) => artifact.id);
      const responseSummary = extractA2ATaskText(remoteTask) ?? "Hermes returned an A2A task state.";

      if (returnedArtifacts.length > 0) {
        setArtifacts((current) => [...returnedArtifacts, ...current]);
      }

      setTasks((current) =>
        current.map((task) =>
          task.id === taskId
            ? {
                ...task,
                id: remoteTask.id || task.id,
                state: remoteTask.status.state,
                summary: responseSummary,
                events: [
                  ...task.events,
                  {
                    id: `${taskId}-accepted`,
                    taskId,
                    agentId: targetAgent.id,
                    label: "Hermes returned an A2A task state.",
                    state: remoteTask.status.state,
                    timestamp: remoteTask.status.timestamp ?? new Date().toISOString(),
                  },
                ],
                artifactIds: [...returnedArtifactIds, ...task.artifactIds],
                updatedAt: remoteTask.status.timestamp ?? new Date().toISOString(),
              }
            : task,
        ),
      );
    } catch (error) {
      setTasks((current) =>
        current.map((task) =>
          task.id === taskId
            ? {
                ...task,
                state: "failed",
                summary: error instanceof Error ? error.message : "A2A message/send failed.",
                events: [
                  ...task.events,
                  {
                    id: `${taskId}-failed`,
                    taskId,
                    agentId: targetAgent.id,
                    label: "A2A message/send failed.",
                    state: "failed",
                    timestamp: new Date().toISOString(),
                  },
                ],
                updatedAt: new Date().toISOString(),
              }
            : task,
        ),
      );
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
                <span className="avatar" aria-hidden="true">
                  {agent.name.slice(0, 1)}
                </span>
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
          <div className="section-label">Projects</div>
          <div className="nav-list">
            {projects.map((project) => (
              <button
                className={`project-item ${selectedProjectId === project.id ? "active" : ""}`}
                key={project.id}
                onClick={() => setSelectedProjectId(project.id)}
              >
                <Folder size={16} />
                <span>
                  <span className="project-name">{project.name}</span>
                </span>
              </button>
            ))}
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
                <button className="primary-button compact-button" onClick={() => setConversationMode("task-room")} disabled={agents.length === 0}>
                  Task room
                </button>
              </div>
            </div>

            {conversationMode === "single" && selectedAgent ? (
              <DirectChat agent={selectedAgent} />
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
                      : "Describe the task for Chief to split and dispatch"
                  }
                />
                <button
                  className="primary-icon-button composer-send-button"
                  type="submit"
                  aria-label="Send message"
                  disabled={!selectedAgent || messageText.trim().length === 0}
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
              <ProjectTasks agents={agents} tasks={scopedTasks} artifacts={scopedArtifacts} />
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
    return {
      id: artifact.artifactId ?? `${task.id}-artifact-${index}`,
      projectId,
      taskId: task.id,
      agentId,
      name: artifact.name ?? `Artifact ${index + 1}`,
      kind: text ? "text" : "json",
      summary: artifact.description ?? text ?? "A2A artifact returned by the agent.",
      createdAt: task.status.timestamp ?? new Date().toISOString(),
    };
  });
}

function StatusDot({ status }: { status: AgentStatus }) {
  return <span className={`status-dot ${status}`} aria-label={`Status: ${status}`} />;
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

function DirectChat({ agent }: { agent: AgentInstance }) {
  return (
    <div className="conversation-body">
      <div className="message-row agent-message">
        <span className="avatar small">{agent.name.slice(0, 1)}</span>
        <div className="session-line">
          <strong>{agent.name}</strong>
          <span>{agent.location} / A2A</span>
        </div>
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

function TaskRoom({ agents, projectTask }: { agents: AgentInstance[]; projectTask?: ProjectTask }) {
  const chief = agents.find((agent) => agent.isChief);
  const participants = projectTask
    ? agents.filter((agent) => projectTask.participantAgentIds.includes(agent.id))
    : agents.filter((agent) => agent.status === "online");

  return (
    <div className="conversation-body">
      <div className="task-summary">
        <div>
          <h3>{projectTask?.title ?? `${chief?.name ?? "Chief"} coordinates A2A task`}</h3>
          <p>{projectTask?.summary ?? "Chief opens project-scoped A2A tasks and routes work to connected agents."}</p>
        </div>
        <span className="mode-badge">{projectTask?.state ?? "submitted"}</span>
      </div>
      <div className="assignment-list">
        {participants.map((agent) => (
          <div className="assignment-row" key={agent.id}>
            <span className="avatar small">{agent.name.slice(0, 1)}</span>
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
  tasks,
  artifacts,
}: {
  agents: AgentInstance[];
  tasks: ProjectTask[];
  artifacts: ProjectArtifact[];
}) {
  if (tasks.length === 0) {
    return (
      <div className="empty-state tall">
        <MessageSquare size={32} />
        <h3>No tasks in this project</h3>
        <p>Chief-led A2A tasks will appear here.</p>
      </div>
    );
  }

  return (
    <div className="output-list">
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
            <p>{artifact.summary}</p>
          </article>
        );
      })}
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
}: {
  testState: ConnectionTestState;
  testMessage: string;
  onClose: () => void;
  onRunTest: (form: FormData) => void;
  onResetTest: () => void;
  onSaveAgent: (event: FormEvent<HTMLFormElement>) => void;
  agents: AgentInstance[];
  onSetChief: (agentId: string) => void;
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
                  <span className="avatar small">{agent.name.slice(0, 1)}</span>
                  <div>
                    <strong>{agent.name}</strong>
                    <span>{agent.location} / {agent.tags.slice(0, 2).join(" / ")}</span>
                  </div>
                  {agent.isChief ? (
                    <span className="chief-dot">Chief</span>
                  ) : (
                    <button className="secondary-button compact-button" type="button" onClick={() => onSetChief(agent.id)}>
                      Set Chief
                    </button>
                  )}
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
