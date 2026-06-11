"use client";

import { EventType, type AGUIEvent } from "@ag-ui/core";
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

type ComposerRoute = {
  target: AgentName;
  message: string;
};

type AgentConversations = Record<AgentName, LucyConversationMessage[]>;

type ProjectRuntimeState = {
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
  const cleanArtifacts = artifacts.filter((artifact) => !artifact.sourceUrl || !/[-.,;:!?，。；：、）)\]】]$/.test(artifact.sourceUrl));
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

function createEmptyProjectRuntime(): ProjectRuntimeState {
  return {
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
  const [eventStreamOpen, setEventStreamOpen] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [connection, setConnection] = useState<"Local Connected" | "Streaming" | "Error">("Local Connected");
  const [lucyPlan, setLucyPlan] = useState<LucyPlan | null>(null);
  const [lucyConversationActive, setLucyConversationActive] = useState(false);
  const [conversations, setConversations] = useState<AgentConversations>(() => emptyConversations());
  const [activeProjectId, setActiveProjectId] = useState<ProjectId>("demo-project");
  const [activeConversationAgent, setActiveConversationAgent] = useState<AgentName>("Lucy");
  const [pendingArtifacts, setPendingArtifacts] = useState<Artifact[]>([]);
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

  function currentProjectRuntime(): ProjectRuntimeState {
    return {
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

  function applyProjectRuntime(runtime: ProjectRuntimeState) {
    setTasks(runtime.tasks);
    setAgents(runtime.agents);
    setEvents(runtime.events);
    setRequirement(runtime.requirement);
    setLucyPlan(runtime.lucyPlan);
    setConversations(runtime.conversations);
    setActiveConversationAgent(runtime.activeConversationAgent);
    setLucyConversationActive(runtime.lucyConversationActive);
    setPendingArtifacts(runtime.pendingArtifacts);
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
    const nextRuntime = projectRuntimeById[nextProjectId] || createEmptyProjectRuntime();
    setProjectRuntimeById((current) => ({
      ...current,
      [activeProjectId]: currentRuntime,
      [nextProjectId]: current[nextProjectId] || nextRuntime
    }));
    setActiveProjectId(nextProjectId);
    applyProjectRuntime(nextRuntime);
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
      mode: "干净项目",
      description: "独立任务、对话和产物测试空间",
      createdAt: new Date().toISOString()
    };
    const emptyRuntime = createEmptyProjectRuntime();

    setProjects((current) => [...current, project]);
    setProjectRuntimeById((current) => ({
      ...current,
      [activeProjectId]: currentProjectRuntime(),
      [project.id]: emptyRuntime
    }));
    setActiveProjectId(project.id);
    applyProjectRuntime(emptyRuntime);
    setNotice({ message: `已进入新项目：${project.name}`, tone: "success" });
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
        const nextRuntime = storedRuntime?.[storedActiveProjectId] || (storedActiveProjectId === "demo-project" ? null : createEmptyProjectRuntime());
        setActiveProjectId(storedActiveProjectId);
        if (nextRuntime) {
          applyProjectRuntime(nextRuntime);
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
          (result?.status === "needs_attention" ? "任务执行完毕，但有步骤需处理。" : "任务运行完成。"),
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
          throw new Error(data.error || "图片粘贴失败");
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

  async function generateLucyPlan() {
    const lastUserMessage =
      [...activeConversationMessages].reverse().find((message) => message.role === "user")?.content ||
      [...conversations.Lucy].reverse().find((message) => message.role === "user")?.content ||
      "";
    const message = requirement.trim() || lucyPlan?.requirement || lastUserMessage;
    if (!message) return;
    setActiveConversationAgent("Lucy");
    if (activeConversationAgent !== "Lucy") {
      setConversations((current) =>
        appendConversationMessage(current, "Lucy", {
          id: `user-escalate-${Date.now()}`,
          role: "user",
          content: message
        })
      );
    }
    await runAction("generate_lucy_plan", message, { planId: lucyPlan?.id });
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

  return (
    <main className="mx-auto flex h-screen max-w-[1920px] flex-col overflow-hidden">
      <Header
        connection={connection}
        eventStreamOpen={eventStreamOpen}
        onToggleEventStream={() => setEventStreamOpen((value) => !value)}
      />
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

      {eventStreamOpen ? (
        <div className="fixed right-8 top-24 z-[220] w-[min(760px,calc(100vw-64px))] overflow-hidden rounded-xl border border-slate-800 bg-[#08111d]/98 shadow-[0_24px_80px_rgba(0,0,0,0.55)] backdrop-blur">
          <EventStream events={events} autoScroll={autoScroll} onToggleAutoScroll={() => setAutoScroll((value) => !value)} />
        </div>
      ) : null}

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)] gap-7 overflow-hidden px-9 pb-6 pt-0 max-xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)] max-lg:grid-cols-1 max-md:px-5">
        <div className="relative grid min-h-0 min-w-0 grid-rows-[minmax(0,1.35fr)_minmax(240px,0.65fr)] gap-5 overflow-hidden">
          <div className="min-h-0 min-w-0 overflow-visible">
            <AgentStatus
              agents={agents}
              running={running}
              connection={connection}
              projects={projects}
              projectId={activeProjectId}
              onProjectChange={switchProject}
              onCreateProject={createProject}
              tasks={tasks}
              onReviewTask={requestCanvasReview}
              collapsed={false}
              className="h-full"
            />
          </div>
          <div className="grid min-h-0 min-w-0 grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] gap-5 overflow-hidden max-xl:grid-cols-1">
            <TaskList
              tasks={tasks}
              className="h-full"
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
            <ContextHubPanel projectId={activeProjectId} className="h-full" />
          </div>
        </div>

        <div className="flex min-h-0 min-w-0 flex-col gap-5">
          <LucyConversationPanel
            plan={activeConversationAgent === "Lucy" ? lucyPlan : null}
            messages={activeConversationMessages}
            running={running}
            activeAgent={activeConversationAgent}
            onGeneratePlan={generateLucyPlan}
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
      </div>
    </main>
  );
}
