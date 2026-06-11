"use client";

import { Bot, RefreshCw } from "lucide-react";
import { useState } from "react";
import type { AgentProfile } from "@/types/agent";

type AgentStatusProps = {
  agents: AgentProfile[];
  running: boolean;
  connection: "Local Connected" | "Streaming" | "Error";
  onReset: () => void;
  selectedAgent?: AgentProfile["name"];
  onSelectAgent?: (agentName: AgentProfile["name"]) => void;
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
    genericRole: "项目经理",
    intro: "负责需求拆解、任务分配、验收标准和风险整理，把用户目标转成可执行的 Agent 工作流。",
    skills: ["拆解需求", "分配任务", "统筹验收", "整理风险", "生成日报"]
  },
  Ray: {
    genericRole: "开发 Agent",
    intro: "负责读取项目上下文、完成实现或修复，并把开发过程沉淀到 Project Context Hub。",
    skills: ["读写代码", "修复问题", "更新上下文", "验证结果", "交接说明"]
  },
  Tiger: {
    genericRole: "内容 Agent",
    intro: "负责复用发布摘要和 Blog 素材，整理面向用户的发布内容草稿，当前通过上海服务器上的 Hermes 接入协作网络。",
    skills: ["生成 Blog", "发布摘要", "复用素材", "内容润色", "运维记录"]
  },
  Musk: {
    genericRole: "金主爸爸",
    intro: "负责提供预算想象力、方向压力和远端服务器视角，当前通过硅谷服务器上的 Hermes 接入协作网络。",
    skills: ["预算判断", "方向压力", "远端视角", "协作扩展", "能力规划"]
  }
} satisfies Record<AgentProfile["name"], { genericRole: string; intro: string; skills: string[] }>;

const agentMetaLine: Partial<Record<AgentProfile["name"], string>> = {
  Lucy: "中国南京：本地 Hermes Agent",
  Ray: "中国南京：本地开发 Agent",
  Tiger: "中国上海：121.4.96.84",
  Musk: "美国硅谷：43.162.107.236"
};

function displayStatus(agent: AgentProfile) {
  if (agent.status === "blocked") {
    return {
      label: "空闲中",
      className: "bg-emerald-500/10 text-emerald-300 shadow-[inset_0_0_0_1px_rgba(52,211,153,0.1)]",
      dot: "bg-emerald-500",
      active: false
    };
  }

  if (agent.status === "offline") {
    return {
      label: "离线",
      className: "bg-slate-500/10 text-slate-300 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.1)]",
      dot: "bg-slate-500",
      active: false
    };
  }

  if (agent.status === "waiting") {
    return {
      label: "等待中",
      className: "bg-amber-500/10 text-amber-300 shadow-[inset_0_0_0_1px_rgba(251,191,36,0.1)]",
      dot: "bg-amber-500",
      active: false
    };
  }

  if (agent.status === "ready") {
    return {
      label: "空闲中",
      className: "bg-emerald-500/10 text-emerald-300 shadow-[inset_0_0_0_1px_rgba(52,211,153,0.1)]",
      dot: "bg-emerald-500",
      active: false
    };
  }

  if (agent.status === "idle") {
    return {
      label: "空闲中",
      className: "bg-emerald-500/10 text-emerald-300 shadow-[inset_0_0_0_1px_rgba(52,211,153,0.1)]",
      dot: "bg-emerald-500",
      active: false
    };
  }

  return {
    label: "工作中",
    className: "bg-blue-500/10 text-blue-300 shadow-[inset_0_0_0_1px_rgba(96,165,250,0.1)]",
    dot: "bg-blue-400",
    active: true
  };
}

export function AgentStatus({
  agents,
  running,
  connection,
  onReset,
  selectedAgent,
  onSelectAgent,
  className = "",
  collapsed = false
}: AgentStatusProps) {
  const [openAgentName, setOpenAgentName] = useState<AgentProfile["name"] | null>(null);
  void connection;
  const leader = agents.find((agent) => agent.name === "Lucy");
  const executors = agents.filter((agent) => agent.name !== "Lucy");
  const leaderOpen = Boolean(leader && openAgentName === leader.name);
  const executorOpen = executors.some((agent) => openAgentName === agent.name);
  const activeExecutors = new Set<AgentProfile["name"]>(
    executors
      .filter((agent) => displayStatus(agent).active)
      .map((agent) => agent.name)
  );

  if (collapsed) {
    return (
      <section className={`frost relative z-40 flex min-w-0 shrink-0 items-center gap-4 rounded-xl p-4 ${className}`}>
        <div className="flex min-w-0 shrink-0 items-center gap-3">
          <Bot className="h-5 w-5 text-slate-300" />
          <h2 className="text-base font-semibold text-slate-100">Agent 列表</h2>
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
                title={`切换到 ${agent.name} 对话`}
              >
                <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-semibold ${toneClass[agent.tone]}`}>
                  {agent.name.slice(0, 1)}
                </span>
                <span className="min-w-0 truncate text-sm font-semibold text-slate-100">{agent.name}</span>
                <span className={`status-dot shrink-0 ${status.dot}`} />
                {openAgentName === agent.name ? <AgentDetailCard agent={agent} compact /> : null}
              </button>
            );
          })}
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <button
            type="button"
            onClick={onReset}
            disabled={running}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-slate-400 transition hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-35"
            title="重置运行状态"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </section>
    );
  }

  return (
      <section className={`frost agent-canvas-bg relative z-40 flex min-w-0 flex-col rounded-xl transition-all duration-300 ${collapsed ? "p-4" : "p-6"} ${className}`}>
        <div className={`relative z-10 ${collapsed ? "mb-3" : "mb-5"} flex items-center justify-between gap-3`}>
          <div className="flex items-center gap-3">
            <Bot className="h-5 w-5 text-slate-300" />
            <h2 className="text-base font-semibold text-slate-100">Agent 列表</h2>
          </div>
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={onReset}
              disabled={running}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-slate-400 transition hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-35"
              title="重置运行状态"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className={`relative z-10 flex max-h-[calc(100%-48px)] flex-col justify-between overflow-visible transition-all duration-300 max-md:h-[360px] ${
          collapsed ? "h-[220px] min-h-[210px]" : "h-[500px] min-h-[440px]"
        }`}>
          <AgentFlowLines activeExecutors={activeExecutors} collapsed={collapsed} />
          {leader ? (
            <div className={`relative flex justify-center ${leaderOpen ? "z-[90]" : "z-10"}`}>
              <AgentNode agent={leader} openAgentName={openAgentName} setOpenAgentName={setOpenAgentName} variant="leader" collapsed={collapsed} />
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
              />
            ))}
          </div>
        </div>
      </section>
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
        onClick={() => setOpenAgentName((current) => (current === agent.name ? null : agent.name))}
        className={`agent-avatar-wrap mx-auto rounded-full focus:outline-none focus:ring-2 focus:ring-sky-400/50 ${status.active ? "agent-progress-ring" : ""}`}
        title={`查看 ${agent.name} 介绍`}
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
            👑
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

function AgentDetailCard({ agent, compact = false }: { agent: AgentProfile; compact?: boolean }) {
  const status = displayStatus(agent);
  const detail = agentDetails[agent.name];
  const metaLine = agentMetaLine[agent.name] || agent.role;

  return (
      <div
        role="region"
        aria-label={`${agent.name} Agent 介绍`}
        className={`absolute ${compact ? "top-12" : "top-[118px]"} z-[80] w-[330px] rounded-xl border border-slate-700/90 bg-[#0b121c] p-5 text-left text-slate-100 shadow-[0_22px_70px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.05)] ${popoverPosition(agent)}`}
      >
        <span
          aria-hidden="true"
          className="absolute -top-[7px] left-1/2 h-3.5 w-3.5 -translate-x-1/2 rotate-45 border-l border-t border-slate-700/90 bg-[#0b121c]"
        />
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

        <p className="text-xs text-slate-500">简介：</p>
        <p className="mt-2 text-sm leading-6 text-slate-300">{detail.intro}</p>

        <p className="mt-4 text-xs text-slate-500">技能：</p>
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
