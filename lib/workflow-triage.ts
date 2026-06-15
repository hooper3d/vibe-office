import type { AgentName } from "@/types/agent";
import type { TaskPriority } from "@/types/task";

export type WorkflowExecutionMode = "execute_now";

export type WorkflowTriage = {
  priority: TaskPriority;
  mode: WorkflowExecutionMode;
  owner: AgentName;
  reason: string;
};

const p0Patterns = /P0|p0|urgent|critical|blocked|cannot open|crash|security|release|production/i;
const p1Patterns = /P1|p1|bug|error|failed|timeout|fix|broken|wrong|implement|delete|adjust|rename|copy|label|layout|overflow/i;

export function triageRequirement(message?: string): WorkflowTriage {
  const text = (message || "").trim();
  const priority: TaskPriority = p0Patterns.test(text) ? "P0" : p1Patterns.test(text) ? "P1" : "P2";

  return {
    priority,
    mode: "execute_now",
    owner: "Ray",
    reason: "The planning agent classified this as an executable development task."
  };
}

export function triageSummary(triage: WorkflowTriage) {
  const modeText: Record<WorkflowExecutionMode, string> = {
    execute_now: "execute now"
  };

  return `${triage.priority} / ${modeText[triage.mode]} / ${triage.owner}: ${triage.reason}`;
}
