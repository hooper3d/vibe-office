import { ArrowUp, ChevronDown, ChevronUp, Paperclip, Sparkles } from "lucide-react";

type RequirementComposerProps = {
  value: string;
  running: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onOpenConversation?: () => void;
  canOpenConversation?: boolean;
  className?: string;
};

const commonInputs = [
  {
    label: "选择常用输入",
    value: ""
  },
  {
    label: "状态流闭环验收",
    value: "请项目经理拆解需求并分配给开发 Agent，只验证 Agent 状态从工作中、等待中到已完成或需处理，并确认刷新后状态恢复正常。"
  },
  {
    label: "优化真实工作流体验",
    value: "请优化真实工作流体验，重点检查发布需求、开发执行、项目经理验收、Event Stream 和结果持久化是否形成闭环。"
  },
  {
    label: "优化 UI 细节",
    value: "请基于当前页面继续优化 UI 细节，保持 AG-UI First 极简 MVP，不增加复杂后台模块。"
  },
  {
    label: "生成 Blog 素材",
    value: "请让内容 Agent 基于 BLOG_CONTEXT.md 和 RELEASE_NOTES.md 生成一版 Blog / 发布内容草稿，不执行真实发布。"
  }
];

export function RequirementComposer({
  value,
  running,
  onChange,
  onSubmit,
  onOpenConversation,
  canOpenConversation = false,
  className = ""
}: RequirementComposerProps) {
  return (
    <section className={`frost relative min-w-0 rounded-2xl p-4 ${className}`}>
      {canOpenConversation && onOpenConversation ? (
        <button
          type="button"
          onClick={onOpenConversation}
          className="absolute right-4 top-4 grid h-7 w-7 place-items-center rounded-full text-slate-400 transition hover:bg-slate-800/70 hover:text-slate-100"
          title="展开对话"
        >
          <ChevronUp className="h-4 w-4" />
        </button>
      ) : null}
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;

          if (event.ctrlKey || event.metaKey) {
            const target = event.currentTarget;
            const start = target.selectionStart;
            const end = target.selectionEnd;
            const nextValue = `${value.slice(0, start)}\n${value.slice(end)}`;
            event.preventDefault();
            onChange(nextValue);
            window.requestAnimationFrame(() => {
              target.selectionStart = start + 1;
              target.selectionEnd = start + 1;
            });
            return;
          }

          event.preventDefault();
          if (!running && value.trim()) onSubmit();
        }}
        spellCheck={false}
        className="scrollbar-thin h-24 min-w-0 w-full resize-none border-0 bg-transparent px-2 py-1 pr-10 text-sm leading-6 text-slate-100 outline-none placeholder:text-slate-500"
        placeholder="把需求发给项目经理，例如：优化真实工作流体验，说明 Project Context Hub 如何让多 Agent 共享上下文。"
      />

      <div className="mt-3 flex min-w-0 items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <div className="relative min-w-40">
            <Sparkles className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cyan-300" />
            <select
              id="common-requirement"
              disabled={running}
              value=""
              onChange={(event) => {
                if (event.target.value) onChange(event.target.value);
              }}
              className="h-9 w-full appearance-none rounded-full border border-slate-700/80 bg-slate-950/24 pl-9 pr-8 text-sm font-semibold text-cyan-200 outline-none transition hover:border-slate-600 focus:border-cyan-400 disabled:cursor-not-allowed disabled:opacity-45"
              title="选择常用输入"
            >
              {commonInputs.map((item) => (
                <option key={item.label} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          </div>

          <label
            className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-full border border-slate-700/80 bg-slate-950/24 px-3 text-sm font-semibold text-slate-300 transition hover:border-slate-600 hover:text-slate-100 ${
              running ? "cursor-not-allowed opacity-45" : "cursor-pointer"
            }`}
            title="上传附件"
          >
            <Paperclip className="h-4 w-4" />
            上传附件
            <input type="file" className="hidden" disabled={running} multiple />
          </label>
        </div>

        <button
          type="button"
          onClick={onSubmit}
          disabled={running || !value.trim()}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-slate-600 text-white shadow-[0_10px_24px_rgba(15,23,42,0.32)] transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-500"
          title="提交给 Lucy 拆解并派发"
        >
          <ArrowUp className="h-5 w-5" />
        </button>
      </div>
    </section>
  );
}
