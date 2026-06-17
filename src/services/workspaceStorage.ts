import type { Conversation, ConversationMessage, ProjectArtifact, ProjectRun, ProjectTask } from "../domain/projectScope";
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
    if (parsed.version !== STORAGE_VERSION) return emptyWorkspaceState;

    return {
      projects: normalizeArray(parsed.projects),
      conversations: normalizeArray(parsed.conversations),
      messages: normalizeArray(parsed.messages),
      runs: normalizeArray(parsed.runs),
      tasks: normalizeArray(parsed.tasks),
      artifacts: normalizeArray(parsed.artifacts),
    };
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

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(storedState));
}

function normalizeArray<T>(value: T[] | unknown): T[] {
  return Array.isArray(value) ? value : [];
}
