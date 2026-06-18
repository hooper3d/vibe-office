export type StoredUiState = {
  selectedAgentId?: string;
  selectedProjectId?: string;
  chatScope?: "free" | "project";
  conversationMode?: "single" | "task-room";
  outputMode?: "workspace" | "browser" | "outputs";
  activeFreeChatConversationIds?: Record<string, string>;
};

const STORAGE_KEY = "vibe-office.ui.v1";

export function loadUiState(): StoredUiState {
  if (typeof window === "undefined") return {};

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};

    const parsed = JSON.parse(raw) as StoredUiState;
    return {
      selectedAgentId: typeof parsed.selectedAgentId === "string" ? parsed.selectedAgentId : undefined,
      selectedProjectId: typeof parsed.selectedProjectId === "string" ? parsed.selectedProjectId : undefined,
      chatScope: parsed.chatScope === "project" ? "project" : parsed.chatScope === "free" ? "free" : undefined,
      conversationMode: parsed.conversationMode === "task-room" ? "task-room" : parsed.conversationMode === "single" ? "single" : undefined,
      outputMode: normalizeOutputMode(parsed.outputMode),
      activeFreeChatConversationIds: normalizeStringRecord(parsed.activeFreeChatConversationIds),
    };
  } catch {
    return {};
  }
}

export function saveUiState(state: StoredUiState) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // UI state is recoverable; storage failures should not break the active chat.
  }
}

function normalizeOutputMode(value: unknown): StoredUiState["outputMode"] {
  if (value === "workspace" || value === "browser" || value === "outputs") return value;
  if (value === "runs" || value === "artifacts") return "outputs";
  return undefined;
}

function normalizeStringRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;

  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
}
