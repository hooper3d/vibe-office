import type { ConversationMessage } from "../domain/projectScope";

export class RequestTracker {
  private readonly activeRequestIds = new Set<string>();

  begin(request: ConversationMessage | string) {
    const requestId = getTrackedRequestId(request);
    this.activeRequestIds.add(requestId);
    return requestId;
  }

  end(request: ConversationMessage | string) {
    this.activeRequestIds.delete(getTrackedRequestId(request));
  }

  has(request: ConversationMessage | string) {
    return this.activeRequestIds.has(getTrackedRequestId(request));
  }

  snapshot() {
    return new Set(this.activeRequestIds);
  }
}

export function createRequestTracker() {
  return new RequestTracker();
}

export function getTrackedRequestId(request: ConversationMessage | string) {
  return typeof request === "string" ? request : request.requestId ?? request.id;
}
