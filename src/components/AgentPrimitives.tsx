import type { AgentInstance, AgentStatus } from "../domain/types";

export function StatusDot({ status }: { status: AgentStatus }) {
  return <span className={`status-dot ${status}`} aria-label={`Status: ${status}`} />;
}

export function AgentAvatar({ agent, size = "regular" }: { agent: AgentInstance; size?: "regular" | "small" | "large" }) {
  const fallback = agent.name.slice(0, 1).toUpperCase();

  return (
    <span className={`avatar ${size === "small" ? "small" : size === "large" ? "large" : ""}`} aria-hidden="true">
      {agent.avatarUrl ? <img alt="" src={agent.avatarUrl} /> : fallback}
    </span>
  );
}
