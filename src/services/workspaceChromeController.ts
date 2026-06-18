import type { Dispatch, FormEvent, PointerEvent, SetStateAction } from "react";
import { getSplitPercentFromClientX, nudgeSplitPercent } from "./splitPaneState";

type WorkspaceOutputMode = "workspace" | "browser" | "outputs";

export type BrowserPreviewOutput = {
  ownerAgentId?: string;
  openedAt: number;
  url: string;
};

export type WorkspaceChromeControllerOptions = {
  browserUrl: string;
  selectedAgentId?: string;
  setOutputMode: Dispatch<SetStateAction<WorkspaceOutputMode>>;
  setPreviewOutput: Dispatch<SetStateAction<BrowserPreviewOutput | undefined>>;
  setSplitPercent: Dispatch<SetStateAction<number>>;
};

export function useWorkspaceChromeController({
  browserUrl,
  selectedAgentId,
  setOutputMode,
  setPreviewOutput,
  setSplitPercent,
}: WorkspaceChromeControllerOptions) {
  function openPreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const url = browserUrl.trim();
    setPreviewOutput(url ? { ownerAgentId: selectedAgentId, openedAt: Date.now(), url } : undefined);
    setOutputMode("browser");
  }

  function updateSplitFromClientX(container: HTMLElement, clientX: number) {
    const rect = container.getBoundingClientRect();
    setSplitPercent(getSplitPercentFromClientX({ clientX, left: rect.left, width: rect.width }));
  }

  function startSplitDrag(event: PointerEvent<HTMLDivElement>) {
    const container = event.currentTarget.parentElement;
    if (!container) return;

    event.preventDefault();
    document.body.classList.add("is-resizing");

    const handlePointerMove = (moveEvent: globalThis.PointerEvent) => {
      updateSplitFromClientX(container, moveEvent.clientX);
    };
    const stopDrag = () => {
      document.body.classList.remove("is-resizing");
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopDrag);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopDrag, { once: true });
  }

  function nudgeSplit(direction: "left" | "right") {
    setSplitPercent((current) => nudgeSplitPercent(current, direction));
  }

  return {
    nudgeSplit,
    openPreview,
    startSplitDrag,
  };
}
