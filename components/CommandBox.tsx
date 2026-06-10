import { Clipboard, Copy, RotateCcw, SendHorizontal, Terminal } from "lucide-react";

type CommandBoxProps = {
  command: string;
  draft: string;
  running: boolean;
  copied: boolean;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  onCopy: () => void;
  onClear: () => void;
};

export function CommandBox({
  command,
  draft,
  running,
  copied,
  onDraftChange,
  onSend,
  onCopy,
  onClear
}: CommandBoxProps) {
  return (
    <section className="grid min-h-[280px] min-w-0 grid-cols-[minmax(0,1fr)_156px] gap-5 p-5 max-sm:grid-cols-1">
      <div className="min-w-0">
        <div className="mb-4 flex items-center gap-3 border-b border-slate-800 pb-3">
          <span className="grid h-9 w-9 place-items-center rounded-lg border border-slate-700 bg-slate-950/32">
            <Terminal className="h-5 w-5 text-slate-200" />
          </span>
          <h2 className="text-base font-semibold text-white">生成的指令预览</h2>
        </div>

        <textarea
          value={command || draft}
          onChange={(event) => onDraftChange(event.target.value)}
          spellCheck={false}
          className="scrollbar-thin h-[200px] min-w-0 w-full resize-none rounded-lg border border-slate-800 bg-[#09101a] p-4 font-mono text-sm leading-6 text-slate-100 outline-none transition focus:border-blue-400"
          placeholder="@Ray&#10;&#10;输入一条测试消息，然后发送给 AG-UI runtime。"
        />
      </div>

      <div className="flex min-w-0 flex-col justify-between rounded-lg border border-slate-800 bg-slate-950/24 p-4">
        <div className="space-y-3">
          <button
            type="button"
            onClick={onCopy}
            disabled={!command && !draft}
            className="flex h-12 w-full items-center justify-center gap-3 rounded-lg bg-blue-500 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(59,130,246,0.2)] transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-45"
            title="复制指令"
          >
            {copied ? <Clipboard className="h-5 w-5" /> : <Copy className="h-5 w-5" />}
            {copied ? "已复制" : "复制指令"}
          </button>
          <button
            type="button"
            onClick={onClear}
            className="flex h-12 w-full items-center justify-center gap-3 rounded-lg border border-slate-700 text-sm font-semibold text-slate-200 transition hover:bg-slate-800/70"
            title="清空"
          >
            <RotateCcw className="h-5 w-5" />
            清空
          </button>
        </div>

        <button
          type="button"
          onClick={onSend}
          disabled={running || !(command || draft).trim()}
          className="flex h-12 w-full items-center justify-center gap-3 rounded-lg border border-slate-700 bg-slate-800/80 text-sm font-semibold text-slate-100 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-45"
          title="发送"
        >
          <SendHorizontal className="h-5 w-5" />
          发送
        </button>
      </div>
    </section>
  );
}
