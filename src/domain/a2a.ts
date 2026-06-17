export type A2ARole = "user" | "agent";

export type A2APart =
  | {
      kind: "text";
      text: string;
    }
  | {
      kind: "data";
      data: Record<string, unknown>;
    }
  | {
      kind: "file";
      file: {
        name?: string;
        mimeType?: string;
        uri?: string;
      };
    };

export type A2AMessage = {
  messageId: string;
  role: A2ARole;
  parts: A2APart[];
  contextId?: string;
  taskId?: string;
  metadata?: Record<string, unknown>;
};

export type A2ATaskState =
  | "submitted"
  | "working"
  | "input-required"
  | "completed"
  | "canceled"
  | "failed"
  | "rejected"
  | "auth-required"
  | "unknown";

export type A2ATask = {
  id: string;
  contextId: string;
  status: {
    state: A2ATaskState;
    message?: A2AMessage;
    timestamp?: string;
  };
  artifacts?: A2AArtifact[];
  history?: A2AMessage[];
  metadata?: Record<string, unknown>;
};

export type A2AArtifact = {
  artifactId?: string;
  name?: string;
  description?: string;
  parts: A2APart[];
  metadata?: Record<string, unknown>;
};

export type A2AAgentSkill = {
  id: string;
  name: string;
  description?: string;
  tags?: string[];
};

export type A2AAgentCard = {
  name: string;
  description?: string;
  url: string;
  version: string;
  protocolVersion?: string;
  capabilities?: {
    streaming?: boolean;
    pushNotifications?: boolean;
    stateTransitionHistory?: boolean;
  };
  skills?: A2AAgentSkill[];
};

export type A2AJsonRpcRequest<TParams> = {
  jsonrpc: "2.0";
  id: string;
  method: string;
  params: TParams;
};

export type A2AJsonRpcResponse<TResult> = {
  jsonrpc: "2.0";
  id: string;
  result?: TResult;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
};

export type A2ASendMessageParams = {
  message: A2AMessage;
  configuration?: {
    acceptedOutputModes?: string[];
    blocking?: boolean;
    historyLength?: number;
  };
  metadata?: Record<string, unknown>;
};

