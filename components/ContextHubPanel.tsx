"use client";

import { AlertTriangle, Database, FileText, Loader2, Network, X } from "lucide-react";
import { useMemo, useState } from "react";
import { contextHubOverview } from "@/lib/mock-data";

type ContextHubPanelProps = {
  className?: string;
};

type ContextFilePreview = {
  ok: boolean;
  file: string;
  path: string;
  purpose: string;
  exists: boolean;
  updatedAt: string | null;
  content: string;
  error?: string;
};

function formatUpdatedAt(value: string | null) {
  if (!value) return "暂无更新时间";

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(new Date(value));
}

function MarkdownPreview({ content }: { content: string }) {
  const lines = useMemo(() => content.split(/\r?\n/), [content]);

  return (
    <div className="markdown-preview">
      {lines.map((line, index) => {
        if (!line.trim()) return <div key={index} className="h-3" />;
        if (line.startsWith("### ")) return <h4 key={index}>{line.slice(4)}</h4>;
        if (line.startsWith("## ")) return <h3 key={index}>{line.slice(3)}</h3>;
        if (line.startsWith("# ")) return <h2 key={index}>{line.slice(2)}</h2>;
        if (line.startsWith("- ")) return <p key={index} className="markdown-list-item">{line.slice(2)}</p>;
        if (/^\d+\.\s/.test(line)) return <p key={index} className="markdown-list-item">{line}</p>;
        if (line.startsWith("```")) return <p key={index} className="font-mono text-slate-500">{line}</p>;

        return <p key={index}>{line}</p>;
      })}
    </div>
  );
}

export function ContextHubPanel({ className = "" }: ContextHubPanelProps) {
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [preview, setPreview] = useState<ContextFilePreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openPreview(file: string) {
    setSelectedFile(file);
    setLoading(true);
    setError(null);
    setPreview(null);

    try {
      const response = await fetch(`/api/context-file?file=${encodeURIComponent(file)}`, {
        cache: "no-store"
      });
      const data = (await response.json()) as ContextFilePreview;
      if (!response.ok || !data.ok) throw new Error(data.error || `读取失败：${response.status}`);
      setPreview(data);
    } catch {
      setError("读取共享记忆失败，请稍后再试。");
    } finally {
      setLoading(false);
    }
  }

  function closePreview() {
    setSelectedFile(null);
    setPreview(null);
    setError(null);
    setLoading(false);
  }

  return (
    <section className={`frost relative flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl p-6 ${className}`}>
      <div className="mb-5 flex shrink-0 min-w-0 items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <Database className="h-5 w-5 text-emerald-300" />
          <h2 className="truncate text-lg font-semibold text-slate-100">Project Context Hub</h2>
        </div>
        <div className="soft-pill bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300">共享记忆</div>
      </div>

      <div className="mb-5 grid shrink-0 grid-cols-3 gap-2 text-center text-xs font-semibold text-slate-300">
        <div className="rounded-lg border border-slate-800 bg-slate-950/22 px-2 py-2">统一入口</div>
        <div className="rounded-lg border border-slate-800 bg-slate-950/22 px-2 py-2">共享记忆</div>
        <div className="rounded-lg border border-slate-800 bg-slate-950/22 px-2 py-2">上下文分发</div>
      </div>

      <div className="scrollbar-thin min-h-0 flex-1 space-y-2 overflow-auto pr-1">
        {contextHubOverview.map((item) => (
          <button
            key={item.file}
            type="button"
            onClick={() => openPreview(item.file)}
            className={`grid w-full min-w-0 grid-cols-[minmax(0,1fr)_112px] gap-3 rounded-lg border px-3 py-2 text-left transition hover:border-emerald-400/35 hover:bg-slate-900/45 focus:outline-none focus-visible:ring-1 focus-visible:ring-emerald-300/40 ${
              selectedFile === item.file ? "border-emerald-400/35 bg-slate-900/48" : "border-slate-800 bg-slate-950/18"
            }`}
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 shrink-0 text-emerald-300" />
                <span className="truncate font-mono text-sm font-semibold text-slate-100">{item.file}</span>
              </div>
              <p className="mt-1 text-xs text-slate-400">{item.role}</p>
            </div>
            <div className="flex items-center justify-end gap-2 text-xs text-slate-400">
              <Network className="h-4 w-4 text-sky-300" />
              <span>{item.flow}</span>
            </div>
          </button>
        ))}
      </div>

      {selectedFile ? (
        <div className="absolute inset-3 z-20 flex min-h-0 flex-col rounded-xl border border-slate-700 bg-[#06101d] shadow-[0_24px_70px_rgba(0,0,0,0.58)]">
          <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-800 bg-[#081624] px-4 py-3">
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <FileText className="h-4 w-4 shrink-0 text-emerald-300" />
                <h3 className="truncate font-mono text-sm font-semibold text-slate-50">{selectedFile}</h3>
              </div>
              <p className="mt-1 text-xs text-slate-400">
                {preview?.purpose || "Project Context Hub"} · {formatUpdatedAt(preview?.updatedAt ?? null)}
              </p>
            </div>
            <button
              type="button"
              onClick={closePreview}
              aria-label="关闭预览"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-slate-700 bg-slate-900/60 text-slate-300 transition hover:border-slate-500 hover:text-white focus:outline-none focus-visible:ring-1 focus-visible:ring-slate-400/50"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="scrollbar-thin min-h-0 flex-1 overflow-auto bg-[#050d18] px-4 py-4">
            {loading ? (
              <div className="flex h-full items-center justify-center gap-2 text-sm text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                正在读取共享记忆...
              </div>
            ) : error ? (
              <div className="flex items-center gap-2 rounded-lg border border-red-400/20 bg-red-500/10 px-3 py-3 text-sm text-red-200">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            ) : preview?.exists && preview.content.trim() ? (
              <MarkdownPreview content={preview.content} />
            ) : (
              <div className="text-sm text-slate-400">暂无内容</div>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
