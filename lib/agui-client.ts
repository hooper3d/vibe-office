"use client";

import type { AGUIEvent, RunAgentInput } from "@ag-ui/core";
import type { AguiIntent } from "@/types/agent";

type StreamHandlers = {
  onEvent: (event: AGUIEvent) => void;
  onError: (message: string) => void;
  onDone: () => void;
};

export async function sendAguiInput(intent: AguiIntent, handlers: StreamHandlers) {
  const now = Date.now();
  const runId = `run_${now.toString(36)}`;
  const input: RunAgentInput = {
    threadId: "demo-thread",
    runId,
    state: {
      intent,
      source: "ai-agent-console",
      transport: "sse"
    },
    messages: [
      {
        id: `msg_${now.toString(36)}`,
        role: "user",
        content: intent.message || `Console action: ${intent.action}`
      }
    ],
    tools: [],
    context: [],
    forwardedProps: {}
  };

  const response = await fetch("/api/agent", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "text/event-stream"
    },
    body: JSON.stringify(input)
  });

  if (!response.ok || !response.body) {
    handlers.onError(`AG-UI runtime returned ${response.status}`);
    handlers.onDone();
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split("\n\n");
      buffer = blocks.pop() || "";

      for (const block of blocks) {
        const data = block
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trim())
          .join("");

        if (!data || data === "[DONE]") continue;
        handlers.onEvent(JSON.parse(data) as AGUIEvent);
      }
    }
  } catch (error) {
    handlers.onError(error instanceof Error ? error.message : "AG-UI stream failed");
  } finally {
    handlers.onDone();
  }
}
