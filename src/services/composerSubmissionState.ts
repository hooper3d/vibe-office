type ConversationMode = "single" | "task-room";
type ChatScope = "free" | "project";

export type ComposerSubmissionIntent =
  | {
      kind: "ignore";
      reason: "empty" | "busy" | "missing-agent" | "missing-chief" | "missing-project" | "missing-participant";
    }
  | {
      kind: "free-chat";
      text: string;
    }
  | {
      kind: "project-chat";
      text: string;
    }
  | {
      kind: "task-room";
      text: string;
    };

export function resolveComposerSubmissionIntent({
  chatScope,
  conversationMode,
  hasChiefAgent,
  hasSelectedAgent,
  hasSelectedWorkspaceProject,
  isBusy,
  selectedTaskParticipantCount,
  text,
}: {
  chatScope: ChatScope;
  conversationMode: ConversationMode;
  hasChiefAgent: boolean;
  hasSelectedAgent: boolean;
  hasSelectedWorkspaceProject: boolean;
  isBusy: boolean;
  selectedTaskParticipantCount: number;
  text: string;
}): ComposerSubmissionIntent {
  const trimmedText = text.trim();
  if (!trimmedText) return { kind: "ignore", reason: "empty" };
  if (isBusy) return { kind: "ignore", reason: "busy" };

  if (conversationMode === "task-room") {
    if (!hasSelectedWorkspaceProject) return { kind: "ignore", reason: "missing-project" };
    if (!hasChiefAgent) return { kind: "ignore", reason: "missing-chief" };
    if (selectedTaskParticipantCount === 0) return { kind: "ignore", reason: "missing-participant" };
    return { kind: "task-room", text: trimmedText };
  }

  if (!hasSelectedAgent) return { kind: "ignore", reason: "missing-agent" };
  if (chatScope === "free") return { kind: "free-chat", text: trimmedText };
  if (!hasSelectedWorkspaceProject) return { kind: "ignore", reason: "missing-project" };
  return { kind: "project-chat", text: trimmedText };
}
