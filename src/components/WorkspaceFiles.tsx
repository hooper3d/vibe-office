import { ArrowLeft, FileText, Folder, Loader2, Paperclip, RefreshCw, Search, X } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import type { Project } from "../domain/types";
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
