import { Copy, Download, ExternalLink, Eye, MessageSquare } from "lucide-react";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { A2APart } from "../domain/a2a";
import type { ProjectArtifact } from "../domain/projectScope";
import type { AgentInstance } from "../domain/types";
import { createTextParts, getImageFileParts } from "../services/artifactState";
import { getTextPartContent } from "../services/messageContent";

function MarkdownContent({ content }: { content: string }) {
  return (
    <div className="markdown-content">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}

function getDataPartContent(parts: A2APart[]) {
  return parts
    .filter((part) => part.kind === "data")
    .map((part) => JSON.stringify(part.data, null, 2))
    .join("\n\n");
}

export function ProjectArtifacts({ agents, artifacts }: { agents: AgentInstance[]; artifacts: ProjectArtifact[] }) {
  const [selectedArtifactId, setSelectedArtifactId] = useState(artifacts[0]?.id ?? "");
  const [copyState, setCopyState] = useState<"idle" | "copied" | "manual">("idle");
  const selectedArtifact = artifacts.find((artifact) => artifact.id === selectedArtifactId) ?? artifacts[0];

  useEffect(() => {
    if (artifacts.length === 0) {
      setSelectedArtifactId("");
      return;
    }
    if (!artifacts.some((artifact) => artifact.id === selectedArtifactId)) {
      setSelectedArtifactId(artifacts[0].id);
    }
  }, [artifacts, selectedArtifactId]);

  if (artifacts.length === 0) {
    return (
      <div className="empty-state tall">
        <MessageSquare size={32} />
        <h3>No artifacts in this project</h3>
        <p>Agent outputs stay scoped to the selected Project.</p>
      </div>
    );
  }

  async function copyArtifactContent(artifact: ProjectArtifact) {
    const content = getArtifactCopyText(artifact);
    if (!content) return;

    try {
      await copyTextToClipboard(content);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 1500);
    } catch {
      setCopyState("manual");
    }
  }

  async function downloadArtifact(artifact: ProjectArtifact) {
    const filePart = getDownloadableFilePart(artifact);
    if (filePart?.kind === "file" && filePart.file.uri) {
      await downloadUri(filePart.file.uri, filePart.file.name ?? `${artifact.name}.bin`);
      return;
    }

    const content = getArtifactCopyText(artifact);
    const extension = artifact.kind === "json" ? "json" : "txt";
    downloadText(content, `${safeFileName(artifact.name)}.${extension}`, artifact.kind === "json" ? "application/json" : "text/plain");
  }

  function openArtifactUrl(artifact: ProjectArtifact) {
    const url = getOpenableArtifactUrl(artifact);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  }

  const selectedAgent = selectedArtifact ? agents.find((item) => item.id === selectedArtifact.agentId) : undefined;
  const openableUrl = selectedArtifact ? getOpenableArtifactUrl(selectedArtifact) : "";
  const canDownload = Boolean(selectedArtifact && (getDownloadableFilePart(selectedArtifact) || getArtifactCopyText(selectedArtifact)));
  const canCopy = Boolean(selectedArtifact && getArtifactCopyText(selectedArtifact));

  return (
    <div className="artifact-viewer">
      <div className="artifact-browser" aria-label="Project artifacts">
        {artifacts.map((artifact) => {
          const agent = agents.find((item) => item.id === artifact.agentId);
          const isSelected = artifact.id === selectedArtifact?.id;
          return (
            <button
              className={`artifact-list-item ${isSelected ? "selected" : ""}`}
              key={artifact.id}
              onClick={() => {
                setSelectedArtifactId(artifact.id);
                setCopyState("idle");
              }}
              type="button"
            >
              <div>
                <h3>{artifact.name}</h3>
                <span>{agent?.name ?? "Agent"} / {artifact.kind}</span>
              </div>
              <Eye size={15} aria-hidden="true" />
            </button>
          );
        })}
      </div>

      {selectedArtifact ? (
        <article className="artifact-detail" aria-label="Artifact viewer">
          <div className="artifact-detail-header">
            <div>
              <div className="eyebrow">Artifact Viewer</div>
              <h3>{selectedArtifact.name}</h3>
              <span>{selectedAgent?.name ?? "Agent"} / {selectedArtifact.kind}</span>
            </div>
            <div className="artifact-actions">
              <button
                aria-label="Copy artifact content"
                className="icon-button mini-button"
                disabled={!canCopy}
                onClick={() => copyArtifactContent(selectedArtifact)}
                title="Copy content"
                type="button"
              >
                <Copy size={15} />
              </button>
              <button
                aria-label="Download artifact"
                className="icon-button mini-button"
                disabled={!canDownload}
                onClick={() => downloadArtifact(selectedArtifact)}
                title="Download"
                type="button"
              >
                <Download size={15} />
              </button>
              <button
                aria-label="Open artifact URL"
                className="icon-button mini-button"
                disabled={!openableUrl}
                onClick={() => openArtifactUrl(selectedArtifact)}
                title="Open URL"
                type="button"
              >
                <ExternalLink size={15} />
              </button>
            </div>
          </div>
          {copyState !== "idle" ? <span className={`copy-status ${copyState}`}>{copyState === "copied" ? "Copied" : "Select and copy"}</span> : null}
          {copyState === "manual" ? (
            <textarea
              className="copy-fallback"
              onFocus={(event) => event.currentTarget.select()}
              readOnly
              value={getArtifactCopyText(selectedArtifact)}
            />
          ) : null}
          <ArtifactPreview artifact={selectedArtifact} />
        </article>
      ) : null}
    </div>
  );
}

function ArtifactPreview({ artifact }: { artifact: ProjectArtifact }) {
  const parts = artifact.contentParts ?? createTextParts(artifact.summary);
  const imageParts = getImageFileParts(parts);
  const text = getTextPartContent(parts);
  const data = getDataPartContent(parts);

  return (
    <div className="artifact-preview">
      {imageParts.map((part, index) =>
        part.kind === "file" && part.file.uri ? (
          <img
            alt={part.file.name ?? `${artifact.name} image ${index + 1}`}
            className="artifact-image"
            key={`${artifact.id}-image-${index}`}
            src={part.file.uri}
          />
        ) : null,
      )}
      {text ? <MarkdownContent content={text} /> : null}
      {data ? (
        <pre className="artifact-json">
          <code>{data}</code>
        </pre>
      ) : null}
    </div>
  );
}

function getArtifactCopyText(artifact: ProjectArtifact) {
  const parts = artifact.contentParts ?? createTextParts(artifact.summary);
  const text = getTextPartContent(parts);
  const data = getDataPartContent(parts);
  const files = parts
    .flatMap((part) => (part.kind === "file" && part.file.uri ? [part.file.uri] : []))
    .join("\n");
  return [text, data, files].filter(Boolean).join("\n\n");
}

function getDownloadableFilePart(artifact: ProjectArtifact) {
  const parts = artifact.contentParts ?? [];
  return parts.find((part): part is Extract<A2APart, { kind: "file" }> => part.kind === "file" && Boolean(part.file.uri));
}

function getOpenableArtifactUrl(artifact: ProjectArtifact) {
  const parts = artifact.contentParts ?? [];
  const fileUri = parts.find((part) => part.kind === "file" && isOpenableUrl(part.file.uri ?? ""));
  if (fileUri?.kind === "file") return fileUri.file.uri ?? "";

  const textUrl = getTextPartContent(parts)
    .split(/\s+/)
    .find((value) => isOpenableUrl(value));
  if (textUrl) return textUrl;

  return artifact.kind === "url" && isOpenableUrl(artifact.summary) ? artifact.summary : "";
}

function isOpenableUrl(value?: string) {
  return Boolean(value && (/^https?:\/\//i.test(value) || value.startsWith("/workspace-local/media")));
}

async function downloadUri(uri: string, fileName: string) {
  const response = await fetch(uri);
  if (!response.ok) throw new Error("Unable to download artifact.");
  const blob = await response.blob();
  downloadBlob(blob, safeFileName(fileName));
}

async function copyTextToClipboard(content: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(content);
      return;
    } catch {
      // Fall back to a local textarea copy for browsers that deny clipboard writes.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = content;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, content.length);
  const copied = document.execCommand("copy");
  textarea.remove();

  if (!copied) {
    throw new Error("Copy failed.");
  }
}

function downloadText(content: string, fileName: string, type: string) {
  downloadBlob(new Blob([content], { type }), fileName);
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function safeFileName(value: string) {
  const cleaned = value.trim().replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "-").replace(/\s+/g, " ");
  return cleaned || "artifact";
}
