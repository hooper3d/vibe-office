import {
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  Globe2,
  MessageSquare,
  RefreshCw,
} from "lucide-react";
import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import type { ProjectArtifact, ProjectRun, ProjectTask } from "../domain/projectScope";
import type { AgentInstance } from "../domain/types";
import { ProjectArtifacts } from "./ProjectArtifacts";
import { ProjectTasks } from "./ProjectTasks";
import {
  countTrackableTaskOutputs,
  filterArtifactsByAgent,
  filterRunsByAgent,
  filterTasksByAgent,
  getVisibleOutputAgentIds,
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

type OutputTypeFilter = "all" | "tasks" | "artifacts" | "preview";

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
  const [selectedAgentId, setSelectedAgentId] = useState("all");
  const [typeFilter, setTypeFilter] = useState<OutputTypeFilter>("all");
  const visibleAgentIds = getVisibleOutputAgentIds({ agents, runs, tasks, artifacts });
  const selectedAgent = selectedAgentId === "all" ? undefined : agents.find((agent) => agent.id === selectedAgentId);
  const filteredRuns = filterRunsByAgent(runs, selectedAgentId);
  const filteredTasks = filterTasksByAgent(tasks, selectedAgentId);
  const filteredArtifacts = filterArtifactsByAgent(artifacts, selectedAgentId);
  const taskCount = countTrackableTaskOutputs(filteredRuns, filteredTasks);
  const artifactCount = filteredArtifacts.length;
  const hasPreview = previewUrl.trim().length > 0;
  const hasAnyOutput = taskCount > 0 || artifactCount > 0 || hasPreview;
  const showTasks = typeFilter === "all" || typeFilter === "tasks";
  const showArtifacts = typeFilter === "all" || typeFilter === "artifacts";
  const showPreview = typeFilter === "all" || typeFilter === "preview";

  useEffect(() => {
    if (selectedAgentId === "all") return;
    if (visibleAgentIds.includes(selectedAgentId)) return;
    setSelectedAgentId("all");
  }, [selectedAgentId, visibleAgentIds]);

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
        <OutputAgentButton
          active={selectedAgentId === "all"}
          label="All agents"
          meta={`${countTrackableTaskOutputs(runs, tasks)} tasks / ${artifacts.length} artifacts`}
          onClick={() => setSelectedAgentId("all")}
        />
        {visibleAgentIds.map((agentId) => {
          const agent = agents.find((item) => item.id === agentId);
          const agentRuns = filterRunsByAgent(runs, agentId);
          const agentTasks = filterTasksByAgent(tasks, agentId);
          const agentArtifacts = filterArtifactsByAgent(artifacts, agentId);
          return (
            <OutputAgentButton
              active={selectedAgentId === agentId}
              key={agentId}
              label={agent?.name ?? "Agent"}
              meta={`${countTrackableTaskOutputs(agentRuns, agentTasks)} tasks / ${agentArtifacts.length} artifacts`}
              onClick={() => setSelectedAgentId(agentId)}
            />
          );
        })}
      </div>

      <div className="output-type-workspace">
        <div className="output-workspace-header">
          <div>
            <div className="eyebrow">Outputs</div>
            <h3>{selectedAgent?.name ?? "All agents"}</h3>
            <span>{taskCount} tasks / {artifactCount} artifacts{hasPreview ? " / 1 preview" : ""}</span>
          </div>
          <div className="output-type-filter" role="tablist" aria-label="Output types">
            <OutputTypeButton active={typeFilter === "all"} label="All" onClick={() => setTypeFilter("all")} />
            <OutputTypeButton active={typeFilter === "tasks"} label="Tasks" onClick={() => setTypeFilter("tasks")} />
            <OutputTypeButton active={typeFilter === "artifacts"} label="Artifacts" onClick={() => setTypeFilter("artifacts")} />
            <OutputTypeButton active={typeFilter === "preview"} label="Preview" onClick={() => setTypeFilter("preview")} />
          </div>
        </div>

        <div className="output-section-stack">
          {showPreview ? <PreviewOutputSection hasPreview={hasPreview} previewUrl={previewUrl} onShowBrowser={onShowBrowser} /> : null}
          {showTasks ? (
            <OutputSection title="Tasks" count={taskCount}>
              <ProjectTasks
                agents={agents}
                runs={filteredRuns}
                tasks={filteredTasks}
                artifacts={filteredArtifacts}
                busyActionId={busyActionId}
                onCancelTask={onCancelTask}
                onRefreshTask={onRefreshTask}
                onRetryTask={onRetryTask}
              />
            </OutputSection>
          ) : null}
          {showArtifacts ? (
            <OutputSection title="Artifacts" count={artifactCount}>
              <ProjectArtifacts agents={agents} artifacts={filteredArtifacts} />
            </OutputSection>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function OutputAgentButton({
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
