import { useRef, useState, type FormEvent } from "react";
import {
  resolveComposerSubmissionIntent,
} from "./composerSubmissionState";
import type { ProjectChatScope, ProjectConversationMode } from "./projectSetupState";

export type ComposerControllerOptions = {
  chatScope: ProjectChatScope;
  conversationMode: ProjectConversationMode;
  hasChiefAgent: boolean;
  hasSelectedAgent: boolean;
  hasSelectedWorkspaceProject: boolean;
  messageText: string;
  selectedTaskParticipantCount: number;
  submitFreeChatMessage: (text: string) => Promise<void>;
  submitProjectDirectMessage: (text: string) => Promise<void>;
  submitTaskRoomMessage: (text: string) => Promise<void>;
};

export function useComposerController({
  chatScope,
  conversationMode,
  hasChiefAgent,
  hasSelectedAgent,
  hasSelectedWorkspaceProject,
  messageText,
  selectedTaskParticipantCount,
  submitFreeChatMessage,
  submitProjectDirectMessage,
  submitTaskRoomMessage,
}: ComposerControllerOptions) {
  const [isComposerSubmitting, setIsComposerSubmitting] = useState(false);
  const composerSubmittingRef = useRef(false);

  async function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const intent = resolveComposerSubmissionIntent({
      chatScope,
      conversationMode,
      hasChiefAgent,
      hasSelectedAgent,
      hasSelectedWorkspaceProject,
      isBusy: composerSubmittingRef.current,
      selectedTaskParticipantCount,
      text: messageText,
    });
    if (intent.kind === "ignore") return;

    if (intent.kind === "task-room") {
      await runWithComposerBusy(() => submitTaskRoomMessage(intent.text));
      return;
    }

    if (intent.kind === "free-chat") {
      await runWithComposerBusy(() => submitFreeChatMessage(intent.text));
      return;
    }

    await runWithComposerBusy(() => submitProjectDirectMessage(intent.text));
  }

  async function runWithComposerBusy(run: () => Promise<void>) {
    composerSubmittingRef.current = true;
    setIsComposerSubmitting(true);
    try {
      await run();
    } finally {
      composerSubmittingRef.current = false;
      setIsComposerSubmitting(false);
    }
  }

  return {
    isComposerSubmitting,
    submitMessage,
  };
}
