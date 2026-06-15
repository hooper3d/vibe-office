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
import { MarkdownPreview } from "@/components/MarkdownPreview";
import type { Artifact } from "@/types/artifact";

type ArtifactCardProps = {
  artifact: Artifact;
  ownerLabel?: string;
  className?: string;
};

function formatCreatedAt(value: string) {
  return new Intl.DateTimeFormat("en", {
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

function extensionFromArtifact(artifact: Artifact) {
  const location = artifact.path || artifact.sourceUrl || "";
  const extension = location.split(/[?#]/)[0].match(/\.[a-z0-9]+$/i)?.[0];
  if (extension) return extension;
  if (artifact.type === "markdown") return ".md";
  if (artifact.mimeType === "text/plain") return ".txt";
  if (artifact.mimeType === "text/csv") return ".csv";
  if (artifact.mimeType === "application/json") return ".json";
  if (artifact.mimeType === "application/pdf") return ".pdf";
  if (artifact.mimeType === "image/png") return ".png";
  if (artifact.mimeType === "image/jpeg") return ".jpg";
  if (artifact.mimeType === "image/gif") return ".gif";
  if (artifact.mimeType === "image/webp") return ".webp";
  if (artifact.mimeType === "image/svg+xml") return ".svg";
  return "";
}

function downloadFilename(artifact: Artifact) {
  const locationName = (artifact.path || artifact.sourceUrl || "").split(/[?#]/)[0].split(/[\\/]/).filter(Boolean).pop();
  const base = locationName || artifact.title || "artifact";
  if (/\.[a-z0-9]+$/i.test(base)) return base;
  return `${base}${extensionFromArtifact(artifact)}`;
}

function PreviewText({ artifact, content, truncated }: { artifact: Artifact; content: string; truncated: boolean }) {
  const previewText = `${content}${truncated ? "\n\n---\nPreview truncated." : ""}`;

  return (
    <div className="border-t border-slate-800 bg-slate-950/60 px-3 py-3">
      <div className="max-h-72 overflow-auto rounded-md bg-slate-950/72 p-3 scrollbar-thin">
        {artifact.type === "markdown" || artifact.mimeType === "text/markdown" ? (
          <MarkdownPreview content={previewText} className="text-xs" />
        ) : (
          <pre className="whitespace-pre-wrap break-words text-xs leading-5 text-slate-300">{previewText}</pre>
        )}
      </div>
    </div>
  );
}

export function ArtifactCard({ artifact, ownerLabel, className = "" }: ArtifactCardProps) {
  const [copied, setCopied] = useState(false);
  const [archivedAt, setArchivedAt] = useState(artifact.archivedAt);
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewContent, setPreviewContent] = useState("");
  const [previewTruncated, setPreviewTruncated] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const href = artifact.accessUrl || artifact.sourceUrl || artifact.path || "";
  const filename = downloadFilename(artifact);
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
    <div
      className={`mt-3 w-full overflow-hidden rounded-lg border border-slate-700/70 bg-slate-950/55 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)] ${className}`}
    >
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
            <div className="flex shrink-0 items-center gap-1">
              {canPreviewTextContent ? (
                <button
                  type="button"
                  onClick={togglePreview}
                  className="inline-flex h-7 items-center gap-1 rounded-lg border border-slate-700/75 bg-slate-900/65 px-2 text-[11px] font-semibold text-slate-300 transition hover:border-cyan-300/45 hover:bg-cyan-400/10 hover:text-cyan-100"
                  title={previewOpen ? "Hide preview" : "Preview"}
                >
                  {previewLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
                  <span>{previewOpen ? "Hide" : "Preview"}</span>
                </button>
              ) : null}
              {href ? (
                <a
                  href={href}
                  download={filename}
                  className="inline-flex h-7 items-center gap-1 rounded-lg border border-slate-700/75 bg-slate-900/65 px-2 text-[11px] font-semibold text-slate-300 transition hover:border-cyan-300/45 hover:bg-cyan-400/10 hover:text-cyan-100"
                  title="Download"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Download</span>
                </a>
              ) : null}
            </div>
          </div>
          <p className="mt-1 truncate text-xs leading-5 text-slate-400">
            {formatType(artifact.type)} / {ownerLabel || artifact.owner} / {formatCreatedAt(artifact.createdAt)}
          </p>
          {archivedAt ? <p className="mt-1 text-[11px] leading-4 text-emerald-300/80">Archived to Hub</p> : null}
          {artifact.description ? <p className="mt-1 text-xs leading-5 text-slate-400">{artifact.description}</p> : null}
          {previewError ? <p className="mt-1 text-xs leading-5 text-red-200">{previewError}</p> : null}

          <div className="mt-2 flex flex-wrap items-center gap-1">
            <button
              type="button"
              onClick={archiveToHub}
              disabled={Boolean(archivedAt) || archiveBusy}
              className="grid h-7 w-7 place-items-center rounded-full text-slate-400 transition hover:bg-slate-800 hover:text-slate-100 disabled:cursor-default disabled:text-emerald-300 disabled:opacity-80"
              title={archivedAt ? "Archived to Hub" : "Archive to Hub"}
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
              title={copied ? "Copied" : "Copy link"}
            >
              <Copy className="h-4 w-4" />
            </button>
            {href ? (
              <a
                href={href}
                target="_blank"
                rel="noreferrer"
                className="grid h-7 w-7 place-items-center rounded-full text-slate-400 transition hover:bg-slate-800 hover:text-slate-100"
                title="Open"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            ) : null}
          </div>
        </div>
      </div>

      {previewOpen ? <PreviewText artifact={artifact} content={previewContent} truncated={previewTruncated} /> : null}
    </div>
  );
}
