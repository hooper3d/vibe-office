import {
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  Globe2,
  MessageSquare,
  RefreshCw,
} from "lucide-react";
import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from "react";
import type { ProjectArtifact, ProjectRun, ProjectTask } from "../domain/projectScope";
import type { AgentInstance } from "../domain/types";
import { ProjectArtifacts } from "./ProjectArtifacts";
import { ProjectTasks } from "./ProjectTasks";
import {
  getInitialOutputSelection,
  getOutputAgentGroups,
  getOutputSelectionMeta,
  getSelectedOutputAgentGroup,
  isSameOutputSelection,
  resolveOutputSelection,
  resolveOutputTypeFilter,
  type OutputSelection,
  type OutputTypeFilter,
} from "../services/outputSelectors";

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

export function ProjectOutputs({
  agents,
  runs,
  tasks,
  artifacts,
  previewUrl,
  busyActionId,
  onCancelTask,
  onRefreshTask,
  onRetryTask,
  onShowBrowser,
}: {
  agents: AgentInstance[];
  runs: ProjectRun[];
  tasks: ProjectTask[];
  artifacts: ProjectArtifact[];
  previewUrl: string;
  busyActionId: string;
  onCancelTask: (taskId: string) => void;
  onRefreshTask: (taskId: string) => void;
  onRetryTask: (taskId: string) => void;
  onShowBrowser: () => void;
}) {
  const [typeFilter, setTypeFilter] = useState<OutputTypeFilter>("all");
  const outputGroups = useMemo(
    () => getOutputAgentGroups({ agents, runs, tasks, artifacts }),
    [agents, runs, tasks, artifacts],
  );
  const hasPreview = previewUrl.trim().length > 0;
  const [selection, setSelection] = useState<OutputSelection>(() => getInitialOutputSelection(outputGroups));
  const selectedGroup = getSelectedOutputAgentGroup(outputGroups, selection);
  const hasAgentOutputs = outputGroups.length > 0;
  const hasAnyOutput = hasAgentOutputs || hasPreview;
  const showTasks = selection.kind === "agent" && (typeFilter === "all" || typeFilter === "tasks");
  const showArtifacts = selection.kind === "agent" && (typeFilter === "all" || typeFilter === "artifacts");
  const showPreview = selection.kind === "preview";

  useEffect(() => {
    const nextSelection = resolveOutputSelection({ groups: outputGroups, hasPreview, selection });
    if (!isSameOutputSelection(selection, nextSelection)) setSelection(nextSelection);
  }, [hasPreview, outputGroups, selection]);

  useEffect(() => {
    const nextTypeFilter = resolveOutputTypeFilter(selection, typeFilter);
    if (typeFilter !== nextTypeFilter) setTypeFilter(nextTypeFilter);
  }, [selection, typeFilter]);

  if (!hasAnyOutput) {
    return (
      <div className="empty-state tall">
        <MessageSquare size={32} />
        <h3>No outputs yet</h3>
        <p>Tasks, artifacts, and browser preview links appear here by agent.</p>
      </div>
    );
  }

  return (
    <div className="project-outputs">
      <div className="output-agent-index" aria-label="Output agents">
        {hasPreview ? (
          <OutputIndexButton
            active={selection.kind === "preview"}
            label="Browser preview"
            meta="Project preview"
            onClick={() => setSelection({ kind: "preview" })}
          />
        ) : null}
        {outputGroups.map((group) => (
          <OutputIndexButton
            active={selection.kind === "agent" && selection.agentId === group.agent.id}
            key={group.agent.id}
            label={group.agent.name}
            meta={`${group.taskCount} tasks / ${group.artifactCount} artifacts`}
            onClick={() => setSelection({ kind: "agent", agentId: group.agent.id })}
          />
        ))}
      </div>

      <div className="output-type-workspace">
        <div className="output-workspace-header">
          <div>
            <div className="eyebrow">Outputs</div>
            <h3>{selection.kind === "preview" ? "Browser preview" : selectedGroup?.agent.name ?? "Agent outputs"}</h3>
            <span>{getOutputSelectionMeta({ group: selectedGroup, hasPreview, selection })}</span>
          </div>
          <div className="output-type-filter" role="tablist" aria-label="Output types">
            {selection.kind === "preview" ? (
              <OutputTypeButton active label="Preview" onClick={() => setTypeFilter("preview")} />
            ) : (
              <>
                <OutputTypeButton active={typeFilter === "all"} label="All" onClick={() => setTypeFilter("all")} />
                <OutputTypeButton active={typeFilter === "tasks"} label="Tasks" onClick={() => setTypeFilter("tasks")} />
                <OutputTypeButton active={typeFilter === "artifacts"} label="Artifacts" onClick={() => setTypeFilter("artifacts")} />
              </>
            )}
          </div>
        </div>

        <div className="output-section-stack">
          {showPreview ? <PreviewOutputSection hasPreview={hasPreview} previewUrl={previewUrl} onShowBrowser={onShowBrowser} /> : null}
          {showTasks && selectedGroup ? (
            <OutputSection title="Tasks" count={selectedGroup.taskCount}>
              <ProjectTasks
                agents={agents}
                runs={selectedGroup.runs}
                tasks={selectedGroup.tasks}
                artifacts={selectedGroup.artifacts}
                busyActionId={busyActionId}
                onCancelTask={onCancelTask}
                onRefreshTask={onRefreshTask}
                onRetryTask={onRetryTask}
              />
            </OutputSection>
          ) : null}
          {showArtifacts && selectedGroup ? (
            <OutputSection title="Artifacts" count={selectedGroup.artifactCount}>
              <ProjectArtifacts agents={agents} artifacts={selectedGroup.artifacts} />
            </OutputSection>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function OutputIndexButton({
  active,
  label,
  meta,
  onClick,
}: {
  active: boolean;
  label: string;
  meta: string;
  onClick: () => void;
}) {
  return (
    <button className={`output-agent-button ${active ? "active" : ""}`} onClick={onClick} type="button">
      <strong>{label}</strong>
      <span>{meta}</span>
    </button>
  );
}

function OutputTypeButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button className={`output-type-button ${active ? "active" : ""}`} onClick={onClick} role="tab" aria-selected={active} type="button">
      {label}
    </button>
  );
}

function OutputSection({ children, count, title }: { children: ReactNode; count: number; title: string }) {
  return (
    <section className="output-section" aria-label={title}>
      <div className="output-section-heading">
        <h4>{title}</h4>
        <span>{count}</span>
      </div>
      {children}
    </section>
  );
}

function PreviewOutputSection({
  hasPreview,
  previewUrl,
  onShowBrowser,
}: {
  hasPreview: boolean;
  previewUrl: string;
  onShowBrowser: () => void;
}) {
  return (
    <OutputSection title="Preview" count={hasPreview ? 1 : 0}>
      {hasPreview ? (
        <button className="preview-output-row" onClick={onShowBrowser} type="button">
          <Globe2 size={16} />
          <span>
            <strong>Browser preview</strong>
            <small>{previewUrl}</small>
          </span>
          <ArrowRight size={15} />
        </button>
      ) : (
        <div className="inline-empty">No browser preview opened yet.</div>
      )}
    </OutputSection>
  );
}
