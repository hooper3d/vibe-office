import { EventType, type AGUIEvent, type RunAgentInput } from "@ag-ui/core";
import { registerArtifactsFromText } from "@/lib/artifacts";
import { runCodexExec } from "@/lib/codex-exec-adapter";
import { buildCommandTemplate } from "@/lib/command-templates";
import { readContextHubSnapshot } from "@/lib/context-hub";
import { buildHermesResponsesInput } from "@/lib/hermes-multimodal";
import { HermesAgentError, sendHermesAgentResponse } from "@/lib/hermes-agent-client";
import { runLocalAgentAction } from "@/lib/local-agent-runtime";
import {
  inferPlanWorkflowStage,
  readPlanWorkflow,
  sortTasksForExecution,
  updatePlanWorkflow,
  writePlanWorkflow
} from "@/lib/plan-workflow-store";
import { initialTasks } from "@/lib/mock-data";
import { appendEventRecord, appendRunRecord, writeLastResult } from "@/lib/run-history";
import { triageRequirement, triageSummary } from "@/lib/workflow-triage";
import type { AgentAction, AgentName, AguiIntent } from "@/types/agent";
import type { PlanWorkflow, TaskItem, TaskPriority } from "@/types/task";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const encoder = new TextEncoder();

const ARTIFACT_OUTPUT_PROTOCOL = `Artifact output protocol:
- When your response includes any generated or delivered artifact, include one JSON object in the final response.
- Artifacts include images, downloadable files, markdown documents, public URLs, deployment URLs, and workspace-local files.
- JSON shape:
{"artifacts":[{"type":"image|file|url|markdown","title":"Short title","url":"https://...","mimeType":"image/png","description":"What this artifact is"}]}
- Use "url" or "sourceUrl" for public http(s) links.
- Use "path" only for files inside the AG_UI workspace that Vibe Office can safely read.
- Keep normal text concise; the JSON lets Vibe Office render preview and download cards.`;

function toSse(event: AGUIEvent) {
  return encoder.encode(`data: ${JSON.stringify(event)}\n\n`);
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeAgentAction(action: unknown): AgentAction {
  if (action === "submit_requirement_to_lucy") return "submit_requirement_to_planning_agent";
  if (action === "generate_lucy_plan") return "generate_plan_workflow";
  if (action === "ask_lucy_review") return "ask_planning_agent_review";
  if (
    action === "submit_requirement_to_planning_agent" ||
    action === "generate_plan_workflow" ||
    action === "execute_selected_tasks" ||
    action === "dispatch_to_ray" ||
    action === "ask_planning_agent_review" ||
    action === "ask_tiger_blog" ||
    action === "ask_tiger_publish" ||
    action === "daily_report" ||
    action === "manual_message"
  ) {
    return action;
  }
  return "dispatch_to_ray";
}

function getIntent(input: RunAgentInput): AguiIntent {
  const state = input.state as { intent?: Partial<AguiIntent> };
  const intent = state.intent || {};
  const projectId = typeof intent.projectId === "string" && intent.projectId.trim() ? intent.projectId.trim() : "demo-project";
  return {
    action: normalizeAgentAction(intent.action),
    targetAgent: (intent.targetAgent || "Ray") as AgentName,
    projectId,
    taskId: intent.taskId || "task-001",
    message: intent.message,
    attachments: Array.isArray(intent.attachments) ? intent.attachments : undefined,
    planId: intent.planId,
    selectedTaskIds: intent.selectedTaskIds
  };
}

function actionCopy(action: AgentAction) {
  const copy: Record<AgentAction, { step: string; tool: string; status: string }> = {
    generate_plan_workflow: {
      step: "Generate plan workflow",
      tool: "generate_plan_workflow",
      status: "reviewing"
    },
    execute_selected_tasks: {
      step: "Execute selected tasks",
      tool: "execute_selected_tasks",
      status: "working"
    },
    dispatch_to_ray: {
      step: "Dispatch development task",
      tool: "dispatch_task",
      status: "coding"
    },
    submit_requirement_to_planning_agent: {
      step: "Submit requirement for planning",
      tool: "planning_agent_requirement_planning",
      status: "reviewing"
    },
    ask_planning_agent_review: {
      step: "Request planning-agent review",
      tool: "request_review",
      status: "reviewing"
    },
    ask_tiger_publish: {
      step: "Prepare publishing content",
      tool: "prepare_publish",
      status: "working"
    },
    ask_tiger_blog: {
      step: "Draft blog content",
      tool: "write_blog_draft",
      status: "working"
    },
    daily_report: {
      step: "Generate project daily report",
      tool: "generate_daily_report",
      status: "working"
    },
    manual_message: {
      step: "Handle manual message",
      tool: "manual_message",
      status: "working"
    }
  };

  return copy[action];
}
async function emit(controller: ReadableStreamDefaultController<Uint8Array>, event: AGUIEvent, delay = 220) {
  await appendEventRecord(event);
  try {
    controller.enqueue(toSse(event));
  } catch {
    // The browser may close the SSE connection while the local runner keeps finishing.
    // History is already persisted above, so refresh can still restore the true state.
  }
  if (delay) await wait(delay);
}

function enqueueSafe(controller: ReadableStreamDefaultController<Uint8Array>, value: Uint8Array) {
  try {
    controller.enqueue(value);
  } catch {
    // Connection is already gone; persisted history remains the source of truth.
  }
}

function codexRunIssue(label: string, run?: Awaited<ReturnType<typeof runCodexExec>>) {
  if (!run || !run.enabled) return "";
  if (run.error) return `${label} ${run.mode} 执行异常：${run.error}`;
  if (run.exitCode !== 0) return `${label} ${run.mode} 执行退出码 ${run.exitCode ?? "未知"}`;
  return "";
}

function codexRunNote(label: string, run?: Awaited<ReturnType<typeof runCodexExec>>) {
  if (!run) return "";
  if (!run.enabled) return `${label} 自动执行未启动：${run.error || "已按当前策略跳过"}`;
  return codexRunIssue(label, run) || `${label} ${run.mode} 执行完成`;
}

function nowIso() {
  return new Date().toISOString();
}

function planId() {
  return `planning_agent_plan_${Date.now().toString(36)}`;
}

function taskId(plan: string, index: number) {
  return `${plan}-task-${String(index).padStart(3, "0")}`;
}

function isAgentName(value: unknown): value is AgentName {
  return value === "Lucy" || value === "Ray" || value === "Tiger" || value === "Musk";
}

function isTaskPriority(value: unknown): value is TaskPriority {
  return value === "P0" || value === "P1" || value === "P2" || value === "P3" || value === "P4" || value === "P5" || value === "P6";
}

function extractJsonObject(text: string) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] || text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) return "";
  return candidate.slice(start, end + 1);
}

function formatAttachmentContext(attachments?: AguiIntent["attachments"]) {
  if (!attachments?.length) return "";

  return [
    "User attached artifacts:",
    JSON.stringify(
      {
        artifacts: attachments.map((artifact) => ({
          id: artifact.id,
          type: artifact.type,
          title: artifact.title,
          accessUrl: artifact.accessUrl,
          sourceUrl: artifact.sourceUrl,
          path: artifact.path,
          mimeType: artifact.mimeType,
          description: artifact.description
        }))
      },
      null,
      2
    )
  ].join("\n");
}

function buildHermesPlanPrompt(requirement: string, attachments?: AguiIntent["attachments"]) {
  const attachmentContext = formatAttachmentContext(attachments);
  return `Create an executable plan workflow for the current AG_UI / Vibe Office project.

User requirement:
${requirement}

${attachmentContext}

Return exactly one JSON object. Do not wrap it in Markdown and do not add commentary.

Required shape:
{
  "summary": "One-sentence plan summary",
  "recommendation": "Recommended next step for the user",
  "tasks": [
    {
      "title": "Task title",
      "owner": "Ray",
      "priority": "P1",
      "description": "Task description",
      "acceptance": ["Acceptance item 1", "Acceptance item 2"],
      "selected": true
    }
  ]
}

Constraints:
- owner must be one of Lucy, Ray, Tiger, Musk. Development work defaults to Ray. Lucy is the current legacy profile key for the planning agent.
- priority must be P0 through P6.
- Do not pretend Ray has already executed anything.
- If a task should produce an image, file, URL, Markdown document, or deployment link, include structured artifact delivery in its acceptance criteria.
- Do not use old private-test projects or stock/trading/market scenarios as validation context.
- Keep the first version AG-UI First and MVP-focused.`;
}
function parsePlanningAgentPlan(input: { text: string; requirement: string; existingPlan?: PlanWorkflow | null }): PlanWorkflow {
  const jsonText = extractJsonObject(input.text);
  if (!jsonText) throw new HermesAgentError("bad_response", "The planning agent did not return a JSON plan.");

  const raw = JSON.parse(jsonText) as {
    summary?: unknown;
    recommendation?: unknown;
    tasks?: Array<{
      title?: unknown;
      owner?: unknown;
      priority?: unknown;
      description?: unknown;
      acceptance?: unknown;
      selected?: unknown;
    }>;
  };

  if (!Array.isArray(raw.tasks) || raw.tasks.length === 0) {
    throw new HermesAgentError("bad_response", "The planning agent returned a plan without tasks.");
  }

  const id = input.existingPlan?.id || planId();
  const createdAt = input.existingPlan?.createdAt || nowIso();
  const tasks: TaskItem[] = raw.tasks.map((task, index) => {
    const title = typeof task.title === "string" && task.title.trim() ? task.title.trim() : `Plan task ${index + 1}`;
    const owner = isAgentName(task.owner) ? task.owner : "Ray";
    const priority = isTaskPriority(task.priority) ? task.priority : "P2";
    const acceptance = Array.isArray(task.acceptance)
      ? task.acceptance.filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
      : [];

    return {
      id: taskId(id, index + 1),
      priority,
      title,
      owner,
      status: "waiting",
      selected: typeof task.selected === "boolean" ? task.selected : owner === "Ray",
      planStatus: "planned",
      description: typeof task.description === "string" ? task.description.trim() : title,
      acceptance,
      order: index + 1
    };
  });

  return {
    id,
    requirement: input.requirement,
    stage: "planned",
    summary: typeof raw.summary === "string" && raw.summary.trim() ? raw.summary.trim() : "Planning agent generated a task plan.",
    questions: [],
    recommendation:
      typeof raw.recommendation === "string" && raw.recommendation.trim()
        ? raw.recommendation.trim()
        : "Select the tasks to execute, then hand them to the assigned agents.",
    tasks,
    createdAt,
    updatedAt: nowIso()
  };
}

function remoteAgentStatus(agent: AgentName) {
  if (agent === "Ray") return "coding";
  if (agent === "Lucy") return "reviewing";
  return "working";
}

async function emitRegisteredArtifacts(input: {
  controller: ReadableStreamDefaultController<Uint8Array>;
  text: string;
  owner: AgentName;
  projectId: AguiIntent["projectId"];
  runId: string;
  messageId: string;
  taskId?: string;
}) {
  const artifacts = await registerArtifactsFromText({
    text: input.text,
    owner: input.owner,
    projectId: input.projectId,
    runId: input.runId,
    messageId: input.messageId
  });

  if (!artifacts.length) return [];

  await emit(input.controller, {
    type: EventType.CUSTOM,
    name: "artifacts_registered",
    value: {
      artifacts,
      owner: input.owner,
      projectId: input.projectId,
      runId: input.runId,
      messageId: input.messageId,
      taskId: input.taskId
    },
    timestamp: Date.now()
  });

  return artifacts;
}

function buildRemoteTaskPrompt(input: { task: TaskItem; plan: PlanWorkflow; requirement?: string; contextHub: string }) {
  const acceptance = input.task.acceptance?.length ? input.task.acceptance.map((item) => `- ${item}`).join("\n") : "- Report what was done and what remains.";

  return `You are ${input.task.owner}, a real Hermes Agent in the AG_UI distributed team.

Execute only the task assigned to you. Do not pretend another agent has completed their part.

Project: AG-UI promotional website / Vibe Office / Project Context Hub.
Original requirement:
${input.requirement || input.plan.requirement || "No extra requirement provided."}

Shared memory snapshot:
${input.contextHub}

Task:
- id: ${input.task.id}
- title: ${input.task.title}
- owner: ${input.task.owner}
- priority: ${input.task.priority}
- description: ${input.task.description || input.task.title}

Acceptance criteria:
${acceptance}

Operational rules:
- If this task requires server work and you have local terminal access, perform it on your own server.
- Do not expose Hermes API ports publicly.
- Do not stop unrelated services.
- If you cannot complete a step, say exactly what blocked you.
- Return a concise result with: status, actions taken, files/paths/URLs changed, verification, risks, and next handoff.

${ARTIFACT_OUTPUT_PROTOCOL}
`;
}

async function runRemoteAgentTask(input: { task: TaskItem; plan: PlanWorkflow; requirement?: string; runId: string }) {
  const snapshot = await readContextHubSnapshot();
  const contextHub = snapshot
    .map((file) => {
      const content = file.exists && file.content.trim() ? file.content.trim() : "暂无内容";
      return `--- ${file.path} (${file.purpose}) ---\n${content}`;
    })
    .join("\n\n");
  const message = buildRemoteTaskPrompt({ ...input, contextHub });
  const conversation = `ag-ui-${input.task.owner.toLowerCase()}-${input.runId}-${input.task.id}`;

  if (input.task.owner === "Lucy") {
    const result = await sendHermesAgentResponse("Lucy", { message, conversation });
    return result.text;
  }

  if (input.task.owner === "Tiger") {
    const result = await sendHermesAgentResponse("Tiger", { message, conversation });
    return result.text;
  }

  if (input.task.owner === "Musk") {
    const result = await sendHermesAgentResponse("Musk", { message, conversation });
    return result.text;
  }

  throw new Error(`Remote execution is not configured for ${input.task.owner}.`);
}

async function buildDirectAgentContext(intent: AguiIntent) {
  if (intent.projectId === "free-project") {
    return [
      "Project mode: 自由项目。",
      "当前对话是开放性任务，不绑定 AG-UI 推广网页开发的共享记忆边界。",
      "请直接回应用户请求；如果需要文件、图片、URL 或部署产物，请明确说明产出位置或下一步需要什么。"
    ].join("\n");
  }

  const snapshot = await readContextHubSnapshot();
  const contextHub = snapshot
    .map((file) => {
      const content = file.exists && file.content.trim() ? file.content.trim() : "暂无内容";
      return `--- ${file.path} (${file.purpose}) ---\n${content}`;
    })
    .join("\n\n");

  return `Project mode: AG-UI 推广网页开发 / Vibe Office。\nShared memory snapshot:\n${contextHub}`;
}

async function sendDirectAgentResponse(intent: AguiIntent, runId: string) {
  const context = await buildDirectAgentContext(intent);
  const attachmentContext = formatAttachmentContext(intent.attachments);
  const message = [
    `You are ${intent.targetAgent}, a real Hermes Agent in Vibe Office.`,
    "This is a direct user message, not a planning-agent-orchestrated task.",
    "Do not pretend another agent completed work.",
    "For simple requests, answer directly. For complex requests, say whether it should be escalated to the planning agent.",
    ARTIFACT_OUTPUT_PROTOCOL,
    "",
    context,
    "",
    "User message:",
    intent.message || "",
    attachmentContext ? "\nAttached image/file context:" : "",
    attachmentContext
  ].join("\n");
  const conversation = `ag-ui-direct-${intent.projectId}-${intent.targetAgent.toLowerCase()}`;
  const responsesInput = await buildHermesResponsesInput({
    message,
    attachments: intent.attachments
  });

  if (intent.targetAgent === "Lucy") {
    const result = await sendHermesAgentResponse("Lucy", { message, responsesInput, conversation });
    return result.text;
  }
  if (intent.targetAgent === "Tiger") {
    const result = await sendHermesAgentResponse("Tiger", { message, responsesInput, conversation });
    return result.text;
  }
  if (intent.targetAgent === "Musk") {
    const result = await sendHermesAgentResponse("Musk", { message, responsesInput, conversation });
    return result.text;
  }

  throw new Error(`Direct Hermes chat is not configured for ${intent.targetAgent}.`);
}

async function streamDirectAgentMessage(input: {
  controller: ReadableStreamDefaultController<Uint8Array>;
  intent: AguiIntent;
  runId: string;
  threadId?: string;
  messageId: string;
}) {
  const toolCallId = `tool_direct_${input.intent.targetAgent.toLowerCase()}_${input.runId}`;

  await emit(input.controller, {
    type: EventType.STATE_DELTA,
    delta: [{ op: "replace", path: `/agents/${input.intent.targetAgent}/status`, value: "working" }],
    timestamp: Date.now()
  });
  await emit(input.controller, {
    type: EventType.TOOL_CALL_START,
    toolCallId,
    toolCallName: "direct_agent_message",
    parentMessageId: input.messageId,
    timestamp: Date.now()
  });
  await emit(input.controller, {
    type: EventType.TOOL_CALL_ARGS,
    toolCallId,
    delta: JSON.stringify({
      targetAgent: input.intent.targetAgent,
      projectId: input.intent.projectId,
      mode: input.intent.projectId === "free-project" ? "free" : "context_hub"
    }),
    timestamp: Date.now()
  });

  try {
    const outputText = await sendDirectAgentResponse(input.intent, input.runId);
    await emit(input.controller, {
      type: EventType.TOOL_CALL_END,
      toolCallId,
      timestamp: Date.now()
    });
    await emit(input.controller, {
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: input.messageId,
      delta: outputText,
      timestamp: Date.now()
    });
    await emitRegisteredArtifacts({
      controller: input.controller,
      text: outputText,
      owner: input.intent.targetAgent,
      projectId: input.intent.projectId,
      runId: input.runId,
      messageId: input.messageId
    });
    await emit(input.controller, {
      type: EventType.STATE_DELTA,
      delta: [{ op: "replace", path: `/agents/${input.intent.targetAgent}/status`, value: "ready" }],
      timestamp: Date.now()
    });
    await finishRun({
      controller: input.controller,
      threadId: input.threadId,
      runId: input.runId,
      action: input.intent.action,
      targetAgent: input.intent.targetAgent,
      message: input.intent.message,
      messageId: input.messageId,
      status: "success",
      resultStatus: "direct_message_completed",
      notice: `${input.intent.targetAgent} 已回复。`,
      outputText
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : `${input.intent.targetAgent} 直连失败。`;
    await emit(input.controller, {
      type: EventType.TOOL_CALL_END,
      toolCallId,
      timestamp: Date.now()
    });
    await emit(input.controller, {
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: input.messageId,
      delta: `${input.intent.targetAgent} 未连接或直连失败：${message}`,
      timestamp: Date.now()
    });
    await emit(input.controller, {
      type: EventType.STATE_DELTA,
      delta: [{ op: "replace", path: `/agents/${input.intent.targetAgent}/status`, value: "ready" }],
      timestamp: Date.now()
    });
    await finishRun({
      controller: input.controller,
      threadId: input.threadId,
      runId: input.runId,
      action: input.intent.action,
      targetAgent: input.intent.targetAgent,
      message: input.intent.message,
      messageId: input.messageId,
      status: "needs_attention",
      resultStatus: "needs_attention",
      notice: `${input.intent.targetAgent} 直连失败，需要处理。`,
      outputText: message
    });
  }
}

async function finishRun(input: {
  controller: ReadableStreamDefaultController<Uint8Array>;
  threadId?: string;
  runId: string;
  action: AgentAction;
  targetAgent: AgentName;
  message?: string;
  messageId: string;
  status: "success" | "needs_attention" | "failed";
  resultStatus: string;
  notice: string;
  command?: string;
  outputText?: string;
}) {
  await emit(input.controller, {
    type: EventType.TEXT_MESSAGE_END,
    messageId: input.messageId,
    timestamp: Date.now()
  });
  await writeLastResult({
    status: input.resultStatus,
    command: input.command,
    outputText: input.outputText
  });
  await emit(input.controller, {
    type: EventType.RUN_FINISHED,
    threadId: input.threadId || "demo-thread",
    runId: input.runId,
    outcome: { type: "success" },
    result: {
      command: input.command,
      targetAgent: input.targetAgent,
      status: input.resultStatus,
      notice: input.notice
    },
    timestamp: Date.now()
  }, 0);
  await appendRunRecord({
    runId: input.runId,
    threadId: input.threadId,
    action: input.action,
    targetAgent: input.targetAgent,
    message: input.message,
    status: input.status,
    finishedAt: new Date().toISOString()
  });
}

/*
async function legacyStreamPlanningAgentClarification(input: {
  controller: ReadableStreamDefaultController<Uint8Array>;
  intent: AguiIntent;
  runId: string;
  threadId?: string;
  messageId: string;
}) {
  let plan = buildPlanWorkflowClarification(input.intent.message || "");
  await writePlanWorkflow(plan);
  await emit(input.controller, {
    type: EventType.STATE_DELTA,
    delta: [
      { op: "replace", path: "/agents/Lucy/status", value: "reviewing" },
      { op: "replace", path: "/agents/Ray/status", value: "ready" }
    ],
    timestamp: Date.now()
  });
  await emit(input.controller, {
    type: EventType.CUSTOM,
    name: "planning_agent_clarification",
    value: { plan },
    timestamp: Date.now()
  });
  await emit(input.controller, {
    type: EventType.TEXT_MESSAGE_CONTENT,
    messageId: input.messageId,
    delta: `Planning agent entered clarification: ${plan.summary}`,
    timestamp: Date.now()
  });
  await emit(input.controller, {
    type: EventType.STATE_DELTA,
    delta: [{ op: "replace", path: "/agents/Lucy/status", value: "waiting" }],
    timestamp: Date.now()
  });
  await finishRun({
    controller: input.controller,
    threadId: input.threadId,
    runId: input.runId,
    action: input.intent.action,
    targetAgent: input.intent.targetAgent,
    message: input.intent.message,
    messageId: input.messageId,
    status: "success",
    resultStatus: "clarifying",
    notice: "Planning agent started clarification and has not dispatched execution yet.",
    outputText: plan.summary
  });
}

*/
function planningAgentErrorMessage(error: unknown) {
  if (error instanceof HermesAgentError) {
    if (error.code === "not_configured") {
      return "Planning agent is not connected to Hermes API: API_SERVER_KEY is missing. Set API_SERVER_ENABLED=true and API_SERVER_KEY in ~/.hermes/.env, then start hermes gateway.";
    }
    if (error.code === "unauthorized") {
      return "Planning agent is not connected to Hermes API: API_SERVER_KEY authorization failed. Check ~/.hermes/.env.";
    }
    if (error.code === "unreachable") {
      return "Planning agent is not connected to Hermes API: cannot reach http://127.0.0.1:8642. Confirm hermes gateway is running.";
    }
    return `Planning agent Hermes API error: ${error.message}`;
  }

  return error instanceof Error ? error.message : "Planning agent is not connected to Hermes API.";
}
async function streamPlanningAgentRequirement(input: {
  controller: ReadableStreamDefaultController<Uint8Array>;
  intent: AguiIntent;
  runId: string;
  threadId?: string;
  messageId: string;
}) {
  const toolCallId = `tool_planning_agent_${input.runId}`;
  const conversation = `ag-ui-planning-agent-${input.intent.projectId}`;

  await emit(input.controller, {
    type: EventType.STATE_DELTA,
    delta: [{ op: "replace", path: "/agents/Lucy/status", value: "working" }],
    timestamp: Date.now()
  });
  await emit(input.controller, {
    type: EventType.TOOL_CALL_START,
    toolCallId,
    toolCallName: "planning_agent_responses",
    parentMessageId: input.messageId,
    timestamp: Date.now()
  });
  await emit(input.controller, {
    type: EventType.TOOL_CALL_ARGS,
    toolCallId,
    delta: JSON.stringify({
      baseUrl: process.env.HERMES_API_BASE_URL || "http://127.0.0.1:8642/v1",
      endpoint: "/responses",
      conversation
    }),
    timestamp: Date.now()
  }, 0);

  try {
    const message = [input.intent.message || "", formatAttachmentContext(input.intent.attachments)].filter(Boolean).join("\n\n");
    const lucy = await sendHermesAgentResponse("Lucy", {
      message,
      responsesInput: await buildHermesResponsesInput({
        message,
        attachments: input.intent.attachments
      }),
      conversation
    });

    await emit(input.controller, {
      type: EventType.TOOL_CALL_END,
      toolCallId,
      timestamp: Date.now()
    });
    await emit(input.controller, {
      type: EventType.CUSTOM,
      name: "planning_agent_response",
      value: {
        connected: true,
        conversation
      },
      timestamp: Date.now()
    });

    let parsedPlan: PlanWorkflow | null = null;
    try {
      parsedPlan = parsePlanningAgentPlan({ text: lucy.text, requirement: input.intent.message || "" });
    } catch {
      parsedPlan = null;
    }

    if (parsedPlan) {
      await writePlanWorkflow(parsedPlan);
      await emit(input.controller, {
        type: EventType.CUSTOM,
        name: "plan_workflow_ready",
        value: { plan: parsedPlan, source: "hermes" },
        timestamp: Date.now()
      });
      await emit(input.controller, {
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId: input.messageId,
        delta: `Planning agent generated ${parsedPlan.tasks.length} executable tasks. Please review and select them in the task list.`,
        timestamp: Date.now()
      });
      await emit(input.controller, {
        type: EventType.STATE_DELTA,
        delta: [{ op: "replace", path: "/agents/Lucy/status", value: "ready" }],
        timestamp: Date.now()
      });
      await finishRun({
        controller: input.controller,
        threadId: input.threadId,
        runId: input.runId,
        action: input.intent.action,
        targetAgent: input.intent.targetAgent,
        message: input.intent.message,
        messageId: input.messageId,
        status: "success",
        resultStatus: "planned",
        notice: "Planning agent returned a structured plan through Hermes.",
        outputText: parsedPlan.summary
      });
      return;
    }

    await emit(input.controller, {
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: input.messageId,
      delta: lucy.text,
      timestamp: Date.now()
    });
    await emit(input.controller, {
      type: EventType.STATE_DELTA,
      delta: [{ op: "replace", path: "/agents/Lucy/status", value: "ready" }],
      timestamp: Date.now()
    });
    await finishRun({
      controller: input.controller,
      threadId: input.threadId,
      runId: input.runId,
      action: input.intent.action,
      targetAgent: input.intent.targetAgent,
      message: input.intent.message,
      messageId: input.messageId,
      status: "success",
      resultStatus: "planning_agent_connected",
      notice: "Planning agent returned a real response through Hermes API.",
      outputText: lucy.text
    });
  } catch (error) {
    const message = planningAgentErrorMessage(error);

    await emit(input.controller, {
      type: EventType.TOOL_CALL_END,
      toolCallId,
      timestamp: Date.now()
    });
    await emit(input.controller, {
      type: EventType.CUSTOM,
      name: "planning_agent_connection",
      value: {
        connected: false,
        status: "offline",
        reason: error instanceof HermesAgentError ? error.code : "unreachable",
        message
      },
      timestamp: Date.now()
    });
    await emit(input.controller, {
      type: EventType.STATE_DELTA,
      delta: [{ op: "replace", path: "/agents/Lucy/status", value: "offline" }],
      timestamp: Date.now()
    });
    await emit(input.controller, {
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: input.messageId,
      delta: message,
      timestamp: Date.now()
    });
    await finishRun({
      controller: input.controller,
      threadId: input.threadId,
      runId: input.runId,
      action: input.intent.action,
      targetAgent: input.intent.targetAgent,
      message: input.intent.message,
      messageId: input.messageId,
      status: "needs_attention",
      resultStatus: "needs_attention",
      notice: "Planning agent is not connected to Hermes API and is currently offline.",
      outputText: message
    });
  }
}

/*
async function legacyStreamPlanWorkflow(input: {
  controller: ReadableStreamDefaultController<Uint8Array>;
  intent: AguiIntent;
  runId: string;
  threadId?: string;
  messageId: string;
}) {
  const existingPlan = await readPlanWorkflow();
  const plan = buildPlanWorkflowTaskPlan(input.intent.message || existingPlan?.requirement || "", existingPlan);
  await writePlanWorkflow(plan);
  await emit(input.controller, {
    type: EventType.STATE_DELTA,
    delta: [{ op: "replace", path: "/agents/Lucy/status", value: "reviewing" }],
    timestamp: Date.now()
  });
  await emit(input.controller, {
    type: EventType.CUSTOM,
    name: "plan_workflow_ready",
    value: { plan },
    timestamp: Date.now()
  });
  await emit(input.controller, {
    type: EventType.TEXT_MESSAGE_CONTENT,
    messageId: input.messageId,
    delta: `Planning agent generated ${plan.tasks.length} planned tasks and is waiting for your selection.`,
    timestamp: Date.now()
  });
  await emit(input.controller, {
    type: EventType.STATE_DELTA,
    delta: [{ op: "replace", path: "/agents/Lucy/status", value: "waiting" }],
    timestamp: Date.now()
  });
  await finishRun({
    controller: input.controller,
    threadId: input.threadId,
    runId: input.runId,
    action: input.intent.action,
    targetAgent: input.intent.targetAgent,
    message: input.intent.message,
    messageId: input.messageId,
    status: "success",
    resultStatus: "planned",
    notice: "Planning agent generated a plan. Select tasks in the task list to execute.",
    outputText: plan.summary
  });
}

*/

async function streamPlanWorkflow(input: {
  controller: ReadableStreamDefaultController<Uint8Array>;
  intent: AguiIntent;
  runId: string;
  threadId?: string;
  messageId: string;
}) {
  const existingPlan = await readPlanWorkflow();
  const requirement = input.intent.message || existingPlan?.requirement || "";
  const toolCallId = `tool_planning_agent_plan_${input.runId}`;
  const conversation = `ag-ui-planning-agent-${input.intent.projectId}`;

  await emit(input.controller, {
    type: EventType.STATE_DELTA,
    delta: [{ op: "replace", path: "/agents/Lucy/status", value: "reviewing" }],
    timestamp: Date.now()
  });
  await emit(input.controller, {
    type: EventType.TOOL_CALL_START,
    toolCallId,
    toolCallName: "planning_agent_plan",
    parentMessageId: input.messageId,
    timestamp: Date.now()
  });
  await emit(input.controller, {
    type: EventType.TOOL_CALL_ARGS,
    toolCallId,
    delta: JSON.stringify({
      endpoint: "/responses",
      conversation,
      format: "json_plan"
    }),
    timestamp: Date.now()
  }, 0);

  try {
    const message = buildHermesPlanPrompt(requirement, input.intent.attachments);
    const lucy = await sendHermesAgentResponse("Lucy", {
      message,
      responsesInput: await buildHermesResponsesInput({
        message,
        attachments: input.intent.attachments
      }),
      conversation
    });
    const plan = parsePlanningAgentPlan({ text: lucy.text, requirement, existingPlan });
    await writePlanWorkflow(plan);

    await emit(input.controller, {
      type: EventType.TOOL_CALL_END,
      toolCallId,
      timestamp: Date.now()
    });
    await emit(input.controller, {
      type: EventType.CUSTOM,
      name: "plan_workflow_ready",
      value: { plan, source: "hermes" },
      timestamp: Date.now()
    });
    await emit(input.controller, {
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: input.messageId,
      delta: `Planning agent generated ${plan.tasks.length} planned tasks. Select tasks in the task list to execute.`,
      timestamp: Date.now()
    });
    await emit(input.controller, {
      type: EventType.STATE_DELTA,
      delta: [{ op: "replace", path: "/agents/Lucy/status", value: "ready" }],
      timestamp: Date.now()
    });
    await finishRun({
      controller: input.controller,
      threadId: input.threadId,
      runId: input.runId,
      action: input.intent.action,
      targetAgent: input.intent.targetAgent,
      message: input.intent.message,
      messageId: input.messageId,
      status: "success",
      resultStatus: "planned",
      notice: "Planning agent generated a plan through Hermes. Select tasks in the task list to execute.",
      outputText: plan.summary
    });
  } catch (error) {
    const message =
      error instanceof HermesAgentError
        ? `Planning-agent plan generation needs attention: ${error.message}`
        : error instanceof Error
          ? `Planning-agent plan generation needs attention: ${error.message}`
          : "Planning-agent plan generation needs attention.";

    await emit(input.controller, {
      type: EventType.TOOL_CALL_END,
      toolCallId,
      timestamp: Date.now()
    });
    await emit(input.controller, {
      type: EventType.CUSTOM,
      name: "plan_workflow_failed",
      value: { source: "hermes", message },
      timestamp: Date.now()
    });
    await emit(input.controller, {
      type: EventType.STATE_DELTA,
      delta: [{ op: "replace", path: "/agents/Lucy/status", value: "blocked" }],
      timestamp: Date.now()
    });
    await emit(input.controller, {
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: input.messageId,
      delta: message,
      timestamp: Date.now()
    });
    await finishRun({
      controller: input.controller,
      threadId: input.threadId,
      runId: input.runId,
      action: input.intent.action,
      targetAgent: input.intent.targetAgent,
      message: input.intent.message,
      messageId: input.messageId,
      status: "needs_attention",
      resultStatus: "needs_attention",
      notice: "Planning agent returned an unusable plan format that needs attention.",
      outputText: message
    });
  }
}

function intentForTask(task: TaskItem): AguiIntent {
  if (task.owner === "Tiger") {
    return {
      action: "ask_tiger_blog",
      targetAgent: "Tiger",
      projectId: "demo-project",
      taskId: task.id,
      message: task.description || task.title
    };
  }

  if (task.owner === "Lucy") {
    return {
      action: "ask_planning_agent_review",
      targetAgent: "Lucy",
      projectId: "demo-project",
      taskId: task.id,
      message: task.description || task.title
    };
  }

  return {
    action: "dispatch_to_ray",
    targetAgent: "Ray",
    projectId: "demo-project",
    taskId: task.id,
    message: task.description || task.title
  };
}

function containsUrl(text: string) {
  return /https?:\/\/[^\s)）"'<>]+/i.test(text);
}

function validateTaskDelivery(task: TaskItem, outputText: string) {
  const title = `${task.title} ${task.description || ""}`;

  if (task.owner === "Musk" && /部署|deploy|server|服务器/i.test(title) && !containsUrl(outputText)) {
    return "Musk deployment task must return an accessible URL before downstream validation can run.";
  }

  if (/验收|终验|acceptance|validate/i.test(title) && /不通过|blocked|无法验证|缺失|没有|cannot|missing/i.test(outputText)) {
    return "Validation task reported that required upstream delivery is missing.";
  }

  return "";
}

async function streamSelectedTasks(input: {
  controller: ReadableStreamDefaultController<Uint8Array>;
  intent: AguiIntent;
  runId: string;
  threadId?: string;
  messageId: string;
}) {
  const plan = await readPlanWorkflow();
  const selectedIds = new Set(input.intent.selectedTaskIds || []);
  const selectedTasks = sortTasksForExecution((plan?.tasks || []).filter((task) => selectedIds.has(task.id)));

  if (!plan || selectedTasks.length === 0) {
    await emit(input.controller, {
      type: EventType.RUN_ERROR,
      message: "??????????????????????",
      runId: input.runId,
      timestamp: Date.now()
    });
    await finishRun({
      controller: input.controller,
      threadId: input.threadId,
      runId: input.runId,
      action: input.intent.action,
      targetAgent: input.intent.targetAgent,
      message: input.intent.message,
      messageId: input.messageId,
      status: "needs_attention",
      resultStatus: "needs_attention",
      notice: "??????????",
      outputText: "??????????"
    });
    return;
  }

  const summaries: string[] = [];
  let hasFailure = false;
  let hasDisabledLocalRunner = false;
  const taskResults = new Map<string, { status: "completed" | "reviewing" | "blocked" | "deferred" | "selected"; summary: string }>();

  const executingPlan: PlanWorkflow = {
    ...plan,
    stage: "executing",
    tasks: plan.tasks.map((task) =>
      selectedIds.has(task.id) ? { ...task, selected: true, planStatus: "selected", status: "waiting" } : task
    )
  };

  await writePlanWorkflow(executingPlan);
  await emit(input.controller, {
    type: EventType.CUSTOM,
    name: "selected_tasks_started",
    value: {
      plan: executingPlan,
      selectedTaskIds: selectedTasks.map((task) => task.id),
      executableTaskIds: selectedTasks.map((task) => task.id),
      remoteTaskIds: selectedTasks.filter((task) => task.owner !== "Ray").map((task) => task.id)
    },
    timestamp: Date.now()
  });

  for (const task of selectedTasks) {
    if (hasFailure) {
      const summary = `${task.id} ${task.title}: deferred because an upstream task needs attention.`;
      taskResults.set(task.id, { status: "deferred", summary });
      summaries.push(summary);

      await emit(input.controller, {
        type: EventType.CUSTOM,
        name: "selected_task_deferred",
        value: {
          taskId: task.id,
          owner: task.owner,
          reason: "upstream_blocked"
        },
        timestamp: Date.now()
      });
      await emit(input.controller, {
        type: EventType.STATE_DELTA,
        delta: [
          { op: "replace", path: "/tasks/" + task.id + "/status", value: "waiting" },
          { op: "replace", path: "/tasks/" + task.id + "/planStatus", value: "deferred" }
        ],
        timestamp: Date.now()
      });
      continue;
    }

    const agentStatus = remoteAgentStatus(task.owner);
    await emit(input.controller, {
      type: EventType.STATE_DELTA,
      delta: [
        { op: "replace", path: "/agents/" + task.owner + "/status", value: agentStatus },
        { op: "replace", path: "/tasks/" + task.id + "/status", value: agentStatus },
        { op: "replace", path: "/tasks/" + task.id + "/planStatus", value: "executing" }
      ],
      timestamp: Date.now()
    });

    await emit(input.controller, {
      type: EventType.CUSTOM,
      name: "agent_task_started",
      value: {
        taskId: task.id,
        owner: task.owner,
        mode: task.owner === "Ray" ? "local" : "hermes"
      },
      timestamp: Date.now()
    });

    let failed = false;
    let outputText = "";
    let outputFile: string | undefined;
    let mode = task.owner === "Ray" ? "local" : "hermes";
    let exitCode: number | null = 0;
    let error: string | undefined;
    let enabled = true;

    if (task.owner === "Ray") {
      const taskIntent = intentForTask(task);
      const localRun = await runLocalAgentAction(taskIntent, task.title);
      const codexRun = await runCodexExec({
        intent: taskIntent,
        taskTitle: task.title,
        command: localRun.command,
        runId: input.runId + "_" + task.id
      });
      enabled = codexRun.enabled;
      if (!codexRun.enabled) {
        hasDisabledLocalRunner = true;
      } else {
        failed = Boolean(codexRun.error) || codexRun.exitCode !== 0;
      }
      outputText = codexRun.outputText || "";
      outputFile = codexRun.outputFile;
      mode = codexRun.mode || mode;
      exitCode = codexRun.exitCode ?? null;
      error = codexRun.error;
    } else {
      try {
        outputText = await runRemoteAgentTask({
          task,
          plan,
          requirement: input.intent.message,
          runId: input.runId
        });
      } catch (remoteError) {
        failed = true;
        exitCode = null;
        error = remoteError instanceof Error ? remoteError.message : "Remote Hermes execution failed.";
      }
    }

    const deliveryIssue = enabled && !failed ? validateTaskDelivery(task, outputText) : "";
    if (deliveryIssue) {
      failed = true;
      error = deliveryIssue;
    }

    const artifacts = outputText
      ? await emitRegisteredArtifacts({
          controller: input.controller,
          text: outputText,
          owner: task.owner,
          projectId: input.intent.projectId,
          runId: input.runId,
          messageId: input.messageId,
          taskId: task.id
        })
      : [];

    hasFailure = hasFailure || failed;
    const resultStatus = !enabled ? "selected" : failed ? "blocked" : task.owner === "Lucy" ? "completed" : "reviewing";
    const summary = !enabled
      ? `${task.id} ${task.title}: Ray runner is not enabled; task remains selected.`
      : `${task.id} ${task.title}: ${
          failed
            ? `${task.owner} needs attention${error ? ` (${error})` : ""}`
            : task.owner === "Lucy"
              ? "Planning agent finished and marked the task completed"
              : `${task.owner} finished; awaiting review`
        }`;
    taskResults.set(task.id, { status: resultStatus, summary });
    summaries.push(summary);

    await emit(input.controller, {
      type: EventType.CUSTOM,
      name: "selected_task_result",
      value: {
        taskId: task.id,
        owner: task.owner,
        exitCode,
        enabled,
        mode,
        outputFile,
        outputText: outputText.slice(0, 1200),
        artifacts,
        error,
        awaitingPlanningAgentReview: enabled && !failed && task.owner !== "Lucy"
      },
      timestamp: Date.now()
    });
    await emit(input.controller, {
      type: EventType.STATE_DELTA,
      delta: [
        { op: "replace", path: "/agents/" + task.owner + "/status", value: "ready" },
        { op: "replace", path: "/tasks/" + task.id + "/status", value: !enabled ? "waiting" : failed ? "blocked" : task.owner === "Lucy" ? "ready" : "reviewing" },
        { op: "replace", path: "/tasks/" + task.id + "/planStatus", value: resultStatus }
      ],
      timestamp: Date.now()
    });
  }

  const nextPlan = await updatePlanWorkflow((current) => {
    const tasks: TaskItem[] = (current || executingPlan).tasks.map((task): TaskItem => {
      if (!selectedIds.has(task.id)) return task;
      const result = taskResults.get(task.id);
      if (result?.status === "blocked") return { ...task, planStatus: "blocked", status: "blocked" };
      if (result?.status === "deferred") return { ...task, planStatus: "deferred", status: "waiting" };
      if (result?.status === "selected") return { ...task, planStatus: "selected", status: "waiting" };
      if (result?.status === "completed") return { ...task, selected: false, planStatus: "completed", status: "ready" };
      return { ...task, planStatus: "reviewing", status: "reviewing" };
    });

    return {
      ...(current || executingPlan),
      stage: hasFailure ? "blocked" : hasDisabledLocalRunner ? "planned" : inferPlanWorkflowStage(tasks),
      tasks
    };
  });

  await emit(input.controller, {
    type: EventType.CUSTOM,
    name: "agent_execution_completed",
    value: {
      plan: nextPlan,
      summaries,
      awaitingPlanningAgentReview: !hasFailure && !hasDisabledLocalRunner && Array.from(taskResults.values()).some((result) => result.status === "reviewing")
    },
    timestamp: Date.now()
  });
  await emit(input.controller, {
    type: EventType.STATE_DELTA,
    delta: [{ op: "replace", path: "/agents/Lucy/status", value: nextPlan.stage === "reviewing" ? "waiting" : "ready" }],
    timestamp: Date.now()
  });
  await emit(input.controller, {
    type: EventType.TEXT_MESSAGE_CONTENT,
    messageId: input.messageId,
    delta: summaries.join("\n"),
    timestamp: Date.now()
  });
  await finishRun({
    controller: input.controller,
    threadId: input.threadId,
    runId: input.runId,
    action: input.intent.action,
    targetAgent: input.intent.targetAgent,
    message: input.intent.message,
    messageId: input.messageId,
    status: hasFailure ? "needs_attention" : "success",
    resultStatus: hasFailure ? "needs_attention" : hasDisabledLocalRunner ? "ray_runner_disabled" : nextPlan.stage === "reviewing" ? "awaiting_planning_agent_review" : "completed",
    notice: hasFailure
      ? "Agent task needs attention."
      : hasDisabledLocalRunner
        ? "Ray runner is not enabled; selected task remains queued."
        : nextPlan.stage === "reviewing"
          ? "Agent task is ready for planning-agent review."
          : "Agent task completed.",
    outputText: summaries.join("\n")
  });
}

async function streamAgentRun(input: RunAgentInput, controller: ReadableStreamDefaultController<Uint8Array>) {
  const intent = getIntent(input);
  const runId = input.runId;
  const threadId = input.threadId;
  const messageId = `assistant_${runId}`;
  const contextToolCallId = `tool_context_${runId}`;
  const inboxToolCallId = `tool_inbox_${runId}`;
  const codexToolCallId = `tool_codex_${runId}`;
  const rayToolCallId = `tool_ray_execute_${runId}`;
  const planningAgentToolCallId = `tool_planning_agent_review_${runId}`;
  const currentPlan = await readPlanWorkflow().catch(() => null);
  const task =
    currentPlan?.tasks.find((item) => item.id === intent.taskId) ||
    initialTasks.find((item) => item.id === intent.taskId) ||
    initialTasks[0];
  const copy = actionCopy(intent.action);
  const triage = intent.action === "submit_requirement_to_planning_agent" ? triageRequirement(intent.message) : undefined;
  const shouldHandoffToRay = intent.action === "submit_requirement_to_planning_agent";

  await emit(controller, {
    type: EventType.RUN_STARTED,
    threadId,
    runId,
    input,
    timestamp: Date.now()
  });
  await appendRunRecord({
    runId,
    threadId,
    action: intent.action,
    targetAgent: intent.targetAgent,
    message: intent.message,
    status: "running",
    startedAt: new Date().toISOString()
  });
  await emit(controller, {
    type: EventType.TEXT_MESSAGE_START,
    messageId,
    role: "assistant",
    name: intent.targetAgent,
    timestamp: Date.now()
  });
  if (intent.action === "submit_requirement_to_planning_agent") {
    await streamPlanningAgentRequirement({ controller, intent, runId, threadId, messageId });
    return;
  }
  if (intent.action === "generate_plan_workflow") {
    await streamPlanWorkflow({ controller, intent, runId, threadId, messageId });
    return;
  }
  if (intent.action === "manual_message" && intent.targetAgent !== "Ray") {
    await streamDirectAgentMessage({ controller, intent, runId, threadId, messageId });
    return;
  }
  await emit(controller, {
    type: EventType.TEXT_MESSAGE_CONTENT,
    messageId,
    delta: `${intent.targetAgent} 已收到控制台意图：${copy.step}。开始读取本地工作区上下文。`,
    timestamp: Date.now()
  });
  if (intent.action === "execute_selected_tasks") {
    await streamSelectedTasks({ controller, intent, runId, threadId, messageId });
    return;
  }

  await emit(controller, {
    type: EventType.STATE_DELTA,
    delta: [
      { op: "replace", path: `/agents/${intent.targetAgent}/status`, value: copy.status },
      { op: "replace", path: `/tasks/${task.id}/status`, value: copy.status }
    ],
    timestamp: Date.now()
  });
  await emit(controller, {
    type: EventType.TOOL_CALL_START,
    toolCallId: contextToolCallId,
    toolCallName: "read_local_workspace_context",
    parentMessageId: messageId,
    timestamp: Date.now()
  });

  const localRun = await runLocalAgentAction(intent, task.title);
  const command = localRun.command;
  const contextFiles = localRun.contextFiles.map((file) => ({
    path: file.path,
    exists: file.exists
  }));

  await emit(controller, {
    type: EventType.TOOL_CALL_ARGS,
    toolCallId: contextToolCallId,
    delta: JSON.stringify({
      files: contextFiles.map((file) => file.path),
      git: true
    }),
    timestamp: Date.now()
  });
  await emit(controller, {
    type: EventType.TOOL_CALL_END,
    toolCallId: contextToolCallId,
    timestamp: Date.now()
  });
  await emit(controller, {
    type: EventType.TEXT_MESSAGE_CONTENT,
    messageId,
    delta: ` 已读取 ${contextFiles.filter((file) => file.exists).length} 个本地文件，准备写入 ${intent.targetAgent} inbox。`,
    timestamp: Date.now()
  });
  await emit(controller, {
    type: EventType.TOOL_CALL_START,
    toolCallId: inboxToolCallId,
    toolCallName: copy.tool,
    parentMessageId: messageId,
    timestamp: Date.now()
  });
  await emit(controller, {
    type: EventType.TOOL_CALL_ARGS,
    toolCallId: inboxToolCallId,
    delta: JSON.stringify({
      targetAgent: intent.targetAgent,
      action: intent.action,
      writtenFiles: localRun.writtenFiles
    }),
    timestamp: Date.now()
  });
  await emit(controller, {
    type: EventType.TOOL_CALL_END,
    toolCallId: inboxToolCallId,
    timestamp: Date.now()
  });
  await emit(controller, {
    type: EventType.CUSTOM,
    name: "local_agent_run",
    value: {
      mode: localRun.mode,
      contextFiles,
      gitStatus: localRun.gitStatus,
      writtenFiles: localRun.writtenFiles,
      summary: localRun.summary
    },
    timestamp: Date.now()
  });
  await emit(controller, {
    type: EventType.CUSTOM,
    name: "context_hub_read",
    value: {
      files: localRun.contextHub.readFiles,
      count: localRun.contextHub.readFiles.length
    },
    timestamp: Date.now()
  });
  await emit(controller, {
    type: EventType.CUSTOM,
    name: "context_hub_write",
    value: {
      files: localRun.contextHub.writtenFiles,
      count: localRun.contextHub.writtenFiles.length
    },
    timestamp: Date.now()
  });
  if (triage) {
    await emit(controller, {
      type: EventType.CUSTOM,
      name: "planning_agent_triage",
      value: {
        priority: triage.priority,
        mode: triage.mode,
        owner: triage.owner,
        reason: triage.reason
      },
      timestamp: Date.now()
    });
    await emit(controller, {
      type: EventType.STATE_DELTA,
      delta: [{ op: "replace", path: `/tasks/${task.id}/priority`, value: triage.priority }],
      timestamp: Date.now()
    });
  }
  if (intent.action === "ask_tiger_blog" || intent.action === "ask_tiger_publish") {
    await emit(controller, {
      type: EventType.CUSTOM,
      name: "blog_context_used",
      value: {
        files: ["ops/BLOG_CONTEXT.md", "ops/RELEASE_NOTES.md"]
      },
      timestamp: Date.now()
    });
  }
  await emit(controller, {
    type: EventType.TOOL_CALL_START,
    toolCallId: codexToolCallId,
    toolCallName: "codex_exec",
    parentMessageId: messageId,
    timestamp: Date.now()
  });
  await emit(controller, {
    type: EventType.TOOL_CALL_ARGS,
    toolCallId: codexToolCallId,
    delta: JSON.stringify({
      targetAgent: intent.targetAgent,
      action: intent.action
    }),
    timestamp: Date.now()
  }, 0);

  const codexRun = await runCodexExec({
    intent,
    taskTitle: task.title,
    command,
    runId
  });
  let commandPreview = codexRun.outputText
    ? `${command}\n\n---\n\nLocal Codex execution result:\n\n${codexRun.outputText}`
    : command;
  if (triage) {
    commandPreview = `${commandPreview}\n\n---\n\nPlanning-agent triage:\n\n${triageSummary(triage)}`;
  }

  let linkedRayRun: Awaited<ReturnType<typeof runLocalAgentAction>> | undefined;
  let linkedRayCodexRun: Awaited<ReturnType<typeof runCodexExec>> | undefined;
  let linkedPlanningAgentRun: Awaited<ReturnType<typeof runCodexExec>> | undefined;

  if (shouldHandoffToRay) {
    const rayIntent: AguiIntent = {
      action: "dispatch_to_ray",
      targetAgent: "Ray",
      projectId: "demo-project",
      taskId: intent.taskId,
      message: `Planning-agent Ray task: ${intent.message || task.title}`
    };

    await emit(controller, {
      type: EventType.CUSTOM,
      name: "plan_workflow_created",
      value: {
        requirement: intent.message,
        assignedTo: "Ray",
        acceptance: ["Update Project Context Hub", "Deliver a verifiable result", "Return for planning-agent review"]
      },
      timestamp: Date.now()
    });
    await emit(controller, {
      type: EventType.CUSTOM,
      name: "handoff_to_ray",
      value: {
        from: "Planning Agent",
        to: "Ray",
        reason: "Planning agent broke down the user requirement and assigned Ray to execute."
      },
      timestamp: Date.now()
    });
    await emit(controller, {
      type: EventType.STATE_DELTA,
      delta: [
        { op: "replace", path: "/agents/Lucy/status", value: "waiting" },
        { op: "replace", path: "/agents/Ray/status", value: "coding" },
        { op: "replace", path: `/tasks/${task.id}/status`, value: "coding" }
      ],
      timestamp: Date.now()
    });
    await emit(controller, {
      type: EventType.TOOL_CALL_START,
      toolCallId: rayToolCallId,
      toolCallName: "linked_ray_execution",
      parentMessageId: messageId,
      timestamp: Date.now()
    });

    linkedRayRun = await runLocalAgentAction(rayIntent, task.title);
    linkedRayCodexRun = await runCodexExec({
      intent: rayIntent,
      taskTitle: task.title,
      command: linkedRayRun.command,
      runId: `${runId}_ray`
    });

    await emit(controller, {
      type: EventType.TOOL_CALL_ARGS,
      toolCallId: rayToolCallId,
      delta: JSON.stringify({
        sourceAgent: "Planning Agent",
        targetAgent: "Ray",
        writtenFiles: linkedRayRun.writtenFiles,
        contextHubWrites: linkedRayRun.contextHub.writtenFiles,
        codexMode: linkedRayCodexRun.mode,
        codexExitCode: linkedRayCodexRun.exitCode
      }),
      timestamp: Date.now()
    });
    await emit(controller, {
      type: EventType.TOOL_CALL_END,
      toolCallId: rayToolCallId,
      timestamp: Date.now()
    });
    await emit(controller, {
      type: EventType.CUSTOM,
      name: "ray_linked_execution",
      value: {
        writtenFiles: linkedRayRun.writtenFiles,
        contextHubWrites: linkedRayRun.contextHub.writtenFiles,
        codex: {
          enabled: linkedRayCodexRun.enabled,
          mode: linkedRayCodexRun.mode,
          exitCode: linkedRayCodexRun.exitCode,
          outputFile: linkedRayCodexRun.outputFile,
          outputText: linkedRayCodexRun.outputText,
          error: linkedRayCodexRun.error
        }
      },
      timestamp: Date.now()
    });
    await emit(controller, {
      type: EventType.CUSTOM,
      name: "ray_code_result",
      value: {
        enabled: linkedRayCodexRun.enabled,
        mode: linkedRayCodexRun.mode,
        exitCode: linkedRayCodexRun.exitCode,
        outputFile: linkedRayCodexRun.outputFile,
        outputText: linkedRayCodexRun.outputText,
        error: linkedRayCodexRun.error
      },
      timestamp: Date.now()
    });
    await writeLastResult({
      status:
        linkedRayCodexRun.exitCode === 0 && !linkedRayCodexRun.error
            ? "Ray execution completed"
            : "Ray execution needs attention",
      outputText: linkedRayCodexRun.outputText || linkedRayCodexRun.error,
      outputFile: linkedRayCodexRun.outputFile
    });
    await emit(controller, {
      type: EventType.CUSTOM,
      name: "context_hub_write",
      value: {
        files: linkedRayRun.contextHub.writtenFiles,
        count: linkedRayRun.contextHub.writtenFiles.length
      },
      timestamp: Date.now()
    });
  }

  if (intent.action === "dispatch_to_ray" || shouldHandoffToRay) {
    const planningAgentIntent: AguiIntent = {
      action: "ask_planning_agent_review",
      targetAgent: "Lucy",
      projectId: "demo-project",
      taskId: intent.taskId,
      message:
        shouldHandoffToRay
          ? "Ray executed the plan workflow and wrote to Project Context Hub. Ask the planning agent to review automatically."
          : "Ray completed the Project Context Hub write. Review automatically from shared context."
    };
    const reviewSource = linkedRayRun || localRun;
    const planningAgentCommand = buildCommandTemplate({
      action: planningAgentIntent.action,
      targetAgent: planningAgentIntent.targetAgent,
      taskTitle: task.title,
      manualMessage: planningAgentIntent.message,
      localContextSummary: `${reviewSource.summary}\nProject Context Hub files: ${reviewSource.contextHub.readFiles.join(", ")}\nRay wrote this time: ${
        reviewSource.contextHub.writtenFiles.length ? reviewSource.contextHub.writtenFiles.join(", ") : "none"
      }`
    });

    await emit(controller, {
      type: EventType.CUSTOM,
      name: "handoff_to_planning_agent",
      value: {
        from: shouldHandoffToRay ? "Ray (via plan workflow)" : "Ray",
        to: "Planning Agent",
        reason: "Ray wrote to Project Context Hub, triggering planning-agent review automatically."
      },
      timestamp: Date.now()
    });
    await emit(controller, {
      type: EventType.STATE_DELTA,
      delta: [
        { op: "replace", path: "/agents/Lucy/status", value: "reviewing" },
        { op: "replace", path: `/tasks/${task.id}/status`, value: "reviewing" }
      ],
      timestamp: Date.now()
    });
    await emit(controller, {
      type: EventType.TOOL_CALL_START,
      toolCallId: planningAgentToolCallId,
      toolCallName: "linked_planning_agent_review",
      parentMessageId: messageId,
      timestamp: Date.now()
    });
    await emit(controller, {
      type: EventType.TOOL_CALL_ARGS,
      toolCallId: planningAgentToolCallId,
      delta: JSON.stringify({
        sourceAgent: "Ray",
        targetAgent: "Lucy",
        files: reviewSource.contextHub.readFiles,
        writtenFiles: reviewSource.contextHub.writtenFiles
      }),
      timestamp: Date.now()
    }, 0);

    linkedPlanningAgentRun = await runCodexExec({
      intent: planningAgentIntent,
      taskTitle: task.title,
      command: planningAgentCommand,
      runId: `${runId}_planning_agent`
    });

    await emit(controller, {
      type: EventType.TOOL_CALL_END,
      toolCallId: planningAgentToolCallId,
      timestamp: Date.now()
    });
    await emit(controller, {
      type: EventType.CUSTOM,
      name: "planning_agent_linked_review",
      value: {
        exitCode: linkedPlanningAgentRun.exitCode,
        outputFile: linkedPlanningAgentRun.outputFile,
        outputText: linkedPlanningAgentRun.outputText,
        error: linkedPlanningAgentRun.error
      },
      timestamp: Date.now()
    });
    await writeLastResult({
      status: linkedPlanningAgentRun.exitCode === 0 ? "Planning-agent review completed" : "Planning-agent review needs attention",
      outputText: linkedPlanningAgentRun.outputText || linkedPlanningAgentRun.error,
      outputFile: linkedPlanningAgentRun.outputFile
    });

    const rayResultText =
      linkedRayCodexRun?.outputText ||
      codexRunNote("Ray", linkedRayCodexRun);

    commandPreview = `${commandPreview}\n\n---\n\n${
      shouldHandoffToRay ? "Planning Agent -> Ray -> Planning Agent orchestration result" : "Ray -> Planning Agent linked review result"
    }:\n\n${
      rayResultText ? `Ray result:\n\n${rayResultText}\n\n---\n\n` : ""
    }${
      linkedPlanningAgentRun.outputText || linkedPlanningAgentRun.error || "Planning agent did not return a review result."
    }`;
  }

  const hasRunFailure = Boolean(
    (codexRun.enabled && (codexRun.exitCode !== 0 || codexRun.error)) ||
      (linkedRayCodexRun && (!linkedRayCodexRun.enabled || linkedRayCodexRun.exitCode !== 0 || linkedRayCodexRun.error)) ||
      (linkedPlanningAgentRun?.enabled && (linkedPlanningAgentRun.exitCode !== 0 || linkedPlanningAgentRun.error))
  );
  const finalTaskStatus = hasRunFailure ? "blocked" : "idle";
  const failureSummary = [
    codexRunIssue(intent.targetAgent, codexRun),
    codexRunIssue("Ray", linkedRayCodexRun),
    codexRunIssue("Planning Agent", linkedPlanningAgentRun)
  ].filter(Boolean);
  const finalAgentPaths = new Set<string>([`/agents/${intent.targetAgent}/status`]);
  if (shouldHandoffToRay || intent.action === "dispatch_to_ray") {
    finalAgentPaths.add("/agents/Lucy/status");
    finalAgentPaths.add("/agents/Ray/status");
  }
  const finalAgentDeltas = Array.from(finalAgentPaths).map((path) => {
    return { op: "replace", path, value: "ready" };
  });
  let reviewedPlan: PlanWorkflow | null = null;

  if (intent.action === "ask_planning_agent_review" && currentPlan?.tasks.some((item) => item.id === task.id)) {
    reviewedPlan = await updatePlanWorkflow((current) => {
      const plan = current || currentPlan;
      const nextStatus: TaskItem["status"] = hasRunFailure ? "blocked" : "ready";
      const nextPlanStatus: TaskItem["planStatus"] = hasRunFailure ? "blocked" : "completed";
      const nextTasks = plan.tasks.map((item) =>
        item.id === task.id
          ? {
              ...item,
              selected: false,
              status: nextStatus,
              planStatus: nextPlanStatus
            }
          : item
      );
      const hasOpenTasks = nextTasks.some((item) => item.planStatus !== "completed" && item.planStatus !== "deferred");

      return {
        ...plan,
        stage: hasRunFailure ? "blocked" : hasOpenTasks ? "planned" : "completed",
        tasks: nextTasks
      };
    });
  }

  await emit(controller, {
    type: EventType.STATE_DELTA,
    delta: [
      ...finalAgentDeltas,
      { op: "replace", path: `/tasks/${task.id}/status`, value: finalTaskStatus },
      ...(intent.action === "ask_planning_agent_review"
        ? [{ op: "replace", path: `/tasks/${task.id}/planStatus`, value: hasRunFailure ? "blocked" : "completed" }]
        : [])
    ],
    timestamp: Date.now()
  });
  if (reviewedPlan) {
    await emit(controller, {
      type: EventType.CUSTOM,
      name: "plan_workflow_completed",
      value: {
        plan: reviewedPlan,
        reviewedTaskId: task.id
      },
      timestamp: Date.now()
    });
  }

  await emit(controller, {
    type: EventType.TOOL_CALL_END,
    toolCallId: codexToolCallId,
    timestamp: Date.now()
  });

  const completionMessage = hasRunFailure
    ? ` Flow finished, but execution needs attention: ${failureSummary.join("; ") || "local execution did not complete successfully"}.`
    : codexRun.enabled
      ? ` Wrote ${localRun.writtenFiles.join(", ")}. Ray executed and the planning agent completed the orchestration review.`
      : ` Wrote ${localRun.writtenFiles.join(", ")}. Codex exec is disabled, so only local execution instructions were generated.`;

  await emit(controller, {
    type: EventType.TEXT_MESSAGE_CONTENT,
    messageId,
    delta: completionMessage,
    timestamp: Date.now()
  });
  await emit(controller, {
    type: EventType.TEXT_MESSAGE_END,
    messageId,
    timestamp: Date.now()
  });
  await emit(controller, {
    type: EventType.CUSTOM,
    name: "codex_exec_result",
    value: {
      enabled: codexRun.enabled,
      mode: codexRun.mode,
      exitCode: codexRun.exitCode,
      outputFile: codexRun.outputFile,
      outputText: codexRun.outputText,
      error: codexRun.error,
      stderrTail: codexRun.stderrTail
    },
    timestamp: Date.now()
  });
  await emit(controller, {
    type: EventType.CUSTOM,
    name: "generated_command",
    value: {
      targetAgent: intent.targetAgent,
      command: commandPreview
    },
    timestamp: Date.now()
  });
  await writeLastResult({
    status: hasRunFailure ? "Execution completed with attention needed" : "Final result generated",
    command: commandPreview
  });
  const runNotice = hasRunFailure
    ? "Flow finished, but a real execution step needs attention."
    : "Task completed and the planning agent completed review.";
  await emit(controller, {
    type: EventType.RUN_FINISHED,
    threadId,
    runId,
    outcome: { type: "success" },
    result: {
      command: commandPreview,
      targetAgent: intent.targetAgent,
      status: hasRunFailure ? "needs_attention" : "completed",
      notice: runNotice
    },
    timestamp: Date.now()
  }, 0);
  await appendRunRecord({
    runId,
    threadId,
    action: intent.action,
    targetAgent: intent.targetAgent,
    message: intent.message,
    status: hasRunFailure ? "needs_attention" : "success",
    finishedAt: new Date().toISOString()
  });
}

export async function POST(request: Request) {
  const input = (await request.json()) as RunAgentInput;

  const stream = new ReadableStream({
    start(controller) {
      void (async () => {
        try {
          enqueueSafe(controller, encoder.encode(": connected\n\n"));
          await streamAgentRun(input, controller);
          enqueueSafe(controller, encoder.encode("data: [DONE]\n\n"));
        } catch (error) {
          const message = error instanceof Error ? error.message : "Local Agent Runtime failed";
          const intent = getIntent(input);
          const errorEvent = {
            type: EventType.RUN_ERROR,
            message,
            timestamp: Date.now()
          } as AGUIEvent;
          await appendEventRecord(errorEvent);
          enqueueSafe(controller, toSse(errorEvent));
          await writeLastResult({
            status: "执行失败",
            outputText: message
          });
          await appendRunRecord({
            runId: input.runId,
            threadId: input.threadId,
            action: intent.action,
            targetAgent: intent.targetAgent,
            message: intent.message,
            status: "failed",
            finishedAt: new Date().toISOString()
          });
        } finally {
          try {
            controller.close();
          } catch {
            // The stream may already be closed by the browser or dev hot reload.
          }
        }
      })();
    }
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no"
    }
  });
}
