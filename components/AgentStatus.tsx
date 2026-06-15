"use client";

import {
  Bot,
  CheckSquare,
  ChevronDown,
  Cuboid,
  Database,
  History,
  Minus,
  PackageOpen,
  Plus,
  RotateCcw,
  Sparkles
} from "lucide-react";
import {
  BaseEdge,
  Background as FlowBackground,
  Handle,
  Position,
  ReactFlow,
  type Edge,
  type EdgeProps,
  type Node as FlowNode,
  type NodeProps,
  type Viewport
} from "@xyflow/react";
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent, type TouchEvent, type WheelEvent } from "react";
import type { AgentProfile, AgentStatus as AgentStatusValue, ProjectId, ProjectProfile } from "@/types/agent";
import type { TaskItem } from "@/types/task";
import type { Artifact } from "@/types/artifact";
import type { OfficeSetupSession, OfficeTemplate } from "@/types/provisioning";

type VirtualOfficeAgent = "setup" | "hermes" | `profile:${string}`;
type OfficeFlowViewportController = {
  getViewport: () => Viewport;
  setViewport: (viewport: Viewport, options?: { duration?: number }) => Promise<boolean> | boolean | void;
};

type AgentStatusProps = {
  agents: AgentProfile[];
  officeSetupSession?: OfficeSetupSession | null;
  running: boolean;
  connection: "Local Connected" | "Streaming" | "Error";
  projects: ProjectProfile[];
  projectId: ProjectId;
  onProjectChange: (projectId: ProjectId) => void;
  onCreateProject: (name: string) => void;
  officeTemplates?: OfficeTemplate[];
  officeTemplateId?: string;
  onOfficeTemplateChange?: (templateId: string) => void;
  selectedAgent?: AgentProfile["name"];
  selectedVirtualAgent?: VirtualOfficeAgent;
  officeActivity?: {
    agentNames: string[];
    routeTargetNames: string[];
  } | null;
  onSelectAgent?: (agentName: AgentProfile["name"]) => void;
  onSelectVirtualAgent?: (agentName: VirtualOfficeAgent) => void;
  tasks?: TaskItem[];
  onReviewTask?: (taskId: string) => void;
  activeOfficePanel?: "tasks" | "archive" | "outputs" | "history" | null;
  officeDockCounts?: {
    archive: number;
    outputs: number;
    history: number;
  };
  onOpenTaskDesk?: () => void;
  onOpenArchiveLibrary?: () => void;
  onOpenArtifactBox?: () => void;
  onOpenHistoryLog?: () => void;
  onArtifactsChange?: (artifacts: Artifact[]) => void;
  className?: string;
  collapsed?: boolean;
};

const toneClass = {
  violet: "bg-violet-200 text-violet-700 shadow-[0_0_0_5px_rgba(167,139,250,0.16)]",
  blue: "bg-blue-100 text-blue-700 shadow-[0_0_0_5px_rgba(96,165,250,0.16)]",
  amber: "bg-amber-100 text-amber-700 shadow-[0_0_0_5px_rgba(251,191,36,0.18)]",
  slate: "bg-slate-200 text-slate-700 shadow-[0_0_0_5px_rgba(148,163,184,0.14)]"
};

const systemAssistantAvatarClass = "bg-cyan-200 text-cyan-800 shadow-[0_0_0_5px_rgba(34,211,238,0.16)]";
const hermesChiefAvatarClass = "bg-amber-100 text-amber-800 shadow-[0_0_0_5px_rgba(245,158,11,0.14)]";
const chiefRoleDescription = "Coordinates agents and context";

function normalizeHermesAgentName(value?: string) {
  const clean = value?.trim();
  if (!clean || clean === "Chief Agent" || clean === "Hermes Agent" || clean === "Manager Agent") return "Chief";
  return clean;
}

function normalizeChiefRoleDescription(value?: string) {
  const clean = value?.trim();
  if (
    !clean ||
    clean === "Chief Agent" ||
    clean === "Chief / default Hermes" ||
    clean === "Chief Agent / project lead" ||
    clean === "Existing main Hermes Chief Agent" ||
    clean === "Connected Hermes Agent"
  ) {
    return chiefRoleDescription;
  }
  return clean;
}

function isOfficeAgentBusy(status?: AgentStatusValue, active?: boolean) {
  return Boolean(active || status === "working" || status === "coding" || status === "handoff" || status === "reviewing" || status === "waiting");
}

function officeAgentStatusLabel(status?: AgentStatusValue, active?: boolean) {
  if (isOfficeAgentBusy(status, active)) return "Working";
  if (status === "blocked") return "Blocked";
  if (status === "offline") return "Offline";
  return "Idle";
}

function taskOwnerDisplayAliases(owner: string) {
  const legacyMap: Record<string, string[]> = {
    Lucy: ["Chief"],
    Ray: ["Builder"],
    Tiger: ["Writer"],
    Musk: ["Operator"]
  };

  return [owner, ...(legacyMap[owner] || [])];
}

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
const DEFAULT_OFFICE_FLOW_VIEWPORT: Viewport = { x: 0, y: 20, zoom: 0.92 };
const COLLAPSED_OFFICE_FLOW_VIEWPORT: Viewport = { x: 0, y: -8, zoom: 0.62 };
const OFFICE_FLOW_MIN_ZOOM = 0.55;
const OFFICE_FLOW_MAX_ZOOM = 1.24;
const OFFICE_FLOW_ZOOM_STEP = 0.12;

function clampCanvasScale(value: number) {
  return Math.min(CANVAS_MAX_SCALE, Math.max(CANVAS_MIN_SCALE, value));
}

function getPinchDistance(touches: TouchEvent<HTMLDivElement>["touches"]) {
  if (touches.length < 2) return 0;
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.hypot(dx, dy);
}

function formatCanvasScale(scale: number) {
  return `${Math.round(scale * 100)}%`;
}

function getDefaultOfficeFlowViewport(collapsed: boolean): Viewport {
  return collapsed ? COLLAPSED_OFFICE_FLOW_VIEWPORT : DEFAULT_OFFICE_FLOW_VIEWPORT;
}

function getFlowControlScale(viewport: Viewport, defaultViewport: Viewport) {
  if (!defaultViewport.zoom) return 1;
  return viewport.zoom / defaultViewport.zoom;
}

type ArtifactsResponse = {
  ok: boolean;
  artifacts: Artifact[];
  error?: string;
};

const agentMetaLine: Partial<Record<AgentProfile["name"], string>> = {
  Lucy: "\u4e2d\u56fd\u5357\u4eac\uff1a\u672c\u5730 Hermes Agent",
  Ray: "\u4e2d\u56fd\u5357\u4eac\uff1a\u672c\u5730\u5f00\u53d1 Agent",
  Tiger: "\u4e2d\u56fd\u4e0a\u6d77\uff1a21.4.96.84",
  Musk: "\u7f8e\u56fd\u7845\u8c37\uff1a3.162.107.236"
};

function displayStatus(agent: AgentProfile) {
  if (agent.status === "blocked") {
    return {
      label: "Blocked",
      className: "bg-emerald-500/10 text-emerald-300 shadow-[inset_0_0_0_1px_rgba(52,211,153,0.1)]",
      dot: "bg-emerald-500",
      active: false
    };
  }

  if (agent.status === "offline") {
    return {
      label: "Offline",
      className: "bg-slate-500/10 text-slate-300 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.1)]",
      dot: "bg-slate-500",
      active: false
    };
  }

  if (agent.status === "waiting") {
    return {
      label: "Waiting",
      className: "bg-amber-500/10 text-amber-300 shadow-[inset_0_0_0_1px_rgba(251,191,36,0.1)]",
      dot: "bg-amber-500",
      active: false
    };
  }

  if (agent.status === "ready") {
    return {
      label: "Idle",
      className: "bg-emerald-500/10 text-emerald-300 shadow-[inset_0_0_0_1px_rgba(52,211,153,0.1)]",
      dot: "bg-emerald-500",
      active: false
    };
  }

  if (agent.status === "idle") {
    return {
      label: "Idle",
      className: "bg-emerald-500/10 text-emerald-300 shadow-[inset_0_0_0_1px_rgba(52,211,153,0.1)]",
      dot: "bg-emerald-500",
      active: false
    };
  }

  return {
    label: "Working",
    className: "bg-blue-500/10 text-blue-300 shadow-[inset_0_0_0_1px_rgba(96,165,250,0.1)]",
    dot: "bg-blue-400",
    active: true
  };
}

export function AgentStatus({
  agents,
  officeSetupSession = null,
  running,
  connection,
  projects,
  projectId,
  onProjectChange,
  onCreateProject,
  officeTemplates = [],
  officeTemplateId,
  onOfficeTemplateChange,
  selectedAgent,
  selectedVirtualAgent = "setup",
  officeActivity = null,
  onSelectAgent,
  onSelectVirtualAgent,
  tasks = [],
  activeOfficePanel = null,
  officeDockCounts,
  onOpenTaskDesk,
  onOpenArchiveLibrary,
  onOpenArtifactBox,
  onOpenHistoryLog,
  onArtifactsChange,
  className = "",
  collapsed = false
}: AgentStatusProps) {
  const [openAgentName, setOpenAgentName] = useState<AgentProfile["name"] | null>(null);
  const [artifactRegistry, setArtifactRegistry] = useState<Artifact[]>([]);
  const [canvasView, setCanvasView] = useState(DEFAULT_CANVAS_VIEW);
  const defaultFlowViewport = useMemo(() => getDefaultOfficeFlowViewport(collapsed), [collapsed]);
  const [flowViewport, setFlowViewport] = useState<Viewport>(() => defaultFlowViewport);
  const [setupAssistantOffset, setSetupAssistantOffset] = useState({ x: 0, y: 0 });
  const [chiefAgentOffset, setChiefAgentOffset] = useState({ x: 0, y: 0 });
  const [setupAssistantDetailOpen, setSetupAssistantDetailOpen] = useState(false);
  const [chiefAgentDetailOpen, setChiefAgentDetailOpen] = useState(false);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const officeFlowRef = useRef<OfficeFlowViewportController | null>(null);
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const touchGestureRef = useRef<
    | { mode: "pan"; x: number; y: number }
    | {
        mode: "pinch";
        startDistance: number;
        startScale: number;
      }
    | null
  >(null);
  const setupAssistantDragRef = useRef<{ x: number; y: number } | null>(null);
  const chiefAgentDragRef = useRef<{ x: number; y: number } | null>(null);
  void connection;
  void onCreateProject;
  const flowControlScale = getFlowControlScale(flowViewport, defaultFlowViewport);
  const officeActive = officeSetupSession?.status === "office_active";
  const activeOfficeAgentName =
    officeActive && selectedVirtualAgent === "hermes"
      ? agents[0]?.name
      : officeActive && selectedVirtualAgent.startsWith("profile:")
        ? officeSetupSession.agents.find((agent) => agent.profileName === selectedVirtualAgent.slice("profile:".length))?.displayName
        : null;
  const displayAgents =
    officeActive && running && activeOfficeAgentName
      ? agents.map((agent) => (agent.name === activeOfficeAgentName ? { ...agent, status: "working" as const } : agent))
      : agents;
  const leader = officeActive ? displayAgents[0] : displayAgents.find((agent) => agent.name === "Lucy");
  const executors = officeActive ? displayAgents.slice(1) : displayAgents.filter((agent) => agent.name !== "Lucy");
  const selectedAgentDetail = openAgentName ? displayAgents.find((agent) => agent.name === openAgentName) : null;
  const reviewingTasks = tasks.filter((task) => task.planStatus === "reviewing");
  const plannedTasks = tasks.filter((task) => task.planStatus === "planned" || task.planStatus === "selected");
  const completedTasks = tasks.filter((task) => task.planStatus === "completed");
  const activeTaskAgentNames = useMemo(() => {
    const names = new Set<string>();
    for (const task of tasks) {
      if (task.planStatus !== "executing" && task.planStatus !== "reviewing") continue;
      for (const name of taskOwnerDisplayAliases(task.owner)) {
        names.add(name);
      }
    }
    return names;
  }, [tasks]);
  const activeOfficeAgentNames = useMemo(
    () => new Set([...activeTaskAgentNames, ...(officeActivity?.agentNames || [])]),
    [activeTaskAgentNames, officeActivity]
  );
  const activeOfficeRouteTargetNames = useMemo(
    () => new Set(officeActivity?.routeTargetNames || []),
    [officeActivity]
  );
  const activeProject = projects.find((project) => project.id === projectId) || projects[0];
  const activeOfficeTemplateId = officeTemplateId || officeSetupSession?.officeTemplateId || officeTemplates[0]?.id || "";
  const activeOfficeTemplate =
    officeTemplates.find((template) => template.id === activeOfficeTemplateId) ||
    officeTemplates[0] ||
    (officeSetupSession
      ? {
          id: officeSetupSession.officeTemplateId,
          name: officeSetupSession.officeTemplateName,
          description: "",
          agents: []
        }
      : null);
  const officeStatusLabel =
    officeSetupSession?.status === "office_active"
      ? "Chief Agent online"
      : officeSetupSession?.status === "activation_review"
        ? "Review activation"
        : officeSetupSession?.status === "office_previewed"
          ? officeSetupSession.userPath === "existing_hermes"
            ? "Review activation"
            : "Office plan ready"
          : officeSetupSession?.status === "hermes_ready"
            ? "Hermes connected"
            : officeSetupSession?.status === "model_ready"
              ? "Office guide ready"
              : "Setup preview";
  const officeStatusDescription =
    officeSetupSession?.status === "office_active"
      ? "Your first Hermes Agent is ready."
      : officeSetupSession?.status === "activation_review"
        ? "Approve only when you are ready for the Chief Agent to go online."
        : officeSetupSession?.status === "office_previewed"
          ? officeSetupSession.userPath === "existing_hermes"
            ? "Approve only when you are ready for the Chief Agent to go online."
            : "Review the plan before activating anything."
          : officeSetupSession?.status === "hermes_ready"
            ? "Review activation before your Chief Agent goes online."
            : officeSetupSession?.status === "model_ready"
              ? "Ask it to help connect Hermes."
              : "Complete the guide first. Agents will appear here after they come online.";

  useEffect(() => {
    let active = true;

    function handleEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpenAgentName(null);
      setSetupAssistantDetailOpen(false);
      setChiefAgentDetailOpen(false);
    }

    async function loadArtifacts() {
      try {
        const response = await fetch(`/api/artifacts?projectId=${encodeURIComponent(projectId)}`, { cache: "no-store" });
        const data = (await response.json()) as ArtifactsResponse;
        if (!active || !response.ok || !data.ok) {
          throw new Error(data.error || `Load artifacts failed (${response.status})`);
        }

        setArtifactRegistry(data.artifacts);
        onArtifactsChange?.(data.artifacts);
      } catch (error) {
        if (!active) return;
        setArtifactRegistry([]);
        onArtifactsChange?.([]);
      }
    }

    window.addEventListener("keydown", handleEscape);
    void loadArtifacts();
    const timer = window.setInterval(loadArtifacts, 10000);

    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [onArtifactsChange, projectId]);

  useEffect(() => {
    setFlowViewport(defaultFlowViewport);
  }, [defaultFlowViewport]);

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
    const isInteractive = Boolean((event.target as HTMLElement).closest("[data-agent-interactive='true']"));
    if (isInteractive) return;

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
      setSetupAssistantDetailOpen(false);
      setChiefAgentDetailOpen(false);
    }
    if (isInteractive) return;
    event.preventDefault();
    dragRef.current = { x: event.clientX, y: event.clientY };
  }

  function handleCanvasMouseMove(event: MouseEvent<HTMLDivElement>) {
    const setupAssistantDrag = setupAssistantDragRef.current;
    if (setupAssistantDrag) {
      const deltaX = event.clientX - setupAssistantDrag.x;
      const deltaY = event.clientY - setupAssistantDrag.y;
      setupAssistantDragRef.current = { x: event.clientX, y: event.clientY };
      setSetupAssistantOffset((current) => ({ x: current.x + deltaX, y: current.y + deltaY }));
      return;
    }

    const chiefAgentDrag = chiefAgentDragRef.current;
    if (chiefAgentDrag) {
      const deltaX = event.clientX - chiefAgentDrag.x;
      const deltaY = event.clientY - chiefAgentDrag.y;
      chiefAgentDragRef.current = { x: event.clientX, y: event.clientY };
      setChiefAgentOffset((current) => ({ x: current.x + deltaX, y: current.y + deltaY }));
      return;
    }

    const drag = dragRef.current;
    if (!drag) return;
    const deltaX = event.clientX - drag.x;
    const deltaY = event.clientY - drag.y;
    dragRef.current = { x: event.clientX, y: event.clientY };
    setCanvasView((current) => ({ ...current, x: current.x + deltaX, y: current.y + deltaY }));
  }

  function handleCanvasMouseUp() {
    dragRef.current = null;
    setupAssistantDragRef.current = null;
    chiefAgentDragRef.current = null;
  }

  function resetCanvasView() {
    setCanvasView(DEFAULT_CANVAS_VIEW);
    setOfficeFlowViewport(defaultFlowViewport);
  }

  function setOfficeFlowViewport(viewport: Viewport) {
    setFlowViewport(viewport);
    void officeFlowRef.current?.setViewport(viewport, { duration: 120 });
  }

  function zoomOfficeFlow(direction: -1 | 1) {
    const current = officeFlowRef.current?.getViewport() || flowViewport;
    const nextZoom = Math.min(
      OFFICE_FLOW_MAX_ZOOM,
      Math.max(OFFICE_FLOW_MIN_ZOOM, current.zoom + defaultFlowViewport.zoom * OFFICE_FLOW_ZOOM_STEP * direction)
    );
    if (nextZoom === current.zoom) return;
    setOfficeFlowViewport({ ...current, zoom: nextZoom });
  }

  function handleCanvasTouchStart(event: TouchEvent<HTMLDivElement>) {
    const isInteractive = Boolean((event.target as HTMLElement).closest("[data-agent-interactive='true']"));
    if (!isInteractive) {
      setOpenAgentName(null);
      setSetupAssistantDetailOpen(false);
      setChiefAgentDetailOpen(false);
      if (event.touches.length === 1) {
        const touch = event.touches[0];
        touchGestureRef.current = { mode: "pan", x: touch.clientX, y: touch.clientY };
        event.preventDefault();
        return;
      }
    }

    if (isInteractive) return;

    if (event.touches.length >= 2) {
      const startDistance = getPinchDistance(event.touches);
      if (startDistance > 0) {
        touchGestureRef.current = {
          mode: "pinch",
          startDistance,
          startScale: canvasView.scale
        };
        event.preventDefault();
      }
    }
  }

  function handleCanvasTouchMove(event: TouchEvent<HTMLDivElement>) {
    const viewport = viewportRef.current?.getBoundingClientRect();
    const gesture = touchGestureRef.current;
    if (!gesture || !viewport) return;

    if (gesture.mode === "pan" && event.touches.length === 1) {
      const touch = event.touches[0];
      const deltaX = touch.clientX - gesture.x;
      const deltaY = touch.clientY - gesture.y;
      touchGestureRef.current = { ...gesture, x: touch.clientX, y: touch.clientY };
      setCanvasView((current) => ({ ...current, x: current.x + deltaX, y: current.y + deltaY }));
      event.preventDefault();
      return;
    }

    if (gesture.mode === "pinch" && event.touches.length >= 2) {
      const nextDistance = getPinchDistance(event.touches);
      if (!nextDistance) return;

      const anchorX = (event.touches[0].clientX + event.touches[1].clientX) / 2 - viewport.left - viewport.width / 2;
      const anchorY = (event.touches[0].clientY + event.touches[1].clientY) / 2 - viewport.top - viewport.height / 2;
      const nextScale = clampCanvasScale(gesture.startScale * (nextDistance / gesture.startDistance));
      setCanvasView((current) => {
        const ratio = nextScale / current.scale;
        return {
          scale: nextScale,
          x: anchorX - (anchorX - current.x) * ratio,
          y: anchorY - (anchorY - current.y) * ratio
        };
      });
      event.preventDefault();
    }
  }

  function handleCanvasTouchEnd() {
    touchGestureRef.current = null;
  }

  function handleSetupAssistantMouseDown(event: MouseEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    setupAssistantDragRef.current = { x: event.clientX, y: event.clientY };
  }

  function handleChiefAgentMouseDown(event: MouseEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    chiefAgentDragRef.current = { x: event.clientX, y: event.clientY };
  }

  if (agents.length === 0) {
    return (
      <section className={`frost relative isolate z-40 min-w-0 overflow-hidden rounded-xl ${className}`}>
        <div className="absolute inset-x-0 top-0 z-[140] flex h-16 items-center justify-between border-b border-slate-800/80 bg-slate-950/18 px-8 backdrop-blur-sm">
          <div className="flex min-w-0 items-center gap-4">
            <span className="grid h-10 w-10 place-items-center rounded-xl border border-violet-300/20 bg-violet-300/8 text-violet-200">
              <Cuboid className="h-5 w-5" />
            </span>
            <OfficeScopeControls
              templates={officeTemplates}
              templateId={activeOfficeTemplate?.id || activeOfficeTemplateId}
              templateName={activeOfficeTemplate?.name || "Agent Office"}
              projects={projects}
              projectId={activeProject?.id || projectId}
              projectName={activeProject?.name || (officeSetupSession?.status === "office_active" ? "Default Project" : "Setup preview")}
              onTemplateChange={onOfficeTemplateChange}
              onProjectChange={onProjectChange}
            />
          </div>
          <span className="grid h-10 w-10 place-items-center rounded-xl border border-slate-700/80 bg-slate-950/34 text-slate-200">
            <Sparkles className="h-5 w-5" />
          </span>
        </div>
        <div
          ref={viewportRef}
          className="absolute inset-x-0 bottom-0 top-16 z-10 cursor-grab select-none overflow-hidden rounded-b-xl transition-all duration-300 active:cursor-grabbing max-md:h-[360px]"
          onWheel={handleCanvasWheel}
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleCanvasMouseMove}
          onMouseUp={handleCanvasMouseUp}
          onMouseLeave={handleCanvasMouseUp}
          onTouchStart={handleCanvasTouchStart}
          onTouchMove={handleCanvasTouchMove}
          onTouchEnd={handleCanvasTouchEnd}
          onTouchCancel={handleCanvasTouchEnd}
        >
          {officeSetupSession?.status === "office_active" ? (
            <ActiveOfficeArchitecture
              session={officeSetupSession}
              canvasView={canvasView}
              viewport={flowViewport}
              onViewportChange={setFlowViewport}
              onFlowInit={(instance) => {
                officeFlowRef.current = instance;
              }}
              onSelectChief={() => onSelectVirtualAgent?.("hermes")}
            />
          ) : (
            <OnboardingArchitecturePreview
              viewport={flowViewport}
              onViewportChange={setFlowViewport}
              onFlowInit={(instance) => {
                officeFlowRef.current = instance;
              }}
            />
          )}
          <OfficeDock
            artifacts={artifactRegistry}
            projectId={projectId}
            activeOfficePanel={activeOfficePanel}
            counts={officeDockCounts}
            plannedTasks={plannedTasks}
            reviewingTasks={reviewingTasks}
            completedTasks={completedTasks}
            running={running}
            onOpenTaskDesk={onOpenTaskDesk}
            onOpenArchiveLibrary={onOpenArchiveLibrary}
            onOpenArtifactBox={onOpenArtifactBox}
            onOpenHistoryLog={onOpenHistoryLog}
          />
          <CanvasViewControls scale={flowControlScale} onZoomOut={() => zoomOfficeFlow(-1)} onReset={resetCanvasView} onZoomIn={() => zoomOfficeFlow(1)} />
        </div>
      </section>
    );
  }

  if (collapsed) {
    return (
      <section className={`frost relative z-40 flex min-w-0 shrink-0 items-center gap-4 rounded-xl p-4 ${className}`}>
        <div className="flex min-w-0 shrink-0 items-center gap-3">
          <Bot className="h-5 w-5 text-slate-300" />
          <OfficeScopeControls
            compact
            templates={officeTemplates}
            templateId={activeOfficeTemplate?.id || activeOfficeTemplateId}
            templateName={activeOfficeTemplate?.name || "Agent Office"}
            projects={projects}
            projectId={activeProject?.id || projectId}
            projectName={activeProject?.name || "Default Project"}
            onTemplateChange={onOfficeTemplateChange}
            onProjectChange={onProjectChange}
          />
          <TaskStatusPill plannedTasks={plannedTasks} reviewingTasks={reviewingTasks} running={running} />
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
                title={`Switch to ${agent.name}`}
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
      <section className={`frost relative isolate z-40 min-w-0 select-none overflow-hidden rounded-xl transition-all duration-300 ${collapsed ? "h-[260px] min-h-[240px]" : "h-full min-h-[520px]"} ${className}`}>
        <div
          data-agent-interactive="true"
          className="absolute left-4 top-4 z-[140] flex items-center gap-3 px-1 py-1"
        >
          <Bot className="h-5 w-5 shrink-0 text-slate-300" />
          <OfficeScopeControls
            templates={officeTemplates}
            templateId={activeOfficeTemplate?.id || activeOfficeTemplateId}
            templateName={activeOfficeTemplate?.name || "Agent Office"}
            projects={projects}
            projectId={activeProject?.id || projectId}
            projectName={activeProject?.name || "Default Project"}
            onTemplateChange={onOfficeTemplateChange}
            onProjectChange={onProjectChange}
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
          onTouchStart={handleCanvasTouchStart}
          onTouchMove={handleCanvasTouchMove}
          onTouchEnd={handleCanvasTouchEnd}
          onTouchCancel={handleCanvasTouchEnd}
        >
          <LiveAgentOfficeArchitecture
            leader={leader}
            executors={executors}
            collapsed={collapsed}
            running={running}
            activeAgentNames={activeOfficeAgentNames}
            activeRouteTargetNames={activeOfficeRouteTargetNames}
            openAgentName={openAgentName}
            setOpenAgentName={setOpenAgentName}
            viewport={flowViewport}
            onViewportChange={setFlowViewport}
            onFlowInit={(instance) => {
              officeFlowRef.current = instance;
            }}
          />

          <OfficeDock
            artifacts={artifactRegistry}
            projectId={projectId}
            activeOfficePanel={activeOfficePanel}
            counts={officeDockCounts}
            plannedTasks={plannedTasks}
            reviewingTasks={reviewingTasks}
            completedTasks={completedTasks}
            running={running}
            onOpenTaskDesk={onOpenTaskDesk}
            onOpenArchiveLibrary={onOpenArchiveLibrary}
            onOpenArtifactBox={onOpenArtifactBox}
            onOpenHistoryLog={onOpenHistoryLog}
          />
          <CanvasViewControls scale={flowControlScale} onZoomOut={() => zoomOfficeFlow(-1)} onReset={resetCanvasView} onZoomIn={() => zoomOfficeFlow(1)} />
        </div>
      </section>
  );
}

function OfficeScopeControls({
  templates,
  templateId,
  templateName,
  projects,
  projectId,
  projectName,
  onTemplateChange,
  onProjectChange,
  compact = false
}: {
  templates: OfficeTemplate[];
  templateId: string;
  templateName: string;
  projects: ProjectProfile[];
  projectId: ProjectId;
  projectName: string;
  onTemplateChange?: (templateId: string) => void;
  onProjectChange: (projectId: ProjectId) => void;
  compact?: boolean;
}) {
  const templateOptions = templates.length ? templates : templateId ? [{ id: templateId, name: templateName, description: "", agents: [] }] : [];
  const projectOptions = projects.length ? projects : projectId ? [{ id: projectId, name: projectName, mode: "", description: "" }] : [];

  return (
    <div
      data-agent-interactive="true"
      className={`pointer-events-auto flex min-w-0 items-center gap-2 ${compact ? "max-w-[420px]" : "max-w-[520px]"}`}
    >
      <ScopeDropdown
        label="Office team template"
        value={templateId}
        displayValue={templateName}
        options={templateOptions.map((template) => ({ value: template.id, label: template.name }))}
        onChange={(value) => onTemplateChange?.(value)}
        disabled={!onTemplateChange || templateOptions.length === 0}
        widthClass={compact ? "w-[150px]" : "w-[180px]"}
      />

      <ScopeDropdown
        label="Project"
        value={projectId}
        displayValue={projectName}
        options={projectOptions.map((project) => ({ value: project.id, label: project.name }))}
        onChange={onProjectChange}
        disabled={projectOptions.length === 0}
        widthClass={compact ? "w-[150px]" : "w-[170px]"}
      />
    </div>
  );
}

function ScopeDropdown({
  label,
  value,
  displayValue,
  options,
  onChange,
  disabled = false,
  widthClass
}: {
  label: string;
  value: string;
  displayValue: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  disabled?: boolean;
  widthClass: string;
}) {
  const [open, setOpen] = useState(false);
  const listboxId = useId();
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value)
  );
  const [activeIndex, setActiveIndex] = useState(selectedIndex);
  const selectedLabel = options[selectedIndex]?.label || displayValue;

  useEffect(() => {
    setActiveIndex(selectedIndex);
  }, [selectedIndex]);

  function closeDropdown() {
    setOpen(false);
    setActiveIndex(selectedIndex);
  }

  function chooseOption(index: number) {
    const option = options[index];
    if (!option) return;
    onChange(option.value);
    setOpen(false);
    window.requestAnimationFrame(() => buttonRef.current?.focus());
  }

  function moveActive(delta: number) {
    if (!options.length) return;
    setOpen(true);
    setActiveIndex((current) => {
      const base = open ? current : selectedIndex;
      return (base + delta + options.length) % options.length;
    });
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveActive(1);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveActive(-1);
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex(0);
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex(Math.max(0, options.length - 1));
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (open) {
        chooseOption(activeIndex);
      } else {
        setOpen(true);
        setActiveIndex(selectedIndex);
      }
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      closeDropdown();
    }
  }

  return (
    <div
      className={`relative min-w-0 ${widthClass}`}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          closeDropdown();
        }
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        onClick={() => {
          setOpen((current) => {
            const nextOpen = !current;
            if (nextOpen) setActiveIndex(selectedIndex);
            return nextOpen;
          });
        }}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        className="flex h-8 w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-950/50 px-3 text-left text-xs font-semibold text-slate-100 shadow-[0_10px_24px_rgba(0,0,0,0.24),inset_0_1px_0_rgba(255,255,255,0.03)] outline-none transition hover:border-slate-700 hover:bg-slate-900/70 focus:border-cyan-300/60 disabled:cursor-not-allowed disabled:opacity-70"
        title={label}
      >
        <span className="min-w-0 truncate">{selectedLabel}</span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-slate-500 transition ${open ? "rotate-180 text-cyan-200" : ""}`} aria-hidden="true" />
      </button>

      {open ? (
        <div
          id={listboxId}
          className="absolute left-0 right-0 top-9 z-[220] overflow-hidden rounded-lg border border-slate-800 bg-[#070d19] py-1 shadow-[0_18px_42px_rgba(0,0,0,0.45)]"
          role="listbox"
          aria-label={label}
        >
          {options.map((option, index) => {
            const selected = option.value === value;
            return (
              <button
                key={option.value}
                id={`${listboxId}-${index}`}
                type="button"
                role="option"
                aria-selected={selected}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => {
                  chooseOption(index);
                }}
                className={`flex h-8 w-full min-w-0 items-center px-3 text-left text-xs font-semibold transition ${
                  selected || activeIndex === index ? "bg-cyan-300/14 text-cyan-100" : "text-slate-300 hover:bg-slate-800/80 hover:text-slate-100"
                }`}
              >
                <span className="min-w-0 truncate">{option.label}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function CanvasViewControls({
  scale,
  onZoomOut,
  onReset,
  onZoomIn
}: {
  scale: number;
  onZoomOut: () => void;
  onReset: () => void;
  onZoomIn: () => void;
}) {
  return (
    <div
      data-agent-interactive="true"
      className="pointer-events-auto absolute right-4 top-4 z-[150] flex items-center gap-1 rounded-full border border-slate-800/70 bg-slate-950/75 px-2 py-1"
    >
      <button
        type="button"
        onClick={onZoomOut}
        className="grid h-7 w-7 place-items-center rounded-full text-slate-100 transition hover:bg-slate-800/70 focus:outline-none focus-visible:ring-1 focus-visible:ring-cyan-300/60"
        title="Zoom Out"
        aria-label="Zoom Out"
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <span className="min-w-[40px] px-2 text-center text-[11px] font-medium text-slate-300">{formatCanvasScale(scale)}</span>
      <button
        type="button"
        onClick={onReset}
        className="grid h-7 w-7 place-items-center rounded-full text-slate-100 transition hover:bg-slate-800/70 focus:outline-none focus-visible:ring-1 focus-visible:ring-cyan-300/60"
        title="Reset View"
        aria-label="Reset View"
      >
        <RotateCcw className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={onZoomIn}
        className="grid h-7 w-7 place-items-center rounded-full text-slate-100 transition hover:bg-slate-800/70 focus:outline-none focus-visible:ring-1 focus-visible:ring-cyan-300/60"
        title="Zoom In"
        aria-label="Zoom In"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function OnboardingArchitecturePreview({
  viewport,
  onViewportChange,
  onFlowInit
}: {
  viewport: Viewport;
  onViewportChange: (viewport: Viewport) => void;
  onFlowInit?: (instance: OfficeFlowViewportController) => void;
}) {
  const flowNodes = useMemo<FlowNode<OfficeCanvasNodeData>[]>(
    () => [
      {
        id: "chief",
        type: "officeAgent",
        initialWidth: 244,
        initialHeight: 162,
        position: { x: 332, y: 36 },
        data: {
          kind: "chief",
          label: "Chief",
          role: "Coordinates agents and context",
          initial: "C",
          tone: "chief"
        }
      },
      {
        id: "context-hub",
        type: "contextHub",
        initialWidth: 260,
        initialHeight: 94,
        position: { x: 324, y: 252 },
        data: {
          kind: "context",
          label: "Project Context Hub"
        }
      },
      {
        id: "worker-builder",
        type: "officeAgent",
        initialWidth: 232,
        initialHeight: 158,
        position: { x: 118, y: 424 },
        data: {
          kind: "worker",
          label: "Builder",
          role: "Builds and fixes",
          initial: "B",
          tone: "builder"
        }
      },
      {
        id: "worker-writer",
        type: "officeAgent",
        initialWidth: 232,
        initialHeight: 158,
        position: { x: 338, y: 424 },
        data: {
          kind: "worker",
          label: "Writer",
          role: "Publishes and summarizes",
          initial: "W",
          tone: "writer"
        }
      },
      {
        id: "worker-operator",
        type: "officeAgent",
        initialWidth: 232,
        initialHeight: 158,
        position: { x: 558, y: 424 },
        data: {
          kind: "worker",
          label: "Operator",
          role: "External tools and special skills",
          initial: "O",
          tone: "operator"
        }
      }
    ],
    []
  );

  const flowEdges = useMemo<Edge[]>(
    () => [
      {
        id: "chief-context",
        source: "chief",
        target: "context-hub",
        sourceHandle: "bottom",
        targetHandle: "top",
        type: "officeLink"
      },
      {
        id: "context-builder",
        source: "context-hub",
        target: "worker-builder",
        sourceHandle: "left",
        targetHandle: "top",
        type: "officeLink"
      },
      {
        id: "context-writer",
        source: "context-hub",
        target: "worker-writer",
        sourceHandle: "bottom",
        targetHandle: "top",
        type: "officeLink"
      },
      {
        id: "context-operator",
        source: "context-hub",
        target: "worker-operator",
        sourceHandle: "right",
        targetHandle: "top",
        type: "officeLink"
      }
    ],
    []
  );

  return (
    <div data-agent-interactive="true" className="absolute inset-0 h-full w-full text-left">
      <ReactFlow
        data-agent-interactive="true"
        className="office-flow-canvas"
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={officeNodeTypes}
        edgeTypes={officeEdgeTypes}
        viewport={viewport}
        onViewportChange={onViewportChange}
        onInit={onFlowInit}
        minZoom={0.62}
        maxZoom={1.24}
        panOnDrag
        zoomOnScroll
        zoomOnPinch
        zoomOnDoubleClick={false}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        fitView={false}
        proOptions={{ hideAttribution: true }}
      >
        <FlowBackground className="office-flow-background" color="rgba(65, 92, 124, 0.72)" gap={24} size={1.4} />
      </ReactFlow>
    </div>
  );
}

type OfficeCanvasNodeData = {
  kind: "chief" | "worker" | "context";
  label: string;
  role?: string;
  initial?: string;
  tone?: "chief" | "builder" | "writer" | "operator";
  busy?: boolean;
  statusLabel?: string;
  onSelect?: () => void;
};

const officeNodeTypes = {
  officeAgent: OfficeAgentFlowNode,
  contextHub: ContextHubFlowNode
};

const officeEdgeTypes = {
  officeLink: OfficeDashedEdge
};

function LiveAgentOfficeArchitecture({
  leader,
  executors,
  collapsed,
  running,
  activeAgentNames,
  activeRouteTargetNames,
  openAgentName,
  setOpenAgentName,
  viewport,
  onViewportChange,
  onFlowInit
}: {
  leader?: AgentProfile;
  executors: AgentProfile[];
  collapsed: boolean;
  running: boolean;
  activeAgentNames: ReadonlySet<string>;
  activeRouteTargetNames: ReadonlySet<string>;
  openAgentName: AgentProfile["name"] | null;
  setOpenAgentName: (agentName: AgentProfile["name"] | null) => void;
  viewport: Viewport;
  onViewportChange: (viewport: Viewport) => void;
  onFlowInit?: (instance: OfficeFlowViewportController) => void;
}) {
  const visibleExecutors = useMemo(() => executors.slice(0, 3), [executors]);
  const selectedAgent = openAgentName ? [leader, ...executors].find((agent): agent is AgentProfile => Boolean(agent && agent.name === openAgentName)) : null;
  const leaderBusy = Boolean(leader && (isOfficeAgentBusy(leader.status) || activeAgentNames.has(leader.name) || (running && activeAgentNames.size === 0)));

  function handleOfficeFlowClick(event: MouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    const interactiveHost = target.closest("[data-agent-interactive='true']");
    if (target.closest(".react-flow__node") || (interactiveHost && interactiveHost !== event.currentTarget)) return;
    setOpenAgentName(null);
  }

  const flowNodes = useMemo<FlowNode<OfficeCanvasNodeData>[]>(
    () => [
      ...(leader
        ? [
            {
              id: `agent-${leader.name}`,
              type: "officeAgent",
              initialWidth: 244,
              initialHeight: 162,
              position: { x: 332, y: 36 },
              data: {
                kind: "chief" as const,
                label: leader.name,
                role: normalizeChiefRoleDescription(leader.role),
                initial: leader.name.slice(0, 1).toUpperCase(),
                tone: "chief" as const,
                busy: leaderBusy,
                statusLabel: officeAgentStatusLabel(leader.status, leaderBusy),
                onSelect: () => setOpenAgentName(openAgentName === leader.name ? null : leader.name)
              }
            }
          ]
        : []),
      {
        id: "context-hub",
        type: "contextHub",
        initialWidth: 260,
        initialHeight: 94,
        position: { x: 324, y: 252 },
        data: {
          kind: "context",
          label: "Project Context Hub"
        }
      },
      ...visibleExecutors.map((agent, index) => {
        const agentBusy = isOfficeAgentBusy(agent.status) || activeAgentNames.has(agent.name);

        return {
          id: `agent-${agent.name}`,
          type: "officeAgent",
          initialWidth: 232,
          initialHeight: 158,
          position: [
            { x: 118, y: 424 },
            { x: 338, y: 424 },
            { x: 558, y: 424 }
          ][index],
          data: {
            kind: "worker" as const,
            label: agent.name,
            role: agent.role,
            initial: agent.name.slice(0, 1).toUpperCase(),
            tone: (["builder", "writer", "operator"] as const)[index] || "builder",
            busy: agentBusy,
            statusLabel: officeAgentStatusLabel(agent.status, agentBusy),
            onSelect: () => setOpenAgentName(openAgentName === agent.name ? null : agent.name)
          }
        };
      })
    ],
    [activeAgentNames, leader, leaderBusy, openAgentName, setOpenAgentName, visibleExecutors]
  );

  const flowEdges = useMemo<Edge[]>(
    () => [
      ...(leader
        ? [
            {
              id: "chief-context",
              source: `agent-${leader.name}`,
              target: "context-hub",
              sourceHandle: "bottom",
              targetHandle: "top",
              type: "officeLink",
              data: {
                active: leaderBusy || activeRouteTargetNames.size > 0
              }
            }
          ]
        : []),
      ...visibleExecutors.map((agent, index) => ({
        id: `context-${agent.name}`,
        source: "context-hub",
        target: `agent-${agent.name}`,
        sourceHandle: index === 0 ? "left" : index === 1 ? "bottom" : "right",
        targetHandle: "top",
        type: "officeLink",
        data: {
          active: activeRouteTargetNames.has(agent.name) || activeAgentNames.has(agent.name)
        }
      }))
    ],
    [activeAgentNames, activeRouteTargetNames, leader, leaderBusy, visibleExecutors]
  );
  const flowKey = useMemo(
    () => [leader?.name || "no-chief", ...visibleExecutors.map((agent) => agent.name)].join("|"),
    [leader?.name, visibleExecutors]
  );

  return (
    <div data-agent-interactive="true" className="absolute inset-0 z-0 h-full w-full text-left" onClickCapture={handleOfficeFlowClick}>
      <ReactFlow
        key={flowKey}
        className="office-flow-canvas"
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={officeNodeTypes}
        edgeTypes={officeEdgeTypes}
        viewport={viewport}
        onViewportChange={onViewportChange}
        onInit={onFlowInit}
        minZoom={0.55}
        maxZoom={1.24}
        panOnDrag
        zoomOnScroll
        zoomOnPinch
        zoomOnDoubleClick={false}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        onPaneClick={() => setOpenAgentName(null)}
        fitView={false}
        proOptions={{ hideAttribution: true }}
      >
        <FlowBackground className="office-flow-background" color="rgba(65, 92, 124, 0.72)" gap={24} size={1.4} />
      </ReactFlow>
      {selectedAgent ? (
        <div data-agent-interactive="true" className="absolute left-5 top-20 z-[170] w-[min(360px,calc(100%-40px))]">
          <AgentDetailCard agent={selectedAgent} compact inCanvas={false} />
        </div>
      ) : null}
    </div>
  );
}

function ActiveOfficeArchitecture({
  session,
  canvasView,
  viewport,
  onViewportChange,
  onFlowInit,
  onSelectChief
}: {
  session: OfficeSetupSession;
  canvasView: { x: number; y: number; scale: number };
  viewport: Viewport;
  onViewportChange: (viewport: Viewport) => void;
  onFlowInit?: (instance: OfficeFlowViewportController) => void;
  onSelectChief: () => void;
}) {
  void canvasView;

  const chief = session.agents.find((agent) => agent.isChief) || session.agents[0];
  const workers = session.agents.filter((agent) => !agent.isChief);

  const workerNodes = useMemo(
    () =>
      workers.slice(0, 3).map((agent, index) => ({
        id: `worker-${agent.profileName}`,
        type: "officeAgent",
        initialWidth: 232,
        initialHeight: 158,
        position: [
          { x: 118, y: 424 },
          { x: 338, y: 424 },
          { x: 558, y: 424 }
        ][index],
        data: {
          kind: "worker" as const,
          label: agent.displayName,
          role: agent.role,
          initial: agent.displayName.slice(0, 1).toUpperCase(),
          tone: (["builder", "writer", "operator"] as const)[index] || "builder",
          statusLabel: officeAgentStatusLabel()
        }
      })),
    [workers]
  );

  const flowNodes = useMemo<FlowNode<OfficeCanvasNodeData>[]>(
    () => [
      {
        id: "chief",
        type: "officeAgent",
        initialWidth: 244,
        initialHeight: 162,
        position: { x: 332, y: 36 },
        data: {
          kind: "chief",
          label: chief?.displayName || "Chief",
          role: normalizeChiefRoleDescription(chief?.role),
          initial: (chief?.displayName || "C").slice(0, 1).toUpperCase(),
          tone: "chief",
          statusLabel: officeAgentStatusLabel(),
          onSelect: onSelectChief
        }
      },
      {
        id: "context-hub",
        type: "contextHub",
        initialWidth: 260,
        initialHeight: 94,
        position: { x: 324, y: 252 },
        data: {
          kind: "context",
          label: "Project Context Hub"
        }
      },
      ...workerNodes
    ],
    [chief?.displayName, chief?.role, onSelectChief, workerNodes]
  );

  const flowEdges = useMemo<Edge[]>(
    () => [
      {
        id: "chief-context",
        source: "chief",
        target: "context-hub",
        sourceHandle: "bottom",
        targetHandle: "top",
        type: "officeLink"
      },
      ...workers.slice(0, 3).map((agent, index) => ({
        id: `context-${agent.profileName}`,
        source: "context-hub",
        target: `worker-${agent.profileName}`,
        sourceHandle: index === 0 ? "left" : index === 1 ? "bottom" : "right",
        targetHandle: "top",
        type: "officeLink"
      }))
    ],
    [workers]
  );

  return (
    <div data-agent-interactive="true" className="absolute inset-0 z-0 h-full w-full text-left">
      <ReactFlow
        data-agent-interactive="true"
        className="office-flow-canvas"
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={officeNodeTypes}
        edgeTypes={officeEdgeTypes}
        viewport={viewport}
        onViewportChange={onViewportChange}
        onInit={onFlowInit}
        minZoom={0.62}
        maxZoom={1.24}
        panOnDrag
        zoomOnScroll
        zoomOnPinch
        zoomOnDoubleClick={false}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        fitView={false}
        proOptions={{ hideAttribution: true }}
      >
        <FlowBackground className="office-flow-background" color="rgba(65, 92, 124, 0.72)" gap={24} size={1.4} />
      </ReactFlow>
    </div>
  );
}

function OfficeAgentFlowNode({ data }: NodeProps<FlowNode<OfficeCanvasNodeData>>) {
  const isChief = data.kind === "chief";
  const isInteractive = Boolean(data.onSelect);
  const statusLabel = data.statusLabel || officeAgentStatusLabel();
  const content = (
    <>
      <div className={`office-flow-avatar-frame ${data.busy ? "office-flow-avatar-frame-busy" : ""}`}>
        <div className={`office-flow-avatar office-flow-avatar-${data.tone || "builder"}`}>
          <span>{data.initial}</span>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-center gap-2">
        <p className="max-w-[160px] truncate text-xl font-semibold leading-6 text-slate-50">
          {isChief ? (
            <span className="mr-1.5" aria-hidden="true">
              {"\uD83D\uDC51"}
            </span>
          ) : null}
          {data.label}
        </p>
        <span className={`office-flow-status ${data.busy ? "office-flow-status-busy" : ""}`}>
          <span className={`status-dot ${data.busy ? "bg-sky-300" : "bg-emerald-300"}`} />
          {statusLabel}
        </span>
      </div>
      {data.role ? <p className="mt-1.5 truncate text-sm leading-5 text-slate-300">{data.role}</p> : null}
    </>
  );

  return (
    <div className={`office-flow-agent-node ${isChief ? "office-flow-agent-node-chief" : ""}`}>
      <Handle id="top" type="target" position={Position.Top} className="office-flow-handle" />
      {isInteractive ? (
        <button
          type="button"
          data-agent-interactive="true"
          className="office-flow-agent-button"
          onClick={(event) => {
            event.stopPropagation();
            data.onSelect?.();
          }}
          title={`Open ${data.label} Agent detail`}
          aria-label={`Open ${data.label} Agent detail`}
        >
          {content}
        </button>
      ) : (
        <div className="office-flow-agent-static">{content}</div>
      )}
      <Handle id="bottom" type="source" position={Position.Bottom} className="office-flow-handle" />
    </div>
  );
}

function ContextHubFlowNode() {
  return (
    <div className="office-flow-context-node">
      <Handle id="top" type="target" position={Position.Top} className="office-flow-handle" />
      <Handle id="left" type="source" position={Position.Left} className="office-flow-handle" />
      <Handle id="right" type="source" position={Position.Right} className="office-flow-handle" />
      <Handle id="bottom" type="source" position={Position.Bottom} className="office-flow-handle" />
      <div className="flex items-center justify-center gap-3">
        <span className="grid h-8 w-8 place-items-center rounded-xl border border-sky-200/30 bg-sky-300/10 text-sky-100">
          <Database className="h-4 w-4" />
        </span>
        <p className="text-base font-semibold text-slate-50">Project Context Hub</p>
      </div>
      <div className="mt-4 flex items-center justify-center gap-2">
        <span className="office-flow-context-chip office-flow-context-chip-memory">Memory</span>
        <span className="office-flow-context-chip office-flow-context-chip-knowledge">Knowledge</span>
        <span className="office-flow-context-chip office-flow-context-chip-state">State</span>
      </div>
    </div>
  );
}

function roundedOfficePath(points: Array<{ x: number; y: number }>, radius = 22) {
  if (points.length < 2) return "";

  let path = `M ${points[0].x} ${points[0].y}`;
  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const next = points[index + 1];
    const previousDistance = Math.hypot(current.x - previous.x, current.y - previous.y);
    const nextDistance = Math.hypot(next.x - current.x, next.y - current.y);
    const cornerRadius = Math.min(radius, previousDistance / 2, nextDistance / 2);

    if (cornerRadius <= 0) {
      path += ` L ${current.x} ${current.y}`;
      continue;
    }

    const start = {
      x: current.x + ((previous.x - current.x) / previousDistance) * cornerRadius,
      y: current.y + ((previous.y - current.y) / previousDistance) * cornerRadius
    };
    const end = {
      x: current.x + ((next.x - current.x) / nextDistance) * cornerRadius,
      y: current.y + ((next.y - current.y) / nextDistance) * cornerRadius
    };

    path += ` L ${start.x} ${start.y} Q ${current.x} ${current.y} ${end.x} ${end.y}`;
  }

  const last = points[points.length - 1];
  return `${path} L ${last.x} ${last.y}`;
}

function officeEdgePath(props: EdgeProps) {
  const source = { x: props.sourceX, y: props.sourceY };
  const target = { x: props.targetX, y: props.targetY };

  if (props.sourcePosition === Position.Left || props.sourcePosition === Position.Right) {
    return roundedOfficePath([source, { x: target.x, y: source.y }, target]);
  }

  if (Math.abs(source.x - target.x) < 8) {
    return roundedOfficePath([source, target]);
  }

  const middleY = source.y + (target.y - source.y) * 0.5;
  return roundedOfficePath([source, { x: source.x, y: middleY }, { x: target.x, y: middleY }, target]);
}

function OfficeDashedEdge(props: EdgeProps) {
  const edgePath = officeEdgePath(props);
  const active = Boolean((props.data as { active?: boolean } | undefined)?.active);

  return (
    <>
      <BaseEdge
        id={props.id + "-glow"}
        path={edgePath}
        style={{
          stroke: active ? "rgba(34, 211, 238, 0.32)" : "rgba(34, 211, 238, 0.18)",
          strokeWidth: active ? 5 : 4,
          strokeLinecap: "round",
          filter: active ? "drop-shadow(0 0 8px rgba(56, 189, 248, 0.36))" : undefined,
          vectorEffect: "non-scaling-stroke"
        }}
      />
      <BaseEdge
        id={props.id}
        path={edgePath}
        style={{
          stroke: active ? "rgba(165, 243, 252, 0.96)" : "rgba(125, 211, 252, 0.86)",
          strokeWidth: active ? 1.8 : 1.5,
          strokeDasharray: active ? "8 10" : "5 7",
          animation: active ? "agent-link-flow 1.15s linear infinite" : undefined,
          strokeLinecap: "round",
          vectorEffect: "non-scaling-stroke"
        }}
      />
      <circle cx={props.sourceX} cy={props.sourceY} r={active ? "4.8" : "4.2"} fill="#67e8f9" stroke="#0f3448" strokeWidth="1.6" />
      <circle cx={props.targetX} cy={props.targetY} r={active ? "4.8" : "4.2"} fill="#67e8f9" stroke="#0f3448" strokeWidth="1.6" />
    </>
  );
}

function SetupAssistantCanvasNode({
  busy,
  active,
  chiefName,
  compact = false,
  detailPlacement = "bottom",
  detailOpen,
  offset,
  onMouseDown,
  onToggleDetail
}: {
  busy: boolean;
  active: boolean;
  chiefName: string;
  compact?: boolean;
  detailPlacement?: "bottom" | "top";
  detailOpen: boolean;
  offset: { x: number; y: number };
  onMouseDown: (event: MouseEvent<HTMLDivElement>) => void;
  onToggleDetail: () => void;
}) {
  const displayName = chiefName;
  const roleLabel = "Chief Agent";
  const detailTitle = "View Chief Agent details";
  const avatarLabel = (displayName.trim().slice(0, 1) || "H").toUpperCase();
  const statusLabel = busy ? "Working" : active ? "Online" : "Online";
  const statusClass = busy
    ? "bg-blue-500/10 text-blue-300 shadow-[inset_0_0_0_1px_rgba(96,165,250,0.1)]"
    : "bg-emerald-500/10 text-emerald-300 shadow-[inset_0_0_0_1px_rgba(52,211,153,0.1)]";
  const statusDot = busy ? "bg-blue-400" : "bg-emerald-500";

  return (
    <div
      data-agent-interactive="true"
      className={`relative flex min-w-0 cursor-grab flex-col items-center overflow-visible rounded-lg text-center transition hover:bg-slate-900/24 active:cursor-grabbing ${
        compact ? "px-3 py-2" : "px-4 py-4"
      } ${
        detailOpen ? "z-[95]" : "z-0"
      }`}
      onMouseDown={onMouseDown}
      style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}
    >
      <button
        type="button"
        data-agent-interactive="true"
        onMouseDown={(event) => event.stopPropagation()}
        onClick={onToggleDetail}
        className={`agent-avatar-wrap mx-auto rounded-full focus:outline-none focus:ring-2 focus:ring-sky-400/50 ${
          busy ? "agent-progress-ring" : ""
        }`}
        title={detailTitle}
      >
        <span className={`grid place-items-center rounded-full font-semibold transition ${
          compact ? "h-12 w-12 text-base" : "h-20 w-20 text-2xl"
        } ${hermesChiefAvatarClass}`}>
          {avatarLabel}
        </span>
      </button>
      <div className={`${compact ? "mt-2" : "mt-3"} flex h-6 items-center justify-center gap-2`}>
        <h3 className={`${compact ? "text-sm" : "text-lg"} font-semibold leading-6 text-slate-100`}>{displayName}</h3>
        <span className={`inline-flex items-center justify-center gap-1.5 rounded-full text-xs font-medium ${compact ? "h-5 px-1.5" : "h-6 px-2"} ${statusClass}`}>
          <span className={`status-dot ${statusDot}`} />
          {compact ? null : statusLabel}
        </span>
      </div>
      <p className={`${compact ? "mt-0.5 text-xs" : "mt-1 text-sm"} text-slate-400`}>{roleLabel}</p>
      {detailOpen ? (
        <SetupAssistantDetailCard
          busy={busy}
          active={active}
          chiefName={chiefName}
          compact={compact}
          placement={detailPlacement}
        />
      ) : null}
    </div>
  );
}

function SetupAssistantDetailCard({
  busy,
  active,
  chiefName,
  compact = false,
  placement = "bottom"
}: {
  busy: boolean;
  active: boolean;
  chiefName: string;
  compact?: boolean;
  placement?: "bottom" | "top";
}) {
  const statusLabel = busy ? "Working" : "Online";
  const statusDot = busy ? "bg-blue-400" : "bg-emerald-500";
  const statusText = busy ? "text-blue-300" : "text-emerald-300";
  const displayName = chiefName;
  const roleLabel = "Chief Agent";
  const avatarLabel = (displayName.trim().slice(0, 1) || "H").toUpperCase();
  const intro = "Runs as the first connected Hermes Agent for this office. Vibe Office will still ask before adding more Agents or sharing more files.";

  return (
    <div
      data-agent-interactive="true"
      role="region"
      aria-label="Chief Agent details"
      className={`absolute z-[80] w-[330px] rounded-xl border border-slate-700/90 bg-[#0b121c] p-5 text-left text-slate-100 shadow-[0_22px_70px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.05)] ${
        placement === "top" && compact
          ? "bottom-[92px] left-0"
          : "left-1/2 top-[118px] -translate-x-1/2"
      }`}
    >
      <span
        aria-hidden="true"
        className={`absolute h-3.5 w-3.5 rotate-45 bg-[#0b121c] ${
          placement === "top" && compact
            ? "-bottom-[7px] left-9 border-b border-r border-slate-700/90"
            : "-top-[7px] left-1/2 -translate-x-1/2 border-l border-t border-slate-700/90"
        }`}
      />
      <div className="flex items-center gap-4">
        <div className={`grid h-14 w-14 shrink-0 place-items-center rounded-full text-lg font-semibold ${hermesChiefAvatarClass}`}>
          {avatarLabel}
        </div>
        <div className="min-w-0">
          <h3 className="truncate text-lg font-semibold text-slate-50">
            {displayName} <span className="text-sm font-medium text-slate-400">(Chief Agent)</span>
          </h3>
          <p className="mt-1 text-sm text-slate-400">{roleLabel}</p>
          <div className={`mt-2 flex items-center gap-2 text-sm font-medium ${statusText}`}>
            <span className={`status-dot ${statusDot}`} />
            {statusLabel}
          </div>
        </div>
      </div>

      <div className="my-4 h-px bg-slate-800" />

      <p className="text-xs text-slate-500">Intro:</p>
      <p className="mt-2 text-sm leading-6 text-slate-300">{intro}</p>

      <p className="mt-4 text-xs text-slate-500">Skills:</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {["Answer questions", "Use Hermes", "Request permission", "Guide next steps"].map((skill) => (
          <span key={skill} className="rounded-full border border-slate-700/70 bg-slate-900/80 px-3 py-1.5 text-xs font-medium text-slate-300">
            {skill}
          </span>
        ))}
      </div>
    </div>
  );
}

function formatTaskCode(id: string) {
  const taskNumber = id.match(/task-(\d+)$/i)?.[1];
  if (taskNumber) return `#${taskNumber}`;
  return `#${id}`;
}

function TaskStatusPill({
  plannedTasks,
  reviewingTasks,
  running
}: {
  plannedTasks: TaskItem[];
  reviewingTasks: TaskItem[];
  running: boolean;
}) {
  const liveTask = reviewingTasks[0] || plannedTasks.find((task) => task.selected) || plannedTasks[0];

  return (
    <div className="hidden max-w-[340px] truncate rounded-full border border-slate-800/80 bg-slate-950/60 px-3 py-1 text-xs text-slate-400 shadow-[0_10px_30px_rgba(0,0,0,0.22)] backdrop-blur lg:block">
      {running ? "\u6b63\u5728\u6267\u884c\u4efb\u52a1..." : liveTask ? `${formatTaskCode(liveTask.id)} ${liveTask.title}` : "Office ready"}
    </div>
  );
}

function OfficeDock({
  artifacts,
  projectId,
  activeOfficePanel,
  counts,
  plannedTasks,
  reviewingTasks,
  completedTasks,
  running,
  onOpenTaskDesk,
  onOpenArchiveLibrary,
  onOpenArtifactBox,
  onOpenHistoryLog
}: {
  artifacts: Artifact[];
  projectId: ProjectId;
  activeOfficePanel: "tasks" | "archive" | "outputs" | "history" | null;
  counts?: {
    archive: number;
    outputs: number;
    history: number;
  };
  plannedTasks: TaskItem[];
  reviewingTasks: TaskItem[];
  completedTasks: TaskItem[];
  running: boolean;
  onOpenTaskDesk?: () => void;
  onOpenArchiveLibrary?: () => void;
  onOpenArtifactBox?: () => void;
  onOpenHistoryLog?: () => void;
}) {
  const projectArtifacts = artifacts.filter((artifact) => !artifact.archivedAt);
  const contextCount = counts?.archive ?? projectArtifacts.length;
  const outputsCount = counts?.outputs ?? projectArtifacts.length;

  return (
    <div
      data-agent-interactive="true"
      className="absolute inset-x-4 bottom-4 z-[150] grid grid-cols-4 items-center gap-2"
    >
      <button
        type="button"
        onClick={onOpenTaskDesk}
        className={`flex h-14 w-full min-w-0 items-center gap-2 rounded-lg border px-2 py-1.5 text-left shadow-[0_12px_30px_rgba(0,0,0,0.24),inset_0_1px_0_rgba(255,255,255,0.035)] transition duration-150 ease-out hover:-translate-y-0.5 hover:shadow-[0_16px_36px_rgba(0,0,0,0.32),inset_0_1px_0_rgba(255,255,255,0.055)] active:translate-y-0 ${
          activeOfficePanel === "tasks"
            ? "border-sky-300/55 bg-sky-500/22"
            : "border-slate-700/85 bg-[#111a28] hover:border-sky-400/40 hover:bg-[#172234]"
        }`}
      >
        <CheckSquare className="h-4 w-4 shrink-0 text-slate-300" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-semibold text-slate-100">Task Desk</span>
          <span className="block truncate text-[10px] text-slate-400">
            {plannedTasks.length} backlog / {reviewingTasks.length} review / {completedTasks.length} done
          </span>
        </span>
      </button>

      <button
        type="button"
        onClick={onOpenArchiveLibrary}
        className={`flex h-14 w-full min-w-0 items-center gap-2 rounded-lg border px-2 py-1.5 text-left shadow-[0_12px_30px_rgba(0,0,0,0.24),inset_0_1px_0_rgba(255,255,255,0.035)] transition duration-150 ease-out hover:-translate-y-0.5 hover:shadow-[0_16px_36px_rgba(0,0,0,0.32),inset_0_1px_0_rgba(255,255,255,0.055)] active:translate-y-0 ${
          activeOfficePanel === "archive"
            ? "border-emerald-300/55 bg-emerald-500/20"
            : "border-slate-700/85 bg-[#111a28] hover:border-emerald-400/40 hover:bg-[#172234]"
        }`}
      >
        <Database className="h-4 w-4 shrink-0 text-emerald-300" />
        <span className="min-w-0">
          <span className="block truncate text-xs font-semibold text-slate-100">Project Context Hub</span>
          <span className="block truncate text-[10px] text-slate-400">{contextCount} context files</span>
        </span>
      </button>

      <button
        type="button"
        onClick={onOpenArtifactBox}
        className={`flex h-14 w-full min-w-0 items-center gap-2 rounded-lg border px-2 py-1.5 text-left shadow-[0_12px_30px_rgba(0,0,0,0.24),inset_0_1px_0_rgba(255,255,255,0.035)] transition duration-150 ease-out hover:-translate-y-0.5 hover:shadow-[0_16px_36px_rgba(0,0,0,0.32),inset_0_1px_0_rgba(255,255,255,0.055)] active:translate-y-0 ${
          activeOfficePanel === "outputs"
            ? "border-emerald-300/55 bg-emerald-500/20"
            : "border-slate-700/85 bg-[#111a28] hover:border-emerald-400/40 hover:bg-[#172234]"
        }`}
        title="Materials & Outputs"
      >
        <PackageOpen className="h-4 w-4 shrink-0 text-emerald-300" />
        <span className="min-w-0">
          <span className="block truncate text-xs font-semibold text-slate-100">Materials & Outputs</span>
          <span className="block truncate text-[10px] text-slate-400">{outputsCount} files</span>
        </span>
      </button>

      <button
        type="button"
        onClick={onOpenHistoryLog}
        className={`flex h-14 w-full min-w-0 items-center gap-2 rounded-lg border px-2 py-1.5 text-left shadow-[0_12px_30px_rgba(0,0,0,0.24),inset_0_1px_0_rgba(255,255,255,0.035)] transition duration-150 ease-out hover:-translate-y-0.5 hover:shadow-[0_16px_36px_rgba(0,0,0,0.32),inset_0_1px_0_rgba(255,255,255,0.055)] active:translate-y-0 ${
          activeOfficePanel === "history"
            ? "border-cyan-300/55 bg-cyan-500/20"
            : "border-slate-700/85 bg-[#111a28] hover:border-cyan-400/40 hover:bg-[#172234]"
        }`}
      >
          <History className="h-4 w-4 shrink-0 text-cyan-300" />
          <span className="min-w-0">
            <span className="block truncate text-xs font-semibold text-slate-100">History Log</span>
          <span className="block truncate text-[10px] text-slate-400">AG-UI Event Stream</span>
          </span>
        </button>
    </div>
  );
}

function AgentFlowLines({
  executors,
  activeExecutors,
  collapsed
}: {
  executors: AgentProfile[];
  activeExecutors: Set<AgentProfile["name"]>;
  collapsed: boolean;
}) {
  const paths = collapsed
    ? [
        "M50 0 C50 34 17 34 17 65",
        "M50 0 C50 34 50 34 50 65",
        "M50 0 C50 34 83 34 83 65"
      ]
    : [
        "M50 48 C38 62 24 76 17 94",
        "M50 48 L50 94",
        "M50 48 C62 62 76 76 83 94"
      ];
  const links = executors.map((agent, index) => ({
    name: agent.name,
    d: paths[index] || `M50 0 C50 34 ${17 + index * 33} 34 ${17 + index * 33} 65`
  }));

  return (
    <svg
      aria-hidden="true"
      className={`pointer-events-none absolute inset-x-0 z-0 w-full overflow-visible ${collapsed ? "top-[78px] h-[110px]" : "top-[142px] h-[300px]"}`}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
    >
      {!collapsed ? (
        <path
          d="M50 0 L50 32"
          data-agent-link="context-hub"
          data-active={activeExecutors.size ? "true" : "false"}
          className={`agent-link-path ${activeExecutors.size ? "agent-link-path-active" : ""}`}
          pathLength="100"
        />
      ) : null}
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

function ProjectContextHubNode() {
  return (
    <div
      data-agent-interactive="true"
      className="relative z-20 mx-auto flex h-[118px] w-[286px] flex-col items-center justify-center rounded-xl border border-sky-300/40 bg-[#071522] px-5 pb-4 pt-8 text-center shadow-[0_18px_48px_rgba(2,8,23,0.34),0_0_34px_rgba(56,189,248,0.08),inset_0_1px_0_rgba(255,255,255,0.055)] backdrop-blur-sm"
    >
      <div className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-sky-200/45 to-transparent" />
      <div className="absolute -top-2 left-1/2 h-4 w-px -translate-x-1/2 bg-sky-200/45" />
      <div className="absolute -bottom-2 left-1/2 h-4 w-px -translate-x-1/2 bg-sky-200/35" />
      <div className="absolute -top-[19px] left-1/2 grid h-11 w-11 -translate-x-1/2 place-items-center rounded-xl border border-sky-200/35 bg-[#0b1d2d] text-sky-100 shadow-[0_10px_26px_rgba(2,8,23,0.32),0_0_22px_rgba(56,189,248,0.12)]">
        <Database className="h-[21px] w-[21px]" />
      </div>
      <p className="text-sm font-semibold leading-tight text-slate-50">Project Context Hub</p>
      <p className="mt-1 text-xs leading-5 text-slate-400">共享记忆 · 知识 · 状态</p>
    </div>
  );
}

function AgentNode({
  agent,
  openAgentName,
  setOpenAgentName,
  variant,
  collapsed
}: {
  agent: AgentProfile;
  openAgentName: AgentProfile["name"] | null;
  setOpenAgentName: (updater: (current: AgentProfile["name"] | null) => AgentProfile["name"] | null) => void;
  variant: "leader" | "executor";
  collapsed: boolean;
}) {
  const status = displayStatus(agent);
  const isLeader = variant === "leader";
  const isOpen = openAgentName === agent.name;

  return (
    <div
      className={`relative min-w-0 overflow-visible rounded-lg px-4 text-center transition hover:bg-slate-900/24 ${
        isLeader
          ? `${collapsed ? "w-[28%] min-w-[180px] py-1" : "w-[34%] min-w-[220px] py-4"}`
          : `${collapsed ? "min-h-[92px] py-1" : "min-h-[176px] py-5"}`
      } ${isOpen ? "z-[95]" : "z-0"}`}
    >
      <button
        type="button"
        data-agent-interactive="true"
        onClick={() => {
          setOpenAgentName((current) => (current === agent.name ? null : agent.name));
        }}
        className={`agent-avatar-wrap mx-auto rounded-full focus:outline-none focus:ring-2 focus:ring-sky-400/50 ${
          status.active ? "agent-progress-ring" : ""
        }`}
        title={`Open ${agent.name} Agent detail`}
      >
        <span className={`grid place-items-center rounded-full font-semibold transition ${
          collapsed ? "h-12 w-12 text-lg" : "h-20 w-20 text-2xl"
        } ${toneClass[agent.tone]}`}>
          {agent.name.slice(0, 1)}
        </span>
      </button>
      <div className={`${collapsed ? "mt-2" : "mt-3"} flex h-6 items-center justify-center gap-2`}>
        {isLeader ? (
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
      {isOpen ? <AgentDetailCard agent={agent} /> : null}
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
  const detail =
    (agentDetails as Partial<Record<string, { genericRole: string; intro: string; skills: string[] }>>)[agent.name] || {
      genericRole: agent.role,
      intro: `${agent.name} is part of this Vibe Office. It works from its own Hermes profile and coordinates through shared project context.`,
      skills: [agent.role, "Hermes profile", "Project Context Hub"]
    };
  const metaLine = (agentMetaLine as Partial<Record<string, string>>)[agent.name] || agent.role;
  const positionedCardClass = inCanvas
    ? `absolute ${compact ? "top-12" : "top-[118px]"} ${popoverPosition(agent)} z-[80]`
    : "relative";

  return (
      <div
        data-agent-interactive="true"
        role="region"
        aria-label={`${agent.name} Agent detail`}
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

        <p className="text-xs text-slate-500">Overview</p>
        <p className="mt-2 text-sm leading-6 text-slate-300">{detail.intro}</p>

        <p className="mt-4 text-xs text-slate-500">Skills</p>
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
