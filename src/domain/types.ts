export type AgentStatus = "online" | "checking" | "offline";
export type AgentOfficeRole = "chief" | "builder" | "writer" | "operator";

export type AgentInstance = {
  id: string;
  name: string;
  role: string;
  officeRole?: AgentOfficeRole;
  location: string;
  endpoint: string;
  a2aEndpoint: string;
  agentCardUrl: string;
  apiKey?: string;
  avatarUrl?: string;
  ipAddress?: string;
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
  directory?: string;
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
