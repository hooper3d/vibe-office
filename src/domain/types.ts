export type AgentStatus = "online" | "checking" | "offline";

export type AgentInstance = {
  id: string;
  name: string;
  role: string;
  location: string;
  endpoint: string;
  a2aEndpoint: string;
  agentCardUrl: string;
  apiKey?: string;
  avatarUrl?: string;
  model: string;
  tags: string[];
  status: AgentStatus;
  isChief?: boolean;
};

export type Project = {
  id: string;
  name: string;
  namespace: string;
  description: string;
};

export type AgentOutputStatus = "completed" | "running" | "failed";

export type AgentOutput = {
  id: string;
  agentId: string;
  projectId: string;
  title: string;
  summary: string;
  status: AgentOutputStatus;
};
