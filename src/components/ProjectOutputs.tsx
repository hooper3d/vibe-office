import { MessageSquare } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ProjectArtifact, ProjectRun, ProjectTask } from "../domain/projectScope";
import type { AgentInstance } from "../domain/types";
import {
  getInitialOutputSelection,
  getOutputAgentGroups,
  getOutputSelectionMeta,
  getSelectedOutputAgentGroup,
  isSameOutputSelection,
  resolveOutputSelection,
  resolveOutputTypeFilter,
  assignPreviewToOutputGroups,
  type OutputSelection,
  type OutputTypeFilter,
} from "../services/outputSelectors";
import { ProjectArtifacts } from "./ProjectArtifacts";
import {
  OutputIndexButton,
  OutputSection,
  OutputTypeButton,
  PreviewOutputSection,
} from "./ProjectOutputPrimitives";
import { ProjectTasks } from "./ProjectTasks";

export function ProjectOutputs({
  agents,
  runs,
  tasks,
  artifacts,
  previewUrl,
  previewOwnerAgentId,
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
  previewOwnerAgentId?: string;
  busyActionId: string;
  onCancelTask: (taskId: string) => void;
  onRefreshTask: (taskId: string) => void;
  onRetryTask: (taskId: string) => void;
  onShowBrowser: () => void;
}) {
  const [typeFilter, setTypeFilter] = useState<OutputTypeFilter>("all");
  const rawOutputGroups = useMemo(
    () => getOutputAgentGroups({ agents, runs, tasks, artifacts }),
    [agents, runs, tasks, artifacts],
  );
  const hasPreview = previewUrl.trim().length > 0;
  const outputGroups = useMemo(
    () => assignPreviewToOutputGroups({ groups: rawOutputGroups, hasPreview, ownerAgentId: previewOwnerAgentId }),
    [rawOutputGroups, hasPreview, previewOwnerAgentId],
  );
  const hasAssignedPreview = outputGroups.some((group) => group.previewCount > 0);
  const showProjectPreviewIndex = hasPreview && !hasAssignedPreview;
  const [selection, setSelection] = useState<OutputSelection>(() => getInitialOutputSelection(outputGroups));
  const selectedGroup = getSelectedOutputAgentGroup(outputGroups, selection);
  const hasAgentOutputs = outputGroups.length > 0;
  const hasAnyOutput = hasAgentOutputs || hasPreview;
  const selectedGroupHasPreview = Boolean(selectedGroup?.previewCount);
  const showTasks = selection.kind === "agent" && (typeFilter === "all" || typeFilter === "tasks");
  const showArtifacts = selection.kind === "agent" && (typeFilter === "all" || typeFilter === "artifacts");
  const showPreview =
    selection.kind === "preview" ||
    (selection.kind === "agent" && selectedGroupHasPreview && (typeFilter === "all" || typeFilter === "preview"));

  useEffect(() => {
    const nextSelection = resolveOutputSelection({ groups: outputGroups, hasPreview, selection });
    if (!isSameOutputSelection(selection, nextSelection)) setSelection(nextSelection);
  }, [hasPreview, outputGroups, selection]);

  useEffect(() => {
    const nextTypeFilter = resolveOutputTypeFilter(selection, typeFilter, selectedGroup);
    if (typeFilter !== nextTypeFilter) setTypeFilter(nextTypeFilter);
  }, [selectedGroup, selection, typeFilter]);

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
        {showProjectPreviewIndex ? (
          <OutputIndexButton
            active={selection.kind === "preview"}
            label="Project preview"
            meta="Project preview"
            onClick={() => setSelection({ kind: "preview" })}
          />
        ) : null}
        {outputGroups.map((group) => (
          <OutputIndexButton
            active={selection.kind === "agent" && selection.agentId === group.agent.id}
            key={group.agent.id}
            label={group.agent.name}
            meta={getOutputSelectionMeta({ group, hasPreview, selection: { kind: "agent", agentId: group.agent.id } })}
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
                {selectedGroupHasPreview ? (
                  <OutputTypeButton active={typeFilter === "preview"} label="Preview" onClick={() => setTypeFilter("preview")} />
                ) : null}
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
