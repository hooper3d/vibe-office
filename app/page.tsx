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
import type { AgentAction, AgentName, AgentStatus as AgentStatusValue } from "@/types/agent";
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

const LUCY_SYSTEM_PREFIXES = [
  "Lucy 已收到控制台意图：提交需求。正在连接 Hermes Lucy。",
  "Lucy 已收到控制台意图：提交需求并编排。开始读取本地工作区上下文。",
  "Lucy 已收到控制台意图：生成 Lucy 任务计划。开始读取本地工作区上下文。"
];

function cleanLucyDelta(delta: string) {
  return LUCY_SYSTEM_PREFIXES.reduce((current, prefix) => current.replace(prefix, ""), delta);
}

function buildLucyConversationFromEvents(events: ConsoleEvent[]) {
  const messages: LucyConversationMessage[] = [];

  for (const event of events) {
    if (event.type === EventType.RUN_STARTED) {
      const input = event.input as
        | {
            state?: {
              intent?: {
                action?: string;
                message?: string;
              };
            };
          }
        | undefined;
      const intent = input?.state?.intent;
      if (intent?.action === "submit_requirement_to_lucy" && intent.message) {
        messages.push({
          id: `user-${event.runId || event.timestamp || messages.length}`,
          role: "user",
          content: intent.message
        });
      }
    }

    if (event.type === EventType.TEXT_MESSAGE_START && event.name === "Lucy") {
      messages.push({
        id: event.messageId,
        role: "lucy",
        content: ""
      });
    }

    if (event.type === EventType.TEXT_MESSAGE_CONTENT) {
      const last = messages[messages.length - 1];
      if (last?.role === "lucy" && last.id === event.messageId) {
        last.content += cleanLucyDelta(event.delta);
      }
    }
  }

  return messages.filter((message) => message.content.trim());
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
  if (ownedTasks.some((task) => task.planStatus === "blocked")) return "blocked";
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
  const [lucyMessages, setLucyMessages] = useState<LucyConversationMessage[]>([]);

  const activeTask = useMemo(() => tasks.find((task) => task.status === "ready") || tasks[0] || initialTasks[0], [tasks]);

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
          const restoredLucyMessages = buildLucyConversationFromEvents(history.events);
          if (restoredLucyMessages.length) {
            setLucyMessages(restoredLucyMessages);
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

    if (event.type === EventType.TEXT_MESSAGE_START && event.name === "Lucy") {
      setLucyMessages((current) => [
        ...current,
        {
          id: event.messageId,
          role: "lucy",
          content: ""
        }
      ]);
    }

    if (event.type === EventType.TEXT_MESSAGE_CONTENT) {
      const delta = cleanLucyDelta(event.delta);
      if (!delta) return;
      setLucyMessages((current) =>
        current.map((message) =>
          message.role === "lucy" && message.id === event.messageId
            ? { ...message, content: `${message.content}${delta}` }
            : message
        )
      );
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
      current.map((agent) => (linkedAgents.includes(agent.name) ? { ...agent, status: "blocked" } : agent))
    );
  }

  async function runAction(action: AgentAction, manualMessage?: string, options?: { selectedTaskIds?: string[]; planId?: string }) {
    const targetAgent = targetForAction(action);
    const taskId = activeTask.id;
    setRunning(true);
    setNotice(null);
    setConnection("Streaming");

    await sendAguiInput(
      {
        action,
        targetAgent,
        projectId: "demo-project",
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
    const message = requirement.trim();
    if (!message) return;
    setLucyConversationActive(true);
    setLucyMessages((current) => [
      ...current,
      {
        id: `user-${Date.now()}`,
        role: "user",
        content: message
      }
    ]);
    setRequirement("");
    await runAction("submit_requirement_to_lucy", message);
  }

  async function generateLucyPlan() {
    const lastUserMessage = [...lucyMessages].reverse().find((message) => message.role === "user")?.content || "";
    const message = requirement.trim() || lucyPlan?.requirement || lastUserMessage;
    if (!message) return;
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
      setLucyMessages([]);
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
      <Header />
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
        <div className="flex min-h-0 min-w-0 flex-col gap-5">
          {lucyConversationActive ? (
            <LucyConversationPanel
              plan={lucyPlan}
              messages={lucyMessages}
              running={running}
              onGeneratePlan={generateLucyPlan}
              onClose={() => setLucyConversationActive(false)}
              className="min-h-0 flex-1"
            />
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
            onChange={setRequirement}
            onSubmit={submitRequirement}
            onOpenConversation={() => setLucyConversationActive(true)}
            canOpenConversation={!lucyConversationActive && Boolean(lucyMessages.length || lucyPlan)}
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
