import type { A2ATask } from "../domain/a2a";
import type { AgentInstance, Project } from "../domain/types";
import { extractA2ATaskText, getA2ATaskTimestamp } from "./agentTaskResult";
import { HermesA2AAdapter } from "./hermesA2AAdapter";
import type { ChatHistoryMessage } from "./providerTypes";

export type AgentRequestExecution = {
  task: A2ATask;
  summary: string;
  completedAt: string;
};

export async function executeFreeChatRequest({
  agent,
  text,
  history,
}: {
  agent: AgentInstance;
  text: string;
  history: ChatHistoryMessage[];
}) {
  const task = await new HermesA2AAdapter({ agent }).sendFreeChatMessage(text, history);
  return normalizeAgentRequestExecution(task, `${agent.name} returned a response.`);
}

export async function executeProjectAgentRequest({
  agent,
  project,
  text,
  history,
  fallbackSummary,
}: {
  agent: AgentInstance;
  project: Project;
  text: string;
  history?: ChatHistoryMessage[];
  fallbackSummary: string;
}) {
  const task = await new HermesA2AAdapter({ agent }).sendProjectMessage(project, text, history ?? []);
  return normalizeAgentRequestExecution(task, fallbackSummary);
}

function normalizeAgentRequestExecution(task: A2ATask, fallbackSummary: string): AgentRequestExecution {
  return {
    task,
    summary: extractA2ATaskText(task) ?? fallbackSummary,
    completedAt: getA2ATaskTimestamp(task),
  };
}
