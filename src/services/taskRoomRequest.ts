import type { WorkState } from "../domain/projectScope";
import type { AgentInstance, Project } from "../domain/types";
import { executeProjectAgentRequest } from "./agentRequestExecutor";
import type { WorkspaceFileAttachment } from "./workspaceFileClient";

export type ParticipantTaskResult = {
  agentId: string;
  agentName: string;
  state: WorkState;
  summary: string;
};

export function executeChiefPlanTurn({
  chief,
  project,
  text,
  participants,
  files,
}: {
  chief: AgentInstance;
  project: Project;
  text: string;
  participants: AgentInstance[];
  files: WorkspaceFileAttachment[];
}) {
  return executeProjectAgentRequest({
    agent: chief,
    project,
    text: buildChiefTaskRequestText(text, project, chief, participants, files),
    fallbackSummary: `${chief.name} returned a Chief task plan.`,
  });
}

export function executeParticipantTaskTurn({
  participant,
  project,
  text,
  chief,
  chiefPlan,
  files,
}: {
  participant: AgentInstance;
  project: Project;
  text: string;
  chief: AgentInstance;
  chiefPlan: string;
  files: WorkspaceFileAttachment[];
}) {
  return executeProjectAgentRequest({
    agent: participant,
    project,
    text: buildParticipantTaskRequestText(text, project, chief, participant, chiefPlan, files),
    fallbackSummary: `${participant.name} returned a task result.`,
  });
}

export function executeChiefAggregationTurn({
  chief,
  project,
  text,
  chiefPlan,
  participantResults,
  files,
}: {
  chief: AgentInstance;
  project: Project;
  text: string;
  chiefPlan: string;
  participantResults: ParticipantTaskResult[];
  files: WorkspaceFileAttachment[];
}) {
  return executeProjectAgentRequest({
    agent: chief,
    project,
    text: buildChiefAggregationRequestText(text, project, chief, chiefPlan, participantResults, files),
    fallbackSummary: `${chief.name} aggregated the participant results.`,
  });
}

function buildChiefTaskRequestText(
  text: string,
  project: Project,
  chief: AgentInstance,
  participants: AgentInstance[],
  files: WorkspaceFileAttachment[],
) {
  const participantList =
    participants.length > 0
      ? participants
          .map((agent) => `- ${agent.name}: ${agent.tags.length > 0 ? agent.tags.join(", ") : "no capability tags"}`)
          .join("\n")
      : "- No participant agents selected. Treat this as a Chief-only task.";
  const taskRequest = [
    `You are the Chief agent for Vibe Office project "${project.name}" (${project.namespace}).`,
    "Handle this as a project-scoped Task Room request.",
    "Use one planning/coordination round only. Do not assume direct access to local files or other agents.",
    `Chief: ${chief.name}`,
    "Selected participant agents:",
    participantList,
    "",
    "Task:",
    text,
  ].join("\n");

  return buildAgentRequestText(taskRequest, project, files);
}

function buildParticipantTaskRequestText(
  text: string,
  project: Project,
  chief: AgentInstance,
  participant: AgentInstance,
  chiefPlan: string,
  files: WorkspaceFileAttachment[],
) {
  const request = [
    `You are ${participant.name}, a selected participant agent in Vibe Office project "${project.name}" (${project.namespace}).`,
    `Chief agent: ${chief.name}.`,
    "Handle only your assigned portion of this one-round task. Do not delegate recursively.",
    "",
    "Original task:",
    text,
    "",
    "Chief plan:",
    chiefPlan,
    "",
    "Return your result clearly and concisely for Chief aggregation.",
  ].join("\n");

  return buildAgentRequestText(request, project, files);
}

function buildChiefAggregationRequestText(
  text: string,
  project: Project,
  chief: AgentInstance,
  chiefPlan: string,
  participantResults: ParticipantTaskResult[],
  files: WorkspaceFileAttachment[],
) {
  const resultList = participantResults
    .map((result) => `## ${result.agentName} (${result.state})\n${result.summary}`)
    .join("\n\n");
  const request = [
    `You are ${chief.name}, the Chief agent for Vibe Office project "${project.name}" (${project.namespace}).`,
    "Aggregate this one-round Task Room result into a final project-scoped answer.",
    "",
    "Original task:",
    text,
    "",
    "Your initial plan:",
    chiefPlan,
    "",
    "Participant results:",
    resultList || "No participant results were returned.",
    "",
    "Return the final summary, note any failed participant work, and do not create new delegations.",
  ].join("\n");

  return buildAgentRequestText(request, project, files);
}

function buildAgentRequestText(text: string, project: Project, files: WorkspaceFileAttachment[]) {
  if (files.length === 0) return text;

  const fileContext = files
    .map((file) => `--- file: ${file.path} (${formatBytes(file.size)}) ---\n${file.content}`)
    .join("\n\n");

  return `${text}\n\nWorkspace context explicitly attached by the user for ${project.name} (${project.namespace}). The remote agent cannot access the local filesystem. Use only the file excerpts below when they are relevant.\n\n${fileContext}`;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
