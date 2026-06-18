import { MessageSquare } from "lucide-react";
import { useEffect, useState } from "react";
import type { ProjectArtifact } from "../domain/projectScope";
import type { AgentInstance } from "../domain/types";
import {
  getArtifactCopyText,
  getDownloadableFilePart,
  getOpenableArtifactUrl,
  safeArtifactFileName,
} from "../services/projectArtifactContent";
import {
  ProjectArtifactBrowser,
  ProjectArtifactDetail,
  type ArtifactCopyState,
} from "./ProjectArtifactViewer";

export function ProjectArtifacts({ agents, artifacts }: { agents: AgentInstance[]; artifacts: ProjectArtifact[] }) {
  const [selectedArtifactId, setSelectedArtifactId] = useState(artifacts[0]?.id ?? "");
  const [copyState, setCopyState] = useState<ArtifactCopyState>("idle");
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

  function selectArtifact(artifactId: string) {
    setSelectedArtifactId(artifactId);
    setCopyState("idle");
  }

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
    downloadText(content, `${safeArtifactFileName(artifact.name)}.${extension}`, artifact.kind === "json" ? "application/json" : "text/plain");
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
      <ProjectArtifactBrowser
        agents={agents}
        artifacts={artifacts}
        selectedArtifactId={selectedArtifact?.id}
        onSelectArtifact={selectArtifact}
      />
      {selectedArtifact ? (
        <ProjectArtifactDetail
          canCopy={canCopy}
          canDownload={canDownload}
          copyState={copyState}
          openableUrl={openableUrl}
          selectedAgent={selectedAgent}
          selectedArtifact={selectedArtifact}
          onCopyArtifact={copyArtifactContent}
          onDownloadArtifact={downloadArtifact}
          onOpenArtifact={openArtifactUrl}
        />
      ) : null}
    </div>
  );
}

async function downloadUri(uri: string, fileName: string) {
  const response = await fetch(uri);
  if (!response.ok) throw new Error("Unable to download artifact.");
  const blob = await response.blob();
  downloadBlob(blob, safeArtifactFileName(fileName));
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
