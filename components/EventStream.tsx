import { Code2 } from "lucide-react";
import { EventType, type AGUIEvent } from "@ag-ui/core";
import type { ConsoleEvent } from "@/types/event";

type EventStreamProps = {
  events: ConsoleEvent[];
  autoScroll: boolean;
  onToggleAutoScroll: () => void;
};

const eventTone: Record<string, string> = {
  [EventType.RUN_STARTED]: "text-sky-300",
  [EventType.TEXT_MESSAGE_CONTENT]: "text-emerald-300",
  [EventType.STATE_DELTA]: "text-yellow-300",
  [EventType.TOOL_CALL_START]: "text-violet-300",
  [EventType.TOOL_CALL_ARGS]: "text-violet-200",
  [EventType.TOOL_CALL_END]: "text-violet-300",
  [EventType.CUSTOM]: "text-cyan-300",
  [EventType.RUN_FINISHED]: "text-emerald-300",
  [EventType.RUN_ERROR]: "text-red-300"
};

function eventText(event: AGUIEvent) {
  if (event.type === EventType.TEXT_MESSAGE_CONTENT) return `message: ${event.delta}`;
  if (event.type === EventType.STATE_DELTA) return `state_delta: ${JSON.stringify(event.delta)}`;
  if (event.type === EventType.TOOL_CALL_START) return `tool_call_start: ${event.toolCallName}`;
  if (event.type === EventType.TOOL_CALL_ARGS) return `tool_call_args: ${event.delta}`;
  if (event.type === EventType.TOOL_CALL_END) return `tool_call_end: ${event.toolCallId}`;
  if (event.type === EventType.CUSTOM && event.name === "local_agent_run") {
    const value = event.value as {
      mode?: string;
      writtenFiles?: string[];
      contextFiles?: Array<{ path: string; exists: boolean }>;
    };
    const readCount = value.contextFiles?.filter((file) => file.exists).length ?? 0;
    return `local_agent_run: ${value.mode || "local"} read=${readCount} wrote=${value.writtenFiles?.join(", ") || "none"}`;
  }
  if (event.type === EventType.CUSTOM && event.name === "codex_exec_result") {
    const value = event.value as {
      enabled?: boolean;
      mode?: string;
      exitCode?: number | null;
      outputFile?: string;
      error?: string;
    };
    if (!value.enabled) return "codex_exec_result: disabled";
    return `codex_exec_result: mode=${value.mode} exit=${value.exitCode ?? "n/a"} output=${value.outputFile || "none"}${value.error ? ` error=${value.error}` : ""}`;
  }
  if (event.type === EventType.CUSTOM && event.name === "context_hub_read") {
    const value = event.value as { count?: number; files?: string[] };
    return `context_hub_read: read=${value.count ?? value.files?.length ?? 0} files`;
  }
  if (event.type === EventType.CUSTOM && event.name === "context_hub_write") {
    const value = event.value as { count?: number; files?: string[] };
    const files = value.files?.length ? value.files.join(", ") : "no write";
    return `context_hub_write: ${files}`;
  }
  if (event.type === EventType.CUSTOM && event.name === "blog_context_used") {
    const value = event.value as { files?: string[] };
    return `blog_context_used: ${value.files?.join(", ") || "BLOG_CONTEXT.md"}`;
  }
  if (event.type === EventType.CUSTOM && event.name === "handoff_to_lucy") {
    const value = event.value as { from?: string; to?: string; reason?: string };
    return `handoff_to_lucy: ${value.from || "Ray"} -> ${value.to || "Lucy"} ${value.reason || ""}`;
  }
  if (event.type === EventType.CUSTOM && event.name === "lucy_plan_created") {
    const value = event.value as { assignedTo?: string; requirement?: string };
    return `lucy_plan_created: assigned=${value.assignedTo || "Ray"} requirement=${value.requirement || "new requirement"}`;
  }
  if (event.type === EventType.CUSTOM && event.name === "lucy_clarification") {
    const value = event.value as { plan?: { questions?: string[] } };
    return `lucy_clarification: questions=${value.plan?.questions?.length || 0}`;
  }
  if (event.type === EventType.CUSTOM && event.name === "lucy_plan_ready") {
    const value = event.value as { plan?: { tasks?: unknown[] } };
    return `lucy_plan_ready: tasks=${value.plan?.tasks?.length || 0}`;
  }
  if (event.type === EventType.CUSTOM && event.name === "selected_tasks_started") {
    const value = event.value as { selectedTaskIds?: string[]; remoteTaskIds?: string[] };
    const remote = value.remoteTaskIds?.length ? ` remote=${value.remoteTaskIds.join(", ")}` : "";
    return `selected_tasks_started: ${value.selectedTaskIds?.join(", ") || "none"}${remote}`;
  }
  if (event.type === EventType.CUSTOM && event.name === "agent_task_started") {
    const value = event.value as { taskId?: string; owner?: string; mode?: string };
    return `agent_task_started: ${value.taskId || "task"} owner=${value.owner || "Agent"} mode=${value.mode || "unknown"}`;
  }
  if (event.type === EventType.CUSTOM && event.name === "selected_task_result") {
    const value = event.value as { taskId?: string; owner?: string; exitCode?: number | null; error?: string; awaitingLucyReview?: boolean };
    const review = value.awaitingLucyReview ? " awaiting_lucy_review=true" : "";
    return `selected_task_result: ${value.taskId || "task"} owner=${value.owner || "Agent"} exit=${value.exitCode ?? "n/a"}${review}${value.error ? ` error=${value.error}` : ""}`;
  }
  if (event.type === EventType.CUSTOM && event.name === "selected_task_deferred") {
    const value = event.value as { taskId?: string; owner?: string };
    return `selected_task_deferred: ${value.taskId || "task"} owner=${value.owner || "Agent"}`;
  }
  if (event.type === EventType.CUSTOM && event.name === "ray_execution_completed") {
    const value = event.value as { summaries?: string[]; awaitingLucyReview?: boolean };
    return `ray_execution_completed: awaiting_lucy_review=${value.awaitingLucyReview ? "true" : "false"} ${value.summaries?.join(" / ") || ""}`;
  }
  if (event.type === EventType.CUSTOM && event.name === "agent_execution_completed") {
    const value = event.value as { summaries?: string[]; awaitingLucyReview?: boolean };
    return `agent_execution_completed: awaiting_lucy_review=${value.awaitingLucyReview ? "true" : "false"} ${value.summaries?.join(" / ") || ""}`;
  }
  if (event.type === EventType.CUSTOM && event.name === "lucy_plan_completed") {
    const value = event.value as { summaries?: string[] };
    return `lucy_plan_completed: ${value.summaries?.join(" / ") || "done"}`;
  }
  if (event.type === EventType.CUSTOM && event.name === "lucy_triage") {
    const value = event.value as { priority?: string; mode?: string; owner?: string; reason?: string };
    return `lucy_triage: ${value.priority || "P2"} ${value.mode || "execute_now"} owner=${value.owner || "Ray"} ${value.reason || ""}`;
  }
  if (event.type === EventType.CUSTOM && event.name === "handoff_to_ray") {
    const value = event.value as { from?: string; to?: string; reason?: string };
    return `handoff_to_ray: ${value.from || "Lucy"} -> ${value.to || "Ray"} ${value.reason || ""}`;
  }
  if (event.type === EventType.CUSTOM && event.name === "ray_linked_execution") {
    const value = event.value as { contextHubWrites?: string[]; writtenFiles?: string[]; codex?: { mode?: string; exitCode?: number | null } };
    const codex = value.codex ? ` codex=${value.codex.mode}/${value.codex.exitCode ?? "n/a"}` : "";
    return `ray_linked_execution: wrote=${value.contextHubWrites?.join(", ") || value.writtenFiles?.join(", ") || "none"}${codex}`;
  }
  if (event.type === EventType.CUSTOM && event.name === "ray_code_result") {
    const value = event.value as { enabled?: boolean; mode?: string; exitCode?: number | null; outputFile?: string; error?: string };
    if (!value.enabled) return `ray_code_result: disabled ${value.error || ""}`;
    return `ray_code_result: mode=${value.mode} exit=${value.exitCode ?? "n/a"} output=${value.outputFile || "none"}${value.error ? ` error=${value.error}` : ""}`;
  }
  if (event.type === EventType.CUSTOM && event.name === "lucy_linked_review") {
    const value = event.value as { exitCode?: number | null; outputFile?: string; error?: string };
    return `lucy_linked_review: exit=${value.exitCode ?? "n/a"} output=${value.outputFile || "none"}${value.error ? ` error=${value.error}` : ""}`;
  }
  if (event.type === EventType.CUSTOM && event.name === "generated_command") return "generated_command: command updated";
  if (event.type === EventType.CUSTOM) return `${event.name}: ${JSON.stringify(event.value)}`;
  if (event.type === EventType.RUN_FINISHED) {
    const result = event.result as { status?: string } | undefined;
    return `run_finished: ${event.runId}${result?.status ? ` status=${result.status}` : ""}`;
  }
  if (event.type === EventType.RUN_STARTED) return `run_started: ${event.runId}`;
  if (event.type === EventType.RUN_ERROR) return `error: ${event.message}`;
  return event.type.toLowerCase();
}

export function EventStream({ events, autoScroll, onToggleAutoScroll }: EventStreamProps) {
  return (
    <section className="min-h-[260px] min-w-0 p-5">
      <div className="mb-4 flex min-w-0 items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-lg border border-slate-700 bg-slate-950/32">
            <Code2 className="h-5 w-5 text-slate-200" />
          </span>
          <h2 className="truncate text-base font-semibold text-white">AG-UI Event Stream</h2>
          <span className="status-dot bg-emerald-400" />
          <span className="text-sm text-slate-300">实时连接中</span>
        </div>
        <button
          type="button"
          onClick={onToggleAutoScroll}
          aria-label="切换自动滚动"
          aria-pressed={autoScroll}
          className="group inline-flex shrink-0 items-center gap-2 rounded-full text-sm text-slate-300 transition hover:text-white focus:outline-none focus-visible:ring-1 focus-visible:ring-slate-500/40"
        >
          <span>自动滚动</span>
          <span
            className={`relative h-7 w-14 rounded-full border border-slate-700 p-0.5 transition ${
              autoScroll ? "bg-slate-800/80" : "bg-slate-900/70"
            }`}
          >
            <span
              className={`absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-full transition ${
                autoScroll ? "left-7 bg-emerald-300" : "left-1 bg-slate-500"
              }`}
            />
          </span>
        </button>
      </div>

      <div
        id="event-stream-log"
        className="scrollbar-thin h-[180px] min-w-0 overflow-auto rounded-lg border border-slate-800/80 bg-slate-950/18 px-3 py-2 font-mono text-sm leading-7"
      >
        {events.length === 0 ? (
          <p className="text-slate-400">等待需求或手动消息...</p>
        ) : (
          events.map((event, index) => (
            <div key={`${event.receivedAt}-${index}`} className="grid min-w-0 grid-cols-[116px_190px_minmax(0,1fr)] gap-3 text-slate-300 max-xl:grid-cols-1 max-xl:gap-0">
              <span className="min-w-0 text-slate-500">[{event.receivedAt}]</span>
              <span className={`min-w-0 ${eventTone[event.type] || "text-slate-300"}`}>[{event.type.toLowerCase()}]</span>
              <span className="min-w-0 break-all text-slate-300">{eventText(event)}</span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
