import { promises as fs } from "fs";
import path from "path";
import type { AgentName, AgentStatus } from "@/types/agent";
import type { LucyPlan, LucyWorkflowStage, TaskItem, TaskPlanStatus, TaskPriority } from "@/types/task";

const WORKSPACE_ROOT = process.cwd();
const OPS_DIR = path.join(WORKSPACE_ROOT, "ops");
const LUCY_PLAN_FILE = path.join(OPS_DIR, "LUCY_PLAN.json");

const priorityOrder: Record<TaskPriority, number> = {
  P0: 0,
  P1: 1,
  P2: 2,
  P3: 3,
  P4: 4,
  P5: 5,
  P6: 6
};

const validAgentStatuses = new Set<AgentStatus>([
  "idle",
  "ready",
  "waiting",
  "working",
  "coding",
  "handoff",
  "reviewing",
  "blocked",
  "offline"
]);

const validPlanStatuses = new Set<TaskPlanStatus>([
  "planned",
  "selected",
  "executing",
  "reviewing",
  "completed",
  "blocked",
  "deferred"
]);

function nowIso() {
  return new Date().toISOString();
}

function planId() {
  return `lucy_plan_${Date.now().toString(36)}`;
}

function taskId(plan: string, index: number) {
  return `${plan}-task-${String(index).padStart(3, "0")}`;
}

function hasAny(text: string, patterns: string[]) {
  const normalized = text.toLowerCase();
  return patterns.some((pattern) => normalized.includes(pattern.toLowerCase()));
}

function ownerFor(priority: TaskPriority, requirement: string): AgentName {
  if (priority === "P5" || hasAny(requirement, ["blog", "发布", "内容", "素材"])) return "Tiger";
  if (priority === "P6") return "Lucy";
  return "Ray";
}

function buildTask(input: {
  plan: string;
  index: number;
  priority: TaskPriority;
  title: string;
  owner: AgentName;
  description: string;
  acceptance: string[];
  selected?: boolean;
}): TaskItem {
  return {
    id: taskId(input.plan, input.index),
    priority: input.priority,
    title: input.title,
    owner: input.owner,
    status: "waiting",
    selected: input.selected ?? (input.priority === "P1" || input.priority === "P2"),
    planStatus: "planned",
    description: input.description,
    acceptance: input.acceptance,
    order: input.index
  };
}

function clarifyRequirement(requirement: string) {
  const short = requirement.length < 18;

  if (hasAny(requirement, ["浅色", "亮色", "配色", "主题", "theme", "light"])) {
    return {
      summary:
        "明白，你不是想随手改几个颜色，而是想在现在这套深色 Vibe Office 工作台之外，增加一套能长期使用的浅色视觉方案。我会先按现有 Agent Console、任务列表、Project Context Hub 和 Event Stream 的结构去理解，不急着让 Ray 动代码。",
      questions: [
        "我先确认一个点：你希望它是深色/浅色可切换，还是先把当前页面直接做成浅色版本看看感觉？"
      ],
      recommendation: "你回我这个方向后，我再把它整理成可选择的执行任务。"
    };
  }

  if (hasAny(requirement, ["bug", "异常", "报错", "失败", "需处理", "不对", "溢出", "遮挡"])) {
    return {
      summary: "明白，这是当前工作台里的一个具体问题，不应该直接丢给 Ray 猜。Lucy 会先把你看到的现象和期望状态对齐，再决定怎么修。",
      questions: [
        "我先确认一下：这个问题是一直能看到，还是某个点击/运行之后才出现？"
      ],
      recommendation: "你补一句复现方式后，我再整理成修复任务。"
    };
  }

  if (hasAny(requirement, ["UI", "视觉", "布局", "样式", "交互", "页面", "卡片"])) {
    return {
      summary: "明白，这是在继续打磨当前工作台体验。Lucy 会先按你正在看的页面和协作流程来理解，而不是套一套通用 UI 优化清单。",
      questions: [
        "这次你最想先动的是视觉观感，还是操作路径？"
      ],
      recommendation: "你确认方向后，我再把它拆成可选择的执行任务。"
    };
  }

  if (hasAny(requirement, ["blog", "发布", "内容", "素材"])) {
    return {
      summary: "明白，这是要把当前项目上下文转成内容产物。Lucy 会先确认内容用途，再看是否交给 Tiger。",
      questions: [
        "这次内容是给自己记录，还是准备对外发布？"
      ],
      recommendation: "你确认用途后，我再整理成内容任务。"
    };
  }

  if (short) {
    return {
      summary: "我收到了，但这句话还太短，我不想替你脑补错方向。",
      questions: ["你再补一句：你希望页面或流程最后变成什么样？"],
      recommendation: "你补充后，我再接着往下聊。"
    };
  }

  return {
    summary: "明白，我先按当前 Vibe Office 工作台的上下文来理解这件事，不会直接派发执行。",
    questions: ["我先确认一下：你希望这次先做成一个可见的产品变化，还是先把思路整理成后续任务？"],
    recommendation: "你确认后，我再整理成可选择的任务。"
  };
}

export function sortTasksForExecution(tasks: TaskItem[]) {
  return [...tasks].sort((left, right) => {
    const priorityDiff = priorityOrder[left.priority] - priorityOrder[right.priority];
    if (priorityDiff !== 0) return priorityDiff;
    return (left.order || 0) - (right.order || 0);
  });
}

export function buildLucyClarification(requirement: string): LucyPlan {
  const trimmed = requirement.trim();
  const createdAt = nowIso();
  const clarification = clarifyRequirement(trimmed);

  return {
    id: planId(),
    requirement: trimmed,
    stage: "clarifying",
    summary: clarification.summary,
    questions: clarification.questions,
    recommendation: clarification.recommendation,
    tasks: [],
    createdAt,
    updatedAt: createdAt
  };
}

function hasCorruptedText(value: unknown): boolean {
  if (typeof value === "string") return /\?{6,}|�/.test(value);
  if (Array.isArray(value)) return value.some(hasCorruptedText);
  return false;
}

function normalizeTaskStatus(task: TaskItem): TaskItem {
  const rawStatus = String(task.status);
  const rawPlanStatus = String(task.planStatus || "");
  const planStatus = validPlanStatuses.has(rawPlanStatus as TaskPlanStatus)
    ? (rawPlanStatus as TaskPlanStatus)
    : rawStatus === "completed"
      ? "completed"
      : "planned";
  const status = validAgentStatuses.has(rawStatus as AgentStatus)
    ? task.status
    : planStatus === "completed"
      ? "ready"
      : planStatus === "blocked"
        ? "blocked"
        : planStatus === "reviewing"
          ? "reviewing"
          : planStatus === "executing"
            ? task.owner === "Ray"
              ? "coding"
              : "working"
            : "waiting";

  if (task.status === status && task.planStatus === planStatus && (planStatus !== "completed" || task.selected === false)) {
    return task;
  }

  return {
    ...task,
    selected: planStatus === "completed" ? false : task.selected,
    status,
    planStatus
  };
}

export function inferLucyPlanStage(tasks: TaskItem[]): LucyWorkflowStage {
  if (!tasks.length) return "idle";
  if (tasks.some((task) => task.planStatus === "blocked")) return "blocked";
  if (tasks.some((task) => task.planStatus === "executing")) return "executing";
  if (tasks.some((task) => task.planStatus === "reviewing")) return "reviewing";
  if (tasks.some((task) => task.planStatus === "planned" || task.planStatus === "selected")) return "planned";
  return "completed";
}

function normalizePlanState(plan: LucyPlan): LucyPlan {
  const tasks = plan.tasks.map(normalizeTaskStatus);
  const inferredStage = inferLucyPlanStage(tasks);
  const stage = plan.stage === "clarifying" && !tasks.length ? plan.stage : inferredStage;

  if (stage === plan.stage && tasks.every((task, index) => task === plan.tasks[index])) return plan;

  return {
    ...plan,
    stage,
    tasks
  };
}

function repairLucyPlan(plan: LucyPlan): LucyPlan {
  const corrupted =
    hasCorruptedText(plan.summary) ||
    hasCorruptedText(plan.questions) ||
    hasCorruptedText(plan.recommendation) ||
    plan.tasks.some((task) => hasCorruptedText([task.title, task.description, task.acceptance]));

  if (!corrupted || hasCorruptedText(plan.requirement)) return normalizePlanState(plan);

  const repaired = plan.stage === "clarifying" ? buildLucyClarification(plan.requirement) : buildLucyTaskPlan(plan.requirement, plan);

  return {
    ...repaired,
    id: plan.id,
    createdAt: plan.createdAt,
    updatedAt: nowIso()
  };
}

export function buildLucyTaskPlan(requirement: string, existingPlan?: LucyPlan | null): LucyPlan {
  const trimmed = requirement.trim() || existingPlan?.requirement || "继续推进当前 AG-UI 工作台体验";
  const createdAt = existingPlan?.createdAt || nowIso();
  const id = existingPlan?.id || planId();
  const themeRelated = hasAny(trimmed, ["浅色", "亮色", "配色", "主题", "theme", "light"]);
  const uiRelated = themeRelated || hasAny(trimmed, ["UI", "视觉", "布局", "样式", "交互", "页面", "卡片"]);
  const bugRelated = hasAny(trimmed, ["bug", "异常", "报错", "失败", "需处理", "不对", "溢出", "遮挡"]);
  const contentRelated = hasAny(trimmed, ["blog", "发布", "内容", "素材"]);
  const primaryOwner = ownerFor(bugRelated ? "P1" : "P2", trimmed);

  const mainTitle = themeRelated ? "设计并接入浅色配色方案" : bugRelated ? "定位并修复当前阻塞问题" : "实现本轮核心需求";
  const mainDescription = themeRelated
    ? "为当前工作台定义浅色主题的背景、面板、文字、边框和状态色，并保留深色主题继续可用。"
    : `围绕“${trimmed}”完成最小可验证实现。`;
  const mainAcceptance = themeRelated
    ? ["浅色主题下主控制台可读、可用", "状态色和 Agent 头像仍能清楚区分", "深色主题现有体验不被破坏"]
    : ["真实代码或内容发生对应变化", "结果可以在当前首页或事件流中验证", "不引入无关后台能力"];

  const tasks: TaskItem[] = [
    buildTask({
      plan: id,
      index: 1,
      priority: bugRelated ? "P1" : "P2",
      title: mainTitle,
      owner: primaryOwner,
      description: mainDescription,
      acceptance: mainAcceptance,
      selected: true
    }),
    buildTask({
      plan: id,
      index: 2,
      priority: "P2",
      title: themeRelated ? "补齐主题切换与状态持久化" : "补齐状态流与任务闭环",
      owner: "Ray",
      description: themeRelated ? "确定浅色/深色主题的入口、默认值和刷新后的恢复方式。" : "确保任务从计划、执行、验收到完成或需处理都有可信状态。",
      acceptance: themeRelated ? ["主题入口清晰", "刷新后主题选择不丢失", "不影响现有工作流状态"] : ["任务状态不误报完成", "刷新后状态可恢复", "失败路径显示需处理"],
      selected: themeRelated
    }),
    buildTask({
      plan: id,
      index: 3,
      priority: uiRelated ? "P3" : "P4",
      title: uiRelated ? "优化界面布局和交互细节" : "整理体验优化项",
      owner: "Ray",
      description: "把本轮变化落到更清晰、可继续扩展的工作台界面上。",
      acceptance: ["布局不遮挡、不溢出", "核心操作入口清晰", "不破坏当前极简 MVP"],
      selected: false
    }),
    buildTask({
      plan: id,
      index: 4,
      priority: "P5",
      title: contentRelated ? "整理发布内容和素材" : "沉淀上下文与交接素材",
      owner: contentRelated ? "Tiger" : "Lucy",
      description: "把本轮决策、风险和可复用上下文记录到 Project Context Hub。",
      acceptance: ["DEV_LOG / HANDOFF / PROGRESS_SUMMARY 有更新", "后续 Agent 可以读取上下文继续工作"],
      selected: false
    }),
    buildTask({
      plan: id,
      index: 5,
      priority: "P6",
      title: "记录后续想法池",
      owner: "Lucy",
      description: "保留本轮不执行但值得后续讨论的想法。",
      acceptance: ["不阻塞本轮执行", "后续可以从计划中恢复讨论"],
      selected: false
    })
  ];

  return {
    id,
    requirement: trimmed,
    stage: "planned",
    summary: "Lucy 已完成任务拆解。请选择要执行的任务，系统会按 P0 到 P6 的顺序派发。",
    questions: [],
    recommendation: "建议先执行已默认勾选的核心任务，P4-P6 可按需要追加。",
    tasks,
    createdAt,
    updatedAt: nowIso()
  };
}

export async function ensureOpsDir() {
  await fs.mkdir(OPS_DIR, { recursive: true });
}

export async function readLucyPlan(): Promise<LucyPlan | null> {
  try {
    const content = await fs.readFile(LUCY_PLAN_FILE, "utf8");
    const plan = JSON.parse(content) as LucyPlan;
    const repaired = repairLucyPlan(plan);
    if (JSON.stringify(repaired) !== JSON.stringify(plan)) await writeLucyPlan(repaired);
    return repaired;
  } catch (error) {
    const code = error instanceof Error && "code" in error ? (error as NodeJS.ErrnoException).code : undefined;
    if (code === "ENOENT") return null;
    throw error;
  }
}

export async function writeLucyPlan(plan: LucyPlan) {
  await ensureOpsDir();
  await fs.writeFile(LUCY_PLAN_FILE, JSON.stringify({ ...plan, updatedAt: nowIso() }, null, 2), "utf8");
}

export async function updateLucyPlan(updater: (plan: LucyPlan | null) => LucyPlan) {
  const next = updater(await readLucyPlan());
  await writeLucyPlan(next);
  return next;
}

export async function clearLucyPlan() {
  await fs.unlink(LUCY_PLAN_FILE).catch((error) => {
    const code = error instanceof Error && "code" in error ? (error as NodeJS.ErrnoException).code : undefined;
    if (code !== "ENOENT") throw error;
  });
}
