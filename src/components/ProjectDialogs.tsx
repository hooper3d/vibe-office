import { Folder, XCircle } from "lucide-react";
import { FormEvent, useState } from "react";
import type { AgentInstance, Project } from "../domain/types";
import { deriveProjectNameFromDirectory } from "../services/projectNaming";

export type ConfirmAction =
  | {
      kind: "delete-project";
      projectId: string;
    }
  | {
      kind: "delete-agent";
      agentId: string;
    };

export function ProjectDialog({
  error,
  project,
  onClose,
  onSaveProject,
}: {
  error: string;
  project?: Project;
  onClose: () => void;
  onSaveProject: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const isEditing = Boolean(project);
  const [projectName, setProjectName] = useState(project?.name ?? "");
  const [directory, setDirectory] = useState(project?.directory ?? "");
  const [folderError, setFolderError] = useState("");

  function updateDirectory(value: string) {
    setDirectory(value);
    setFolderError("");
    if (!projectName.trim()) {
      setProjectName(deriveProjectNameFromDirectory(value));
    }
  }

  function chooseProjectFolder() {
    setFolderError("Browser folder picker cannot expose a full local path here. Paste the absolute path instead.");
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="project-dialog" role="dialog" aria-modal="true" aria-labelledby="project-title">
        <div className="setup-header">
          <div>
            <div className="eyebrow">Project Scope</div>
            <h2 id="project-title">{isEditing ? "Rename project" : "Create project"}</h2>
            <p>{isEditing ? "Keep the namespace stable while changing the label." : "Keep conversations, runs, tasks, and artifacts isolated."}</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close project dialog">
            <XCircle size={18} />
          </button>
        </div>

        <form className="setup-form" onSubmit={onSaveProject}>
          <label>
            Project directory
            <div className="folder-picker-row">
              <input
                name="directory"
                value={directory}
                placeholder="Paste a local path or browse"
                onChange={(event) => updateDirectory(event.currentTarget.value)}
              />
              <button type="button" className="secondary-button folder-picker-button" onClick={chooseProjectFolder}>
                <Folder size={16} />
                Browse
              </button>
            </div>
            <span>{folderError || "Used as the local workspace reference for this project."}</span>
          </label>
          <label>
            Project name
            <input
              name="name"
              value={projectName}
              placeholder="Auto from folder if empty"
              onChange={(event) => setProjectName(event.currentTarget.value)}
              autoFocus={!isEditing}
            />
            <span>{isEditing ? `Namespace stays ${project?.namespace}.` : "Used in the sidebar and project namespace."}</span>
          </label>
          <label>
            Description
            <input name="description" defaultValue={project?.description ?? ""} />
            <span>Optional short context for this workspace.</span>
          </label>
          {error ? <div className="form-error">{error}</div> : null}
          <div className="setup-actions">
            <button type="button" className="secondary-button" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="primary-button">
              {isEditing ? "Save changes" : "Create project"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export function ConfirmDialog({
  action,
  agents,
  projects,
  onCancel,
  onConfirm,
}: {
  action: ConfirmAction;
  agents: AgentInstance[];
  projects: Project[];
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const project = action.kind === "delete-project" ? projects.find((item) => item.id === action.projectId) : undefined;
  const agent = action.kind === "delete-agent" ? agents.find((item) => item.id === action.agentId) : undefined;
  const title = action.kind === "delete-project" ? "Delete project" : "Delete agent";
  const targetName = project?.name ?? agent?.name ?? "this item";
  const body =
    action.kind === "delete-project"
      ? "This removes the project and its conversations, messages, runs, tasks, and artifacts from local storage."
      : "This removes the agent from the registry. Existing project history stays in place.";

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
        <div className="setup-header">
          <div>
            <div className="eyebrow">Confirm</div>
            <h2 id="confirm-title">{title}</h2>
            <p>{targetName}</p>
          </div>
          <button className="icon-button" onClick={onCancel} aria-label="Close confirmation">
            <XCircle size={18} />
          </button>
        </div>
        <p className="confirm-copy">{body}</p>
        <div className="setup-actions">
          <button type="button" className="secondary-button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="danger-action-button" onClick={onConfirm}>
            Delete
          </button>
        </div>
      </section>
    </div>
  );
}
