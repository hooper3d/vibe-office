import type { Conversation, ConversationMessage, ProjectArtifact, ProjectRun, ProjectTask } from "../domain/projectScope";
import { createRequestTracker } from "./requestTracker";

export type RequestWorkspaceState = {
  conversations: Conversation[];
  messages: ConversationMessage[];
  runs: ProjectRun[];
  tasks: ProjectTask[];
  artifacts: ProjectArtifact[];
};

export function createRequestRuntimeStore(initialState: RequestWorkspaceState) {
  let state = initialState;
  const tracker = createRequestTracker();

  return {
    snapshot() {
      return state;
    },
    replace(nextState: RequestWorkspaceState) {
      state = nextState;
      return state;
    },
    sync(nextState: Partial<RequestWorkspaceState>) {
      state = {
        ...state,
        ...nextState,
      };
      return state;
    },
    activeRequestIds() {
      return tracker.snapshot();
    },
    begin(request: ConversationMessage | string) {
      return tracker.begin(request);
    },
    end(request: ConversationMessage | string) {
      tracker.end(request);
    },
    has(request: ConversationMessage | string) {
      return tracker.has(request);
    },
  };
}
