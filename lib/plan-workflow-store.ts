import { promises as fs } from "fs";
import path from "path";
import type { AgentName, AgentStatus } from "@/types/agent";
import type { PlanWorkflow, PlanWorkflowStage, TaskItem, TaskPlanStatus, TaskPriority } from "@/types/task";

const WORKSPACE_ROOT = process.cwd();
const OPS_DIR = path.join(WORKSPACE_ROOT, "ops");
const PLAN_WORKFLOW_FILE = path.join(OPS_DIR, "PLAN_WORKFLOW.json");
const LEGACY_LUCY_PLAN_FILE = path.join(OPS_DIR, "LUCY_PLAN.json");

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

function workflowId() {
  return `plan_workflow_${Date.now().toString(36)}`;
}

function taskId(workflow: string, index: number) {
  return `${workflow}-task-${String(index).padStart(3, "0")}`;
}

function hasAny(text: string, patterns: string[]) {
  const normalized = text.toLowerCase();
  return patterns.some((pattern) => normalized.includes(pattern.toLowerCase()));
}

function ownerFor(priority: TaskPriority, requirement: string): AgentName {
  if (priority === "P5" || hasAny(requirement, ["blog", "publish", "content", "release notes"])) return "Tiger";
  if (priority === "P6") return "Lucy";
  return "Ray";
}

function buildTask(input: {
  workflow: string;
  index: number;
  priority: TaskPriority;
  title: string;
  owner: AgentName;
  description: string;
  acceptance: string[];
  selected?: boolean;
}): TaskItem {
  return {
    id: taskId(input.workflow, input.index),
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

  if (hasAny(requirement, ["bug", "broken", "failed", "wrong", "error", "issue"])) {
    return {
      summary: "I need one more reproduction detail before turning this into an execution workflow.",
      questions: ["Where do you see the issue, and what should the expected state be?"],
      recommendation: "Add the missing reproduction detail, then generate the execution plan."
    };
  }

  if (hasAny(requirement, ["ui", "visual", "layout", "style", "interaction", "canvas"])) {
    return {
      summary: "This looks like a product UI refinement. I will keep the scope tied to the current Vibe Office screen.",
      questions: ["Should this round prioritize visual polish, workflow behavior, or both?"],
      recommendation: "Confirm the priority, then generate the execution plan."
    };
  }

  if (hasAny(requirement, ["blog", "publish", "content", "release"])) {
    return {
      summary: "This looks like a content workflow. I will clarify the audience before assigning production work.",
      questions: ["Is this content for internal notes or external publishing?"],
      recommendation: "Confirm the target audience, then generate the execution plan."
    };
  }

  if (short) {
    return {
      summary: "The request is too short to plan safely.",
      questions: ["What final product change or workflow outcome do you want?"],
      recommendation: "Add one sentence of context, then generate the execution plan."
    };
  }

  return {
    summary: "I understand the request and can turn it into a scoped execution workflow.",
    questions: ["Should this be implemented now, or should we first produce a planning-only breakdown?"],
    recommendation: "Choose the execution mode, then continue with the workflow."
  };
}

export function sortTasksForExecution(tasks: TaskItem[]) {
  return [...tasks].sort((left, right) => {
    const priorityDiff = priorityOrder[left.priority] - priorityOrder[right.priority];
    if (priorityDiff !== 0) return priorityDiff;
    return (left.order || 0) - (right.order || 0);
  });
}

export function buildPlanWorkflowClarification(requirement: string): PlanWorkflow {
  const trimmed = requirement.trim();
  const createdAt = nowIso();
  const clarification = clarifyRequirement(trimmed);

  return {
    id: workflowId(),
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
  if (typeof value === "string") return /\?{6,}|锟?/.test(value);
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

export function inferPlanWorkflowStage(tasks: TaskItem[]): PlanWorkflowStage {
  if (!tasks.length) return "idle";
  if (tasks.some((task) => task.planStatus === "blocked")) return "blocked";
  if (tasks.some((task) => task.planStatus === "executing")) return "executing";
  if (tasks.some((task) => task.planStatus === "reviewing")) return "reviewing";
  if (tasks.some((task) => task.planStatus === "planned" || task.planStatus === "selected")) return "planned";
  return "completed";
}

function normalizePlanState(workflow: PlanWorkflow): PlanWorkflow {
  const tasks = workflow.tasks.map(normalizeTaskStatus);
  const inferredStage = inferPlanWorkflowStage(tasks);
  const stage = workflow.stage === "clarifying" && !tasks.length ? workflow.stage : inferredStage;

  if (stage === workflow.stage && tasks.every((task, index) => task === workflow.tasks[index])) return workflow;

  return {
    ...workflow,
    stage,
    tasks
  };
}

function repairPlanWorkflow(workflow: PlanWorkflow): PlanWorkflow {
  const corrupted =
    hasCorruptedText(workflow.summary) ||
    hasCorruptedText(workflow.questions) ||
    hasCorruptedText(workflow.recommendation) ||
    workflow.tasks.some((task) => hasCorruptedText([task.title, task.description, task.acceptance]));

  if (!corrupted || hasCorruptedText(workflow.requirement)) return normalizePlanState(workflow);

  const repaired =
    workflow.stage === "clarifying"
      ? buildPlanWorkflowClarification(workflow.requirement)
      : buildPlanWorkflowTaskPlan(workflow.requirement, workflow);

  return {
    ...repaired,
    id: workflow.id,
    createdAt: workflow.createdAt,
    updatedAt: nowIso()
  };
}

export function buildPlanWorkflowTaskPlan(requirement: string, existingWorkflow?: PlanWorkflow | null): PlanWorkflow {
  const trimmed = requirement.trim() || existingWorkflow?.requirement || "Continue improving the current AG-UI workspace.";
  const createdAt = existingWorkflow?.createdAt || nowIso();
  const id = existingWorkflow?.id || workflowId();
  const themeRelated = hasAny(trimmed, ["theme", "light", "dark", "color"]);
  const uiRelated = themeRelated || hasAny(trimmed, ["ui", "visual", "layout", "style", "interaction", "page", "canvas"]);
  const bugRelated = hasAny(trimmed, ["bug", "broken", "failed", "wrong", "error", "issue"]);
  const contentRelated = hasAny(trimmed, ["blog", "publish", "content", "release"]);
  const primaryOwner = ownerFor(bugRelated ? "P1" : "P2", trimmed);

  const mainTitle = themeRelated ? "Design and connect the theme update" : bugRelated ? "Locate and fix the current issue" : "Implement the requested product change";
  const mainDescription = themeRelated
    ? "Define the surface, text, border, and status colors for the requested theme while preserving the current dark workspace."
    : `Complete the smallest verifiable implementation for: ${trimmed}`;
  const mainAcceptance = themeRelated
    ? ["The theme is readable and usable", "Agent identity colors remain clear", "The current dark UI remains intact"]
    : ["A real product or code change is present", "The result can be verified in the current workspace", "No unrelated admin surface is added"];

  const tasks: TaskItem[] = [
    buildTask({
      workflow: id,
      index: 1,
      priority: bugRelated ? "P1" : "P2",
      title: mainTitle,
      owner: primaryOwner,
      description: mainDescription,
      acceptance: mainAcceptance,
      selected: true
    }),
    buildTask({
      workflow: id,
      index: 2,
      priority: "P2",
      title: themeRelated ? "Persist and restore theme state" : "Close the workflow status loop",
      owner: "Ray",
      description: themeRelated
        ? "Define the entry point, default value, and refresh behavior for the theme choice."
        : "Make sure planned, executing, review, completed, and blocked states are represented truthfully.",
      acceptance: themeRelated
        ? ["The theme entry point is clear", "Refresh does not lose the choice", "Existing workflow state is not broken"]
        : ["The task state is not falsely reported as complete", "State can recover after refresh", "Failure paths show needs-attention"],
      selected: themeRelated
    }),
    buildTask({
      workflow: id,
      index: 3,
      priority: uiRelated ? "P3" : "P4",
      title: uiRelated ? "Polish layout and interaction details" : "Capture follow-up product polish",
      owner: "Ray",
      description: "Move the result toward a clearer and more maintainable workspace UI.",
      acceptance: ["Layout does not overflow", "Primary action remains clear", "The AG-UI First MVP stays focused"],
      selected: false
    }),
    buildTask({
      workflow: id,
      index: 4,
      priority: "P5",
      title: contentRelated ? "Prepare content assets" : "Update handoff and project context",
      owner: contentRelated ? "Tiger" : "Lucy",
      description: "Record decisions, risks, and reusable context in the Project Context Hub.",
      acceptance: ["DEV_LOG / HANDOFF / PROGRESS_SUMMARY are ready to update", "Future agents can continue from the context"],
      selected: false
    }),
    buildTask({
      workflow: id,
      index: 5,
      priority: "P6",
      title: "Record deferred ideas",
      owner: "Lucy",
      description: "Keep ideas that are valuable but should not block the current round.",
      acceptance: ["Deferred work does not block current execution", "The idea can be recovered later"],
      selected: false
    })
  ];

  return {
    id,
    requirement: trimmed,
    stage: "planned",
    summary: "The planning agent created an executable workflow. Select the tasks you want to run.",
    questions: [],
    recommendation: "Start with the selected core tasks; add P4-P6 follow-ups only when needed.",
    tasks,
    createdAt,
    updatedAt: nowIso()
  };
}

export async function ensureOpsDir() {
  await fs.mkdir(OPS_DIR, { recursive: true });
}

async function readWorkflowFile(filePath: string): Promise<PlanWorkflow | null> {
  try {
    const content = await fs.readFile(filePath, "utf8");
    return JSON.parse(content) as PlanWorkflow;
  } catch (error) {
    const code = error instanceof Error && "code" in error ? (error as NodeJS.ErrnoException).code : undefined;
    if (code === "ENOENT") return null;
    throw error;
  }
}

export async function readPlanWorkflow(): Promise<PlanWorkflow | null> {
  const workflow = await readWorkflowFile(PLAN_WORKFLOW_FILE);
  const legacyWorkflow = workflow ? null : await readWorkflowFile(LEGACY_LUCY_PLAN_FILE);
  const current = workflow || legacyWorkflow;
  if (!current) return null;

  const repaired = repairPlanWorkflow(current);
  if (JSON.stringify(repaired) !== JSON.stringify(current) || legacyWorkflow) await writePlanWorkflow(repaired);
  return repaired;
}

export async function writePlanWorkflow(workflow: PlanWorkflow) {
  await ensureOpsDir();
  await fs.writeFile(PLAN_WORKFLOW_FILE, JSON.stringify({ ...workflow, updatedAt: nowIso() }, null, 2), "utf8");
}

export async function updatePlanWorkflow(updater: (workflow: PlanWorkflow | null) => PlanWorkflow) {
  const next = updater(await readPlanWorkflow());
  await writePlanWorkflow(next);
  return next;
}

export async function clearPlanWorkflow() {
  await fs.unlink(PLAN_WORKFLOW_FILE).catch((error) => {
    const code = error instanceof Error && "code" in error ? (error as NodeJS.ErrnoException).code : undefined;
    if (code !== "ENOENT") throw error;
  });
}
