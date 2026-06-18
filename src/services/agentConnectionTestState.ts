import { createAgentFromHermesSetup, getProviderSetupIssue } from "../domain/hermesSetup";
import type { AgentInstance } from "../domain/types";
import { getUserFacingAgentError } from "./agentErrorText";
import { HermesA2AAdapter } from "./hermesA2AAdapter";
import { assertLocalTrustedAgentCredential, stripAgentCredential, upsertLocalTrustedAgent } from "./localTrustedAgentRegistry";
import { createA2ACompatibilityMetadata, type A2ACompatibilityMetadata, type ProviderConnectionTestResult } from "./providerTypes";

export type AgentConnectionTestResult =
  | {
      status: "passed";
      agent: AgentInstance;
      metadata: A2ACompatibilityMetadata;
      message: string;
    }
  | {
      status: "failed";
      agent?: AgentInstance;
      message: string;
    };

export type AgentConnectionTestAdapter = {
  testConnection(): Promise<ProviderConnectionTestResult>;
};

export type RunAgentConnectionTestOptions = {
  form: FormData;
  agentId?: string;
  createAdapter?: (agent: AgentInstance) => AgentConnectionTestAdapter;
  onAgentPersisted?: (agent: AgentInstance) => Promise<void> | void;
  persistAgent?: (agent: AgentInstance) => Promise<void> | void;
};

export async function runAgentConnectionTest({
  form,
  agentId,
  createAdapter = (agent) => new HermesA2AAdapter({ agent }),
  onAgentPersisted,
  persistAgent = upsertLocalTrustedAgent,
}: RunAgentConnectionTestOptions): Promise<AgentConnectionTestResult> {
  const agent = createAgentFromHermesSetup(form, { id: agentId });
  const setupIssue = getProviderSetupIssue(agent);
  if (setupIssue) {
    return { status: "failed", agent, message: setupIssue };
  }

  try {
    await persistAgent(agent);
    await onAgentPersisted?.(agent);
    await assertLocalTrustedAgentCredential(agent);
    const result = await createAdapter(stripAgentCredential(agent)).testConnection();

    return {
      status: "passed",
      agent,
      metadata: createA2ACompatibilityMetadata(result),
      message: `${result.card.name || agent.name} provider connection verified.`,
    };
  } catch (error) {
    return {
      status: "failed",
      agent,
      message: getUserFacingAgentError(error),
    };
  }
}
