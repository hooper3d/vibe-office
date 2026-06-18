import { useState } from "react";
import {
  readLocalTrustedAgentReadinessRefresh,
  removeAgentReadinessIssues,
  removeAgentReadinessStatus,
  type LocalTrustedAgentStatusById,
} from "./agentReadinessState";

export function useLocalTrustedAgentReadiness() {
  const [localTrustedAgentIssues, setLocalTrustedAgentIssues] = useState<Record<string, string[]>>({});
  const [localTrustedAgentStatuses, setLocalTrustedAgentStatuses] = useState<LocalTrustedAgentStatusById>({});

  async function refreshLocalTrustedAgentIssues(
    agentIds: string[],
    options: { replace?: boolean; isCancelled?: () => boolean } = {},
  ) {
    if (agentIds.length === 0) {
      setLocalTrustedAgentIssues({});
      setLocalTrustedAgentStatuses({});
      return;
    }

    try {
      const refresh = await readLocalTrustedAgentReadinessRefresh({ agentIds, replace: options.replace });
      if (options.isCancelled?.()) return;
      setLocalTrustedAgentStatuses((current) => refresh.applyStatuses(current));
      setLocalTrustedAgentIssues((current) => refresh.applyIssues(current));
    } catch {
      if (options.isCancelled?.()) return;
      if (options.replace) {
        setLocalTrustedAgentIssues({});
        setLocalTrustedAgentStatuses({});
      }
    }
  }

  function removeLocalTrustedAgentReadiness(agentId: string) {
    setLocalTrustedAgentIssues((current) => removeAgentReadinessIssues(current, agentId));
    setLocalTrustedAgentStatuses((current) => removeAgentReadinessStatus(current, agentId));
  }

  return {
    localTrustedAgentIssues,
    localTrustedAgentStatuses,
    refreshLocalTrustedAgentIssues,
    removeLocalTrustedAgentReadiness,
  };
}
