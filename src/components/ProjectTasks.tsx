import { ArrowRight, Loader2, MessageSquare, RefreshCw, XCircle } from "lucide-react";
import type { ProjectArtifact, ProjectRun, ProjectTask } from "../domain/projectScope";
import type { AgentInstance } from "../domain/types";
import {
  getTaskEventDisplayLabel,
  getTaskLifecycleAddress,
  hasCancelUnsupportedEvent,
  hasLifecycleUnsupportedEvent,
  isTaskLifecycleBusy,
  isTaskActive,
  isTaskTerminal,
} from "../services/taskLifecycleState";
import { getStandaloneOutputTasks, getVisibleOutputRuns } from "../services/outputSelectors";

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
  const visibleRuns = getVisibleOutputRuns(runs);
  const standaloneTasks = getStandaloneOutputTasks(runs, tasks);

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
  const refreshBusy = isTaskLifecycleBusy(busyActionId, "refresh", task.id);
  const retryBusy = isTaskLifecycleBusy(busyActionId, "retry", task.id);
  const cancelBusy = isTaskLifecycleBusy(busyActionId, "cancel", task.id);

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
