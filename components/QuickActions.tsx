import { FileText, Globe2, Send, UserCheck } from "lucide-react";
import type { AgentAction } from "@/types/agent";

type QuickActionsProps = {
  running: boolean;
  onAction: (action: AgentAction) => void;
};

const actions: Array<{
  action: AgentAction;
  label: string;
  icon: typeof Send;
  tone: string;
}> = [
  { action: "dispatch_to_ray", label: "Ray → Lucy 联动", icon: Send, tone: "text-blue-400" },
  { action: "ask_lucy_review", label: "让 Lucy 统筹验收", icon: UserCheck, tone: "text-violet-400" },
  { action: "ask_tiger_blog", label: "让 Tiger 写 Blog", icon: Globe2, tone: "text-emerald-400" },
  { action: "daily_report", label: "生成项目日报", icon: FileText, tone: "text-orange-400" }
];

export function QuickActions({ running, onAction }: QuickActionsProps) {
  return (
    <section className="frost min-w-0 rounded-xl p-6">
      <div className="mb-5 flex items-center gap-3">
        <Send className="h-5 w-5 text-slate-300" />
        <h2 className="text-lg font-semibold text-slate-100">快捷动作</h2>
      </div>

      <div className="grid min-w-0 grid-cols-2 gap-3 max-sm:grid-cols-1">
        {actions.map(({ action, label, icon: Icon, tone }) => (
          <button
            key={action}
            type="button"
            disabled={running}
            onClick={() => onAction(action)}
            className="flex h-16 min-w-0 items-center justify-center gap-4 rounded-lg border border-slate-700/90 bg-slate-950/16 px-4 text-base font-semibold text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] transition hover:-translate-y-0.5 hover:border-slate-600 hover:bg-slate-800/45 disabled:cursor-not-allowed disabled:opacity-55"
            title={label}
          >
            <Icon className={`h-6 w-6 ${tone}`} />
            <span className="truncate">{label}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
