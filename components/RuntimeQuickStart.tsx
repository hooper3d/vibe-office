"use client";

import { CheckCircle2, Loader2, MonitorCog, Settings2, Wrench } from "lucide-react";
import { officeTemplates } from "@/lib/office-templates";
import type { OfficeSetupSession } from "@/types/provisioning";
import type { LocalRuntimeHealth, RuntimeQuickStartState } from "@/types/workspace";

type RuntimeQuickStartProps = {
  health: LocalRuntimeHealth | null;
  quickStart: RuntimeQuickStartState | null;
  preparing: boolean;
  testMode?: boolean;
  guideCompleted?: boolean;
  onPrepare: () => void | Promise<void>;
  onOpenOffice: (session?: OfficeSetupSession) => void;
  onOfficeSetupSaved?: (session: OfficeSetupSession) => void;
  onOpenDeveloperMode: () => void;
};

function statusLabel(health: LocalRuntimeHealth | null) {
  if (!health) return "Not checked";
  return health.summary === "ready" ? "Ready" : "Needs setup";
}

export function RuntimeQuickStart({
  health,
  quickStart,
  preparing,
  guideCompleted = false,
  onPrepare,
  onOpenOffice,
  onOpenDeveloperMode
}: RuntimeQuickStartProps) {
  const template = officeTemplates[0];
  const steps = quickStart?.steps || [];
  const ready = Boolean(quickStart?.ready || health?.summary === "ready" || guideCompleted);

  return (
    <section className="grid gap-5 rounded-xl border border-slate-800/80 bg-slate-950/55 p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-slate-800 bg-slate-950/70 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
            <MonitorCog className="h-3.5 w-3.5" />
            Default Template
          </div>
          <h2 className="text-xl font-semibold text-slate-100">{template.name}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">{template.description}</p>
        </div>
        <span className="shrink-0 rounded-full border border-slate-800 bg-slate-950 px-3 py-1 text-xs font-medium text-slate-300">
          {statusLabel(health)}
        </span>
      </div>

      {steps.length ? (
        <div className="grid gap-2">
          {steps.map((step) => (
            <div
              key={step.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-slate-800/80 bg-slate-900/30 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-200">{step.label}</p>
                {step.message ? <p className="mt-1 truncate text-xs text-slate-500">{step.message}</p> : null}
              </div>
              <span className="shrink-0 text-xs font-medium text-slate-400">{step.status}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-slate-800 bg-slate-950/45 px-4 py-5 text-sm text-slate-400">
          Run the local runtime check to prepare the office workspace.
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void onPrepare()}
          disabled={preparing}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-slate-100 px-4 text-sm font-semibold text-slate-950 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {preparing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wrench className="h-4 w-4" />}
          {preparing ? "Checking..." : "Check Runtime"}
        </button>
        <button
          type="button"
          onClick={() => onOpenOffice()}
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-700 bg-slate-900/70 px-4 text-sm font-semibold text-slate-100 transition hover:border-slate-500 hover:bg-slate-800"
        >
          <CheckCircle2 className="h-4 w-4" />
          {ready ? "Open Office" : "Preview Office"}
        </button>
        <button
          type="button"
          onClick={onOpenDeveloperMode}
          className="inline-flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium text-slate-400 transition hover:bg-slate-900/70 hover:text-slate-100"
        >
          <Settings2 className="h-4 w-4" />
          Developer Mode
        </button>
      </div>
    </section>
  );
}
