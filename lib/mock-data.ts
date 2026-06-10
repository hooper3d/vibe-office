import type { AgentProfile } from "@/types/agent";
import type { TaskItem } from "@/types/task";

export const project = {
  id: "demo-project",
  name: "AG-UI 推广网页开发"
} as const;

export const initialAgents: AgentProfile[] = [
  { name: "Lucy", role: "项目经理 Agent", status: "ready", tone: "violet" },
  { name: "Ray", role: "全栈工程师 Agent", status: "ready", tone: "blue" },
  { name: "Tiger", role: "运维工程师 Agent", status: "offline", tone: "amber" },
  { name: "Musk", role: "金主爸爸 Agent", status: "offline", tone: "slate" }
];

export const initialTasks: TaskItem[] = [
  { id: "task-001", priority: "P1", title: "搭建推广页首屏与核心卖点", status: "idle", owner: "Ray" },
  { id: "task-002", priority: "P1", title: "沉淀 Project Context Hub 共享记忆", status: "ready", owner: "Ray" },
  { id: "task-003", priority: "P2", title: "整理 Blog 发布素材与发布摘要", status: "handoff", owner: "Tiger" },
  { id: "task-004", priority: "P2", title: "验收统一入口与上下文分发流程", status: "ready", owner: "Lucy" },
  { id: "task-005", priority: "P2", title: "优化推广页视觉收口和响应式体验", status: "ready", owner: "Ray" }
];

export const latestHandoff = {
  from: "Ray",
  to: "Tiger",
  time: "10 分钟前",
  file: "BLOG_CONTEXT.md",
  summary: "Ray 已把推广页开发过程沉淀到 Project Context Hub，Tiger 可直接读取 Blog 素材生成发布内容。"
};

export const risks = [
  { id: "RISK-1001", level: "高", title: "Blog 素材若不沉淀，Tiger 仍需要用户复述开发过程" },
  { id: "RISK-1002", level: "中", title: "共享上下文需要保持简洁，避免重新变成复杂后台" }
];

export const contextHubOverview = [
  { file: "PROJECT_BRIEF.md", role: "目标 / 范围", flow: "User → Hub" },
  { file: "PROGRESS_SUMMARY.md", role: "当前进展", flow: "Ray → Lucy" },
  { file: "DEV_LOG.md", role: "开发时间线", flow: "Ray 写入" },
  { file: "HANDOFF.md", role: "Agent 交接", flow: "Ray → Lucy/Tiger" },
  { file: "DECISIONS.md", role: "关键决策", flow: "User/Lucy" },
  { file: "RELEASE_NOTES.md", role: "发布摘要", flow: "Tiger 读取" },
  { file: "BLOG_CONTEXT.md", role: "Blog 素材", flow: "Tiger 读取" }
];
