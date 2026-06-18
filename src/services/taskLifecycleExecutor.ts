import type { A2ATask } from "../domain/a2a";
import type { AgentInstance, Project } from "../domain/types";
import { HermesA2AAdapter } from "./hermesA2AAdapter";

export type RemoteTaskAddress = {
  taskId: string;
  contextId: string;
};

export async function refreshRemoteTaskLifecycle({
  agent,
  address,
}: {
  agent: AgentInstance;
  address: RemoteTaskAddress;
}): Promise<A2ATask> {
  return new HermesA2AAdapter({ agent }).getProjectTask(address.taskId, address.contextId);
}

export async function cancelRemoteTaskLifecycle({
  agent,
  address,
}: {
  agent: AgentInstance;
  address: RemoteTaskAddress;
}): Promise<A2ATask> {
  return new HermesA2AAdapter({ agent }).cancelProjectTask(address.taskId, address.contextId);
}

export async function retryRemoteProjectTask({
  agent,
  project,
  taskTitle,
  previousFailure,
}: {
  agent: AgentInstance;
  project: Project;
  taskTitle: string;
  previousFailure: string;
}): Promise<A2ATask> {
  return new HermesA2AAdapter({ agent }).sendProjectMessage(
    project,
    ["Retry this failed project task.", "", `Task title: ${taskTitle}`, "", "Previous failure:", previousFailure].join("\n"),
  );
}
