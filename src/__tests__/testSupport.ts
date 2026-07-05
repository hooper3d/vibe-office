import type { A2ATask } from "../domain/a2a";
import type { Conversation, ConversationMessage, ProjectArtifact, ProjectRun, ProjectTask } from "../domain/projectScope";
import type { AgentInstance, Project } from "../domain/types";
import type { DirectRequestState } from "../services/directRequestOrchestrator";
import type { TaskRoomRequestState } from "../services/taskRoomOrchestrator";

export const at = "2026-06-18T10:00:00.000Z";
export const freeChatProjectId = "default";

export const agent: AgentInstance = {
  id: "agent-lucy",
  name: "Lucy",
  role: "drafts / releases",
  officeRole: "chief",
  location: "local",
  endpoint: "http://127.0.0.1:8642/v1/chat/completions",
  a2aEndpoint: "",
  agentCardUrl: "",
  model: "hermes",
  tags: ["drafts"],
  status: "online",
};

export const participant: AgentInstance = {
  ...agent,
  id: "agent-tiger",
  name: "Tiger",
  officeRole: "writer",
  tags: ["releases"],
};

export const project: Project = {
  id: "project-vibe",
  name: "Vibe Office",
  namespace: "project-vibe-office",
  description: "Project workspace.",
};

export function conversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: "conversation-1",
    projectId: project.id,
    mode: "direct",
    title: "Direct chat",
    primaryAgentId: agent.id,
    participantAgentIds: [],
    a2aContextId: project.namespace,
    createdAt: at,
    updatedAt: at,
    ...overrides,
  };
}

export function userMessage(overrides: Partial<ConversationMessage> = {}): ConversationMessage {
  return {
    id: "message-1",
    conversationId: "conversation-1",
    projectId: project.id,
    role: "user",
    contentParts: [{ kind: "text", text: "hello" }],
    requestId: "request-1",
    requestAttempt: 1,
    requestStartedAt: at,
    status: "sending",
    createdAt: at,
    ...overrides,
  };
}

export function task(overrides: Partial<ProjectTask> = {}): ProjectTask {
  return {
    id: "task-1",
    projectId: project.id,
    contextId: project.namespace,
    title: "Task",
    ownerAgentId: agent.id,
    participantAgentIds: [participant.id],
    state: "submitting",
    summary: "Task submitted to Chief.",
    events: [],
    artifactIds: [],
    updatedAt: at,
    ...overrides,
  };
}

export function run(overrides: Partial<ProjectRun> = {}): ProjectRun {
  return {
    id: "run-1",
    projectId: project.id,
    conversationId: "conversation-1",
    taskId: "task-1",
    type: "chief_delegation",
    ownerAgentId: agent.id,
    participantAgentIds: [agent.id, participant.id],
    state: "submitting",
    summary: "Chief-led task submitted.",
    eventIds: ["run-1-submitted"],
    artifactIds: [],
    createdAt: at,
    updatedAt: at,
    ...overrides,
  };
}

export function artifact(overrides: Partial<ProjectArtifact> = {}): ProjectArtifact {
  return {
    id: "artifact-1",
    projectId: project.id,
    taskId: "task-1",
    agentId: participant.id,
    name: "Artifact",
    kind: "text",
    summary: "Artifact body.",
    contentParts: [{ kind: "text", text: "Artifact body." }],
    createdAt: at,
    ...overrides,
  };
}

export function a2aTask(summary: string, id = "remote-task-1"): A2ATask {
  return {
    id,
    contextId: project.namespace,
    status: {
      state: "completed",
      timestamp: at,
      message: {
        messageId: `${id}-message`,
        role: "agent",
        parts: [{ kind: "text", text: summary }],
      },
    },
  };
}

export function directA2ATask(summary: string, id = "remote-message-1"): A2ATask {
  return {
    ...a2aTask(summary, id),
    metadata: {
      responseKind: "direct-message",
    },
  };
}

export function directRequestState(overrides: Partial<DirectRequestState> = {}): DirectRequestState {
  return {
    conversations: [conversation()],
    messages: [userMessage()],
    runs: [],
    tasks: [],
    artifacts: [],
    ...overrides,
  };
}

export function taskRoomRequestState(overrides: Partial<TaskRoomRequestState> = {}): TaskRoomRequestState {
  return {
    conversations: [conversation({ mode: "task_room", chiefAgentId: agent.id })],
    messages: [userMessage({ taskId: "task-1", runId: "run-1" })],
    runs: [run()],
    tasks: [task()],
    artifacts: [],
    ...overrides,
  };
}

export class MemoryLocalStorage {
  private values = new Map<string, string>();

  constructor(private shouldThrowOnSet = false) { }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    if (this.shouldThrowOnSet) throw new Error("Quota exceeded");
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  clear() {
    this.values.clear();
  }
}

export function withWindowStorage<T>(storage: MemoryLocalStorage, run: () => T) {
  const hadWindow = Object.prototype.hasOwnProperty.call(globalThis, "window");
  const previousWindow = (globalThis as { window?: unknown }).window;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { localStorage: storage },
  });

  try {
    return run();
  } finally {
    if (hadWindow) {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: previousWindow,
      });
    } else {
      Reflect.deleteProperty(globalThis, "window");
    }
  }
}
