import {
  AlertTriangle,
  Bot,
  Folder,
  MessageSquare,
  Moon,
  Pencil,
  Plus,
  Settings,
  Sparkles,
  Sun,
  Trash2,
} from "lucide-react";
import { getOfficeRoleLabel } from "../domain/agentProfile";
import type { AgentInstance, Project } from "../domain/types";
import type { ThemeMode } from "../services/themeStorage";
import { AgentAvatar, StatusDot } from "./AgentPrimitives";

export function AppSidebar({
  agents,
  projects,
  selectedAgentId,
  selectedProjectId,
  freeChatEntryProjectId,
  agentSetupIssues,
  respondingAgentIds,
  themeMode,
  onAddAgent,
  onCreateProject,
  onDeleteProject,
  onEditAgent,
  onEditProject,
  onSelectAgent,
  onSelectProject,
  onToggleTheme,
}: {
  agents: AgentInstance[];
  projects: Project[];
  selectedAgentId: string;
  selectedProjectId: string;
  freeChatEntryProjectId: string;
  agentSetupIssues: Record<string, string[]>;
  respondingAgentIds: Set<string>;
  themeMode: ThemeMode;
  onAddAgent: () => void;
  onCreateProject: () => void;
  onDeleteProject: (projectId: string) => void;
  onEditAgent: (agentId: string) => void;
  onEditProject: (projectId: string) => void;
  onSelectAgent: (agentId: string) => void;
  onSelectProject: (projectId: string, scope: "free" | "project") => void;
  onToggleTheme: () => void;
}) {
  return (
    <aside className="sidebar" aria-label="Vibe Office navigation">
      <div className="brand">
        <div className="brand-mark" aria-hidden="true">
          <Sparkles size={18} />
        </div>
        <div>
          <div className="brand-title">Vibe Office</div>
        </div>
        <button
          className="theme-toggle"
          type="button"
          onClick={onToggleTheme}
          aria-label={themeMode === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          title={themeMode === "dark" ? "Light theme" : "Dark theme"}
        >
          {themeMode === "dark" ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </div>

      <section className="nav-section">
        <div className="section-label">
          <span className="section-title">
            <Bot size={14} />
            Agents
          </span>
          <span className="count-badge">{agents.length}</span>
        </div>
        <div className="nav-list">
          {agents.length === 0 ? <div className="inline-empty">Add an agent provider to start.</div> : null}
          {agents.map((agent) => {
            const isActive = selectedAgentId === agent.id;
            const isResponding = respondingAgentIds.has(agent.id);
            const setupIssues = agentSetupIssues[agent.id] ?? [];
            const setupIssue = setupIssues[0];
            const setupIssueLabel = setupIssue ? getSetupIssueLabel(setupIssues) : "";
            return (
              <div className={`agent-row ${isActive ? "active" : ""}`} key={agent.id}>
                <button className="nav-item agent-item" onClick={() => onSelectAgent(agent.id)}>
                  <AgentAvatar agent={agent} />
                  <span className="nav-item-content">
                    <span className="nav-item-title">
                      <span className="nav-item-name">{agent.name}</span>
                      <span className="nav-item-badges">
                        {setupIssue ? (
                          <span className="setup-warning-pill" title={setupIssues.join("\n")} aria-label={`Setup issue: ${setupIssues.join(" ")}`}>
                            <AlertTriangle size={11} />
                          </span>
                        ) : null}
                        <span className="chief-dot">{getOfficeRoleLabel(agent.officeRole, agent.isChief)}</span>
                      </span>
                    </span>
                    <span className="nav-item-meta">
                      <StatusDot status={isResponding ? "checking" : agent.status} />
                      {isResponding ? "responding" : setupIssue ? setupIssueLabel : agent.tags.slice(0, 2).join(" / ")}
                    </span>
                  </span>
                </button>
                <div className="row-actions agent-row-actions" aria-label={`${agent.name} agent actions`}>
                  <button
                    className="icon-button mini-button"
                    type="button"
                    onClick={() => onEditAgent(agent.id)}
                    aria-label={`Edit ${agent.name}`}
                    title="Edit agent"
                  >
                    <Pencil size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <button className="secondary-action" onClick={onAddAgent}>
          <Plus size={16} />
          Add agent
        </button>
      </section>

      <section className="nav-section">
        <div className="section-label">
          <span className="section-title">
            <Folder size={14} />
            Projects
          </span>
          <button className="section-icon-button" type="button" onClick={onCreateProject} aria-label="Create project" title="Create project">
            <Plus size={14} />
          </button>
        </div>
        <div className="nav-list">
          {projects.map((project) => {
            const isActive = selectedProjectId === project.id;
            const isFreeChatProject = project.id === freeChatEntryProjectId;
            const projectName = isFreeChatProject ? "Free Chat" : project.name;
            const projectMeta = isFreeChatProject ? "personal conversations" : project.directory ?? project.namespace;
            return (
              <div className={`project-row ${isActive ? "active" : ""}`} key={project.id}>
                <button className="project-item" onClick={() => onSelectProject(project.id, isFreeChatProject ? "free" : "project")}>
                  <span className="project-icon" aria-hidden="true">
                    {isFreeChatProject ? <MessageSquare size={15} /> : <Folder size={15} />}
                  </span>
                  <span>
                    <span className="project-name">{projectName}</span>
                    <span className="project-namespace">{projectMeta}</span>
                  </span>
                </button>
                {!isFreeChatProject ? (
                  <div className="row-actions" aria-label={`${projectName} project actions`}>
                    <button
                      className="icon-button mini-button"
                      type="button"
                      onClick={() => onEditProject(project.id)}
                      aria-label={`Rename ${projectName}`}
                      title="Rename project"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      className="icon-button mini-button danger-button"
                      type="button"
                      onClick={() => onDeleteProject(project.id)}
                      aria-label={`Delete ${projectName}`}
                      title="Delete project"
                      disabled={projects.length <= 1}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>

      <button className="setup-card" onClick={onAddAgent}>
        <Settings size={18} />
        <span>
          <strong>Settings</strong>
        </span>
      </button>
    </aside>
  );
}

function getSetupIssueLabel(issues: string[]) {
  if (issues.some((issue) => issue.toLowerCase().includes("api key"))) return "missing key";
  if (issues.some((issue) => issue.toLowerCase().includes("provider type"))) return "provider mismatch";
  if (issues.some((issue) => issue.toLowerCase().includes("minimax"))) return "provider mismatch";
  return "setup issue";
}
