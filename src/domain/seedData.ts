import type { Conversation, ConversationMessage, ProjectArtifact, ProjectRun, ProjectScope, ProjectTask } from "./projectScope";
import type { AgentInstance, Project } from "./types";

export const initialAgents: AgentInstance[] = [];

export const projects: Project[] = [
  {
    id: "default",
    name: "Default Project",
    namespace: "default",
    description: "Free chat namespace for fast conversations.",
  },
  {
    id: "vibe-office",
    name: "Vibe Office",
    namespace: "project.vibe-office",
    description: "Product workspace for Hermes agent aggregation.",
  },
];

export const projectScopes: ProjectScope[] = [];

export const conversations: Conversation[] = [];

export const conversationMessages: ConversationMessage[] = [];

export const projectRuns: ProjectRun[] = [];

export const projectTasks: ProjectTask[] = [];

export const projectArtifacts: ProjectArtifact[] = [];

export const setupSteps = ["Connect", "Test", "Profile", "Save"];
