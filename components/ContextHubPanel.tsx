"use client";

import { AlertTriangle, Bot, Clock3, Database, FileText, Loader2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { contextHubOverview } from "@/lib/mock-data";
import { MarkdownPreview } from "@/components/MarkdownPreview";
import type { ProjectId } from "@/types/agent";

type ContextHubPanelProps = {
  projectId: ProjectId;
  embedded?: boolean;
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

type ContextFileMetadata = {
  file: string;
  updatedAt: string | null;
  lastEditor: string;
};

type ContextFilesMetadataResponse = {
  ok: boolean;
  files: ContextFileMetadata[];
};

function formatUpdatedAt(value: string | null) {
  if (!value) return "暂无更新";

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(value));
}

function isRecentlyUpdated(value: string | null) {
  if (!value) return false;
  const updatedAt = new Date(value).getTime();
  if (Number.isNaN(updatedAt)) return false;

  return Date.now() - updatedAt < 2 * 60 * 60 * 1000;
}

export function ContextHubPanel({ projectId, embedded = false, className = "" }: ContextHubPanelProps) {
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [preview, setPreview] = useState<ContextFilePreview | null>(null);
  const [metadataByFile, setMetadataByFile] = useState<Record<string, ContextFileMetadata>>({});
  const [changedFiles, setChangedFiles] = useState<Set<string>>(new Set());
  const [acknowledgedUpdates, setAcknowledgedUpdates] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const usesDefaultContextFiles = projectId === "demo-project";

  useEffect(() => {
    let active = true;

    async function loadMetadata() {
      try {
        const response = await fetch("/api/context-files", { cache: "no-store" });
        const data = (await response.json()) as ContextFilesMetadataResponse;
        if (!active || !response.ok || !data.ok) return;

        setMetadataByFile((current) => {
          const next = Object.fromEntries(data.files.map((item) => [item.file, item]));
          const changed = data.files
            .filter((item) => current[item.file] && current[item.file].updatedAt !== item.updatedAt)
            .map((item) => item.file);

          if (changed.length) {
            setChangedFiles((currentChanged) => {
              const nextChanged = new Set(currentChanged);
              changed.forEach((file) => nextChanged.add(file));
              return nextChanged;
            });
          }

          return next;
        });
      } catch {
        if (active) setMetadataByFile({});
      }
    }

    void loadMetadata();
    const interval = window.setInterval(loadMetadata, 10000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  async function openPreview(file: string, acknowledgedUpdatedAt?: string | null) {
    setSelectedFile(file);
    setAcknowledgedUpdates((current) => ({
      ...current,
      [file]: acknowledgedUpdatedAt ?? metadataByFile[file]?.updatedAt ?? null
    }));
    setChangedFiles((current) => {
      const next = new Set(current);
      next.delete(file);
      return next;
    });
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
    <section className={`${embedded ? "relative flex min-h-0 min-w-0 flex-col overflow-hidden" : "frost relative flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl p-6"} ${className}`}>
      {!embedded ? (
      <div className="mb-5 flex min-w-0 shrink-0 items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <Database className="h-5 w-5 text-emerald-300" />
          <h2 className="truncate text-base font-semibold text-slate-100">Project Context Hub</h2>
        </div>
        <div className="soft-pill h-7 max-w-20 shrink-0 truncate bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300">
          共享记忆
        </div>
      </div>
      ) : null}

      <div className="scrollbar-thin min-h-0 flex-1 space-y-2 overflow-auto pr-1">
        {!usesDefaultContextFiles ? (
          <div className="flex h-full min-h-[220px] flex-col items-center justify-center rounded-lg border border-dashed border-slate-800 bg-slate-950/10 px-6 text-center">
            <p className="text-sm font-semibold text-slate-300">当前项目还没有写入共享记忆</p>
            <p className="mt-2 max-w-[260px] text-xs leading-5 text-slate-500">
              等任务、对话或产物沉淀为项目上下文后，会在这里显示。
            </p>
          </div>
        ) : null}
        {usesDefaultContextFiles ? contextHubOverview.map((item) => {
          const metadata = metadataByFile[item.file];
          const hasChanged = changedFiles.has(item.file);
          const hasBeenSeen = acknowledgedUpdates[item.file] === (metadata?.updatedAt ?? null);
          const hasUpdateStatus = !hasBeenSeen && (hasChanged || isRecentlyUpdated(metadata?.updatedAt ?? null));

          return (
            <button
              key={item.file}
              type="button"
              onClick={() => openPreview(item.file, metadata?.updatedAt ?? null)}
              className={`grid w-full min-w-0 grid-cols-[minmax(0,1fr)_88px] gap-3 rounded-lg border px-3 py-2 text-left transition hover:border-emerald-400/35 hover:bg-slate-900/45 focus:outline-none focus-visible:ring-1 focus-visible:ring-emerald-300/40 ${
                selectedFile === item.file
                  ? "border-emerald-400/35 bg-slate-900/48"
                  : hasUpdateStatus
                    ? "border-sky-400/45 bg-sky-400/10"
                    : "border-slate-800 bg-slate-950/18"
              }`}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="relative shrink-0">
                    <FileText className="h-4 w-4 text-emerald-300" />
                  </span>
                  <span className="truncate font-mono text-sm font-semibold text-slate-100">{item.file}</span>
                  {hasUpdateStatus ? (
                    <span className="inline-flex h-5 shrink-0 items-center rounded-full bg-sky-400/12 px-1.5 text-xs font-medium text-sky-200 shadow-[inset_0_0_0_1px_rgba(125,211,252,0.16)]">
                      更新
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 truncate text-xs text-slate-400">{item.role}</p>
              </div>
              <div className="flex min-w-0 flex-col items-end justify-center gap-1 text-xs text-slate-400">
                <span className="flex max-w-full items-center gap-1 truncate">
                  <Clock3 className="h-3.5 w-3.5 shrink-0 text-sky-300" />
                  <span className="truncate">{formatUpdatedAt(metadata?.updatedAt ?? null)}</span>
                </span>
                <span className="flex max-w-full items-center gap-1 truncate">
                  <Bot className="h-3.5 w-3.5 shrink-0 text-emerald-300" />
                  <span className="truncate">{metadata?.lastEditor ?? "Unknown"}</span>
                </span>
              </div>
            </button>
          );
        }) : null}
      </div>

      {selectedFile ? (
        <div className="absolute inset-0 z-20 flex min-h-0 flex-col bg-[rgba(7,13,22,0.98)]">
          <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-800/80 px-6 py-4">
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <FileText className="h-4 w-4 shrink-0 text-emerald-300" />
                <h3 className="truncate font-mono text-sm font-semibold text-slate-50">{selectedFile}</h3>
              </div>
              <p className="mt-1 truncate text-xs text-slate-400">
                {preview?.purpose || "Project Context Hub"} / 更新 {formatUpdatedAt(preview?.updatedAt ?? null)} / 编辑{" "}
                {metadataByFile[selectedFile]?.lastEditor ?? "Unknown"}
              </p>
            </div>
            <button
              type="button"
              onClick={closePreview}
              aria-label="关闭预览"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-slate-400 transition hover:bg-slate-800/80 hover:text-white focus:outline-none focus-visible:ring-1 focus-visible:ring-slate-400/50"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="scrollbar-thin min-h-0 flex-1 overflow-auto px-6 py-5">
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
