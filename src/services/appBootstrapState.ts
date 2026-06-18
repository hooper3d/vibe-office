import {
  conversationMessages,
  conversations as seedConversations,
  projectArtifacts,
  projectRuns,
  projectTasks,
  projects as seedProjects,
} from "../domain/seedData";
import type { ProjectChatScope } from "./projectSetupState";

export type AppOutputMode = "workspace" | "browser" | "outputs";

export const FREE_CHAT_ENTRY_PROJECT_ID = "default";
export const FREE_CHAT_PROJECT_ID = "__free_chat__";
export const FREE_CHAT_NAMESPACE = "free-chat";

export const seedWorkspaceDefaults = {
  projects: seedProjects,
  conversations: seedConversations,
  messages: conversationMessages,
  runs: projectRuns,
  tasks: projectTasks,
  artifacts: projectArtifacts,
};

export function normalizeOutputMode(mode?: string): AppOutputMode {
  if (mode === "workspace" || mode === "browser" || mode === "outputs") return mode;
  if (mode === "runs" || mode === "artifacts") return "outputs";
  return "workspace";
}

export function deriveInitialChatScope({
  freeChatEntryProjectId,
  selectedProjectId,
  storedChatScope,
}: {
  freeChatEntryProjectId: string;
  selectedProjectId?: string;
  storedChatScope?: ProjectChatScope;
}): ProjectChatScope {
  if (storedChatScope) return storedChatScope;
  return selectedProjectId && selectedProjectId !== freeChatEntryProjectId ? "project" : "free";
}
