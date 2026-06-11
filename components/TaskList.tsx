import { CheckSquare, Play } from "lucide-react";
import type { TaskItem } from "@/types/task";
import { StatusPill } from "./StatusPill";

type TaskListProps = {
  tasks: TaskItem[];
  className?: string;
  selectable?: boolean;
  running?: boolean;
  onToggleTask?: (taskId: string) => void;
  onExecuteSelected?: () => void;
};

function formatTaskCode(id: string) {
  const taskNumber = id.match(/task-(\d+)$/i)?.[1];
  if (taskNumber) return `#${taskNumber}`;
  return `#${id}`;
}

export function TaskList({
  tasks,
  className = "",
  selectable = false,
  running = false,
  onToggleTask,
  onExecuteSelected
}: TaskListProps) {
  const selectedCount = tasks.filter((task) => task.selected).length;

  return (
    <section className={`frost flex min-h-0 min-w-0 flex-col rounded-xl p-6 ${className}`}>
      <div className="mb-4 flex shrink-0 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <CheckSquare className="h-5 w-5 text-slate-300" />
          <h2 className="text-base font-semibold text-slate-100">任务列表</h2>
        </div>
        <span className="soft-pill bg-slate-500/10 px-2 py-0.5 text-xs text-slate-300">{tasks.length} 项</span>
      </div>

      {selectable ? (
        <div className="mb-3 flex shrink-0 items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/20 px-3 py-2">
          <span className="text-xs font-medium text-slate-400">已选择 {selectedCount} 项，按 P0 → P6 执行</span>
          <button
            type="button"
            onClick={onExecuteSelected}
            disabled={running || selectedCount === 0}
            className="inline-flex h-7 items-center justify-center gap-1.5 rounded-full bg-cyan-500/14 px-2.5 text-xs font-semibold text-cyan-200 transition hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Play className="h-3.5 w-3.5" />
            执行选中任务
          </button>
        </div>
      ) : null}

      <div className="scrollbar-thin min-h-0 min-w-0 flex-1 space-y-2 overflow-auto pr-1">
        {!tasks.length ? (
          <div className="flex h-full min-h-[180px] flex-col items-center justify-center rounded-lg border border-dashed border-slate-800 bg-slate-950/10 px-6 text-center">
            <p className="text-sm font-semibold text-slate-300">还没有生成计划任务</p>
            <p className="mt-2 max-w-[260px] text-xs leading-5 text-slate-500">
              先和 Lucy 对齐需求，沟通完成后点击生成计划，这里才会出现可勾选的任务。
            </p>
          </div>
        ) : null}
        {tasks.map((task) => {
          const taskCode = formatTaskCode(task.id);

          return (
            <div
              key={task.id}
              className="min-w-0 rounded-lg border border-slate-800 bg-slate-950/12 px-3 py-3 text-sm transition hover:border-slate-700 hover:bg-slate-900/34"
            >
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                {selectable ? (
                  <input
                    type="checkbox"
                    checked={Boolean(task.selected)}
                    disabled={running || task.planStatus === "executing" || task.planStatus === "completed"}
                    onChange={() => onToggleTask?.(task.id)}
                    className="h-4 w-4 shrink-0 rounded border-slate-700 bg-slate-950 accent-cyan-400 disabled:opacity-40"
                    aria-label={`选择任务 ${task.title}`}
                  />
                ) : null}
                <StatusPill label={task.priority} compact />
                <span className="min-w-0 truncate text-xs font-medium text-slate-500" title={task.id}>
                  {task.owner} · {taskCode}
                </span>
              </div>
              <StatusPill label={task.planStatus || task.status} compact />
            </div>

            <p className="mt-2 truncate font-medium text-slate-200">{task.title}</p>
            {task.description ? <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-400">{task.description}</p> : null}
            {task.acceptance?.length ? (
              <p className="mt-2 truncate text-[11px] text-slate-500">验收：{task.acceptance[0]}</p>
            ) : null}
          </div>
          );
        })}
      </div>
    </section>
  );
}
