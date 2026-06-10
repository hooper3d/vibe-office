import type { AGUIEvent } from "@ag-ui/core";

export type ConsoleEvent = AGUIEvent & {
  receivedAt: string;
};

export type CommandPayload = {
  command: string;
  targetAgent: string;
};
