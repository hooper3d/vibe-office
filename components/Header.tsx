import { ShieldAlert, Sparkles } from "lucide-react";

type HeaderProps = {
  connection: "Local Connected" | "Streaming" | "Error";
};

export function Header({ connection }: HeaderProps) {
  const isError = connection === "Error";
  const isStreaming = connection === "Streaming";

  return (
    <header className="flex h-[80px] items-center gap-6 bg-[#0a111c]/72 px-8 backdrop-blur max-md:px-5">
      <div className="flex min-w-0 items-center gap-4">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-blue-400/30 bg-blue-500/10 shadow-sm">
          <Sparkles className="h-5 w-5 text-blue-300" />
        </div>
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <h1 className="truncate text-lg font-semibold tracking-normal text-slate-50">Vibe Office</h1>
            <span className="shrink-0 rounded-full border border-sky-300/20 bg-sky-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase leading-none text-sky-200">
              beta
            </span>
          </div>
          <p className="mt-0.5 truncate text-xs text-slate-400">AG-UI Agent Platform</p>
        </div>
      </div>

      <div className="ml-auto flex min-w-0 items-center gap-4">
        <div
          className={`top-control hidden h-9 min-w-44 items-center justify-center gap-2.5 rounded-lg px-3 text-sm font-medium md:flex ${
            isError ? "text-red-300" : isStreaming ? "text-blue-300" : "text-emerald-300"
          }`}
        >
          <span className={`status-dot ${isError ? "bg-red-500" : isStreaming ? "bg-blue-500" : "bg-emerald-500"}`} />
          AG-UI · {connection}
        </div>

        <button
          type="button"
          className="top-control hidden h-9 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium text-amber-300 md:flex"
          title="当前有 2 项风险提示"
        >
          <ShieldAlert className="h-4 w-4" />
          <span>2</span>
        </button>

      </div>
    </header>
  );
}
