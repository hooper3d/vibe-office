"use client";

import {
  Archive,
  Bot,
  Boxes,
  ChevronDown,
  ExternalLink,
  Plus
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type WheelEvent } from "react";
import type { AgentProfile, ProjectId, ProjectProfile } from "@/types/agent";
import type { TaskItem } from "@/types/task";
import type { Artifact } from "@/types/artifact";

type AgentStatusProps = {
  agents: AgentProfile[];
  running: boolean;
  connection: "Local Connected" | "Streaming" | "Error";
  projects: ProjectProfile[];
  projectId: ProjectId;
  onProjectChange: (projectId: ProjectId) => void;
  onCreateProject: (name: string) => void;
  selectedAgent?: AgentProfile["name"];
  onSelectAgent?: (agentName: AgentProfile["name"]) => void;
  tasks?: TaskItem[];
  onReviewTask?: (taskId: string) => void;
  className?: string;
  collapsed?: boolean;
};

const toneClass = {
  violet: "bg-violet-200 text-violet-700 shadow-[0_0_0_5px_rgba(167,139,250,0.16)]",
  blue: "bg-blue-100 text-blue-700 shadow-[0_0_0_5px_rgba(96,165,250,0.16)]",
  amber: "bg-amber-100 text-amber-700 shadow-[0_0_0_5px_rgba(251,191,36,0.18)]",
  slate: "bg-slate-200 text-slate-700 shadow-[0_0_0_5px_rgba(148,163,184,0.14)]"
};

const agentDetails = {
  Lucy: {
    genericRole: "\u9879\u76ee\u7ecf\u7406",
    intro: "\u8d1f\u8d23\u9700\u6c42\u62c6\u89e3\u3001\u4efb\u52a1\u5206\u914d\u3001\u9a8c\u6536\u6807\u51c6\u548c\u98ce\u9669\u6574\u7406\uff0c\u628a\u7528\u6237\u76ee\u6807\u8f6c\u6210\u53ef\u6267\u884c\u7684 Agent \u5de5\u4f5c\u6d41\u3002",
    skills: ["\u62c6\u89e3\u9700\u6c42", "\u5206\u914d\u4efb\u52a1", "\u7edf\u7b79\u9a8c\u6536", "\u6574\u7406\u98ce\u9669", "\u751f\u6210\u65e5\u62a5"]
  },
  Ray: {
    genericRole: "\u5168\u6808\u5de5\u7a0b\u5e08",
    intro: "\u8d1f\u8d23\u8bfb\u53d6\u9879\u76ee\u4e0a\u4e0b\u6587\u3001\u5b8c\u6210\u5b9e\u73b0\u6216\u4fee\u590d\uff0c\u5e76\u628a\u5f00\u53d1\u8fc7\u7a0b\u6c89\u6dc0\u5230 Project Context Hub\u3002",
    skills: ["\u8bfb\u5199\u4ee3\u7801", "\u4fee\u590d\u95ee\u9898", "\u66f4\u65b0\u4e0a\u4e0b\u6587", "\u9a8c\u8bc1\u7ed3\u679c", "\u4ea4\u63a5\u8bf4\u660e"]
  },
  Tiger: {
    genericRole: "\u8fd0\u7ef4\u5de5\u7a0b\u5e08",
    intro: "\u8d1f\u8d23\u590d\u7528\u53d1\u5e03\u6458\u8981\u548c Blog \u7d20\u6750\uff0c\u6574\u7406\u9762\u5411\u7528\u6237\u7684\u53d1\u5e03\u5185\u5bb9\u8349\u7a3f\uff0c\u5f53\u524d\u901a\u8fc7\u4e0a\u6d77\u670d\u52a1\u5668\u4e0a\u7684 Hermes \u63a5\u5165\u534f\u4f5c\u7f51\u7edc\u3002",
    skills: ["\u751f\u6210 Blog", "\u53d1\u5e03\u6458\u8981", "\u590d\u7528\u7d20\u6750", "\u5185\u5bb9\u6da6\u8272", "\u8fd0\u7ef4\u8bb0\u5f55"]
  },
  Musk: {
    genericRole: "\u91d1\u4e3b\u7238\u7238",
    intro: "\u8d1f\u8d23\u63d0\u4f9b\u9884\u7b97\u60f3\u8c61\u529b\u3001\u65b9\u5411\u538b\u529b\u548c\u8fdc\u7aef\u670d\u52a1\u5668\u89c6\u89d2\uff0c\u5f53\u524d\u901a\u8fc7\u7845\u8c37\u670d\u52a1\u5668\u4e0a\u7684 Hermes \u63a5\u5165\u534f\u4f5c\u7f51\u7edc\u3002",
    skills: ["\u9884\u7b97\u5224\u65ad", "\u65b9\u5411\u538b\u529b", "\u8fdc\u7aef\u89c6\u89d2", "\u534f\u4f5c\u6269\u5c55", "\u80fd\u529b\u89c4\u5212"]
  }
} satisfies Record<AgentProfile["name"], { genericRole: string; intro: string; skills: string[] }>;

const CANVAS_MIN_SCALE = 0.25;
const CANVAS_MAX_SCALE = 3;
const CANVAS_SCALE_STEP = 0.15;
const DEFAULT_CANVAS_VIEW = { x: 0, y: 0, scale: 1 };

function clampCanvasScale(value: number) {
  return Math.min(CANVAS_MAX_SCALE, Math.max(CANVAS_MIN_SCALE, value));
}

type ArtifactsResponse = {
  ok: boolean;
  artifacts: Artifact[];
  error?: string;
};

function formatArtifactTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(value));
}

function artifactTypeLabel(type: Artifact["type"]) {
  if (type === "image") return "Image";
  if (type === "markdown") return "Markdown";
  if (type === "file") return "File";
  return "URL";
}

const agentMetaLine: Partial<Record<AgentProfile["name"], string>> = {
  Lucy: "\u4e2d\u56fd\u5357\u4eac\uff1a\u672c\u5730 Hermes Agent",
  Ray: "\u4e2d\u56fd\u5357\u4eac\uff1a\u672c\u5730\u5f00\u53d1 Agent",
  Tiger: "\u4e2d\u56fd\u4e0a\u6d77\uff1a21.4.96.84",
  Musk: "\u7f8e\u56fd\u7845\u8c37\uff1a3.162.107.236"
};

function displayStatus(agent: AgentProfile) {
  if (agent.status === "blocked") {
    return {
      label: "\u9700\u5904\u7406",
      className: "bg-emerald-500/10 text-emerald-300 shadow-[inset_0_0_0_1px_rgba(52,211,153,0.1)]",
      dot: "bg-emerald-500",
      active: false
    };
  }

  if (agent.status === "offline") {
    return {
      label: "\u79bb\u7ebf",
      className: "bg-slate-500/10 text-slate-300 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.1)]",
      dot: "bg-slate-500",
      active: false
    };
  }

  if (agent.status === "waiting") {
    return {
      label: "\u7b49\u5f85\u4e2d",
      className: "bg-amber-500/10 text-amber-300 shadow-[inset_0_0_0_1px_rgba(251,191,36,0.1)]",
      dot: "bg-amber-500",
      active: false
    };
  }

  if (agent.status === "ready") {
    return {
      label: "\u7a7a\u95f2\u4e2d",
      className: "bg-emerald-500/10 text-emerald-300 shadow-[inset_0_0_0_1px_rgba(52,211,153,0.1)]",
      dot: "bg-emerald-500",
      active: false
    };
  }

  if (agent.status === "idle") {
    return {
      label: "\u7a7a\u95f2\u4e2d",
      className: "bg-emerald-500/10 text-emerald-300 shadow-[inset_0_0_0_1px_rgba(52,211,153,0.1)]",
      dot: "bg-emerald-500",
      active: false
    };
  }

  return {
    label: "\u5de5\u4f5c\u4e2d",
    className: "bg-blue-500/10 text-blue-300 shadow-[inset_0_0_0_1px_rgba(96,165,250,0.1)]",
    dot: "bg-blue-400",
    active: true
  };
}

export function AgentStatus({
  agents,
  running,
  connection,
  projects,
  projectId,
  onProjectChange,
  onCreateProject,
  selectedAgent,
  onSelectAgent,
  tasks = [],
  className = "",
  collapsed = false
}: AgentStatusProps) {
  const [openAgentName, setOpenAgentName] = useState<AgentProfile["name"] | null>(null);
  const [selectedArtifactOwner, setSelectedArtifactOwner] = useState<AgentProfile["name"]>("Tiger");
  const [artifactOutletOpen, setArtifactOutletOpen] = useState(false);
  const [artifactRegistry, setArtifactRegistry] = useState<Artifact[]>([]);
  const [artifactLoading, setArtifactLoading] = useState(false);
  const [artifactError, setArtifactError] = useState<string | null>(null);
  const [canvasView, setCanvasView] = useState(DEFAULT_CANVAS_VIEW);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  void connection;
  const leader = agents.find((agent) => agent.name === "Lucy");
  const executors = agents.filter((agent) => agent.name !== "Lucy");
  const leaderOpen = Boolean(leader && openAgentName === leader.name);
  const executorOpen = executors.some((agent) => openAgentName === agent.name);
  const selectedAgentDetail = openAgentName ? agents.find((agent) => agent.name === openAgentName) : null;
  const activeExecutors = new Set<AgentProfile["name"]>(
    executors
      .filter((agent) => displayStatus(agent).active)
      .map((agent) => agent.name)
  );
  const reviewingTasks = tasks.filter((task) => task.planStatus === "reviewing");
  const plannedTasks = tasks.filter((task) => task.planStatus === "planned" || task.planStatus === "selected");
  const completedTasks = tasks.filter((task) => task.planStatus === "completed");
  const activeOwnerArtifacts = useMemo(
    () =>
      artifactRegistry
        .filter((artifact) => artifact.projectId === projectId && artifact.owner === selectedArtifactOwner && !artifact.archivedAt)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [artifactRegistry, projectId, selectedArtifactOwner]
  );
  const activeProject = projects.find((project) => project.id === projectId) || projects[0];

  useEffect(() => {
    let active = true;

    async function loadArtifacts() {
      setArtifactLoading(true);
      setArtifactError(null);

      try {
        const response = await fetch(`/api/artifacts?projectId=${encodeURIComponent(projectId)}`, { cache: "no-store" });
        const data = (await response.json()) as ArtifactsResponse;
        if (!active || !response.ok || !data.ok) {
          throw new Error(data.error || `Load artifacts failed (${response.status})`);
        }

        setArtifactRegistry(data.artifacts);
      } catch (error) {
        if (!active) return;
        setArtifactError(error instanceof Error ? error.message : "Load artifacts failed");
      } finally {
        if (active) {
          setArtifactLoading(false);
        }
      }
    }

    void loadArtifacts();
    const timer = window.setInterval(loadArtifacts, 10000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [projectId]);

  function zoomCanvas(delta: number, anchor?: { clientX: number; clientY: number }) {
    setCanvasView((current) => {
      const nextScale = clampCanvasScale(current.scale + delta);
      if (nextScale === current.scale) return current;
      const viewport = viewportRef.current?.getBoundingClientRect();
      if (!viewport || !anchor) return { ...current, scale: nextScale };

      const anchorX = anchor.clientX - viewport.left - viewport.width / 2;
      const anchorY = anchor.clientY - viewport.top - viewport.height / 2;
      const ratio = nextScale / current.scale;

      return {
        scale: nextScale,
        x: anchorX - (anchorX - current.x) * ratio,
        y: anchorY - (anchorY - current.y) * ratio
      };
    });
  }

  function handleCanvasWheel(event: WheelEvent<HTMLDivElement>) {
    event.preventDefault();
    zoomCanvas(event.deltaY > 0 ? -CANVAS_SCALE_STEP : CANVAS_SCALE_STEP, {
      clientX: event.clientX,
      clientY: event.clientY
    });
  }

  function handleCanvasMouseDown(event: MouseEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    const isInteractive = Boolean((event.target as HTMLElement).closest("[data-agent-interactive='true']"));
    if (!isInteractive) {
      setOpenAgentName(null);
    }
    if (isInteractive) return;
    event.preventDefault();
    dragRef.current = { x: event.clientX, y: event.clientY };
  }

  function handleCanvasMouseMove(event: MouseEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    const deltaX = event.clientX - drag.x;
    const deltaY = event.clientY - drag.y;
    dragRef.current = { x: event.clientX, y: event.clientY };
    setCanvasView((current) => ({ ...current, x: current.x + deltaX, y: current.y + deltaY }));
  }

  function handleCanvasMouseUp() {
    dragRef.current = null;
  }

  if (collapsed) {
    return (
      <section className={`frost relative z-40 flex min-w-0 shrink-0 items-center gap-4 rounded-xl p-4 ${className}`}>
        <div className="flex min-w-0 shrink-0 items-center gap-3">
          <Bot className="h-5 w-5 text-slate-300" />
          <h2 className="text-base font-semibold text-slate-100">Agent Office</h2>
          <ProjectControls
            projects={projects}
            projectId={projectId}
            activeProjectName={activeProject?.name || "Project"}
            onProjectChange={onProjectChange}
            onCreateProject={onCreateProject}
          />
        </div>

        <div className="flex min-w-0 flex-1 items-center justify-center gap-3 overflow-hidden">
          {agents.map((agent) => {
            const status = displayStatus(agent);
            return (
              <button
                key={agent.name}
                type="button"
                onClick={() => {
                  onSelectAgent?.(agent.name);
                  setOpenAgentName(null);
                }}
                className={`group relative flex min-w-0 items-center gap-2 rounded-full px-2 py-1 transition hover:bg-slate-900/50 focus:outline-none focus-visible:ring-1 focus-visible:ring-sky-400/50 ${
                  selectedAgent === agent.name ? "bg-slate-800/70 shadow-[inset_0_0_0_1px_rgba(125,211,252,0.16)]" : ""
                }`}
                title={`\u5207\u6362\u5230 ${agent.name} \u5bf9\u8bdd`}
              >
                <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-semibold ${toneClass[agent.tone]}`}>
                  {agent.name.slice(0, 1)}
                </span>
                <span className="min-w-0 truncate text-sm font-semibold text-slate-100">{agent.name}</span>
                <span className={`status-dot shrink-0 ${status.dot}`} />
              </button>
            );
          })}
          {selectedAgentDetail ? <AgentDetailCard agent={selectedAgentDetail} compact inCanvas={false} /> : null}
        </div>

      </section>
    );
  }

  return (
      <section className={`frost agent-canvas-bg relative isolate z-40 min-w-0 select-none overflow-hidden rounded-xl transition-all duration-300 ${collapsed ? "h-[260px] min-h-[240px]" : "h-full min-h-[520px]"} ${className}`}>
        <div
          data-agent-interactive="true"
          className="absolute left-4 top-4 z-[140] flex items-center gap-3 px-1 py-1"
        >
          <Bot className="h-5 w-5 text-slate-300" />
          <h2 className="text-base font-semibold text-slate-100">Agent Office</h2>
          <ProjectControls
            projects={projects}
            projectId={projectId}
            activeProjectName={activeProject?.name || "Project"}
            onProjectChange={onProjectChange}
            onCreateProject={onCreateProject}
          />
        </div>

        <div
          ref={viewportRef}
          className="absolute inset-0 z-10 cursor-grab select-none overflow-hidden rounded-xl transition-all duration-300 active:cursor-grabbing max-md:h-[360px]"
          onWheel={handleCanvasWheel}
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleCanvasMouseMove}
          onMouseUp={handleCanvasMouseUp}
          onMouseLeave={handleCanvasMouseUp}
        >
          <div
            className="absolute left-1/2 top-1/2 z-0 flex h-[520px] max-h-[calc(100%-96px)] w-[820px] max-w-[calc(100%-48px)] origin-center flex-col justify-between px-4 py-3 transition-transform duration-75 will-change-transform"
            style={{
              transform: `translate(calc(-50% + ${canvasView.x}px), calc(-50% + ${canvasView.y}px)) scale(${canvasView.scale})`
            }}
          >
            <AgentFlowLines activeExecutors={activeExecutors} collapsed={collapsed} />
            {leader ? (
              <div className={`relative flex justify-center ${leaderOpen ? "z-[90]" : "z-10"}`}>
                <AgentNode
                  agent={leader}
                  openAgentName={openAgentName}
                  setOpenAgentName={setOpenAgentName}
                  variant="leader"
                  collapsed={collapsed}
                  onSelectArtifactOwner={setSelectedArtifactOwner}
                  selectedArtifactOwner={selectedArtifactOwner}
                />
              </div>
            ) : null}

            <div className={`relative grid min-w-0 grid-cols-3 gap-4 max-sm:grid-cols-1 ${executorOpen ? "z-[90]" : "z-10"}`}>
            {executors.map((agent) => (
              <AgentNode
                key={agent.name}
                agent={agent}
                openAgentName={openAgentName}
                setOpenAgentName={setOpenAgentName}
                variant="executor"
                collapsed={collapsed}
                onSelectArtifactOwner={setSelectedArtifactOwner}
                selectedArtifactOwner={selectedArtifactOwner}
              />
            ))}
          </div>
          <ArtifactOutlet
            owner={artifactOutletOpen ? selectedArtifactOwner : null}
            artifacts={activeOwnerArtifacts}
            loading={artifactLoading}
            error={artifactError}
            onClose={() => setArtifactOutletOpen(false)}
          />
        </div>

          <OfficeDock
            artifacts={artifactRegistry}
            projectId={projectId}
            selectedArtifactOwner={selectedArtifactOwner}
            plannedTasks={plannedTasks}
            reviewingTasks={reviewingTasks}
            completedTasks={completedTasks}
            running={running}
            onOpenArtifactBox={() => setArtifactOutletOpen(true)}
          />
        </div>
      </section>
  );
}

function ProjectControls({
  projects,
  projectId,
  activeProjectName,
  onProjectChange,
  onCreateProject
}: {
  projects: ProjectProfile[];
  projectId: ProjectId;
  activeProjectName: string;
  onProjectChange: (projectId: ProjectId) => void;
  onCreateProject: (name: string) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [draftName, setDraftName] = useState("");

  function submitProjectName() {
    const name = draftName.trim();
    if (!name) return;
    onCreateProject(name);
    setDraftName("");
    setCreating(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      submitProjectName();
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setCreating(false);
      setDraftName("");
    }
  }

  return (
    <div data-agent-interactive="true" className="flex min-w-0 items-center gap-2">
      <label className="relative inline-flex h-8 max-w-[240px] items-center gap-2 rounded-lg border border-slate-800/80 bg-slate-950/36 px-2.5 text-xs font-semibold text-cyan-100 transition hover:border-slate-700">
        <span className="min-w-0 truncate">{activeProjectName}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-500" />
        <select
          value={projectId}
          onChange={(event) => onProjectChange(event.target.value)}
          className="absolute inset-0 h-8 w-full cursor-pointer opacity-0"
          title="Switch project"
        >
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
      </label>
      {creating ? (
        <div className="flex h-8 min-w-0 items-center gap-1 rounded-lg border border-cyan-400/30 bg-slate-950/72 px-1.5">
          <input
            value={draftName}
            onChange={(event) => setDraftName(event.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
            placeholder="Project name"
            className="h-6 w-32 min-w-0 bg-transparent px-1 text-xs font-semibold text-slate-100 outline-none placeholder:text-slate-500"
          />
          <button
            type="button"
            onClick={submitProjectName}
            disabled={!draftName.trim()}
            className="h-6 rounded-md px-2 text-xs font-semibold text-cyan-200 transition hover:bg-cyan-400/10 disabled:cursor-not-allowed disabled:opacity-35"
          >
            Create
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-slate-800/80 bg-slate-950/36 text-slate-300 transition hover:border-cyan-400/40 hover:text-cyan-100"
          title="New project"
        >
          <Plus className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

function formatTaskCode(id: string) {
  const taskNumber = id.match(/task-(\d+)$/i)?.[1];
  if (taskNumber) return `#${taskNumber}`;
  return `#${id}`;
}

function OfficeDock({
  artifacts,
  projectId,
  selectedArtifactOwner,
  plannedTasks,
  reviewingTasks,
  completedTasks,
  running,
  onOpenArtifactBox
}: {
  artifacts: Artifact[];
  projectId: ProjectId;
  selectedArtifactOwner: AgentProfile["name"];
  plannedTasks: TaskItem[];
  reviewingTasks: TaskItem[];
  completedTasks: TaskItem[];
  running: boolean;
  onOpenArtifactBox: () => void;
}) {
  const liveTask = reviewingTasks[0] || plannedTasks.find((task) => task.selected) || plannedTasks[0];
  const selectedArtifacts = artifacts.filter((artifact) => artifact.projectId === projectId && artifact.owner === selectedArtifactOwner && !artifact.archivedAt);
  const latestArtifact = [...selectedArtifacts].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

  return (
    <div
      data-agent-interactive="true"
      className="absolute inset-x-4 bottom-4 z-[150] grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.55fr)] items-center gap-3 rounded-xl border border-slate-800/85 bg-slate-950/78 px-3 py-2 shadow-[0_18px_56px_rgba(0,0,0,0.38)] backdrop-blur"
    >
      <div className="flex min-w-0 items-center gap-2">
        <DockMetric label="Backlog" value={plannedTasks.length} />
        <DockMetric label="Review" value={reviewingTasks.length} tone={reviewingTasks.length ? "attention" : "normal"} />
        <DockMetric label="Done" value={completedTasks.length} tone="done" />
      </div>

      <div className="flex min-w-0 items-center justify-center gap-2">
        <div className="min-w-[170px] max-w-[240px] truncate rounded-lg border border-slate-800/90 bg-slate-900/52 px-3 py-2 text-xs text-slate-300">
          {running ? "\u6b63\u5728\u6267\u884c\u4efb\u52a1..." : liveTask ? `${formatTaskCode(liveTask.id)} ${liveTask.title}` : "Office ready"}
        </div>
        <button
          type="button"
          onClick={onOpenArtifactBox}
          className="flex min-w-[230px] max-w-[320px] items-center gap-2 rounded-lg border border-emerald-400/18 bg-emerald-500/10 px-3 py-2 text-left transition hover:border-emerald-300/40 hover:bg-emerald-500/16"
          title={latestArtifact ? latestArtifact.title : `${selectedArtifactOwner} \u6682\u65e0\u4ea7\u51fa`}
        >
          <Archive className="h-4 w-4 shrink-0 text-emerald-300" />
          <span className="min-w-0">
            <span className="block truncate text-xs font-semibold text-emerald-100">Outputs selected {selectedArtifactOwner}</span>
            <span className="block truncate text-[10px] text-emerald-200/65">
              {selectedArtifacts.length} items{latestArtifact ? ` / ${latestArtifact.title}` : ""}
            </span>
          </span>
        </button>
      </div>
    </div>
  );
}

function DockMetric({ label, value, tone = "normal" }: { label: string; value: number; tone?: "normal" | "attention" | "done" }) {
  const toneClassName =
    tone === "attention"
      ? "text-amber-200 bg-amber-500/12"
      : tone === "done"
        ? "text-emerald-200 bg-emerald-500/12"
        : "text-slate-300 bg-slate-800/60";

  return (
    <div className={`min-w-[68px] rounded-lg px-2.5 py-2 ${toneClassName}`}>
      <p className="text-[10px] font-semibold uppercase tracking-normal opacity-70">{label}</p>
      <p className="mt-0.5 text-sm font-semibold">{value}</p>
    </div>
  );
}

function AgentFlowLines({ activeExecutors, collapsed }: { activeExecutors: Set<AgentProfile["name"]>; collapsed: boolean }) {
  const links: Array<{ name: AgentProfile["name"]; d: string }> = [
    { name: "Ray", d: "M50 0 C50 34 17 34 17 65" },
    { name: "Tiger", d: "M50 0 C50 34 50 34 50 65" },
    { name: "Musk", d: "M50 0 C50 34 83 34 83 65" }
  ];

  return (
    <svg
      aria-hidden="true"
      className={`pointer-events-none absolute inset-x-0 z-0 w-full overflow-visible ${collapsed ? "top-[78px] h-[110px]" : "top-[168px] h-[240px]"}`}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
    >
      {links.map((link) => {
        const active = activeExecutors.has(link.name);
        if (collapsed && !active) return null;

        return (
          <path
            key={link.name}
            d={link.d}
            data-agent-link={link.name}
            data-active={active ? "true" : "false"}
            className={`agent-link-path ${active ? "agent-link-path-active" : ""}`}
            pathLength="100"
          />
        );
      })}
    </svg>
  );
}

function AgentNode({
  agent,
  openAgentName,
  setOpenAgentName,
  variant,
  collapsed,
  onSelectArtifactOwner,
  selectedArtifactOwner
}: {
  agent: AgentProfile;
  openAgentName: AgentProfile["name"] | null;
  setOpenAgentName: (updater: (current: AgentProfile["name"] | null) => AgentProfile["name"] | null) => void;
  variant: "leader" | "executor";
  collapsed: boolean;
  onSelectArtifactOwner?: (owner: AgentProfile["name"]) => void;
  selectedArtifactOwner?: AgentProfile["name"];
}) {
  const status = displayStatus(agent);
  const isLeader = variant === "leader";
  const isOpen = openAgentName === agent.name;
  const isSelectedForOutputs = selectedArtifactOwner === agent.name;

  return (
    <div
      className={`relative min-w-0 overflow-visible rounded-lg px-4 text-center transition hover:bg-slate-900/24 ${
        isLeader
          ? `${collapsed ? "w-[28%] min-w-[180px] py-1" : "w-[34%] min-w-[220px] py-4"}`
          : `${collapsed ? "min-h-[92px] py-1" : "min-h-[176px] py-5"}`
      } ${isOpen ? "z-[95]" : "z-0"} ${isSelectedForOutputs ? "bg-sky-400/8 shadow-[inset_0_0_0_1px_rgba(56,189,248,0.16)]" : ""}`}
    >
      <button
        type="button"
        data-agent-interactive="true"
        onClick={() => {
          onSelectArtifactOwner?.(agent.name);
          setOpenAgentName((current) => (current === agent.name ? null : agent.name));
        }}
        className={`agent-avatar-wrap mx-auto rounded-full focus:outline-none focus:ring-2 focus:ring-sky-400/50 ${
          status.active ? "agent-progress-ring" : ""
        } ${isSelectedForOutputs ? "ring-2 ring-sky-300/55" : ""}`}
        title={`\u9009\u62e9 ${agent.name} \u5e76\u67e5\u770b\u4ecb\u7ecd`}
      >
        <span className={`grid place-items-center rounded-full font-semibold transition ${
          collapsed ? "h-12 w-12 text-lg" : "h-20 w-20 text-2xl"
        } ${toneClass[agent.tone]}`}>
          {agent.name.slice(0, 1)}
        </span>
      </button>
      <div className={`${collapsed ? "mt-2" : "mt-3"} flex h-6 items-center justify-center gap-2`}>
        {agent.name === "Lucy" ? (
          <span aria-hidden="true" className="inline-flex h-6 w-5 items-center justify-center text-base leading-none">
            {"\uD83D\uDC51"}
          </span>
        ) : null}
        <h3 className={`${collapsed ? "text-sm" : "text-lg"} font-semibold leading-6 text-slate-100`}>{agent.name}</h3>
        <span className={`inline-flex h-6 items-center justify-center gap-1.5 rounded-full px-2 text-xs font-medium ${status.className}`}>
          <span className={`status-dot ${status.dot}`} />
          {status.label}
        </span>
      </div>
      <p className={`${collapsed ? "hidden" : "mt-1"} truncate text-sm text-slate-400`}>{agent.role}</p>
      {isSelectedForOutputs && !collapsed ? (
        <p className="mt-2 text-xs font-medium text-sky-200">Outputs selected</p>
      ) : null}
      {isOpen ? <AgentDetailCard agent={agent} /> : null}
    </div>
  );
}

function ArtifactOutlet({
  owner,
  artifacts,
  loading,
  error,
  onClose
}: {
  owner: AgentProfile["name"] | null;
  artifacts: Artifact[];
  loading: boolean;
  error: string | null;
  onClose: () => void;
}) {
  if (!owner) return null;

  return (
    <div className="pointer-events-auto absolute inset-0 z-[120] flex items-center justify-center bg-[rgba(2,8,23,0.45)] p-4">
      <section className="w-[min(680px,95%)] max-h-[62%] overflow-hidden rounded-xl border border-slate-700 bg-[#08101b]/95 p-4 shadow-[0_24px_72px_rgba(0,0,0,0.55)] backdrop-blur">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <Archive className="h-4 w-4 shrink-0 text-emerald-300" />
            <h3 className="truncate text-sm font-semibold text-slate-100">{owner} {"\u4ea7\u51fa\u7bb1"}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-2 py-1 text-xs font-medium text-slate-300 transition hover:text-white"
          >
            {"\u5173\u95ed"}
          </button>
        </div>

        {loading ? <div className="py-8 text-sm text-slate-300">{"\u52a0\u8f7d\u4e2d..."}</div> : null}
        {error ? <div className="rounded-md border border-red-400/20 bg-red-500/12 px-3 py-2 text-sm text-red-200">{error}</div> : null}

        {!loading && !error ? (
          <div className="max-h-[46vh] overflow-auto space-y-2 pr-1 scrollbar-thin">
            {artifacts.length ? (
              artifacts.map((artifact) => {
                const href = artifact.accessUrl || artifact.sourceUrl || artifact.path || "";
                return (
                  <div key={artifact.id} className="rounded-lg border border-slate-800 bg-slate-950/55 px-3 py-2">
                    <div className="flex min-w-0 items-center gap-3">
                      {artifact.type === "image" && href ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={href}
                          alt={artifact.title}
                          className="h-14 w-14 shrink-0 rounded-md border border-slate-700/80 object-cover"
                        />
                      ) : (
                        <Boxes className="h-4 w-4 shrink-0 text-sky-300" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-100">{artifact.title}</p>
                        <p className="mt-1 text-xs text-slate-400">
                          {artifactTypeLabel(artifact.type)} / {artifact.owner} / {formatArtifactTime(artifact.createdAt)}
                        </p>
                      </div>
                      <a
                        href={href}
                        target="_blank"
                        rel="noreferrer"
                        className="grid h-8 w-8 place-items-center rounded-full text-slate-400 transition hover:bg-slate-800 hover:text-slate-100"
                        title="\u6253\u5f00"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </div>
                    {artifact.description ? (
                      <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-400">{artifact.description}</p>
                    ) : null}
                  </div>
                );
              })
            ) : (
              <div className="py-5 text-sm text-slate-400">{"\u8be5 Agent \u5f53\u524d\u6682\u65e0\u4ea7\u51fa\u3002"}</div>
            )}
          </div>
        ) : null}
      </section>
    </div>
  );
}

function popoverPosition(agent: AgentProfile) {
  return "left-1/2 -translate-x-1/2";
}

function AgentDetailCard({
  agent,
  compact = false,
  inCanvas = true
}: {
  agent: AgentProfile;
  compact?: boolean;
  inCanvas?: boolean;
}) {
  const status = displayStatus(agent);
  const detail = agentDetails[agent.name];
  const metaLine = agentMetaLine[agent.name] || agent.role;
  const positionedCardClass = inCanvas
    ? `absolute ${compact ? "top-12" : "top-[118px]"} ${popoverPosition(agent)} z-[80]`
    : "relative";

  return (
      <div
        data-agent-interactive="true"
        role="region"
        aria-label={`${agent.name} Agent \u4ecb\u7ecd`}
        className={`${positionedCardClass} w-[330px] rounded-xl border border-slate-700/90 bg-[#0b121c] p-5 text-left text-slate-100 shadow-[0_22px_70px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.05)]`}
      >
        {inCanvas ? (
          <span
            aria-hidden="true"
            className="absolute -top-[7px] left-1/2 h-3.5 w-3.5 -translate-x-1/2 rotate-45 border-l border-t border-slate-700/90 bg-[#0b121c]"
          />
        ) : null}
        <div className="flex items-center gap-4">
          <div className={`grid h-14 w-14 shrink-0 place-items-center rounded-full text-lg font-semibold ${toneClass[agent.tone]}`}>
            {agent.name.slice(0, 1)}
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-lg font-semibold text-slate-50">
              {agent.name} <span className="text-sm font-medium text-slate-400">({detail.genericRole})</span>
            </h3>
            <p className="mt-1 text-sm text-slate-400">{metaLine}</p>
            <div className="mt-2 flex items-center gap-2 text-sm font-medium text-emerald-300">
              <span className={`status-dot ${status.dot}`} />
              {status.label}
            </div>
          </div>
        </div>

        <div className="my-4 h-px bg-slate-800" />

        <p className="text-xs text-slate-500">{"\u7b80\u4ecb\uff1a"}</p>
        <p className="mt-2 text-sm leading-6 text-slate-300">{detail.intro}</p>

        <p className="mt-4 text-xs text-slate-500">{"\u6280\u80fd\uff1a"}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {detail.skills.map((skill) => (
            <span key={skill} className="rounded-full border border-slate-700/70 bg-slate-900/80 px-3 py-1.5 text-xs font-medium text-slate-300">
              {skill}
            </span>
          ))}
        </div>
      </div>
  );
}
