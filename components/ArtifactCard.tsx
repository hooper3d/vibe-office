"use client";

import {
  Archive,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  FileDown,
  FileText,
  Image as ImageIcon,
  Loader2
} from "lucide-react";
import { useState } from "react";
import type { Artifact } from "@/types/artifact";

type ArtifactCardProps = {
  artifact: Artifact;
};

function formatCreatedAt(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(value));
}

function formatType(type: Artifact["type"]) {
  if (type === "image") return "Image";
  if (type === "markdown") return "Markdown";
  if (type === "file") return "File";
  return "URL";
}

function canPreviewText(artifact: Artifact) {
  if (artifact.type === "markdown") return true;
  if (artifact.mimeType?.startsWith("text/")) return true;
  if (artifact.mimeType === "application/json") return true;
  return /\.(csv|json|md|markdown|txt)(?:[?#]|$)/i.test(artifact.sourceUrl || artifact.path || artifact.title);
}

function PreviewText({ content, truncated }: { content: string; truncated: boolean }) {
  return (
    <div className="border-t border-slate-800 bg-slate-950/60 px-3 py-3">
      <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-md bg-slate-950/80 p-3 text-xs leading-5 text-slate-300">
        {content}
        {truncated ? "\n\n... preview truncated" : ""}
      </pre>
    </div>
  );
}

export function ArtifactCard({ artifact }: ArtifactCardProps) {
  const [copied, setCopied] = useState(false);
  const [archivedAt, setArchivedAt] = useState(artifact.archivedAt);
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewContent, setPreviewContent] = useState("");
  const [previewTruncated, setPreviewTruncated] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const href = artifact.accessUrl || artifact.sourceUrl || artifact.path || "";
  const copyValue = artifact.sourceUrl || artifact.path || artifact.accessUrl || "";
  const canPreviewImage = artifact.type === "image" && href;
  const canPreviewTextContent = canPreviewText(artifact);

  async function copyLocation() {
    if (!copyValue) return;
    await navigator.clipboard.writeText(copyValue);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  async function togglePreview() {
    if (!canPreviewTextContent) return;
    if (previewOpen) {
      setPreviewOpen(false);
      return;
    }

    setPreviewOpen(true);
    if (previewContent || previewLoading) return;

    setPreviewLoading(true);
    setPreviewError(null);

    try {
      const response = await fetch(`/api/artifacts/${encodeURIComponent(artifact.id)}/preview`, {
        cache: "no-store"
      });
      const data = (await response.json()) as {
        ok: boolean;
        content?: string;
        truncated?: boolean;
        error?: string;
      };
      if (!response.ok || !data.ok) throw new Error(data.error || "Preview unavailable");

      setPreviewContent(data.content || "");
      setPreviewTruncated(Boolean(data.truncated));
    } catch (error) {
      setPreviewError(error instanceof Error ? error.message : "Preview unavailable");
    } finally {
      setPreviewLoading(false);
    }
  }

  async function archiveToHub() {
    if (archivedAt || archiveBusy) return;

    setArchiveBusy(true);
    try {
      const response = await fetch(`/api/artifacts/${encodeURIComponent(artifact.id)}/archive`, {
        method: "POST"
      });
      const data = (await response.json()) as {
        ok: boolean;
        artifact?: Artifact;
        error?: string;
      };
      if (!response.ok || !data.ok || !data.artifact) throw new Error(data.error || "Archive failed");
      setArchivedAt(data.artifact.archivedAt || new Date().toISOString());
    } finally {
      setArchiveBusy(false);
    }
  }

  return (
    <div className="mt-3 w-full overflow-hidden rounded-lg border border-slate-700/70 bg-slate-950/55 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
      {canPreviewImage ? (
        <a href={href} target="_blank" rel="noreferrer" className="block bg-slate-950">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={href} alt={artifact.title} className="max-h-72 w-full object-contain" />
        </a>
      ) : null}

      <div className="grid min-w-0 grid-cols-[36px_minmax(0,1fr)] gap-3 px-3 py-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-800/80 text-slate-200">
          {artifact.type === "image" ? <ImageIcon className="h-4 w-4" /> : <FileDown className="h-4 w-4" />}
        </div>

        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <p className="min-w-0 flex-1 truncate text-sm font-semibold leading-5 text-slate-100">{artifact.title}</p>
            <span className="shrink-0 rounded-full bg-emerald-400/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-200">
              {archivedAt ? "Archived" : "Hub"}
            </span>
          </div>
          <p className="mt-1 truncate text-xs leading-5 text-slate-400">
            {formatType(artifact.type)} / {artifact.owner} / {formatCreatedAt(artifact.createdAt)}
          </p>
          {artifact.description ? <p className="mt-1 text-xs leading-5 text-slate-400">{artifact.description}</p> : null}
          {previewError ? <p className="mt-1 text-xs leading-5 text-red-200">{previewError}</p> : null}

          <div className="mt-2 flex flex-wrap items-center gap-1">
            {canPreviewTextContent ? (
              <button
                type="button"
                onClick={togglePreview}
                className="grid h-7 w-7 place-items-center rounded-full text-slate-400 transition hover:bg-slate-800 hover:text-slate-100"
                title={previewOpen ? "收起预览" : "预览"}
              >
                {previewLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              </button>
            ) : null}
            <button
              type="button"
              onClick={archiveToHub}
              disabled={Boolean(archivedAt) || archiveBusy}
              className="grid h-7 w-7 place-items-center rounded-full text-slate-400 transition hover:bg-slate-800 hover:text-slate-100 disabled:cursor-default disabled:text-emerald-300 disabled:opacity-80"
              title={archivedAt ? "已归档到 Hub" : "归档到 Hub"}
            >
              {archivedAt ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : archiveBusy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Archive className="h-4 w-4" />
              )}
            </button>
            <button
              type="button"
              onClick={copyLocation}
              disabled={!copyValue}
              className="grid h-7 w-7 place-items-center rounded-full text-slate-400 transition hover:bg-slate-800 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
              title={copied ? "已复制" : "复制链接"}
            >
              <Copy className="h-4 w-4" />
            </button>
            {href ? (
              <a
                href={href}
                target="_blank"
                rel="noreferrer"
                className="grid h-7 w-7 place-items-center rounded-full text-slate-400 transition hover:bg-slate-800 hover:text-slate-100"
                title="打开"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            ) : null}
            {href ? (
              <a
                href={href}
                download
                className="grid h-7 w-7 place-items-center rounded-full text-slate-400 transition hover:bg-slate-800 hover:text-slate-100"
                title="下载"
              >
                <Download className="h-4 w-4" />
              </a>
            ) : null}
          </div>
        </div>
      </div>

      {previewOpen ? <PreviewText content={previewContent} truncated={previewTruncated} /> : null}
    </div>
  );
}
