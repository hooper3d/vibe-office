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
import {
  getArtifactsForTaskOutputItem,
  getTrackableTaskOutputItems,
  type TrackableTaskOutputItem,
} from "../services/projectTaskOutputItems";

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
  const outputItems = getTrackableTaskOutputItems({ runs, tasks });

  if (outputItems.length === 0) {
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
      {outputItems.map((item) => (
        <TaskOutputItem
          agents={agents}
          artifacts={artifacts}
          busyActionId={busyActionId}
          item={item}
          key={item.id}
          onCancelTask={onCancelTask}
          onRefreshTask={onRefreshTask}
          onRetryTask={onRetryTask}
          runs={runs}
        />
      ))}
    </div>
  );
}

function TaskOutputItem({
  agents,
  artifacts,
  busyActionId,
  item,
  onCancelTask,
  onRefreshTask,
  onRetryTask,
  runs,
}: {
  agents: AgentInstance[];
  artifacts: ProjectArtifact[];
  busyActionId: string;
  item: TrackableTaskOutputItem;
  onCancelTask: (taskId: string) => void;
  onRefreshTask: (taskId: string) => void;
  onRetryTask: (taskId: string) => void;
  runs: ProjectRun[];
}) {
  const owner = agents.find((agent) => agent.id === item.ownerAgentId);
  const itemArtifacts = getArtifactsForTaskOutputItem(artifacts, item);

  return (
    <article className={`output-item ${item.source === "run" ? "run-item" : ""}`} key={item.id}>
      <div className="output-title-row">
        <div>
          <h3>{item.title}</h3>
          <span>{owner?.name ?? "Agent"} / {item.contextLabel}</span>
        </div>
        <span className={`status-badge ${item.state}`}>{item.state}</span>
      </div>
      {item.lifecycleTask ? (
        <TaskLifecycleActions
          busyActionId={busyActionId}
          lifecycleLinked={Boolean(getTaskLifecycleAddress(item.lifecycleTask, runs))}
          onCancelTask={onCancelTask}
          onRefreshTask={onRefreshTask}
          onRetryTask={onRetryTask}
          owner={owner}
          task={item.lifecycleTask}
        />
      ) : null}
      <p>{item.summary}</p>
      {item.events.length > 0 ? <TaskEventList agents={agents} events={item.events} /> : null}
      <div className="artifact-strip">
        {itemArtifacts.length > 0 ? (
          itemArtifacts.map((artifact) => (
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
