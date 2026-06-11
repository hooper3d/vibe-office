import { ArrowUp, ChevronDown, ChevronUp, MessagesSquare, Paperclip } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { projects } from "@/lib/mock-data";
import type { AgentName, AgentProfile, ProjectId } from "@/types/agent";

type RequirementComposerProps = {
  value: string;
  running: boolean;
  agents: AgentProfile[];
  projectId: ProjectId;
  target: AgentName;
  onProjectChange: (projectId: ProjectId) => void;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onOpenConversation?: () => void;
  canOpenConversation?: boolean;
  className?: string;
};

export function RequirementComposer({
  value,
  running,
  agents,
  projectId,
  target,
  onProjectChange,
  onChange,
  onSubmit,
  onOpenConversation,
  canOpenConversation = false,
  className = ""
}: RequirementComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionStart, setMentionStart] = useState(0);
  const mentionOptions = useMemo(
    () => agents.map((agent) => ({ name: agent.name, label: agent.name, role: agent.role })),
    [agents]
  );
  const visibleMentionOptions = mentionOptions.filter((option) => {
    if (mentionQuery === null) return false;
    const normalized = mentionQuery.trim().toLowerCase();
    if (!normalized) return true;
    return option.name.toLowerCase().startsWith(normalized) || option.label.toLowerCase().startsWith(normalized);
  });
  void target;
  const activeProject = projects.find((item) => item.id === projectId) || projects[0];

  function updateMentionMenu(nextValue: string, caret: number) {
    const beforeCaret = nextValue.slice(0, caret);
    const tokenStart = Math.max(beforeCaret.lastIndexOf(" "), beforeCaret.lastIndexOf("\n"), beforeCaret.lastIndexOf("\t")) + 1;
    const token = beforeCaret.slice(tokenStart);

    if (token.startsWith("@") && !token.includes("：") && !token.includes(":")) {
      setMentionStart(tokenStart);
      setMentionQuery(token.slice(1));
      return;
    }

    setMentionQuery(null);
  }

  function insertMention(option: (typeof mentionOptions)[number]) {
    const textarea = textareaRef.current;
    const caret = textarea?.selectionStart ?? value.length;
    const label = option.name;
    const nextValue = `${value.slice(0, mentionStart)}@${label} ${value.slice(caret)}`;

    onChange(nextValue);
    setMentionQuery(null);
    window.requestAnimationFrame(() => {
      if (!textarea) return;
      const nextCaret = mentionStart + label.length + 2;
      textarea.focus();
      textarea.selectionStart = nextCaret;
      textarea.selectionEnd = nextCaret;
    });
  }

  return (
    <section className={`frost relative z-20 min-w-0 rounded-2xl p-4 ${className}`}>
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
        ref={textareaRef}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          updateMentionMenu(event.target.value, event.target.selectionStart);
        }}
        onClick={(event) => updateMentionMenu(value, event.currentTarget.selectionStart)}
        onKeyUp={(event) => updateMentionMenu(value, event.currentTarget.selectionStart)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && mentionQuery !== null) {
            event.preventDefault();
            setMentionQuery(null);
            return;
          }
          if (event.key === "Enter" && mentionQuery !== null && visibleMentionOptions[0]) {
            event.preventDefault();
            insertMention(visibleMentionOptions[0]);
            return;
          }
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
        placeholder={
          projectId === "free-project"
            ? "在自由项目里输入 @Tiger、@Musk 或 @Ray 直接沟通；复杂任务仍可 @Lucy。"
            : "输入 @ 选择 Agent；复杂任务交给 Lucy，简单任务可直接 @Tiger / @Musk / @Ray。"
        }
      />

      {visibleMentionOptions.length ? (
        <div className="absolute bottom-[76px] left-5 z-50 max-h-56 w-64 overflow-auto rounded-lg border border-slate-700/80 bg-[#08111d] py-1 shadow-[0_18px_48px_rgba(0,0,0,0.42)]">
          {visibleMentionOptions.map((option) => (
            <button
              key={option.name}
              type="button"
              onMouseDown={(event) => {
                event.preventDefault();
                insertMention(option);
              }}
              className="flex w-full min-w-0 items-center gap-3 px-3 py-2 text-left transition hover:bg-slate-800/70"
            >
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-slate-800 text-xs font-bold text-slate-100">
                {option.label.slice(0, 1)}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-slate-100">@{option.label}</span>
                <span className="block truncate text-xs text-slate-500">{option.role}</span>
              </span>
            </button>
          ))}
        </div>
      ) : null}

      <div className="mt-3 flex min-w-0 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <label className="relative inline-flex h-9 w-[136px] items-center gap-2 rounded-lg border border-slate-700/80 bg-slate-950/24 px-3 text-sm font-semibold text-cyan-100 transition hover:border-slate-600">
            <MessagesSquare className="h-4 w-4 shrink-0 text-cyan-300" />
            <span className="min-w-0 truncate">{activeProject.name}</span>
            <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" />
            <select
              value={projectId}
              onChange={(event) => onProjectChange(event.target.value as ProjectId)}
              className="absolute inset-0 h-9 w-full cursor-pointer opacity-0"
              title="切换项目"
            >
              {projects.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>

          <label
            aria-label="上传附件"
            className={`grid h-9 w-9 place-items-center rounded-lg border border-slate-700/80 bg-slate-950/24 text-slate-300 transition hover:border-slate-600 hover:text-slate-100 ${
              running ? "cursor-not-allowed opacity-45" : "cursor-pointer"
            }`}
            title="上传附件"
          >
            <Paperclip className="h-4 w-4" />
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
