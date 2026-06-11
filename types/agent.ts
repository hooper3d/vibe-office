export type AgentName = "Lucy" | "Ray" | "Tiger" | "Musk";
export type AgentMentionTarget = "Auto" | AgentName;
export type ProjectId = "demo-project" | "free-project";

export type AgentStatus =
  | "idle"
  | "ready"
  | "waiting"
  | "working"
  | "coding"
  | "handoff"
  | "reviewing"
  | "blocked"
  | "offline";

export type AgentAction =
  | "submit_requirement_to_lucy"
  | "generate_lucy_plan"
  | "execute_selected_tasks"
  | "dispatch_to_ray"
  | "ask_lucy_review"
  | "ask_tiger_blog"
  | "ask_tiger_publish"
  | "daily_report"
  | "manual_message";

export type AgentProfile = {
  name: AgentName;
  role: string;
  status: AgentStatus;
  tone: "violet" | "blue" | "amber" | "slate";
};

export type AguiIntent = {
  action: AgentAction;
  targetAgent: AgentName;
  projectId: ProjectId;
  taskId?: string;
  message?: string;
  planId?: string;
  selectedTaskIds?: string[];
};
