import type {
  A2AAgentCard,
  A2AJsonRpcResponse,
  A2AMessage,
  A2ASendMessageParams,
  A2ATask,
} from "../domain/a2a";
import { createBrowserAgentHttpTransport, type AgentHttpTransport } from "./agentHttpTransport";

export type A2AClientOptions = {
  agentId: string;
  timeoutMs?: number;
  transport?: AgentHttpTransport;
};

export class A2AClient {
  private agentId: string;
  private timeoutMs: number;
  private transport: AgentHttpTransport;

  constructor(options: A2AClientOptions) {
    this.agentId = options.agentId;
    this.timeoutMs = options.timeoutMs ?? 60_000;
    this.transport = options.transport ?? createBrowserAgentHttpTransport();
  }

  async getAgentCard() {
    return this.transport.commandJson<A2AAgentCard>(
      {
        agentId: this.agentId,
        command: "a2a.getAgentCard",
      },
      {
        timeoutMs: this.timeoutMs,
        timeoutMessage: "Provider capability request timed out.",
        agentId: this.agentId,
      },
    );
  }

  async sendMessage(message: A2AMessage, metadata?: Record<string, unknown>) {
    return this.rpc<A2ASendMessageParams, A2ATask>("a2a.messageSend", {
      message,
      configuration: {
        acceptedOutputModes: ["text/plain", "application/json"],
        blocking: false,
        historyLength: 0,
      },
      metadata,
    });
  }

  async getTask(taskId: string, contextId: string) {
    return this.rpc<{ id: string; contextId: string }, A2ATask>("a2a.tasksGet", {
      id: taskId,
      contextId,
    });
  }

  async cancelTask(taskId: string, contextId: string) {
    return this.rpc<{ id: string; contextId: string }, A2ATask>("a2a.tasksCancel", {
      id: taskId,
      contextId,
    });
  }

  private async rpc<TParams, TResult>(
    command: "a2a.messageSend" | "a2a.tasksGet" | "a2a.tasksCancel",
    params: TParams,
  ) {
    const payload = await this.transport.commandJson<A2AJsonRpcResponse<TResult>>(
      {
        agentId: this.agentId,
        command,
        payload: params as A2ASendMessageParams & { id: string; contextId: string },
      },
      {
        timeoutMs: this.timeoutMs,
        timeoutMessage: "Agent task request timed out.",
        agentId: this.agentId,
      },
    );

    return this.readRpcResult(payload);
  }

  private readRpcResult<TResult>(payload: A2AJsonRpcResponse<TResult>) {
    if (payload.error) {
      throw new Error(payload.error.message);
    }

    if (!payload.result) {
      throw new Error("Agent response did not include a result.");
    }

    return payload.result;
  }
}
