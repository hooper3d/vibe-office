import { Copy, Download, ExternalLink, Eye } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ProjectArtifact } from "../domain/projectScope";
import type { AgentInstance } from "../domain/types";
import { getArtifactCopyText, getArtifactPreviewContent } from "../services/projectArtifactContent";

export type ArtifactCopyState = "idle" | "copied" | "manual";

export function ProjectArtifactBrowser({
  agents,
  artifacts,
  selectedArtifactId,
  onSelectArtifact,
}: {
  agents: AgentInstance[];
  artifacts: ProjectArtifact[];
  selectedArtifactId?: string;
  onSelectArtifact: (artifactId: string) => void;
}) {
  return (
    <div className="artifact-browser" aria-label="Project artifacts">
      {artifacts.map((artifact) => {
        const agent = agents.find((item) => item.id === artifact.agentId);
        const isSelected = artifact.id === selectedArtifactId;
        return (
          <button
            className={`artifact-list-item ${isSelected ? "selected" : ""}`}
            key={artifact.id}
            onClick={() => onSelectArtifact(artifact.id)}
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
  );
}

export function ProjectArtifactDetail({
  canCopy,
  canDownload,
  copyState,
  openableUrl,
  selectedAgent,
  selectedArtifact,
  onCopyArtifact,
  onDownloadArtifact,
  onOpenArtifact,
}: {
  canCopy: boolean;
  canDownload: boolean;
  copyState: ArtifactCopyState;
  openableUrl: string;
  selectedAgent?: AgentInstance;
  selectedArtifact: ProjectArtifact;
  onCopyArtifact: (artifact: ProjectArtifact) => void;
  onDownloadArtifact: (artifact: ProjectArtifact) => void;
  onOpenArtifact: (artifact: ProjectArtifact) => void;
}) {
  return (
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
            onClick={() => onCopyArtifact(selectedArtifact)}
            title="Copy content"
            type="button"
          >
            <Copy size={15} />
          </button>
          <button
            aria-label="Download artifact"
            className="icon-button mini-button"
            disabled={!canDownload}
            onClick={() => onDownloadArtifact(selectedArtifact)}
            title="Download"
            type="button"
          >
            <Download size={15} />
          </button>
          <button
            aria-label="Open artifact URL"
            className="icon-button mini-button"
            disabled={!openableUrl}
            onClick={() => onOpenArtifact(selectedArtifact)}
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
  );
}

function ArtifactPreview({ artifact }: { artifact: ProjectArtifact }) {
  const { data, imageParts, text } = getArtifactPreviewContent(artifact);

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

function MarkdownContent({ content }: { content: string }) {
  return (
    <div className="markdown-content">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}
