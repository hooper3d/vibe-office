"use client";

import { EventType, type AGUIEvent } from "@ag-ui/core";
import { Bot, Check, CheckSquare, Database, ExternalLink, FolderKanban, History, PackageOpen, Plus, Settings, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AgentStatus } from "@/components/AgentStatus";
import { ContextHubPanel } from "@/components/ContextHubPanel";
import { EventStream } from "@/components/EventStream";
import { Header } from "@/components/Header";
import { LucyConversationPanel, type LucyConversationMessage } from "@/components/LucyConversationPanel";
import { RequirementComposer } from "@/components/RequirementComposer";
import { TaskList } from "@/components/TaskList";
import { sendAguiInput } from "@/lib/agui-client";
import { initialAgents, initialTasks, projects as initialProjects } from "@/lib/mock-data";
import type {
  AgentAction,
  AgentName,
  AgentStatus as AgentStatusValue,
  ProjectId,
  ProjectProfile
} from "@/types/agent";
import type { Artifact } from "@/types/artifact";
import type { ConsoleEvent } from "@/types/event";
import type { LucyPlan, TaskItem, TaskPlanStatus, TaskPriority } from "@/types/task";

type HistoryResponse = {
  events?: ConsoleEvent[];
  lastResult?: {
    command?: string;
    outputText?: string;
    status?: string;
  } | null;
  lucyPlan?: LucyPlan | null;
  runnerStatus?: RunnerStatus;
};

type RunnerStatus = {
  enabled: boolean;
  rayWorkspaceWriteEnabled: boolean;
};

type HermesAgentStatusResponse = {
  connected?: boolean;
  message?: string;
};

type Notice = {
  message: string;
  tone: "success" | "attention";
};

type OfficePanel = "tasks" | "archive" | "outputs" | "history" | null;

type ComposerRoute = {
  target: AgentName;
  message: string;
};

type AgentConversations = Record<AgentName, LucyConversationMessage[]>;

type ProjectRuntimeState = {
  projectId: ProjectId;
  tasks: TaskItem[];
  agents: typeof initialAgents;
  events: ConsoleEvent[];
  requirement: string;
  lucyPlan: LucyPlan | null;
  conversations: AgentConversations;
  activeConversationAgent: AgentName;
  lucyConversationActive: boolean;
  pendingArtifacts: Artifact[];
};

const LUCY_SYSTEM_PREFIXES = [
  "Lucy 已收到控制台意图：提交需求。正在连接 Hermes Lucy。",
  "Lucy 已收到控制台意图：提交需求并编排。开始读取本地工作区上下文。",
  "Lucy 已收到控制台意图：生成 Lucy 任务计划。开始读取本地工作区上下文。"
];
const PROJECTS_STORAGE_KEY = "vibe-office-projects-v1";
const PROJECT_RUNTIME_STORAGE_KEY = "vibe-office-project-runtime-v1";
const ACTIVE_PROJECT_STORAGE_KEY = "vibe-office-active-project-v1";

function cleanLucyDelta(delta: string) {
  return LUCY_SYSTEM_PREFIXES.reduce((current, prefix) => current.replace(prefix, ""), delta);
}

function formatArtifactTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(value));
}

function artifactTypeLabel(type: Artifact["type"]) {
  if (type === "image") return "Image";
  if (type === "markdown") return "Markdown";
  if (type === "file") return "File";
  return "URL";
}

function sidebarAgentStatus(agent: (typeof initialAgents)[number]) {
  if (agent.status === "working") return { label: "工作中", dot: "bg-sky-400", text: "text-sky-200" };
  if (agent.status === "blocked") return { label: "需处理", dot: "bg-rose-400", text: "text-rose-200" };
  if (agent.status === "waiting") return { label: "等待中", dot: "bg-amber-400", text: "text-amber-200" };
  if (agent.status === "offline") return { label: "离线", dot: "bg-slate-500", text: "text-slate-400" };
  return { label: "空闲中", dot: "bg-emerald-400", text: "text-emerald-200" };
}

function isAgentName(value: unknown): value is AgentName {
  return value === "Lucy" || value === "Ray" || value === "Tiger" || value === "Musk";
}

function extractComposerRoute(value: string, fallbackAgent: AgentName = "Lucy"): ComposerRoute {
  const trimmed = value.trim();
  const match = trimmed.match(/^@(Lucy|Ray|Tiger|Musk)\s*/i);
  if (!match) return { target: fallbackAgent, message: trimmed };

  const rawTarget = match[1];
  const normalizedTarget = rawTarget.slice(0, 1).toUpperCase() + rawTarget.slice(1).toLowerCase();
  return {
    target: isAgentName(normalizedTarget) ? normalizedTarget : fallbackAgent,
    message: trimmed.slice(match[0].length).trim()
  };
}

function emptyConversations(): AgentConversations {
  return {
    Lucy: [],
    Ray: [],
    Tiger: [],
    Musk: []
  };
}

function appendConversationMessage(
  conversations: AgentConversations,
  agentName: AgentName,
  message: LucyConversationMessage
): AgentConversations {
  return {
    ...conversations,
    [agentName]: [...conversations[agentName], message]
  };
}

function appendConversationDelta(
  conversations: AgentConversations,
  messageId: string,
  delta: string
): AgentConversations {
  let changed = false;
  const next = { ...conversations };

  for (const agentName of Object.keys(next) as AgentName[]) {
    const messages = next[agentName];
    const messageIndex = messages.findIndex((message) => message.role === "agent" && message.id === messageId);
    if (messageIndex < 0) continue;

    changed = true;
    next[agentName] = messages.map((message, index) =>
      index === messageIndex ? { ...message, content: `${message.content}${delta}` } : message
    );
  }

  return changed ? next : conversations;
}

function appendConversationArtifacts(
  conversations: AgentConversations,
  messageId: string,
  artifacts: Artifact[]
): AgentConversations {
  const cleanArtifacts = artifacts.filter((artifact) => !artifact.sourceUrl || !/[-.,;:!?)\]]$/.test(artifact.sourceUrl));
  if (!cleanArtifacts.length) return conversations;

  let changed = false;
  const next = { ...conversations };

  for (const agentName of Object.keys(next) as AgentName[]) {
    const messages = next[agentName];
    const messageIndex = messages.findIndex((message) => message.role === "agent" && message.id === messageId);
    if (messageIndex < 0) continue;

    changed = true;
    next[agentName] = messages.map((message, index) => {
      if (index !== messageIndex) return message;
      const existingIds = new Set((message.artifacts || []).map((artifact) => artifact.id));
      const newArtifacts = cleanArtifacts.filter((artifact) => !existingIds.has(artifact.id));
      return { ...message, artifacts: [...(message.artifacts || []), ...newArtifacts] };
    });
  }

  return changed ? next : conversations;
}

function buildConversationsFromEvents(events: ConsoleEvent[]) {
  let conversations = emptyConversations();

  for (const event of events) {
    if (event.type === EventType.RUN_STARTED) {
      const input = event.input as
        | {
            state?: {
              intent?: {
                action?: string;
                message?: string;
                targetAgent?: string;
                attachments?: Artifact[];
              };
            };
          }
        | undefined;
      const intent = input?.state?.intent;
      if (
        (intent?.action === "submit_requirement_to_lucy" || intent?.action === "manual_message") &&
        intent.message
      ) {
        const targetAgent = isAgentName(intent.targetAgent) ? intent.targetAgent : "Lucy";
        conversations = appendConversationMessage(conversations, targetAgent, {
          id: `user-${event.runId || event.timestamp || conversations[targetAgent].length}`,
          role: "user",
          content: intent.message,
          artifacts: intent.attachments
        });
      }
    }

    if (event.type === EventType.TEXT_MESSAGE_START && isAgentName(event.name)) {
      conversations = appendConversationMessage(conversations, event.name, {
        id: event.messageId,
        role: "agent",
        agentName: event.name,
        content: ""
      });
    }

    if (event.type === EventType.TEXT_MESSAGE_CONTENT) {
      conversations = appendConversationDelta(conversations, event.messageId, cleanLucyDelta(event.delta));
    }

    if (event.type === EventType.CUSTOM && event.name === "artifacts_registered") {
      const value = event.value as { messageId?: string; artifacts?: Artifact[] } | undefined;
      if (value?.messageId && value.artifacts?.length) {
        conversations = appendConversationArtifacts(conversations, value.messageId, value.artifacts);
      }
    }
  }

  return Object.fromEntries(
    (Object.keys(conversations) as AgentName[]).map((agentName) => [
      agentName,
      conversations[agentName].filter((message) => message.content.trim() || message.artifacts?.length)
    ])
  ) as AgentConversations;
}

function hasConversationMessages(conversations: AgentConversations) {
  return (Object.keys(conversations) as AgentName[]).some((agentName) => conversations[agentName].length > 0);
}

function latestConversationAgentFromEvents(events: ConsoleEvent[]): AgentName | undefined {
  for (const event of [...events].reverse()) {
    if (event.type === EventType.TEXT_MESSAGE_START && isAgentName(event.name)) return event.name;
    if (event.type === EventType.RUN_STARTED) {
      const input = event.input as
        | {
            state?: {
              intent?: {
                action?: string;
                targetAgent?: string;
              };
            };
          }
        | undefined;
      const intent = input?.state?.intent;
      if (
        (intent?.action === "submit_requirement_to_lucy" || intent?.action === "manual_message") &&
        isAgentName(intent.targetAgent)
      ) {
        return intent.targetAgent;
      }
    }
  }
  return undefined;
}

function OutputsCabinetPanel({
  owners,
  owner,
  artifacts,
  allArtifacts,
  onOwnerChange
}: {
  owners: AgentName[];
  owner: AgentName;
  artifacts: Artifact[];
  allArtifacts: Artifact[];
  onOwnerChange: (owner: AgentName) => void;
}) {
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <div className="mb-4 flex flex-wrap gap-2">
        {owners.map((agentName) => {
          const count = allArtifacts.filter((artifact) => artifact.owner === agentName).length;
          return (
            <button
              key={agentName}
              type="button"
              onClick={() => onOwnerChange(agentName)}
              className={`rounded-lg border px-3 py-1.5 text-left text-xs transition ${
                owner === agentName
                  ? "border-emerald-300/45 bg-emerald-400/14 text-emerald-100"
                  : "border-slate-800/80 bg-slate-900/42 text-slate-300 hover:border-emerald-400/30 hover:text-slate-100"
              }`}
            >
              <span className="font-semibold">{agentName}</span>
              <span className="ml-2 text-slate-500">{count}</span>
            </button>
          );
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-auto pr-1 scrollbar-thin">
        {artifacts.length ? (
          <div className="grid gap-2">
            {artifacts.map((artifact) => {
              const href = artifact.accessUrl || artifact.sourceUrl || artifact.path || "";
              return (
                <div key={artifact.id} className="rounded-lg border border-slate-800/90 bg-slate-950/42 px-3 py-2">
                  <div className="flex min-w-0 items-center gap-3">
                    {artifact.type === "image" && href ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={href}
                        alt={artifact.title}
                        className="h-14 w-14 shrink-0 rounded-md border border-slate-700/80 object-cover"
                      />
                    ) : (
                      <PackageOpen className="h-4 w-4 shrink-0 text-emerald-300" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-100">{artifact.title}</p>
                      <p className="mt-1 text-xs text-slate-400">
                        {artifactTypeLabel(artifact.type)} / {artifact.owner} / {formatArtifactTime(artifact.createdAt)}
                      </p>
                    </div>
                    {href ? (
                      <a
                        href={href}
                        target="_blank"
                        rel="noreferrer"
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-slate-400 transition hover:bg-slate-800 hover:text-slate-100"
                        title="Open"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    ) : null}
                  </div>
                  {artifact.description ? (
                    <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-400">{artifact.description}</p>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="grid h-full min-h-[180px] place-items-center text-center">
            <div>
              <p className="text-sm font-semibold text-slate-200">{owner} has no outputs yet</p>
              <p className="mt-2 text-xs text-slate-500">Choose another Agent above, or ask this Agent to create something.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function OfficeSidebar({
  agents,
  projects,
  activeProjectId,
  activeAgent,
  running,
  connection,
  onSelectAgent,
  onProjectChange,
  onCreateProject
}: {
  agents: typeof initialAgents;
  projects: ProjectProfile[];
  activeProjectId: ProjectId;
  activeAgent: AgentName;
  running: boolean;
  connection: "Local Connected" | "Streaming" | "Error";
  onSelectAgent: (agentName: AgentName) => void;
  onProjectChange: (projectId: ProjectId) => void;
  onCreateProject: (name: string) => void;
}) {
  const [creatingProject, setCreatingProject] = useState(false);
  const [projectDraft, setProjectDraft] = useState("");
  const onlineAgents = agents.filter((agent) => agent.status !== "offline").length;
  void connection;

  function submitProjectDraft() {
    const name = projectDraft.trim();
    if (!name) return;
    onCreateProject(name);
    setProjectDraft("");
    setCreatingProject(false);
  }

  return (
    <aside className="frost flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl p-4">
      <section className="shrink-0">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <Bot className="h-4 w-4 text-slate-300" />
            <p className="text-xs font-semibold uppercase text-slate-500">Agent</p>
          </div>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
              running ? "bg-sky-400/10 text-sky-200" : "bg-emerald-400/10 text-emerald-200"
            }`}
          >
            {onlineAgents}/{agents.length}
          </span>
        </div>
        <div className="space-y-1.5">
          {agents.map((agent) => {
            const status = sidebarAgentStatus(agent);
            return (
              <button
                key={agent.name}
                type="button"
                onClick={() => onSelectAgent(agent.name)}
                className={`grid w-full min-w-0 grid-cols-[32px_minmax(0,1fr)] items-center gap-2 rounded-lg border px-2 py-2 text-left transition ${
                  activeAgent === agent.name
                    ? "border-sky-300/35 bg-sky-400/10"
                    : "border-transparent bg-slate-950/16 hover:border-slate-800 hover:bg-slate-900/38"
                }`}
              >
                <span
                  className={`grid h-8 w-8 place-items-center rounded-full text-xs font-semibold ${
                    agent.tone === "violet"
                      ? "bg-violet-200 text-violet-700"
                      : agent.tone === "blue"
                        ? "bg-blue-100 text-blue-700"
                        : agent.tone === "amber"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-slate-200 text-slate-700"
                  }`}
                >
                  {agent.name.slice(0, 1)}
                </span>
                <span className="min-w-0">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-sm font-semibold text-slate-100">{agent.name}</span>
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${status.dot}`} />
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] text-slate-500">{agent.role}</span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="mt-5 flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="mb-2 flex shrink-0 items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <FolderKanban className="h-4 w-4 text-slate-300" />
            <p className="text-xs font-semibold uppercase text-slate-500">Projects</p>
          </div>
        </div>

        <div className="scrollbar-thin min-h-0 flex-1 space-y-0.5 overflow-auto pr-1">
          {creatingProject ? (
            <div className="flex h-8 min-w-0 items-center gap-1 rounded-md bg-slate-950/18 px-2">
              <FolderKanban className="h-4 w-4 shrink-0 text-slate-400" />
              <input
                value={projectDraft}
                onChange={(event) => setProjectDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") submitProjectDraft();
                  if (event.key === "Escape") {
                    setProjectDraft("");
                    setCreatingProject(false);
                  }
                }}
                autoFocus
                placeholder="Project name"
                className="h-7 min-w-0 flex-1 bg-transparent px-1 text-xs font-medium text-slate-100 outline-none placeholder:text-slate-500"
              />
              <button
                type="button"
                onClick={() => {
                  setProjectDraft("");
                  setCreatingProject(false);
                }}
                className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-slate-500 transition hover:bg-slate-900/70 hover:text-slate-100"
                title="Cancel"
              >
                <X className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={submitProjectDraft}
                disabled={!projectDraft.trim()}
                className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-emerald-300 transition hover:bg-emerald-400/12 disabled:cursor-not-allowed disabled:opacity-35"
                title="Create"
              >
                <Check className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setCreatingProject(true)}
              className="flex h-8 w-full min-w-0 items-center gap-2 rounded-md px-2 text-left text-xs font-medium text-slate-300 transition hover:bg-slate-900/45 hover:text-slate-100"
            >
              <Plus className="h-4 w-4 shrink-0 text-slate-400" />
              <span className="truncate">新建项目</span>
            </button>
          )}
          {projects.map((project) => (
            <button
              key={project.id}
              type="button"
              onClick={() => onProjectChange(project.id)}
              className={`flex h-9 w-full min-w-0 items-center gap-2 rounded-lg border px-2 text-left text-xs font-medium transition ${
                activeProjectId === project.id
                  ? "border-sky-300/35 bg-sky-400/10 text-slate-100"
                  : "border-transparent text-slate-300 hover:border-slate-800 hover:bg-slate-900/45 hover:text-slate-100"
              }`}
            >
              <FolderKanban className={`h-4 w-4 shrink-0 ${activeProjectId === project.id ? "text-sky-300" : "text-slate-400"}`} />
              <span className="truncate">{project.name}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="mt-4 shrink-0 border-t border-slate-800/80 pt-3">
        <button
          type="button"
          className="flex w-full min-w-0 items-center gap-2 rounded-lg border border-transparent bg-slate-950/16 px-2.5 py-2 text-left text-xs font-semibold text-slate-300 transition hover:border-slate-800 hover:bg-slate-900/38"
        >
          <Settings className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <span className="truncate">Settings</span>
        </button>
      </section>
    </aside>
  );
}

function createEmptyProjectRuntime(projectId: ProjectId): ProjectRuntimeState {
  return {
    projectId,
    tasks: [],
    agents: initialAgents,
    events: [],
    requirement: "",
    lucyPlan: null,
    conversations: emptyConversations(),
    activeConversationAgent: "Lucy",
    lucyConversationActive: false,
    pendingArtifacts: []
  };
}

function clock() {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
    hour12: false
  }).format(new Date());
}

function targetForAction(action: AgentAction): AgentName {
  if (
    action === "submit_requirement_to_lucy" ||
    action === "generate_lucy_plan" ||
    action === "execute_selected_tasks" ||
    action === "ask_lucy_review" ||
    action === "daily_report"
  ) {
    return "Lucy";
  }
  if (action === "ask_tiger_blog" || action === "ask_tiger_publish") return "Tiger";
  return "Ray";
}

function isStatusPatch(
  item: unknown,
  path: string
): item is { op: string; path: string; value: AgentStatusValue } {
  return (
    typeof item === "object" &&
    item !== null &&
    "path" in item &&
    (item as { path: string }).path === path
  );
}

function isTaskPriority(value: unknown): value is TaskPriority {
  return value === "P0" || value === "P1" || value === "P2" || value === "P3" || value === "P4" || value === "P5" || value === "P6";
}

function isTaskPlanStatus(value: unknown): value is TaskPlanStatus {
  return value === "planned" || value === "selected" || value === "executing" || value === "reviewing" || value === "completed" || value === "blocked" || value === "deferred";
}

function isPatch(item: unknown, path: string): item is { op: string; path: string; value: unknown } {
  return (
    typeof item === "object" &&
    item !== null &&
    "path" in item &&
    (item as { path: string }).path === path
  );
}

function applyStateDelta(tasks: TaskItem[], event: AGUIEvent) {
  if (event.type !== EventType.STATE_DELTA) return tasks;

  return tasks.map((task) => {
    const statusPatch = event.delta.find((item) => isStatusPatch(item, `/tasks/${task.id}/status`));
    const priorityPatch = event.delta.find((item) => isPatch(item, `/tasks/${task.id}/priority`));
    const planStatusPatch = event.delta.find((item) => isPatch(item, `/tasks/${task.id}/planStatus`));
    const priority = priorityPatch && isTaskPriority(priorityPatch.value) ? priorityPatch.value : task.priority;
    const planStatus = planStatusPatch && isTaskPlanStatus(planStatusPatch.value) ? planStatusPatch.value : task.planStatus;

    if (statusPatch) return { ...task, status: statusPatch.value, priority, planStatus };
    if (priority !== task.priority || planStatus !== task.planStatus) return { ...task, priority, planStatus };
    return task;
  });
}

function applyAgentStateDelta(agents: typeof initialAgents, event: AGUIEvent) {
  if (event.type !== EventType.STATE_DELTA) return agents;

  return agents.map((agent) => {
    const patch = event.delta.find((item) => isStatusPatch(item, `/agents/${agent.name}/status`));

    return patch ? { ...agent, status: patch.value } : agent;
  });
}

function agentStatusFromPlan(agentName: AgentName, tasks: TaskItem[]): AgentStatusValue | undefined {
  const ownedTasks = tasks.filter((task) => task.owner === agentName);
  if (!ownedTasks.length) return undefined;
  if (ownedTasks.some((task) => task.planStatus === "executing")) {
    if (agentName === "Ray") return "coding";
    if (agentName === "Lucy") return "reviewing";
    return "working";
  }
  return "ready";
}

function applyAgentStatusesFromPlan(agents: typeof initialAgents, plan: LucyPlan) {
  return agents.map((agent) => {
    const status = agentStatusFromPlan(agent.name, plan.tasks);
    return status ? { ...agent, status } : agent;
  });
}

function replayStateDeltas<T>(items: T, events: ConsoleEvent[] | undefined, apply: (current: T, event: AGUIEvent) => T) {
  if (!events?.length) return items;
  return events.reduce<T>((current, event) => apply(current, event), items);
}

export default function Home() {
  const [projects, setProjects] = useState<ProjectProfile[]>(() => [...initialProjects]);
  const [tasks, setTasks] = useState<TaskItem[]>(initialTasks);
  const [agents, setAgents] = useState(initialAgents);
  const [events, setEvents] = useState<ConsoleEvent[]>([]);
  const [requirement, setRequirement] = useState("");
  const [running, setRunning] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [activeOfficePanel, setActiveOfficePanel] = useState<OfficePanel>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [connection, setConnection] = useState<"Local Connected" | "Streaming" | "Error">("Local Connected");
  const [lucyPlan, setLucyPlan] = useState<LucyPlan | null>(null);
  const [lucyConversationActive, setLucyConversationActive] = useState(false);
  const [conversations, setConversations] = useState<AgentConversations>(() => emptyConversations());
  const [activeProjectId, setActiveProjectId] = useState<ProjectId>("demo-project");
  const [activeConversationAgent, setActiveConversationAgent] = useState<AgentName>("Lucy");
  const [pendingArtifacts, setPendingArtifacts] = useState<Artifact[]>([]);
  const [officeArtifacts, setOfficeArtifacts] = useState<Artifact[]>([]);
  const [selectedArtifactOwner, setSelectedArtifactOwner] = useState<AgentName>("Tiger");
  const [artifactUploadBusy, setArtifactUploadBusy] = useState(false);
  const [runnerStatus, setRunnerStatus] = useState<RunnerStatus>({ enabled: false, rayWorkspaceWriteEnabled: false });
  const [projectRuntimeById, setProjectRuntimeById] = useState<Record<ProjectId, ProjectRuntimeState>>({});
  const [projectStorageLoaded, setProjectStorageLoaded] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  const activeTask = useMemo(() => tasks.find((task) => task.status === "ready") || tasks[0] || initialTasks[0], [tasks]);
  const selectedExecutableTasks = useMemo(
    () => tasks.filter((task) => task.selected && task.planStatus !== "completed" && task.planStatus !== "executing" && task.planStatus !== "reviewing"),
    [tasks]
  );
  const executionDisabledReason = useMemo(() => {
    const hasRayTask = selectedExecutableTasks.some((task) => task.owner === "Ray");
    if (!hasRayTask) return null;
    if (!runnerStatus.enabled) return "Ray runner 未启用：请用 AG_UI_ENABLE_CODEX_EXEC=1 重启 3000 服务。";
    if (!runnerStatus.rayWorkspaceWriteEnabled) return "Ray 写入模式未启用：请用 AG_UI_CODEX_WRITE_ACTIONS=1 重启 3000 服务。";
    return null;
  }, [runnerStatus.enabled, runnerStatus.rayWorkspaceWriteEnabled, selectedExecutableTasks]);
  const composerRoute = useMemo(() => extractComposerRoute(requirement, activeConversationAgent), [requirement, activeConversationAgent]);
  const activeConversationMessages = conversations[activeConversationAgent];
  const hasAnyConversation = hasConversationMessages(conversations);
  const projectOfficeArtifacts = useMemo(
    () =>
      officeArtifacts
        .filter((artifact) => artifact.projectId === activeProjectId && !artifact.archivedAt)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [activeProjectId, officeArtifacts]
  );
  const selectedOwnerArtifacts = useMemo(
    () =>
      projectOfficeArtifacts.filter((artifact) => artifact.owner === selectedArtifactOwner),
    [projectOfficeArtifacts, selectedArtifactOwner]
  );

  function currentProjectRuntime(): ProjectRuntimeState {
    return {
      projectId: activeProjectId,
      tasks,
      agents,
      events,
      requirement,
      lucyPlan,
      conversations,
      activeConversationAgent,
      lucyConversationActive,
      pendingArtifacts
    };
  }

  function applyProjectRuntime(runtime: ProjectRuntimeState, projectId: ProjectId) {
    const scoped = runtime.projectId === projectId;
    setTasks(runtime.tasks);
    setAgents(runtime.agents);
    setEvents(runtime.events);
    setRequirement(runtime.requirement);
    setLucyPlan(runtime.lucyPlan);
    setConversations(scoped ? runtime.conversations : emptyConversations());
    setActiveConversationAgent(scoped ? runtime.activeConversationAgent : "Lucy");
    setLucyConversationActive(scoped ? runtime.lucyConversationActive : false);
    setPendingArtifacts(scoped ? runtime.pendingArtifacts : []);
    setConnection("Local Connected");
  }

  function switchProject(nextProjectId: ProjectId) {
    if (nextProjectId === activeProjectId) return;
    if (running) {
      setNotice({ message: "任务运行中，先不要切换项目。", tone: "attention" });
      window.setTimeout(() => setNotice(null), 3600);
      return;
    }

    const currentRuntime = currentProjectRuntime();
    const nextRuntime = projectRuntimeById[nextProjectId] || createEmptyProjectRuntime(nextProjectId);
    setProjectRuntimeById((current) => ({
      ...current,
      [activeProjectId]: currentRuntime,
      [nextProjectId]: current[nextProjectId] || nextRuntime
    }));
    setActiveProjectId(nextProjectId);
    applyProjectRuntime(nextRuntime, nextProjectId);
    setActiveOfficePanel(null);
  }

  function createProject(name: string) {
    if (running) {
      setNotice({ message: "任务运行中，先不要新建项目。", tone: "attention" });
      window.setTimeout(() => setNotice(null), 3600);
      return;
    }

    const cleanName = name.trim();
    if (!cleanName) return;

    const project: ProjectProfile = {
      id: `project-${Date.now().toString(36)}`,
      name: cleanName,
      mode: "骞插噣椤圭洰",
      description: "鐙珛浠诲姟銆佸璇濆拰浜х墿娴嬭瘯绌洪棿",
      createdAt: new Date().toISOString()
    };
    const emptyRuntime = createEmptyProjectRuntime(project.id);

    setProjects((current) => [...current, project]);
    setProjectRuntimeById((current) => ({
      ...current,
      [activeProjectId]: currentProjectRuntime(),
      [project.id]: emptyRuntime
    }));
    setActiveProjectId(project.id);
    applyProjectRuntime(emptyRuntime, project.id);
    setActiveOfficePanel(null);
    setNotice({ message: `宸茶繘鍏ユ柊椤圭洰锛?{project.name}`, tone: "success" });
    window.setTimeout(() => setNotice(null), 3200);
  }

  useEffect(() => {
    try {
      const storedProjects = JSON.parse(window.localStorage.getItem(PROJECTS_STORAGE_KEY) || "null") as ProjectProfile[] | null;
      const storedRuntime = JSON.parse(window.localStorage.getItem(PROJECT_RUNTIME_STORAGE_KEY) || "null") as Record<ProjectId, ProjectRuntimeState> | null;
      const storedActiveProjectId = window.localStorage.getItem(ACTIVE_PROJECT_STORAGE_KEY);

      if (Array.isArray(storedProjects) && storedProjects.length) {
        setProjects(storedProjects);
      }
      if (storedRuntime && typeof storedRuntime === "object") {
        setProjectRuntimeById(storedRuntime);
      }
      if (storedActiveProjectId) {
        const nextRuntime =
          storedRuntime?.[storedActiveProjectId] ||
          (storedActiveProjectId === "demo-project" ? null : createEmptyProjectRuntime(storedActiveProjectId));
        setActiveProjectId(storedActiveProjectId);
        if (nextRuntime) {
          applyProjectRuntime(nextRuntime, storedActiveProjectId);
        }
      }
    } catch {
      // Local project state is a convenience; ignore corrupted browser storage.
    } finally {
      setProjectStorageLoaded(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!projectStorageLoaded) return;

    const runtimeById = {
      ...projectRuntimeById,
      [activeProjectId]: currentProjectRuntime()
    };

    window.localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(projects));
    window.localStorage.setItem(PROJECT_RUNTIME_STORAGE_KEY, JSON.stringify(runtimeById));
    window.localStorage.setItem(ACTIVE_PROJECT_STORAGE_KEY, activeProjectId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    projectStorageLoaded,
    projects,
    activeProjectId,
    tasks,
    agents,
    events,
    requirement,
    lucyPlan,
    conversations,
    activeConversationAgent,
    lucyConversationActive,
    pendingArtifacts,
    projectRuntimeById
  ]);

  useEffect(() => {
    if (!autoScroll) return;
    const log = document.getElementById("event-stream-log");
    if (log) log.scrollTop = log.scrollHeight;
  }, [events, autoScroll]);

  useEffect(() => {
    if (!projectStorageLoaded || historyLoaded || activeProjectId !== "demo-project") return;

    let active = true;

    async function loadHistory() {
      try {
        const response = await fetch("/api/history", { cache: "no-store" });
        if (!response.ok) return;
        const history = (await response.json()) as HistoryResponse;
        if (!active) return;

        if (history.runnerStatus) {
          setRunnerStatus(history.runnerStatus);
        }

        if (history.events?.length) {
          setEvents(history.events);
          setTasks((current) => replayStateDeltas(current, history.events, applyStateDelta));
          setAgents((current) => replayStateDeltas(current, history.events, applyAgentStateDelta));
          const restoredConversations = buildConversationsFromEvents(history.events);
          if (hasConversationMessages(restoredConversations)) {
            setConversations(restoredConversations);
            const lastAgent = latestConversationAgentFromEvents(history.events);
            if (lastAgent) setActiveConversationAgent(lastAgent);
          }
        }
        if (history.lucyPlan) {
          setLucyPlan(history.lucyPlan);
          setTasks(history.lucyPlan.tasks);
          setAgents((current) => applyAgentStatusesFromPlan(current, history.lucyPlan as LucyPlan));
        }

        void history.lastResult;
      } catch {
        // History is an enhancement; the console can still run without it.
      } finally {
        if (active) setHistoryLoaded(true);
      }
    }

    void loadHistory();

    return () => {
      active = false;
    };
  }, [activeProjectId, historyLoaded, projectStorageLoaded]);

  useEffect(() => {
    let active = true;

    async function loadAgentConnection(
      agentName: "Lucy" | "Tiger" | "Musk",
      endpoint: "/api/hermes-lucy" | "/api/hermes-tiger" | "/api/hermes-musk"
    ) {
      try {
        const response = await fetch(endpoint, { cache: "no-store" });
        const status = (await response.json()) as HermesAgentStatusResponse;
        if (!active) return;

        setAgents((current) =>
          current.map((agent) =>
            agent.name === agentName ? { ...agent, status: status.connected ? "ready" : "offline" } : agent
          )
        );

        if (!status.connected) {
          setNotice({ message: `${agentName} 未连接 Hermes API，当前为离线状态。`, tone: "attention" });
          window.setTimeout(() => setNotice(null), 5200);
        }
      } catch {
        if (!active) return;
        setAgents((current) => current.map((agent) => (agent.name === agentName ? { ...agent, status: "offline" } : agent)));
      }
    }

    void loadAgentConnection("Lucy", "/api/hermes-lucy");
    void loadAgentConnection("Tiger", "/api/hermes-tiger");
    void loadAgentConnection("Musk", "/api/hermes-musk");

    return () => {
      active = false;
    };
  }, []);

  function addEvent(event: AGUIEvent) {
    setEvents((current) => [...current, { ...event, receivedAt: clock() }]);

    if (event.type === EventType.STATE_DELTA) {
      setTasks((current) => applyStateDelta(current, event));
      setAgents((current) => applyAgentStateDelta(current, event));
    }

    if (event.type === EventType.TEXT_MESSAGE_START && isAgentName(event.name)) {
      const agentName = event.name;
      setConversations((current) =>
        appendConversationMessage(current, agentName, {
          id: event.messageId,
          role: "agent",
          agentName,
          content: ""
        })
      );
    }

    if (event.type === EventType.TEXT_MESSAGE_CONTENT) {
      const delta = cleanLucyDelta(event.delta);
      if (!delta) return;
      setConversations((current) => appendConversationDelta(current, event.messageId, delta));
    }

    if (event.type === EventType.CUSTOM) {
      const value = event.value as { plan?: LucyPlan } | undefined;
      if (event.name === "artifacts_registered") {
        const artifactValue = event.value as { messageId?: string; artifacts?: Artifact[] } | undefined;
        if (artifactValue?.messageId && artifactValue.artifacts?.length) {
          setConversations((current) =>
            appendConversationArtifacts(current, artifactValue.messageId as string, artifactValue.artifacts as Artifact[])
          );
        }
      }
      if (
        event.name === "lucy_clarification" ||
        event.name === "lucy_plan_ready" ||
        event.name === "selected_tasks_started" ||
        event.name === "lucy_plan_completed" ||
        event.name === "ray_execution_completed"
      ) {
        if (value?.plan) {
          const plan = value.plan;
          setLucyPlan(plan);
          setTasks(plan.tasks);
          setAgents((current) => applyAgentStatusesFromPlan(current, plan));
        }
      }
    }

    if (event.type === EventType.RUN_FINISHED) {
      const result = event.result as { status?: string; notice?: string } | undefined;
      setNotice({
        message:
          result?.notice ||
          (result?.status === "needs_attention" ? "任务执行完毕，但有步骤需要处理。" : "任务运行完成。"),
        tone: result?.status === "needs_attention" ? "attention" : "success"
      });
      window.setTimeout(() => setNotice(null), 5200);
    }

    if (event.type === EventType.RUN_ERROR) {
      setNotice({ message: "任务执行失败，需要处理。", tone: "attention" });
      window.setTimeout(() => setNotice(null), 5200);
    }
  }

  function markRunNeedsAttention(targetAgent: AgentName, taskId: string, action: AgentAction) {
    const linkedAgents: AgentName[] =
      action === "dispatch_to_ray" ? ["Lucy", "Ray"] : [targetAgent];

    setTasks((current) => current.map((task) => (task.id === taskId ? { ...task, status: "blocked" } : task)));
    setAgents((current) =>
      current.map((agent) => (linkedAgents.includes(agent.name) ? { ...agent, status: "ready" } : agent))
    );
  }

  async function runAction(
    action: AgentAction,
    manualMessage?: string,
    options?: { selectedTaskIds?: string[]; planId?: string; targetAgent?: AgentName; attachments?: Artifact[]; taskId?: string }
  ) {
    const targetAgent = options?.targetAgent || targetForAction(action);
    const taskId = options?.taskId || activeTask.id;
    setRunning(true);
    setNotice(null);
    setConnection("Streaming");

    await sendAguiInput(
      {
        action,
        targetAgent,
        projectId: activeProjectId,
        taskId,
        message: manualMessage,
        attachments: options?.attachments,
        selectedTaskIds: options?.selectedTaskIds,
        planId: options?.planId
      },
      {
        onEvent: (event) => {
          addEvent(event);
          if (event.type === EventType.RUN_ERROR) {
            markRunNeedsAttention(targetAgent, taskId, action);
          }
        },
        onError: (message) => {
          setConnection("Error");
          markRunNeedsAttention(targetAgent, taskId, action);
          setEvents((current) => [
            ...current,
            {
              type: EventType.RUN_ERROR,
              message,
              receivedAt: clock()
            }
          ]);
          setNotice({ message: "AG-UI 连接失败，需要处理。", tone: "attention" });
          window.setTimeout(() => setNotice(null), 5200);
        },
        onDone: () => {
          setRunning(false);
          setConnection((current) => (current === "Error" ? "Error" : "Local Connected"));
        }
      }
    );
  }

  async function submitRequirement() {
    const route = extractComposerRoute(requirement, activeConversationAgent);
    const targetAgent = route.target;
    const attachments = pendingArtifacts;
    const message = route.message || (attachments.length ? "请查看我粘贴的图片。" : "");
    if (!message && !attachments.length) return;
    const action: AgentAction = targetAgent === "Lucy" ? "submit_requirement_to_lucy" : "manual_message";
    setLucyConversationActive(true);
    setActiveConversationAgent(targetAgent);
    setConversations((current) =>
      appendConversationMessage(current, targetAgent, {
        id: `user-${Date.now()}`,
        role: "user",
        content: message,
        artifacts: attachments
      })
    );
    setRequirement("");
    setPendingArtifacts([]);
    await runAction(action, message, { targetAgent, attachments });
  }

  async function handlePasteImages(files: File[]) {
    if (!files.length) return;

    setArtifactUploadBusy(true);
    try {
      const uploaded: Artifact[] = [];
      for (const file of files) {
        const formData = new FormData();
        formData.set("file", file);
        formData.set("projectId", activeProjectId);
        formData.set("title", file.name && file.name !== "image.png" ? file.name : "Pasted image");

        const response = await fetch("/api/artifacts/upload", {
          method: "POST",
          body: formData
        });
        const data = (await response.json()) as { ok: boolean; artifacts?: Artifact[]; error?: string };
        if (!response.ok || !data.ok || !data.artifacts?.length) {
          throw new Error(data.error || "鍥剧墖绮樿创澶辫触");
        }
        uploaded.push(...data.artifacts);
      }

      setPendingArtifacts((current) => [...current, ...uploaded]);
      setNotice({ message: `已粘贴 ${uploaded.length} 张图片。`, tone: "success" });
      window.setTimeout(() => setNotice(null), 2600);
    } catch (error) {
      setNotice({ message: error instanceof Error ? error.message : "图片粘贴失败，需要处理。", tone: "attention" });
      window.setTimeout(() => setNotice(null), 4200);
    } finally {
      setArtifactUploadBusy(false);
    }
  }

  function removePendingArtifact(artifactId: string) {
    setPendingArtifacts((current) => current.filter((artifact) => artifact.id !== artifactId));
  }

  function togglePlannedTask(taskId: string) {
    setTasks((current) => current.map((task) => (task.id === taskId ? { ...task, selected: !task.selected } : task)));
    setLucyPlan((current) =>
      current
        ? {
            ...current,
            tasks: current.tasks.map((task) => (task.id === taskId ? { ...task, selected: !task.selected } : task))
          }
        : current
    );
  }

  async function executeSelectedTasks() {
    const selectedTaskIds = selectedExecutableTasks.map((task) => task.id);
    if (!selectedTaskIds.length) {
      setNotice({ message: "请先勾选要执行的任务。", tone: "attention" });
      window.setTimeout(() => setNotice(null), 3600);
      return;
    }
    if (executionDisabledReason) {
      setNotice({ message: executionDisabledReason, tone: "attention" });
      window.setTimeout(() => setNotice(null), 5200);
      return;
    }
    await runAction("execute_selected_tasks", lucyPlan?.requirement || requirement, {
      selectedTaskIds,
      planId: lucyPlan?.id
    });
  }

  async function requestCanvasReview(taskId: string) {
    const task = tasks.find((item) => item.id === taskId);
    if (!task) return;

    await runAction("ask_lucy_review", `请 Lucy 验收 ${task.title}。Ray 已完成实现，等待验收闭环。`, {
      taskId,
      planId: lucyPlan?.id,
      targetAgent: "Lucy"
    });
  }

  const officePanelMeta =
    activeOfficePanel === "tasks"
      ? { title: "Task Desk", icon: CheckSquare, tone: "text-slate-300" }
      : activeOfficePanel === "archive"
        ? { title: "Archive Library", icon: Database, tone: "text-emerald-300" }
        : activeOfficePanel === "outputs"
          ? { title: "Outputs Cabinet", icon: PackageOpen, tone: "text-emerald-300" }
          : activeOfficePanel === "history"
            ? { title: "History Log", icon: History, tone: "text-cyan-300" }
            : null;
  const OfficePanelIcon = officePanelMeta?.icon;

  return (
    <main className="mx-auto flex h-screen max-w-[1920px] flex-col overflow-hidden">
      <Header connection={connection} />
      {notice ? (
        <div
          className={`fixed right-8 top-28 z-30 rounded-xl px-5 py-3 text-sm font-semibold shadow-[0_18px_48px_rgba(0,0,0,0.3)] backdrop-blur ${
            notice.tone === "attention"
              ? "border border-red-400/20 bg-red-500/12 text-red-200"
              : "border border-emerald-400/20 bg-emerald-500/12 text-emerald-200"
          }`}
        >
          {notice.message}
        </div>
      ) : null}

      <div className="grid min-h-0 flex-1 grid-cols-[260px_minmax(340px,0.72fr)_minmax(0,1.2fr)] gap-5 overflow-hidden px-9 pb-6 pt-0 max-2xl:grid-cols-[240px_minmax(320px,0.78fr)_minmax(0,1.05fr)] max-lg:grid-cols-1 max-md:px-5">
        <OfficeSidebar
          agents={agents}
          projects={projects}
          activeProjectId={activeProjectId}
          activeAgent={activeConversationAgent}
          running={running}
          connection={connection}
          onSelectAgent={(agentName) => {
            setActiveConversationAgent(agentName);
            setLucyConversationActive(true);
          }}
          onProjectChange={switchProject}
          onCreateProject={createProject}
        />

        <div className="flex min-h-0 min-w-0 flex-col gap-5">
          <LucyConversationPanel
            plan={activeConversationAgent === "Lucy" ? lucyPlan : null}
            messages={activeConversationMessages}
            running={running}
            activeAgent={activeConversationAgent}
            className="min-h-0 flex-1"
          />
          <RequirementComposer
            value={requirement}
            running={running}
            agents={agents}
            projectId={activeProjectId}
            target={composerRoute.target}
            attachments={pendingArtifacts}
            attachmentBusy={artifactUploadBusy}
            onChange={setRequirement}
            onSubmit={submitRequirement}
            onPasteImages={handlePasteImages}
            onRemoveAttachment={removePendingArtifact}
            className="shrink-0"
          />
        </div>

        <div className="relative min-h-0 min-w-0 overflow-hidden">
          <AgentStatus
            agents={agents}
            running={running}
            connection={connection}
            projects={projects}
            projectId={activeProjectId}
            onProjectChange={switchProject}
            onCreateProject={createProject}
            selectedAgent={activeConversationAgent}
            onSelectAgent={(agentName) => {
              setActiveConversationAgent(agentName);
              setLucyConversationActive(true);
            }}
            tasks={tasks}
            activeOfficePanel={activeOfficePanel}
            onOpenTaskDesk={() => setActiveOfficePanel((current) => (current === "tasks" ? null : "tasks"))}
            onOpenArchiveLibrary={() => setActiveOfficePanel((current) => (current === "archive" ? null : "archive"))}
            onOpenArtifactBox={() => setActiveOfficePanel((current) => (current === "outputs" ? null : "outputs"))}
            onOpenHistoryLog={() => setActiveOfficePanel((current) => (current === "history" ? null : "history"))}
            onArtifactsChange={setOfficeArtifacts}
            onReviewTask={requestCanvasReview}
            collapsed={false}
            className="h-full"
          />
          {activeOfficePanel && officePanelMeta && OfficePanelIcon ? (
            <div className="absolute inset-x-4 bottom-[76px] z-[145] flex h-[min(58%,460px)] min-h-0 flex-col overflow-hidden rounded-xl border border-slate-700/85 bg-[#050914]/[0.99] shadow-[0_-18px_64px_rgba(0,0,0,0.48)] backdrop-blur">
              <div className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-800/80 px-5 py-4">
                <div className="flex min-w-0 items-center gap-2">
                  <OfficePanelIcon className={`h-4 w-4 shrink-0 ${officePanelMeta.tone}`} />
                  <h2 className="truncate text-base font-semibold text-slate-100">{officePanelMeta.title}</h2>
                  {activeOfficePanel === "history" ? (
                    <>
                      <span className="status-dot bg-emerald-400" />
                      <span className="shrink-0 text-xs text-slate-400">实时连接中</span>
                      <button
                        type="button"
                        onClick={() => setAutoScroll((value) => !value)}
                        aria-label="切换自动滚动"
                        aria-pressed={autoScroll}
                        className="hidden"
                      >
                        <span>自动滚动</span>
                        <span
                          className={`relative h-5 w-9 rounded-full border border-slate-700 p-0.5 transition ${
                            autoScroll ? "bg-slate-800/80" : "bg-slate-900/70"
                          }`}
                        >
                          <span
                            className={`absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full transition ${
                              autoScroll ? "left-[19px] bg-emerald-300" : "left-1 bg-slate-500"
                            }`}
                          />
                        </span>
                      </button>
                    </>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  {activeOfficePanel === "history" ? (
                    <button
                      type="button"
                      onClick={() => setAutoScroll((value) => !value)}
                      aria-label="切换自动滚动"
                      aria-pressed={autoScroll}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-full text-xs text-slate-400 transition hover:text-slate-100"
                    >
                      <span>自动滚动</span>
                      <span
                        className={`relative h-5 w-9 rounded-full border border-slate-700 p-0.5 transition ${
                          autoScroll ? "bg-slate-800/80" : "bg-slate-900/70"
                        }`}
                      >
                        <span
                          className={`absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full transition ${
                            autoScroll ? "left-[19px] bg-emerald-300" : "left-1 bg-slate-500"
                          }`}
                        />
                      </span>
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setActiveOfficePanel(null)}
                    className="rounded-full px-2 py-1 text-xs font-semibold text-slate-400 transition hover:bg-slate-800/70 hover:text-slate-100"
                  >
                    Close
                  </button>
                </div>
              </div>
              <div className="min-h-0 flex-1 px-5 pb-4 pt-4">
                {activeOfficePanel === "tasks" ? (
                  <TaskList
                    tasks={tasks}
                    className="h-full"
                    embedded
                    selectable={
                      lucyPlan?.stage === "planned" ||
                      lucyPlan?.stage === "executing" ||
                      lucyPlan?.stage === "reviewing" ||
                      lucyPlan?.stage === "blocked"
                    }
                    running={running}
                    executionDisabledReason={executionDisabledReason}
                    onToggleTask={togglePlannedTask}
                    onExecuteSelected={executeSelectedTasks}
                  />
                ) : activeOfficePanel === "archive" ? (
                  <ContextHubPanel projectId={activeProjectId} className="h-full" embedded />
                ) : activeOfficePanel === "outputs" ? (
                  <OutputsCabinetPanel
                    owners={agents.map((agent) => agent.name)}
                    owner={selectedArtifactOwner}
                    artifacts={selectedOwnerArtifacts}
                    allArtifacts={projectOfficeArtifacts}
                    onOwnerChange={setSelectedArtifactOwner}
                  />
                ) : (
                  <EventStream events={events} autoScroll={autoScroll} onToggleAutoScroll={() => setAutoScroll((value) => !value)} embedded />
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}

