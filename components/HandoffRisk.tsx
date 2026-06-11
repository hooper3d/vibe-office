import { File, Link2, ShieldAlert } from "lucide-react";
import { latestHandoff, risks } from "@/lib/mock-data";

export function HandoffRisk() {
  return (
    <div className="grid grid-cols-2 gap-5 max-md:grid-cols-1">
      <section className="frost rounded-xl p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link2 className="h-5 w-5 text-violet-500" />
            <h2 className="text-base font-semibold text-slate-100">最新 Handoff</h2>
          </div>
          <span className="text-sm text-slate-400">{latestHandoff.time}</span>
        </div>
        <div className="soft-pill soft-pill-violet mb-3 px-3 py-1 text-sm">
          来自 {latestHandoff.from} → {latestHandoff.to}
        </div>
        <p className="text-sm leading-6 text-slate-300">{latestHandoff.summary}</p>
        <div className="mt-4 inline-flex items-center gap-2 rounded-lg border border-slate-700/80 bg-slate-950/20 px-3 py-2 text-sm text-slate-400">
          <File className="h-4 w-4" />
          {latestHandoff.file}
        </div>
      </section>

      <section className="frost rounded-xl p-6">
        <div className="mb-4 flex items-center gap-3">
          <ShieldAlert className="h-5 w-5 text-red-500" />
          <h2 className="text-base font-semibold text-slate-100">Bug / 风险</h2>
        </div>
        <div className="space-y-4">
          {risks.map((risk) => (
            <div key={risk.id} className="flex gap-3">
              <span className={risk.level === "高" ? "mt-2 h-2 w-2 rounded-full bg-red-500" : "mt-2 h-2 w-2 rounded-full bg-amber-400"} />
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className={
                      risk.level === "高"
                        ? "soft-pill soft-pill-red px-2 py-1 text-xs"
                        : "soft-pill soft-pill-amber px-2 py-1 text-xs"
                    }
                  >
                    {risk.level}
                  </span>
                  <span className="text-sm font-medium text-slate-300">{risk.title}</span>
                </div>
                <p className="mt-1 text-sm text-slate-500">#{risk.id}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
