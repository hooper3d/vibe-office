import type { AgentStatus } from "@/types/agent";
import type { TaskPlanStatus, TaskPriority } from "@/types/task";

type StatusPillProps = {
  label: AgentStatus | TaskPriority | TaskPlanStatus | string;
  compact?: boolean;
};

const palette: Record<string, string> = {
  P0: "bg-red-500/30 text-red-100 shadow-[inset_0_0_0_1px_rgba(248,113,113,0.18)]",
  P1: "bg-red-500/20 text-red-200 shadow-[inset_0_0_0_1px_rgba(248,113,113,0.12)]",
  P2: "bg-amber-500/20 text-amber-200 shadow-[inset_0_0_0_1px_rgba(251,191,36,0.12)]",
  P3: "bg-sky-500/14 text-sky-200 shadow-[inset_0_0_0_1px_rgba(56,189,248,0.1)]",
  P4: "bg-emerald-500/12 text-emerald-200 shadow-[inset_0_0_0_1px_rgba(52,211,153,0.1)]",
  P5: "bg-violet-500/14 text-violet-200 shadow-[inset_0_0_0_1px_rgba(167,139,250,0.1)]",
  P6: "bg-slate-500/14 text-slate-300 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.1)]",
  idle: "bg-sky-500/10 text-sky-300 shadow-[inset_0_0_0_1px_rgba(56,189,248,0.1)]",
  ready: "bg-emerald-500/10 text-emerald-300 shadow-[inset_0_0_0_1px_rgba(52,211,153,0.1)]",
  waiting: "bg-amber-500/10 text-amber-300 shadow-[inset_0_0_0_1px_rgba(251,191,36,0.1)]",
  working: "bg-blue-500/10 text-blue-300 shadow-[inset_0_0_0_1px_rgba(96,165,250,0.1)]",
  coding: "bg-blue-500/10 text-blue-300 shadow-[inset_0_0_0_1px_rgba(96,165,250,0.1)]",
  handoff: "bg-amber-500/10 text-amber-300 shadow-[inset_0_0_0_1px_rgba(251,191,36,0.1)]",
  reviewing: "bg-blue-500/10 text-blue-300 shadow-[inset_0_0_0_1px_rgba(96,165,250,0.1)]",
  blocked: "bg-red-500/10 text-red-300 shadow-[inset_0_0_0_1px_rgba(248,113,113,0.1)]",
  planned: "bg-slate-500/10 text-slate-300 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.1)]",
  selected: "bg-cyan-500/10 text-cyan-300 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.1)]",
  executing: "bg-blue-500/10 text-blue-300 shadow-[inset_0_0_0_1px_rgba(96,165,250,0.1)]",
  completed: "bg-sky-500/10 text-sky-300 shadow-[inset_0_0_0_1px_rgba(56,189,248,0.1)]",
  deferred: "bg-slate-500/10 text-slate-400 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.1)]"
};

const dot: Record<string, string> = {
  idle: "bg-sky-500",
  ready: "bg-emerald-500",
  waiting: "bg-amber-500",
  working: "bg-blue-400",
  coding: "bg-blue-400",
  handoff: "bg-amber-500",
  reviewing: "bg-blue-400",
  blocked: "bg-red-500",
  planned: "bg-slate-500",
  selected: "bg-cyan-400",
  executing: "bg-blue-400",
  completed: "bg-sky-500",
  deferred: "bg-slate-500"
};

const displayText: Record<string, string> = {
  idle: "已完成",
  ready: "空闲中",
  waiting: "等待中",
  working: "工作中",
  coding: "工作中",
  handoff: "等待中",
  reviewing: "工作中",
  blocked: "需处理",
  planned: "待确认",
  selected: "已选择",
  executing: "执行中",
  completed: "已完成",
  deferred: "暂缓"
};

export function StatusPill({ label, compact }: StatusPillProps) {
  const text = String(label);
  const showDot = Boolean(dot[text]);

  return (
    <span
      className={`inline-flex min-h-6 items-center justify-center gap-1.5 rounded-full px-2.5 text-xs font-medium ${
        palette[text] || "bg-slate-500/10 text-slate-300 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.1)]"
      } ${compact ? "min-w-12" : "min-w-20"}`}
    >
      {showDot ? <span className={`status-dot ${dot[text]}`} /> : null}
      {text === "reviewing" ? "待验收" : displayText[text] || text}
    </span>
  );
}
