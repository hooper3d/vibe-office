import {
  ArrowLeft,
  ArrowRight,
  Copy,
  Download,
  Eye,
  ExternalLink,
  FileText,
  Folder,
  Globe2,
  Loader2,
  MessageSquare,
  Paperclip,
  RefreshCw,
  Search,
  X,
  XCircle,
} from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { A2APart } from "../domain/a2a";
import type { ProjectArtifact, ProjectRun, ProjectTask, WorkState } from "../domain/projectScope";
import type { AgentInstance, Project } from "../domain/types";
import { createTextParts, getImageFileParts } from "../services/artifactState";
import { getTextPartContent } from "../services/messageContent";
import { getUserFacingWorkspaceError } from "../services/workspaceErrorText";
import {
  listWorkspaceFiles,
  readWorkspaceFile,
  searchWorkspaceFiles,
  type WorkspaceFileAttachment,
  type WorkspaceFileEntry,
  type WorkspaceFileListResult,
  type WorkspaceFileReadResult,
  type WorkspaceFileSearchMatch,
} from "../services/workspaceFileClient";

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

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatWorkspacePath(result: WorkspaceFileListResult | null) {
  if (!result) return "Root";
  if (!result.path) return result.rootName || "Root";
  return `/ ${result.path}`;
}

function getTaskLifecycleAddress(task: ProjectTask, runs: ProjectRun[]) {
  if (task.remoteTaskId) {
    return {
      taskId: task.remoteTaskId,
      contextId: task.remoteContextId ?? task.contextId,
    };
  }

  const linkedRun = runs.find((run) => run.taskId === task.id);
  if (linkedRun?.type === "direct_message") {
    return {
      taskId: task.id,
      contextId: task.contextId,
    };
  }

  return null;
}

function isTaskActive(state: WorkState) {
  return state === "submitting" || state === "submitted" || state === "working" || state === "input_required";
}

function isTaskTerminal(state: WorkState) {
  return state === "completed" || state === "failed" || state === "canceled" || state === "unsupported";
}

function hasLifecycleUnsupportedEvent(task: ProjectTask) {
  return task.events.some((event) => event.state === "unsupported" || event.label.startsWith("Lifecycle unsupported:"));
}

function hasCancelUnsupportedEvent(task: ProjectTask) {
  return task.events.some((event) => event.state === "unsupported" && event.label.startsWith("Cancel unsupported:"));
}

function getTaskEventDisplayLabel(label: string) {
  return label.replace("Agent returned an A2A task.", "Agent returned a task.").replace("A2A request failed", "Agent task request failed");
}

export function WorkspaceFiles({
  project,
  attachedFiles,
  onAttachFile,
  onDetachFile,
  onEditProject,
}: {
  project: Project;
  attachedFiles: WorkspaceFileAttachment[];
  onAttachFile: (file: WorkspaceFileReadResult) => void;
  onDetachFile: (path: string) => void;
  onEditProject: () => void;
}) {
  const [currentPath, setCurrentPath] = useState("");
  const [listResult, setListResult] = useState<WorkspaceFileListResult | null>(null);
  const [selectedFile, setSelectedFile] = useState<WorkspaceFileReadResult | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchMatches, setSearchMatches] = useState<WorkspaceFileSearchMatch[]>([]);
  const [searchTruncated, setSearchTruncated] = useState(false);
  const [loadingState, setLoadingState] = useState<"idle" | "listing" | "reading" | "searching">("idle");
  const [error, setError] = useState("");
  const projectDirectory = project.directory?.trim() ?? "";
  const hasDirectory = projectDirectory.length > 0;
  const selectedFileIsAttached = selectedFile ? attachedFiles.some((file) => file.path === selectedFile.path) : false;

  useEffect(() => {
    setCurrentPath("");
    setListResult(null);
    setSelectedFile(null);
    setSearchQuery("");
    setSearchMatches([]);
    setSearchTruncated(false);
    setError("");
  }, [project.id]);

  useEffect(() => {
    if (!hasDirectory) return;
    void loadDirectory(currentPath);
    // Directory loading is intentionally driven by project/path changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectDirectory, currentPath]);

  async function loadDirectory(path: string) {
    if (!hasDirectory) return;
    setLoadingState("listing");
    setError("");

    try {
      const result = await listWorkspaceFiles(projectDirectory, path);
      setListResult(result);
      setSelectedFile(null);
    } catch (error) {
      setListResult(null);
      setError(getUserFacingWorkspaceError(error, "Unable to list workspace files."));
    } finally {
      setLoadingState("idle");
    }
  }

  function openDirectory(path: string) {
    setSearchMatches([]);
    setSearchTruncated(false);
    setCurrentPath(path);
  }

  async function openEntry(entry: WorkspaceFileEntry) {
    if (entry.type === "directory") {
      openDirectory(entry.path);
      return;
    }

    setLoadingState("reading");
    setError("");
    try {
      setSelectedFile(await readWorkspaceFile(projectDirectory, entry.path));
    } catch (error) {
      setSelectedFile(null);
      setError(getUserFacingWorkspaceError(error, "Unable to read file."));
    } finally {
      setLoadingState("idle");
    }
  }

  async function openSearchMatch(match: WorkspaceFileSearchMatch) {
    await openEntry({
      name: match.path.split("/").pop() ?? match.path,
      path: match.path,
      type: "file",
    });
  }

  async function runSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hasDirectory || searchQuery.trim().length < 2) return;

    setLoadingState("searching");
    setError("");
    try {
      const result = await searchWorkspaceFiles(projectDirectory, searchQuery);
      setSearchMatches(result.matches);
      setSearchTruncated(result.truncated);
    } catch (error) {
      setSearchMatches([]);
      setSearchTruncated(false);
      setError(getUserFacingWorkspaceError(error, "Unable to search workspace files."));
    } finally {
      setLoadingState("idle");
    }
  }

  if (!hasDirectory) {
    return (
      <section className="workspace-files-panel" aria-label="Project files">
        <div className="workspace-files-header">
          <div>
            <div className="eyebrow">Project files</div>
            <h3>Bind a local folder</h3>
            <p>Files are listed by the local trusted layer before anything is sent to an agent.</p>
          </div>
          <button className="secondary-button compact-button" type="button" onClick={onEditProject}>
            <Folder size={16} />
            Bind folder
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="workspace-files-panel" aria-label="Project files">
      <div className="workspace-files-header">
        <div>
          <div className="eyebrow">Project files</div>
          <h3>{project.name}</h3>
          <p>{projectDirectory}</p>
        </div>
        <button className="secondary-button compact-button" type="button" onClick={() => void loadDirectory(currentPath)}>
          {loadingState === "listing" ? <Loader2 className="spin" size={16} /> : <RefreshCw size={16} />}
          Refresh
        </button>
      </div>

      <form className="workspace-search" onSubmit={runSearch}>
        <label className="sr-only" htmlFor="workspace-search">
          Search files
        </label>
        <input
          id="workspace-search"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.currentTarget.value)}
          placeholder="Search files"
        />
        <button className="secondary-button compact-button" type="submit" disabled={loadingState === "searching" || searchQuery.trim().length < 2}>
          {loadingState === "searching" ? <Loader2 className="spin" size={16} /> : <Search size={16} />}
          Search
        </button>
      </form>

      {error ? <div className="form-error">{error}</div> : null}

      <div className="workspace-file-grid">
        <div className="workspace-file-list" aria-label="Workspace file list">
          <div className="workspace-path-row">
            <button
              className="icon-button mini-button"
              data-testid="workspace-parent-folder"
              type="button"
              disabled={listResult?.parentPath === undefined}
              onClick={() => {
                if (listResult?.parentPath !== undefined) openDirectory(listResult.parentPath);
              }}
              aria-label="Go to parent folder"
              title="Go to parent folder"
            >
              <ArrowLeft size={14} />
            </button>
            {listResult?.path ? (
              <button className="breadcrumb-root" type="button" onClick={() => openDirectory("")}>
                {listResult.rootName}
              </button>
            ) : null}
            <span>{formatWorkspacePath(listResult)}</span>
          </div>
          {loadingState === "listing" && !listResult ? (
            <div className="inline-empty">Loading workspace files.</div>
          ) : listResult?.entries.length ? (
            listResult.entries.map((entry) => (
              <button className="workspace-file-row" key={entry.path} type="button" onClick={() => void openEntry(entry)}>
                {entry.type === "directory" ? <Folder size={15} /> : <FileText size={15} />}
                <span>
                  <strong>{entry.name}</strong>
                  <small>{entry.type === "file" && entry.size !== undefined ? formatBytes(entry.size) : "Folder"}</small>
                </span>
              </button>
            ))
          ) : (
            <div className="inline-empty">No files in this folder.</div>
          )}
        </div>

        <div className="workspace-preview" aria-label="Workspace file preview">
          {selectedFile ? (
            <>
              <div className="workspace-preview-header">
                <div>
                  <strong>{selectedFile.path}</strong>
                  <span>{formatBytes(selectedFile.size)}</span>
                </div>
                {selectedFileIsAttached ? (
                  <button className="secondary-button compact-button" type="button" onClick={() => onDetachFile(selectedFile.path)}>
                    <X size={16} />
                    Remove
                  </button>
                ) : (
                  <button className="primary-button compact-button" type="button" onClick={() => onAttachFile(selectedFile)}>
                    <Paperclip size={16} />
                    Attach
                  </button>
                )}
              </div>
              <pre className="workspace-file-preview">{selectedFile.content}</pre>
            </>
          ) : (
            <div className="inline-empty">Select a file to preview it before attaching context.</div>
          )}
        </div>
      </div>

      {searchMatches.length > 0 || searchTruncated ? (
        <div className="workspace-search-results" aria-label="Search results">
          {searchMatches.map((match) => (
            <button className="workspace-search-result" key={`${match.path}-${match.lineNumber}`} type="button" onClick={() => void openSearchMatch(match)}>
              <FileText size={14} />
              <span>
                <strong>{match.path}:{match.lineNumber}</strong>
                <small>{match.preview}</small>
              </span>
            </button>
          ))}
          {searchTruncated ? <div className="inline-empty">Showing the first matches. Narrow the query for more precision.</div> : null}
        </div>
      ) : searchQuery.trim().length >= 2 && loadingState !== "searching" ? (
        <div className="inline-empty">No matches yet.</div>
      ) : null}
    </section>
  );
}

export function BrowserPreview({
  browserUrl,
  previewUrl,
  onBrowserUrlChange,
  onOpenPreview,
}: {
  browserUrl: string;
  previewUrl: string;
  onBrowserUrlChange: (value: string) => void;
  onOpenPreview: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const hasPreview = previewUrl.length > 0;
  const canEmbed = previewUrl.startsWith("http://localhost") || previewUrl.startsWith("http://127.0.0.1");

  return (
    <div className="browser-workspace">
      <form className="browser-toolbar" id="browser-url-form" onSubmit={onOpenPreview}>
        <button type="button" className="icon-button" aria-label="Go back">
          <ArrowLeft size={16} />
        </button>
        <button type="button" className="icon-button" aria-label="Go forward">
          <ArrowRight size={16} />
        </button>
        <button type="submit" className="icon-button" aria-label="Refresh preview">
          <RefreshCw size={16} />
        </button>
        <label className="url-input">
          <input
            aria-label="Preview URL"
            value={browserUrl}
            onChange={(event) => onBrowserUrlChange(event.target.value)}
            placeholder="Open URL"
          />
        </label>
        <a className="icon-button" href={previewUrl} target="_blank" rel="noreferrer" aria-label="Open externally">
          <ExternalLink size={16} />
        </a>
      </form>

      <div className="browser-frame">
        {!hasPreview ? (
          <div className="empty-state">
            <Globe2 size={32} />
            <button className="secondary-button" type="submit" form="browser-url-form">
              Open URL
            </button>
          </div>
        ) : canEmbed ? (
          <iframe title="Browser preview" src={previewUrl} />
        ) : (
          <div className="empty-state">
            <Globe2 size={32} />
            <a className="secondary-button" href={previewUrl} target="_blank" rel="noreferrer">
              Open external
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

export function ProjectTasks({
  agents,
  runs,
  tasks,
  artifacts,
  busyActionId,
  onCancelTask,
  onRefreshTask,
  onRetryTask,
}: {
  agents: AgentInstance[];
  runs: ProjectRun[];
  tasks: ProjectTask[];
  artifacts: ProjectArtifact[];
  busyActionId: string;
  onCancelTask: (taskId: string) => void;
  onRefreshTask: (taskId: string) => void;
  onRetryTask: (taskId: string) => void;
}) {
  const visibleRuns = runs.filter(
    (run) => run.type !== "direct_message" || run.state !== "completed" || run.artifactIds.length > 0 || Boolean(run.taskId),
  );
  const visibleRunTaskIds = new Set(visibleRuns.map((run) => run.taskId).filter(Boolean));
  const standaloneTasks = tasks.filter((task) => !visibleRunTaskIds.has(task.id));

  if (visibleRuns.length === 0 && standaloneTasks.length === 0) {
    return (
      <div className="empty-state tall">
        <MessageSquare size={32} />
        <h3>No tasks yet</h3>
        <p>Direct chat stays in the conversation. Tasks appear here when work needs tracking.</p>
      </div>
    );
  }

  return (
    <div className="output-list">
      {visibleRuns.map((run) => {
        const owner = agents.find((item) => item.id === run.ownerAgentId);
        const runArtifacts = artifacts.filter((artifact) => run.artifactIds.includes(artifact.id));
        const linkedTask = tasks.find((task) => task.id === run.taskId);
        const lifecycleTask = linkedTask;
        return (
          <article className="output-item run-item" key={run.id}>
            <div className="output-title-row">
              <div>
                <h3>{linkedTask?.title ?? (run.type === "direct_message" ? "Direct message" : "Chief delegation")}</h3>
                <span>{owner?.name ?? "Agent"} / {run.type.replace("_", " ")}</span>
              </div>
              <span className={`status-badge ${run.state}`}>{run.state}</span>
            </div>
            {lifecycleTask ? (
              <TaskLifecycleActions
                busyActionId={busyActionId}
                lifecycleLinked={Boolean(getTaskLifecycleAddress(lifecycleTask, runs))}
                onCancelTask={onCancelTask}
                onRefreshTask={onRefreshTask}
                onRetryTask={onRetryTask}
                owner={owner}
                task={lifecycleTask}
              />
            ) : null}
            <p>{linkedTask?.summary ?? run.summary ?? "Project-scoped run record."}</p>
            {linkedTask ? <TaskEventList agents={agents} events={linkedTask.events} /> : null}
            <div className="artifact-strip">
              {runArtifacts.length > 0 ? (
                runArtifacts.map((artifact) => (
                  <span className="artifact-chip" key={artifact.id}>
                    {artifact.name}
                  </span>
                ))
              ) : (
                <span className="artifact-chip muted">No artifact</span>
              )}
            </div>
          </article>
        );
      })}
      {standaloneTasks.map((task) => {
        const owner = agents.find((item) => item.id === task.ownerAgentId);
        const taskArtifacts = artifacts.filter((artifact) => task.artifactIds.includes(artifact.id));
        return (
          <article className="output-item" key={task.id}>
            <div className="output-title-row">
              <div>
                <h3>{task.title}</h3>
                <span>{owner?.name ?? "Agent"} / {task.contextId}</span>
              </div>
              <span className={`status-badge ${task.state}`}>{task.state}</span>
            </div>
            <TaskLifecycleActions
              busyActionId={busyActionId}
              lifecycleLinked={Boolean(getTaskLifecycleAddress(task, runs))}
              onCancelTask={onCancelTask}
              onRefreshTask={onRefreshTask}
              onRetryTask={onRetryTask}
              owner={owner}
              task={task}
            />
            <p>{task.summary}</p>
            <TaskEventList agents={agents} events={task.events} />
            <div className="artifact-strip">
              {taskArtifacts.map((artifact) => (
                <span className="artifact-chip" key={artifact.id}>
                  {artifact.name}
                </span>
              ))}
            </div>
          </article>
        );
      })}
    </div>
  );
}

function TaskEventList({ agents, events }: { agents: AgentInstance[]; events: ProjectTask["events"] }) {
  return (
    <div className="task-event-list">
      {events.map((event) => {
        const agent = agents.find((item) => item.id === event.agentId);
        return (
          <div className="task-event" key={event.id}>
            <span className={`status-dot ${event.state === "completed" ? "online" : event.state === "failed" ? "offline" : "checking"}`} />
            <span>{agent?.name ?? "Agent"}</span>
            <strong>{getTaskEventDisplayLabel(event.label)}</strong>
          </div>
        );
      })}
    </div>
  );
}

function TaskLifecycleActions({
  busyActionId,
  lifecycleLinked,
  onCancelTask,
  onRefreshTask,
  onRetryTask,
  owner,
  task,
}: {
  busyActionId: string;
  lifecycleLinked: boolean;
  onCancelTask: (taskId: string) => void;
  onRefreshTask: (taskId: string) => void;
  onRetryTask: (taskId: string) => void;
  owner?: AgentInstance;
  task: ProjectTask;
}) {
  const active = isTaskActive(task.state);
  const failed = task.state === "failed";
  const terminal = isTaskTerminal(task.state);
  const unsupported = hasLifecycleUnsupportedEvent(task);
  const cancelUnsupported = hasCancelUnsupportedEvent(task);
  const lifecycleKnownUnsupported = !lifecycleLinked || unsupported || owner?.supportsTaskLifecycle === false;
  const cancelKnownUnsupported = !lifecycleLinked || unsupported || cancelUnsupported || owner?.supportsCancel === false;
  const refreshBusy = busyActionId === `refresh:${task.id}`;
  const retryBusy = busyActionId === `retry:${task.id}`;
  const cancelBusy = busyActionId === `cancel:${task.id}`;

  return (
    <div className="task-lifecycle-actions" aria-label="Task lifecycle actions">
      <button
        aria-label="Refresh task status"
        className="icon-button mini-button"
        disabled={terminal || lifecycleKnownUnsupported || Boolean(busyActionId)}
        onClick={() => onRefreshTask(task.id)}
        title={!lifecycleLinked ? "No remote lifecycle link" : lifecycleKnownUnsupported ? "Lifecycle unsupported" : "Refresh status"}
        type="button"
      >
        {refreshBusy ? <Loader2 size={14} /> : <RefreshCw size={14} />}
      </button>
      <button
        aria-label="Retry failed task"
        className="icon-button mini-button"
        disabled={!failed || Boolean(busyActionId)}
        onClick={() => onRetryTask(task.id)}
        title="Retry failed task"
        type="button"
      >
        {retryBusy ? <Loader2 size={14} /> : <ArrowRight size={14} />}
      </button>
      <button
        aria-label="Cancel task"
        className="icon-button mini-button danger-button"
        disabled={!active || cancelKnownUnsupported || Boolean(busyActionId)}
        onClick={() => onCancelTask(task.id)}
        title={cancelKnownUnsupported ? "Cancel unsupported" : "Cancel task"}
        type="button"
      >
        {cancelBusy ? <Loader2 size={14} /> : <XCircle size={14} />}
      </button>
      {lifecycleKnownUnsupported ? (
        <span className="lifecycle-note">{lifecycleLinked ? "Lifecycle unsupported" : "No remote lifecycle link"}</span>
      ) : null}
      {cancelUnsupported && !lifecycleKnownUnsupported ? <span className="lifecycle-note">Cancel unsupported</span> : null}
      <TaskLifecycleMetadata lifecycleLinked={lifecycleLinked} owner={owner} task={task} />
    </div>
  );
}

function TaskLifecycleMetadata({
  lifecycleLinked,
  owner,
  task,
}: {
  lifecycleLinked: boolean;
  owner?: AgentInstance;
  task: ProjectTask;
}) {
  const taskReference = task.remoteTaskId ? "Remote task" : "Local task";
  const trackingState =
    owner?.supportsTaskLifecycle === false || hasLifecycleUnsupportedEvent(task)
      ? "Status tracking unavailable"
      : lifecycleLinked
        ? "Status tracking"
        : "Local progress";
  const cancelState =
    owner?.supportsCancel === false || hasCancelUnsupportedEvent(task)
      ? "Cancel unavailable"
      : owner?.supportsCancel === true
        ? "Cancel available"
        : lifecycleLinked
          ? "Cancel unknown"
          : "Cancel unavailable";

  return (
    <div className="lifecycle-meta" aria-label="Task lifecycle metadata">
      <span>{taskReference}</span>
      <span>{trackingState}</span>
      <span>{cancelState}</span>
    </div>
  );
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
