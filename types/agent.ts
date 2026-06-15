export type AgentName = "Lucy" | "Ray" | "Tiger" | "Musk";
export type AgentMentionTarget = "Auto" | AgentName;
export type ProjectId = string;

export type ProjectProfile = {
  id: ProjectId;
  name: string;
  mode: string;
  description: string;
  createdAt?: string;
};

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
  | "submit_requirement_to_planning_agent"
  | "generate_plan_workflow"
  | "execute_selected_tasks"
  | "dispatch_to_ray"
  | "ask_planning_agent_review"
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
  attachments?: Array<{
    id: string;
    type: "image" | "file" | "url" | "markdown";
    title: string;
    accessUrl?: string;
    sourceUrl?: string;
    path?: string;
    mimeType?: string;
    description?: string;
  }>;
  planId?: string;
  selectedTaskIds?: string[];
};
