import type { AgentName, AgentStatus } from "./agent";

export type TaskPriority = "P0" | "P1" | "P2" | "P3" | "P4" | "P5" | "P6";

export type TaskPlanStatus = "planned" | "selected" | "executing" | "reviewing" | "completed" | "blocked" | "deferred";

export type TaskItem = {
  id: string;
  priority: TaskPriority;
  title: string;
  status: AgentStatus;
  owner: AgentName;
  selected?: boolean;
  planStatus?: TaskPlanStatus;
  description?: string;
  acceptance?: string[];
  questions?: string[];
  order?: number;
};

export type LucyWorkflowStage = "idle" | "clarifying" | "planned" | "executing" | "reviewing" | "completed" | "blocked";

export type LucyPlan = {
  id: string;
  requirement: string;
  stage: LucyWorkflowStage;
  summary: string;
  questions: string[];
  recommendation: string;
  tasks: TaskItem[];
  createdAt: string;
  updatedAt: string;
};
