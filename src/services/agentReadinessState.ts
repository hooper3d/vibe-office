import { getProviderSetupIssue } from "../domain/providerSetup";
import type { AgentInstance } from "../domain/types";
import type { LocalTrustedAgentSafeStatus } from "./localTrustedAgentRegistry";

export type AgentReadinessIssuesById = Record<string, string[]>;
export type LocalTrustedAgentStatusById = Record<string, LocalTrustedAgentSafeStatus>;

export function deriveAgentReadinessIssues({
  agents,
  localTrustedIssues,
}: {
  agents: AgentInstance[];
  localTrustedIssues: AgentReadinessIssuesById;
}) {
  return Object.fromEntries(
    agents.map((agent) => {
      const issues = [...(localTrustedIssues[agent.id] ?? [])];
      const setupIssue = getProviderSetupIssue(agent);
      if (setupIssue && !issues.includes(setupIssue)) issues.unshift(setupIssue);
      return [agent.id, issues];
    }),
  );
}

export function applyLocalTrustedAgentStatusMap({
  currentStatuses,
  replace,
  statuses,
}: {
  currentStatuses: LocalTrustedAgentStatusById;
  replace?: boolean;
  statuses: LocalTrustedAgentSafeStatus[];
}) {
  const nextStatuses = Object.fromEntries(statuses.map((status) => [status.id, status]));
  return replace ? nextStatuses : { ...currentStatuses, ...nextStatuses };
}

export function applyLocalTrustedAgentStatuses({
  currentIssues,
  replace,
  statuses,
}: {
  currentIssues: AgentReadinessIssuesById;
  replace?: boolean;
  statuses: Pick<LocalTrustedAgentSafeStatus, "id" | "issues">[];
}) {
  const nextIssues = Object.fromEntries(statuses.map((status) => [status.id, status.issues]));
  return replace ? nextIssues : { ...currentIssues, ...nextIssues };
}

export function removeAgentReadinessIssues(currentIssues: AgentReadinessIssuesById, agentId: string) {
  const { [agentId]: _removedIssues, ...remainingIssues } = currentIssues;
  return remainingIssues;
}

export function removeAgentReadinessStatus(currentStatuses: LocalTrustedAgentStatusById, agentId: string) {
  const { [agentId]: _removedStatus, ...remainingStatuses } = currentStatuses;
  return remainingStatuses;
}
