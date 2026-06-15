import { ArrowUp, ChevronUp, Image as ImageIcon, Loader2, Paperclip, X } from "lucide-react";
import { useEffect, useRef } from "react";
import type { AgentName, AgentProfile, ProjectId } from "@/types/agent";
import type { Artifact } from "@/types/artifact";

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
  placeholder?: string;
  disabledReason?: string | null;
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
  placeholder,
  disabledReason,
  className = ""
}: RequirementComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isOfficeSetupPending = agents.length === 0;
  const interactionDisabled = running || Boolean(disabledReason);
  const canSubmit = Boolean(value.trim() || attachments.length || isOfficeSetupPending);
  const composerPlaceholder =
    placeholder ||
    (isOfficeSetupPending
      ? "Open Office Setup to activate your first Agent before starting a conversation."
      : `Message ${target}. Paste images or context here.`);
  void projectId;

  useEffect(() => {
    const currentValue = textareaRef.current?.value || "";
    if (currentValue && currentValue !== value) {
      onChange(currentValue);
    }
  }, [onChange, value]);

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
    if (!interactionDisabled && canSubmit && !attachmentBusy) onSubmit();
  }

  return (
    <section className={`frost relative z-[160] min-w-0 rounded-2xl p-4 ${className}`}>
      {canOpenConversation && onOpenConversation ? (
        <button
          type="button"
          onClick={onOpenConversation}
          className="absolute right-4 top-4 grid h-7 w-7 place-items-center rounded-full text-slate-400 transition hover:bg-slate-800/70 hover:text-slate-100"
          title="Expand conversation"
        >
          <ChevronUp className="h-4 w-4" />
        </button>
      ) : null}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        onInput={(event) => {
          onChange(event.currentTarget.value);
        }}
        onPaste={handlePaste}
        onKeyDown={handleSubmitShortcut}
        disabled={Boolean(disabledReason)}
        spellCheck={false}
        className="scrollbar-thin h-24 min-w-0 w-full resize-none border-0 bg-transparent px-2 py-1 pr-10 text-sm leading-6 text-slate-100 outline-none placeholder:text-slate-500 disabled:cursor-not-allowed disabled:text-slate-500"
        placeholder={composerPlaceholder}
      />

      {disabledReason ? <p className="mt-1 px-2 text-xs leading-5 text-amber-200">{disabledReason}</p> : null}

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
                title="Remove image"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          {attachmentBusy ? (
            <div className="flex h-14 items-center gap-2 rounded-lg border border-slate-700/80 bg-slate-950/24 px-3 text-xs text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin text-sky-300" />
              Reading pasted image
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-3 flex min-w-0 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <label
            aria-label="Upload image"
            className={`grid h-9 w-9 place-items-center rounded-full border border-slate-700/80 bg-slate-950/24 text-slate-300 transition hover:border-slate-600 hover:text-slate-100 ${
              interactionDisabled ? "cursor-not-allowed opacity-45" : "cursor-pointer"
            }`}
            title="Upload image"
          >
            <Paperclip className="h-4 w-4" />
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
              className="hidden"
              disabled={interactionDisabled || attachmentBusy}
              multiple
              onChange={handleFileInput}
            />
          </label>
        </div>

        <button
          type="button"
          onClick={onSubmit}
          disabled={interactionDisabled || attachmentBusy || !canSubmit}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-slate-600 text-white shadow-[0_10px_24px_rgba(15,23,42,0.32)] transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-500"
          title="Submit"
        >
          <ArrowUp className="h-5 w-5" />
        </button>
      </div>
    </section>
  );
}
