import type { AgentProfile, ProjectProfile } from "@/types/agent";
import type { TaskItem } from "@/types/task";

export const project = {
  id: "demo-project",
  name: "AG-UI 推广网页开发"
} as const;

export const projects: ProjectProfile[] = [
  {
    id: "demo-project",
    name: "AG-UI 推广网页开发",
    mode: "共享记忆",
    description: "绑定 Project Context Hub 的正式项目"
  },
  {
    id: "free-project",
    name: "自由项目",
    mode: "开放",
    description: "开放性对话，不预设项目边界"
  }
] as const;

export const initialAgents: AgentProfile[] = [
  { name: "Lucy", role: "项目经理", status: "ready", tone: "violet" },
  { name: "Ray", role: "全栈工程师", status: "ready", tone: "blue" },
  { name: "Tiger", role: "运维工程师", status: "offline", tone: "amber" },
  { name: "Musk", role: "金主爸爸", status: "offline", tone: "slate" }
];

export const initialTasks: TaskItem[] = [
  {
    id: "agent-office-canvas-task-001",
    priority: "P0",
    title: "定义 Agent Office Canvas v1 交互边界",
    status: "ready",
    owner: "Lucy",
    selected: false,
    planStatus: "completed",
    description: "明确画布第一版只做 pan / zoom / reset / fit，不引入复杂后台、minimap 或自由拖拽保存。",
    acceptance: ["确认画布能力边界：拖拽平移、缩放、归位"]
  },
  {
    id: "agent-office-canvas-task-002",
    priority: "P0",
    title: "实现 Agent 画布 pan / zoom / reset",
    status: "ready",
    owner: "Ray",
    selected: false,
    planStatus: "completed",
    description: "把现有 AgentStatus 画布改成 viewport + world 结构，用 CSS transform 支持平移、缩放和归位。",
    acceptance: ["画布可拖拽、缩放，并有一键归位/fit 控件"]
  },
  {
    id: "agent-office-canvas-task-003",
    priority: "P1",
    title: "把 Agent 详情卡纳入画布坐标系",
    status: "reviewing",
    owner: "Ray",
    selected: true,
    planStatus: "reviewing",
    description: "Agent 介绍卡跟随对应节点在画布内移动、缩放和裁切，不再作为页面级浮层抢层级。",
    acceptance: ["详情卡不再覆盖输入框和 @Agent 菜单"]
  },
  {
    id: "agent-office-canvas-task-004",
    priority: "P2",
    title: "设计每个 Agent 的办公桌物件",
    status: "waiting",
    owner: "Lucy",
    selected: false,
    planStatus: "planned",
    description: "为 Lucy/Ray/Tiger/Musk 定义最小 desk cluster：产出箱、桌面/草稿、垃圾桶。",
    acceptance: ["每个 Agent 有清晰的办公物件定义"]
  },
  {
    id: "agent-office-canvas-task-005",
    priority: "P2",
    title: "把 Agent 产出箱接入 Artifact registry",
    status: "waiting",
    owner: "Ray",
    selected: false,
    planStatus: "planned",
    description: "在画布上为每个 Agent 显示产出入口，点击后按 owner 过滤 artifact。",
    acceptance: ["Tiger 产出箱能显示 Vibe Office App Icon"]
  },
  {
    id: "agent-office-canvas-task-006",
    priority: "P3",
    title: "Lucy 验收 Agent Office Canvas v1",
    status: "waiting",
    owner: "Lucy",
    selected: false,
    planStatus: "planned",
    description: "验收画布化是否减少层级遮挡、是否符合 Vibe Office 的 office 感、是否仍保持极简 MVP。",
    acceptance: ["验收结论写入 Project Context Hub"]
  }
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
  { file: "BLOG_CONTEXT.md", role: "Blog 素材", flow: "Tiger 读取" },
  { file: "ARTIFACTS.md", role: "产物出口", flow: "Ray 写入" }
];
