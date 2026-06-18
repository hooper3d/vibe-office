import type {
  Conversation,
  ConversationFailureKind,
  ConversationMessage,
  ConversationMode,
  ProjectArtifact,
  ProjectArtifactKind,
  ProjectRun,
  ProjectRunType,
  ProjectTask,
  WorkState,
} from "../domain/projectScope";
import type { A2APart } from "../domain/a2a";
import type { Project } from "../domain/types";

const STORAGE_KEY = "vibe-office.workspace.v1";
const STORAGE_VERSION = 1;

export type WorkspaceState = {
  projects: Project[];
  conversations: Conversation[];
  messages: ConversationMessage[];
  runs: ProjectRun[];
  tasks: ProjectTask[];
  artifacts: ProjectArtifact[];
};

type StoredWorkspaceState = WorkspaceState & {
  version: number;
};

export const emptyWorkspaceState: WorkspaceState = {
  projects: [],
  conversations: [],
  messages: [],
  runs: [],
  tasks: [],
  artifacts: [],
};

export function loadWorkspaceState(): WorkspaceState {
  if (typeof window === "undefined") return emptyWorkspaceState;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyWorkspaceState;

    const parsed = JSON.parse(raw) as Partial<StoredWorkspaceState>;
    return migrateWorkspaceState(parsed);
  } catch {
    return emptyWorkspaceState;
  }
}

export function saveWorkspaceState(state: WorkspaceState) {
  if (typeof window === "undefined") return;

  const storedState: StoredWorkspaceState = {
    version: STORAGE_VERSION,
    projects: state.projects,
    conversations: state.conversations,
    messages: state.messages,
    runs: state.runs,
    tasks: state.tasks,
    artifacts: state.artifacts,
  };

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(storedState));
  } catch {
    // Workspace state is recoverable in prototype mode; storage quota failures should not interrupt active chat.
  }
}

function normalizeArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function migrateWorkspaceState(value: Partial<StoredWorkspaceState>): WorkspaceState {
  return {
    projects: normalizeArray(value.projects)
      .map(normalizeProject)
      .filter((project): project is Project => Boolean(project)),
    conversations: normalizeArray(value.conversations)
      .map(normalizeConversation)
      .filter((conversation): conversation is Conversation => Boolean(conversation)),
    messages: normalizeArray(value.messages)
      .map(normalizeMessage)
      .filter((message): message is ConversationMessage => Boolean(message)),
    runs: normalizeArray(value.runs)
      .map(normalizeRun)
      .filter((run): run is ProjectRun => Boolean(run)),
    tasks: normalizeArray(value.tasks)
      .map(normalizeTask)
      .filter((task): task is ProjectTask => Boolean(task)),
    artifacts: normalizeArray(value.artifacts)
      .map(normalizeArtifact)
      .filter((artifact): artifact is ProjectArtifact => Boolean(artifact)),
  };
}

function normalizeProject(value: unknown): Project | null {
  if (!isRecord(value)) return null;
  if (!hasString(value, "id") || !hasString(value, "name") || !hasString(value, "namespace")) return null;

  return {
    id: value.id,
    name: value.name,
    namespace: value.namespace,
    description: typeof value.description === "string" ? value.description : "",
    directory: typeof value.directory === "string" ? value.directory : undefined,
  };
}

function normalizeConversation(value: unknown): Conversation | null {
  if (!isRecord(value)) return null;
  if (!hasString(value, "id") || !hasString(value, "projectId") || !isConversationMode(value.mode)) return null;

  return {
    id: value.id,
    projectId: value.projectId,
    mode: value.mode,
    title: typeof value.title === "string" ? value.title : "Conversation",
    primaryAgentId: typeof value.primaryAgentId === "string" ? value.primaryAgentId : undefined,
    chiefAgentId: typeof value.chiefAgentId === "string" ? value.chiefAgentId : undefined,
    participantAgentIds: normalizeStringArray(value.participantAgentIds),
    a2aContextId: typeof value.a2aContextId === "string" ? value.a2aContextId : value.projectId,
    createdAt: typeof value.createdAt === "string" ? value.createdAt : new Date().toISOString(),
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : typeof value.createdAt === "string" ? value.createdAt : new Date().toISOString(),
  };
}

function normalizeMessage(value: unknown): ConversationMessage | null {
  if (!isRecord(value)) return null;
  if (!hasString(value, "id") || !hasString(value, "conversationId") || !hasString(value, "projectId")) return null;
  if (value.role !== "user" && value.role !== "agent" && value.role !== "system") return null;
  if (value.status !== "sending" && value.status !== "sent" && value.status !== "failed") return null;

  return {
    id: value.id,
    conversationId: value.conversationId,
    projectId: value.projectId,
    role: value.role,
    agentId: typeof value.agentId === "string" ? value.agentId : undefined,
    contentParts: normalizeParts(value.contentParts),
    workspaceContext: normalizeWorkspaceContext(value.workspaceContext),
    a2aMessageId: typeof value.a2aMessageId === "string" ? value.a2aMessageId : undefined,
    taskId: typeof value.taskId === "string" ? value.taskId : undefined,
    runId: typeof value.runId === "string" ? value.runId : undefined,
    errorKind: isFailureKind(value.errorKind) ? value.errorKind : undefined,
    errorText: typeof value.errorText === "string" ? value.errorText : undefined,
    status: value.status,
    createdAt: typeof value.createdAt === "string" ? value.createdAt : new Date().toISOString(),
  };
}

function normalizeRun(value: unknown): ProjectRun | null {
  if (!isRecord(value)) return null;
  if (!hasString(value, "id") || !hasString(value, "projectId") || !hasString(value, "conversationId")) return null;
  if (!isRunType(value.type) || !isWorkState(value.state) || !hasString(value, "ownerAgentId")) return null;

  return {
    id: value.id,
    projectId: value.projectId,
    conversationId: value.conversationId,
    taskId: typeof value.taskId === "string" ? value.taskId : undefined,
    type: value.type,
    ownerAgentId: value.ownerAgentId,
    participantAgentIds: normalizeStringArray(value.participantAgentIds),
    state: value.state,
    summary: typeof value.summary === "string" ? value.summary : undefined,
    eventIds: normalizeStringArray(value.eventIds),
    artifactIds: normalizeStringArray(value.artifactIds),
    createdAt: typeof value.createdAt === "string" ? value.createdAt : new Date().toISOString(),
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : typeof value.createdAt === "string" ? value.createdAt : new Date().toISOString(),
  };
}

function normalizeTask(value: unknown): ProjectTask | null {
  if (!isRecord(value)) return null;
  if (!hasString(value, "id") || !hasString(value, "projectId") || !hasString(value, "contextId")) return null;
  if (!hasString(value, "title") || !hasString(value, "ownerAgentId") || !isWorkState(value.state)) return null;

  return {
    id: value.id,
    projectId: value.projectId,
    contextId: value.contextId,
    remoteTaskId: typeof value.remoteTaskId === "string" ? value.remoteTaskId : undefined,
    remoteContextId: typeof value.remoteContextId === "string" ? value.remoteContextId : undefined,
    title: value.title,
    ownerAgentId: value.ownerAgentId,
    participantAgentIds: normalizeStringArray(value.participantAgentIds),
    state: value.state,
    summary: typeof value.summary === "string" ? value.summary : "",
    events: normalizeArray(value.events)
      .map(normalizeTaskEvent)
      .filter((event): event is ProjectTask["events"][number] => Boolean(event)),
    artifactIds: normalizeStringArray(value.artifactIds),
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : new Date().toISOString(),
  };
}

function normalizeArtifact(value: unknown): ProjectArtifact | null {
  if (!isRecord(value)) return null;
  if (!hasString(value, "id") || !hasString(value, "projectId") || !hasString(value, "taskId") || !hasString(value, "agentId")) return null;
  if (!hasString(value, "name") || !isArtifactKind(value.kind)) return null;

  return {
    id: value.id,
    projectId: value.projectId,
    taskId: value.taskId,
    agentId: value.agentId,
    name: value.name,
    kind: value.kind,
    summary: typeof value.summary === "string" ? value.summary : "",
    contentParts: normalizeParts(value.contentParts),
    createdAt: typeof value.createdAt === "string" ? value.createdAt : new Date().toISOString(),
  };
}

function normalizeTaskEvent(value: unknown): ProjectTask["events"][number] | null {
  if (!isRecord(value)) return null;
  if (!hasString(value, "id") || !hasString(value, "taskId") || !hasString(value, "agentId") || !hasString(value, "label")) {
    return null;
  }
  if (!isWorkState(value.state)) return null;

  return {
    id: value.id,
    taskId: value.taskId,
    agentId: value.agentId,
    label: value.label,
    state: value.state,
    timestamp: typeof value.timestamp === "string" ? value.timestamp : new Date().toISOString(),
  };
}

function normalizeWorkspaceContext(value: unknown): ConversationMessage["workspaceContext"] {
  const references = normalizeArray(value)
    .filter(isRecord)
    .filter((item) => hasString(item, "path"))
    .map((item) => ({
      path: item.path,
      size: typeof item.size === "number" ? item.size : 0,
      attachedAt: typeof item.attachedAt === "string" ? item.attachedAt : new Date().toISOString(),
    }));

  return references.length > 0 ? references : undefined;
}

function normalizeParts(value: unknown): A2APart[] {
  return Array.isArray(value) ? (value.filter(isRecord) as A2APart[]) : [];
}

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasString(value: Record<string, unknown>, key: string): value is Record<string, unknown> & Record<typeof key, string> {
  return typeof value[key] === "string";
}

function isConversationMode(value: unknown): value is ConversationMode {
  return value === "direct" || value === "task_room";
}

function isRunType(value: unknown): value is ProjectRunType {
  return value === "direct_message" || value === "a2a_task" || value === "chief_delegation";
}

function isArtifactKind(value: unknown): value is ProjectArtifactKind {
  return value === "text" || value === "file" || value === "json" || value === "url";
}

function isFailureKind(value: unknown): value is ConversationFailureKind {
  return value === "timeout" || value === "network" || value === "auth" || value === "not_found" || value === "context" || value === "interrupted" || value === "unknown";
}

function isWorkState(value: unknown): value is WorkState {
  return (
    value === "idle" ||
    value === "submitting" ||
    value === "submitted" ||
    value === "working" ||
    value === "input_required" ||
    value === "completed" ||
    value === "failed" ||
    value === "canceled" ||
    value === "unsupported"
  );
}
