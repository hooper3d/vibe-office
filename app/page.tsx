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
import { initialAgents, initialTasks } from "@/lib/mock-data";
import type {
  AgentAction,
  AgentName,
  AgentStatus as AgentStatusValue,
  ProjectId
} from "@/types/agent";
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

const LUCY_SYSTEM_PREFIXES = [
  "Lucy 已收到控制台意图：提交需求。正在连接 Hermes Lucy。",
  "Lucy 已收到控制台意图：提交需求并编排。开始读取本地工作区上下文。",
  "Lucy 已收到控制台意图：生成 Lucy 任务计划。开始读取本地工作区上下文。"
];

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
          content: intent.message
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
  }

  return Object.fromEntries(
    (Object.keys(conversations) as AgentName[]).map((agentName) => [
      agentName,
      conversations[agentName].filter((message) => message.content.trim())
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
  return value === "planned" || value === "selected" || value === "executing" || value === "completed" || value === "blocked" || value === "deferred";
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
  const [tasks, setTasks] = useState<TaskItem[]>(initialTasks);
  const [agents, setAgents] = useState(initialAgents);
  const [events, setEvents] = useState<ConsoleEvent[]>([]);
  const [requirement, setRequirement] = useState("");
  const [running, setRunning] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [connection, setConnection] = useState<"Local Connected" | "Streaming" | "Error">("Local Connected");
  const [lucyPlan, setLucyPlan] = useState<LucyPlan | null>(null);
  const [lucyConversationActive, setLucyConversationActive] = useState(false);
  const [conversations, setConversations] = useState<AgentConversations>(() => emptyConversations());
  const [activeProjectId, setActiveProjectId] = useState<ProjectId>("demo-project");
  const [activeConversationAgent, setActiveConversationAgent] = useState<AgentName>("Lucy");

  const activeTask = useMemo(() => tasks.find((task) => task.status === "ready") || tasks[0] || initialTasks[0], [tasks]);
  const composerRoute = useMemo(() => extractComposerRoute(requirement, activeConversationAgent), [requirement, activeConversationAgent]);
  const activeConversationMessages = conversations[activeConversationAgent];
  const hasAnyConversation = hasConversationMessages(conversations);

  useEffect(() => {
    if (!autoScroll) return;
    const log = document.getElementById("event-stream-log");
    if (log) log.scrollTop = log.scrollHeight;
  }, [events, autoScroll]);

  useEffect(() => {
    let active = true;

    async function loadHistory() {
      try {
        const response = await fetch("/api/history", { cache: "no-store" });
        if (!response.ok) return;
        const history = (await response.json()) as HistoryResponse;
        if (!active) return;

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
      }
    }

    void loadHistory();

    return () => {
      active = false;
    };
  }, []);

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
    options?: { selectedTaskIds?: string[]; planId?: string; targetAgent?: AgentName }
  ) {
    const targetAgent = options?.targetAgent || targetForAction(action);
    const taskId = activeTask.id;
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
    const message = route.message;
    if (!message) return;
    const action: AgentAction = targetAgent === "Lucy" ? "submit_requirement_to_lucy" : "manual_message";
    setLucyConversationActive(true);
    setActiveConversationAgent(targetAgent);
    setConversations((current) =>
      appendConversationMessage(current, targetAgent, {
        id: `user-${Date.now()}`,
        role: "user",
        content: message
      })
    );
    setRequirement("");
    await runAction(action, message, { targetAgent });
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
    const selectedTaskIds = tasks
      .filter((task) => task.selected && task.planStatus !== "completed" && task.planStatus !== "executing")
      .map((task) => task.id);
    if (!selectedTaskIds.length) {
      setNotice({ message: "请先勾选要执行的任务。", tone: "attention" });
      window.setTimeout(() => setNotice(null), 3600);
      return;
    }
    await runAction("execute_selected_tasks", lucyPlan?.requirement || requirement, {
      selectedTaskIds,
      planId: lucyPlan?.id
    });
  }

  async function resetHistory() {
    const confirmed = window.confirm("重置会清空运行历史、事件流和最后结果，并把页面状态恢复初始值。确认继续？");
    if (!confirmed) return;

    try {
      const response = await fetch("/api/history", {
        method: "DELETE",
        cache: "no-store"
      });
      if (!response.ok) throw new Error(`Reset failed: ${response.status}`);

      setTasks(initialTasks);
      setAgents(initialAgents);
      setEvents([]);
      setLucyPlan(null);
      setConversations(emptyConversations());
      setLucyConversationActive(false);
      setConnection("Local Connected");
      setNotice({ message: "运行状态已重置。", tone: "success" });
      window.setTimeout(() => setNotice(null), 3600);
    } catch {
      setNotice({ message: "重置失败，需要处理。", tone: "attention" });
      window.setTimeout(() => setNotice(null), 5200);
    }
  }

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

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)] gap-7 overflow-hidden px-9 pb-6 pt-0 max-lg:grid-cols-1 max-md:px-5">
        <div className="relative flex min-h-0 min-w-0 flex-col gap-5 overflow-visible">
          {lucyConversationActive ? (
            <>
              <AgentStatus
                agents={agents}
                running={running}
                connection={connection}
                onReset={resetHistory}
                selectedAgent={activeConversationAgent}
                onSelectAgent={setActiveConversationAgent}
                collapsed
              />
              <LucyConversationPanel
                plan={activeConversationAgent === "Lucy" ? lucyPlan : null}
                messages={activeConversationMessages}
                running={running}
                activeAgent={activeConversationAgent}
                onGeneratePlan={generateLucyPlan}
                onClose={() => setLucyConversationActive(false)}
                className="min-h-0 flex-1"
              />
            </>
          ) : (
            <AgentStatus
              agents={agents}
              running={running}
              connection={connection}
              onReset={resetHistory}
              collapsed={false}
              className="min-h-0 flex-1"
            />
          )}
          <RequirementComposer
            value={requirement}
            running={running}
            agents={agents}
            projectId={activeProjectId}
            target={composerRoute.target}
            onProjectChange={setActiveProjectId}
            onChange={setRequirement}
            onSubmit={submitRequirement}
            onOpenConversation={() => setLucyConversationActive(true)}
            canOpenConversation={!lucyConversationActive && Boolean(hasAnyConversation || lucyPlan)}
            className="shrink-0"
          />
        </div>

        <div className="flex min-h-0 min-w-0 flex-col gap-5">
          <div className="dark-panel min-h-[220px] shrink-0 overflow-hidden rounded-xl">
            <EventStream events={events} autoScroll={autoScroll} onToggleAutoScroll={() => setAutoScroll((value) => !value)} />
          </div>
          <div className="grid min-h-0 min-w-0 flex-1 grid-cols-2 gap-5 overflow-hidden max-xl:grid-cols-1">
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
              onToggleTask={togglePlannedTask}
              onExecuteSelected={executeSelectedTasks}
            />
            <ContextHubPanel className="h-full" />
          </div>
        </div>
      </div>
    </main>
  );
}
