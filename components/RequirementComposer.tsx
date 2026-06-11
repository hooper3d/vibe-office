import { ArrowUp, ChevronUp, Image as ImageIcon, Loader2, Paperclip, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import type { AgentName, AgentProfile, ProjectId } from "@/types/agent";
import type { Artifact } from "@/types/artifact";
import type { CSSProperties } from "react";

type RequirementComposerProps = {
  value: string;
  running: boolean;
  agents: AgentProfile[];
  projectId: ProjectId;
  target: AgentName;
  attachments?: Artifact[];
  attachmentBusy?: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onPasteImages?: (files: File[]) => void;
  onRemoveAttachment?: (artifactId: string) => void;
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
  attachments = [],
  attachmentBusy = false,
  onChange,
  onSubmit,
  onPasteImages,
  onRemoveAttachment,
  onOpenConversation,
  canOpenConversation = false,
  className = ""
}: RequirementComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionStart, setMentionStart] = useState(0);
  const [mentionMenuStyle, setMentionMenuStyle] = useState<CSSProperties>({ bottom: 76, left: 20 });
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
  const canSubmit = Boolean(value.trim() || attachments.length);
  void target;

  function measureTextareaPosition(position: number) {
    const textarea = textareaRef.current;
    const container = textarea?.closest("section");
    if (!textarea || !container) return null;

    const textareaRect = textarea.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const style = window.getComputedStyle(textarea);
    const mirror = document.createElement("div");
    const marker = document.createElement("span");
    const lineHeight = Number.parseFloat(style.lineHeight) || 24;

    Object.assign(mirror.style, {
      position: "fixed",
      visibility: "hidden",
      whiteSpace: "pre-wrap",
      wordBreak: "break-word",
      overflowWrap: "break-word",
      boxSizing: style.boxSizing,
      width: `${textareaRect.width}px`,
      padding: style.padding,
      border: style.border,
      font: style.font,
      letterSpacing: style.letterSpacing,
      lineHeight: style.lineHeight,
      top: `${textareaRect.top}px`,
      left: `${textareaRect.left}px`
    });

    mirror.textContent = textarea.value.slice(0, position);
    marker.textContent = textarea.value.slice(position, position + 1) || " ";
    mirror.appendChild(marker);
    document.body.appendChild(mirror);

    const markerRect = marker.getBoundingClientRect();
    document.body.removeChild(mirror);

    return {
      left: markerRect.left - containerRect.left - textarea.scrollLeft,
      bottom: markerRect.top + lineHeight - containerRect.top - textarea.scrollTop,
      containerWidth: containerRect.width,
      containerHeight: containerRect.height
    };
  }

  function updateMentionPosition(tokenStart: number) {
    const position = measureTextareaPosition(tokenStart + 1);
    if (!position) return;

    setMentionMenuStyle({
      bottom: Math.max(position.containerHeight - position.bottom, 14),
      left: Math.max(14, Math.min(position.left + 8, position.containerWidth - 244))
    });
  }

  function updateMentionMenu(nextValue: string, caret: number) {
    const beforeCaret = nextValue.slice(0, caret);
    const tokenStart = Math.max(beforeCaret.lastIndexOf(" "), beforeCaret.lastIndexOf("\n"), beforeCaret.lastIndexOf("\t")) + 1;
    const token = beforeCaret.slice(tokenStart);

    if (token.startsWith("@") && !token.includes("，") && !token.includes("：") && !token.includes(":")) {
      setMentionStart(tokenStart);
      setMentionQuery(token.slice(1));
      window.requestAnimationFrame(() => updateMentionPosition(tokenStart));
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

  function handlePaste(event: React.ClipboardEvent<HTMLTextAreaElement>) {
    const imageFiles = Array.from(event.clipboardData.items)
      .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file));

    if (!imageFiles.length) return;
    event.preventDefault();
    onPasteImages?.(imageFiles);
  }

  function handleFileInput(event: React.ChangeEvent<HTMLInputElement>) {
    const imageFiles = Array.from(event.currentTarget.files || []).filter((file) => file.type.startsWith("image/"));
    event.currentTarget.value = "";
    if (!imageFiles.length) return;
    onPasteImages?.(imageFiles);
  }

  function handleSubmitShortcut(event: React.KeyboardEvent<HTMLTextAreaElement>) {
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
    if (!running && canSubmit && !attachmentBusy) onSubmit();
  }

  return (
    <section className={`frost relative z-[160] min-w-0 rounded-2xl p-4 ${className}`}>
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
        onPaste={handlePaste}
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
          handleSubmitShortcut(event);
        }}
        spellCheck={false}
        className="scrollbar-thin h-24 min-w-0 w-full resize-none border-0 bg-transparent px-2 py-1 pr-10 text-sm leading-6 text-slate-100 outline-none placeholder:text-slate-500"
        placeholder={
          projectId === "free-project"
            ? "在自由项目里输入 @Tiger、@Musk 或 @Ray 直接沟通；复杂任务仍可 @Lucy。支持直接粘贴图片。"
            : "输入 @ 选择 Agent；复杂任务交给 Lucy，简单任务可直接 @Tiger / @Musk / @Ray。支持直接粘贴图片。"
        }
      />

      {attachments.length || attachmentBusy ? (
        <div className="mt-2 flex min-w-0 flex-wrap gap-2 px-1">
          {attachments.map((artifact) => (
            <div
              key={artifact.id}
              className="group relative flex h-14 min-w-0 max-w-[220px] items-center gap-2 rounded-lg border border-sky-400/20 bg-sky-950/30 p-1.5 pr-8"
            >
              {artifact.accessUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={artifact.accessUrl} alt={artifact.title} className="h-11 w-11 shrink-0 rounded-md object-cover" />
              ) : (
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-slate-900 text-sky-200">
                  <ImageIcon className="h-4 w-4" />
                </span>
              )}
              <span className="min-w-0 truncate text-xs font-medium text-sky-50">{artifact.title}</span>
              <button
                type="button"
                onClick={() => onRemoveAttachment?.(artifact.id)}
                className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full text-slate-400 transition hover:bg-slate-800 hover:text-slate-100"
                title="移除图片"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          {attachmentBusy ? (
            <div className="flex h-14 items-center gap-2 rounded-lg border border-slate-700/80 bg-slate-950/24 px-3 text-xs text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin text-sky-300" />
              正在读取粘贴图片
            </div>
          ) : null}
        </div>
      ) : null}

      {visibleMentionOptions.length ? (
        <div
          style={mentionMenuStyle}
          className="absolute z-[180] max-h-56 w-56 overflow-auto rounded-lg border border-slate-700/80 bg-[#08111d] py-1 shadow-[0_18px_48px_rgba(0,0,0,0.42)]"
        >
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
          <label
            aria-label="上传图片"
            className={`grid h-9 w-9 place-items-center rounded-full border border-slate-700/80 bg-slate-950/24 text-slate-300 transition hover:border-slate-600 hover:text-slate-100 ${
              running ? "cursor-not-allowed opacity-45" : "cursor-pointer"
            }`}
            title="上传图片"
          >
            <Paperclip className="h-4 w-4" />
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
              className="hidden"
              disabled={running || attachmentBusy}
              multiple
              onChange={handleFileInput}
            />
          </label>
        </div>

        <button
          type="button"
          onClick={onSubmit}
          disabled={running || attachmentBusy || !canSubmit}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-slate-600 text-white shadow-[0_10px_24px_rgba(15,23,42,0.32)] transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-500"
          title="提交"
        >
          <ArrowUp className="h-5 w-5" />
        </button>
      </div>
    </section>
  );
}
