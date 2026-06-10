import { EventType, type AGUIEvent, type RunAgentInput } from "@ag-ui/core";
import { runCodexExec } from "@/lib/codex-exec-adapter";
import { buildCommandTemplate } from "@/lib/command-templates";
import { readContextHubSnapshot } from "@/lib/context-hub";
import { HermesLucyError, sendLucyResponse } from "@/lib/hermes-lucy-client";
import { sendMuskResponse } from "@/lib/hermes-musk-client";
import { sendTigerResponse } from "@/lib/hermes-tiger-client";
import { runLocalAgentAction } from "@/lib/local-agent-runtime";
import {
  readLucyPlan,
  sortTasksForExecution,
  updateLucyPlan,
  writeLucyPlan
} from "@/lib/lucy-plan-store";
import { initialTasks } from "@/lib/mock-data";
import { appendEventRecord, appendRunRecord, writeLastResult } from "@/lib/run-history";
import { triageRequirement, triageSummary } from "@/lib/workflow-triage";
import type { AgentAction, AgentName, AguiIntent } from "@/types/agent";
import type { LucyPlan, TaskItem, TaskPriority } from "@/types/task";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const encoder = new TextEncoder();

function toSse(event: AGUIEvent) {
  return encoder.encode(`data: ${JSON.stringify(event)}\n\n`);
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getIntent(input: RunAgentInput): AguiIntent {
  const state = input.state as { intent?: Partial<AguiIntent> };
  const intent = state.intent || {};
  return {
    action: (intent.action || "dispatch_to_ray") as AgentAction,
    targetAgent: (intent.targetAgent || "Ray") as AgentName,
    projectId: "demo-project",
    taskId: intent.taskId || "task-001",
    message: intent.message,
    planId: intent.planId,
    selectedTaskIds: intent.selectedTaskIds
  };
}

function actionCopy(action: AgentAction) {
  const copy: Record<AgentAction, { step: string; tool: string; status: string }> = {
    generate_lucy_plan: {
      step: "生成 Lucy 任务计划",
      tool: "generate_lucy_plan",
      status: "reviewing"
    },
    execute_selected_tasks: {
      step: "执行选中任务",
      tool: "execute_selected_tasks",
      status: "working"
    },
    dispatch_to_ray: {
      step: "派发开发任务",
      tool: "dispatch_task",
      status: "coding"
    },
    submit_requirement_to_lucy: {
      step: "提交需求并编排",
      tool: "lucy_requirement_planning",
      status: "reviewing"
    },
    ask_lucy_review: {
      step: "请求验收",
      tool: "request_review",
      status: "reviewing"
    },
    ask_tiger_publish: {
      step: "准备 Blog 内容",
      tool: "prepare_publish",
      status: "working"
    },
    ask_tiger_blog: {
      step: "生成 Blog 草稿",
      tool: "write_blog_draft",
      status: "working"
    },
    daily_report: {
      step: "生成项目日报",
      tool: "generate_daily_report",
      status: "working"
    },
    manual_message: {
      step: "处理手动消息",
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
  return `hermes_lucy_plan_${Date.now().toString(36)}`;
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

function buildHermesPlanPrompt(requirement: string) {
  return `请基于当前 AG-UI / Vibe Office 项目上下文，把用户需求拆成可执行任务计划。

用户需求：
${requirement}

只返回一个 JSON 对象，不要 Markdown，不要解释。格式如下：
{
  "summary": "一句话总结计划",
  "recommendation": "给用户的下一步建议",
  "tasks": [
    {
      "title": "任务标题",
      "owner": "Ray",
      "priority": "P1",
      "description": "任务说明",
      "acceptance": ["验收标准 1", "验收标准 2"],
      "selected": true
    }
  ]
}

约束：
- owner 只能是 Lucy、Ray、Tiger、Musk；开发实现默认 Ray。
- priority 只能是 P0 到 P6。
- 不要假装 Ray 已经执行。
- 禁止使用、提及或借用旧测试项目，包括 DSA、A股、交易、行情、持仓、盈亏、K线、股票等场景。
- 当前安全测试项目只能是“AG-UI 推广网页开发 / Vibe Office / Project Context Hub”。
- 第一版保持 AG-UI First 极简 MVP。`;
}

function parseHermesLucyPlan(input: { text: string; requirement: string; existingPlan?: LucyPlan | null }): LucyPlan {
  const jsonText = extractJsonObject(input.text);
  if (!jsonText) throw new HermesLucyError("bad_response", "Hermes Lucy did not return a JSON plan.");

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
    throw new HermesLucyError("bad_response", "Hermes Lucy returned a plan without tasks.");
  }

  const id = input.existingPlan?.id || planId();
  const createdAt = input.existingPlan?.createdAt || nowIso();
  const tasks: TaskItem[] = raw.tasks.map((task, index) => {
    const title = typeof task.title === "string" && task.title.trim() ? task.title.trim() : `Lucy 计划任务 ${index + 1}`;
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
    summary: typeof raw.summary === "string" && raw.summary.trim() ? raw.summary.trim() : "Lucy 已生成任务计划。",
    questions: [],
    recommendation:
      typeof raw.recommendation === "string" && raw.recommendation.trim()
        ? raw.recommendation.trim()
        : "请勾选要执行的任务，再交给对应 Agent。",
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

function buildRemoteTaskPrompt(input: { task: TaskItem; plan: LucyPlan; requirement?: string; contextHub: string }) {
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
`;
}

async function runRemoteAgentTask(input: { task: TaskItem; plan: LucyPlan; requirement?: string; runId: string }) {
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
    const result = await sendLucyResponse({ message, conversation });
    return result.text;
  }

  if (input.task.owner === "Tiger") {
    const result = await sendTigerResponse({ message, conversation });
    return result.text;
  }

  if (input.task.owner === "Musk") {
    const result = await sendMuskResponse({ message, conversation });
    return result.text;
  }

  throw new Error(`Remote execution is not configured for ${input.task.owner}.`);
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
async function legacyStreamLucyClarification(input: {
  controller: ReadableStreamDefaultController<Uint8Array>;
  intent: AguiIntent;
  runId: string;
  threadId?: string;
  messageId: string;
}) {
  let plan = buildLucyClarification(input.intent.message || "");
  await writeLucyPlan(plan);
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
    name: "lucy_clarification",
    value: { plan },
    timestamp: Date.now()
  });
  await emit(input.controller, {
    type: EventType.TEXT_MESSAGE_CONTENT,
    messageId: input.messageId,
    delta: `Lucy 已进入需求沟通阶段：${plan.summary}`,
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
    notice: "Lucy 已开始沟通澄清，暂未派发执行。",
    outputText: plan.summary
  });
}

*/
function hermesLucyErrorMessage(error: unknown) {
  if (error instanceof HermesLucyError) {
    if (error.code === "not_configured") {
      return "Lucy 未连接 Hermes API：缺少 API_SERVER_KEY。请在 ~/.hermes/.env 设置 API_SERVER_ENABLED=true 和 API_SERVER_KEY，并启动 hermes gateway。";
    }
    if (error.code === "unauthorized") {
      return "Lucy 未连接 Hermes API：API_SERVER_KEY 鉴权失败，请检查 ~/.hermes/.env。";
    }
    if (error.code === "unreachable") {
      return "Lucy 未连接 Hermes API：无法连接 http://127.0.0.1:8642，请确认 hermes gateway 已启动。";
    }
    return `Lucy 未连接 Hermes API：Hermes 返回异常，${error.message}`;
  }

  return error instanceof Error ? error.message : "Lucy 未连接 Hermes API。";
}

async function streamHermesLucyRequirement(input: {
  controller: ReadableStreamDefaultController<Uint8Array>;
  intent: AguiIntent;
  runId: string;
  threadId?: string;
  messageId: string;
}) {
  const toolCallId = `tool_hermes_lucy_${input.runId}`;

  await emit(input.controller, {
    type: EventType.STATE_DELTA,
    delta: [{ op: "replace", path: "/agents/Lucy/status", value: "working" }],
    timestamp: Date.now()
  });
  await emit(input.controller, {
    type: EventType.TOOL_CALL_START,
    toolCallId,
    toolCallName: "hermes_lucy_responses",
    parentMessageId: input.messageId,
    timestamp: Date.now()
  });
  await emit(input.controller, {
    type: EventType.TOOL_CALL_ARGS,
    toolCallId,
    delta: JSON.stringify({
      baseUrl: process.env.HERMES_API_BASE_URL || "http://127.0.0.1:8642/v1",
      endpoint: "/responses",
      conversation: "ag-ui-lucy"
    }),
    timestamp: Date.now()
  }, 0);

  try {
    const lucy = await sendLucyResponse({
      message: input.intent.message || "",
      conversation: "ag-ui-lucy"
    });

    await emit(input.controller, {
      type: EventType.TOOL_CALL_END,
      toolCallId,
      timestamp: Date.now()
    });
    await emit(input.controller, {
      type: EventType.CUSTOM,
      name: "hermes_lucy_response",
      value: {
        connected: true,
        conversation: "ag-ui-lucy"
      },
      timestamp: Date.now()
    });

    let parsedPlan: LucyPlan | null = null;
    try {
      parsedPlan = parseHermesLucyPlan({ text: lucy.text, requirement: input.intent.message || "" });
    } catch {
      parsedPlan = null;
    }

    if (parsedPlan) {
      await writeLucyPlan(parsedPlan);
      await emit(input.controller, {
        type: EventType.CUSTOM,
        name: "lucy_plan_ready",
        value: { plan: parsedPlan, source: "hermes" },
        timestamp: Date.now()
      });
      await emit(input.controller, {
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId: input.messageId,
        delta: `Lucy generated ${parsedPlan.tasks.length} executable tasks. Please review and select them in the task list.`,
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
        notice: "Lucy returned a structured plan through Hermes.",
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
      resultStatus: "lucy_connected",
      notice: "Lucy 已通过 Hermes API 返回真实响应。",
      outputText: lucy.text
    });
  } catch (error) {
    const message = hermesLucyErrorMessage(error);

    await emit(input.controller, {
      type: EventType.TOOL_CALL_END,
      toolCallId,
      timestamp: Date.now()
    });
    await emit(input.controller, {
      type: EventType.CUSTOM,
      name: "hermes_lucy_connection",
      value: {
        connected: false,
        status: "offline",
        reason: error instanceof HermesLucyError ? error.code : "unreachable",
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
      notice: "Lucy 未连接 Hermes API，当前为离线状态。",
      outputText: message
    });
  }
}

/*
async function legacyStreamLucyPlan(input: {
  controller: ReadableStreamDefaultController<Uint8Array>;
  intent: AguiIntent;
  runId: string;
  threadId?: string;
  messageId: string;
}) {
  const existingPlan = await readLucyPlan();
  const plan = buildLucyTaskPlan(input.intent.message || existingPlan?.requirement || "", existingPlan);
  await writeLucyPlan(plan);
  await emit(input.controller, {
    type: EventType.STATE_DELTA,
    delta: [{ op: "replace", path: "/agents/Lucy/status", value: "reviewing" }],
    timestamp: Date.now()
  });
  await emit(input.controller, {
    type: EventType.CUSTOM,
    name: "lucy_plan_ready",
    value: { plan },
    timestamp: Date.now()
  });
  await emit(input.controller, {
    type: EventType.TEXT_MESSAGE_CONTENT,
    messageId: input.messageId,
    delta: `Lucy 已生成 ${plan.tasks.length} 个计划任务，等待你勾选执行。`,
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
    notice: "Lucy 已生成计划，请在任务列表勾选执行。",
    outputText: plan.summary
  });
}

*/

async function streamLucyPlan(input: {
  controller: ReadableStreamDefaultController<Uint8Array>;
  intent: AguiIntent;
  runId: string;
  threadId?: string;
  messageId: string;
}) {
  const existingPlan = await readLucyPlan();
  const requirement = input.intent.message || existingPlan?.requirement || "";
  const toolCallId = `tool_hermes_lucy_plan_${input.runId}`;

  await emit(input.controller, {
    type: EventType.STATE_DELTA,
    delta: [{ op: "replace", path: "/agents/Lucy/status", value: "reviewing" }],
    timestamp: Date.now()
  });
  await emit(input.controller, {
    type: EventType.TOOL_CALL_START,
    toolCallId,
    toolCallName: "hermes_lucy_plan",
    parentMessageId: input.messageId,
    timestamp: Date.now()
  });
  await emit(input.controller, {
    type: EventType.TOOL_CALL_ARGS,
    toolCallId,
    delta: JSON.stringify({
      endpoint: "/responses",
      conversation: "ag-ui-lucy",
      format: "json_plan"
    }),
    timestamp: Date.now()
  }, 0);

  try {
    const lucy = await sendLucyResponse({
      message: buildHermesPlanPrompt(requirement),
      conversation: "ag-ui-lucy"
    });
    const plan = parseHermesLucyPlan({ text: lucy.text, requirement, existingPlan });
    await writeLucyPlan(plan);

    await emit(input.controller, {
      type: EventType.TOOL_CALL_END,
      toolCallId,
      timestamp: Date.now()
    });
    await emit(input.controller, {
      type: EventType.CUSTOM,
      name: "lucy_plan_ready",
      value: { plan, source: "hermes" },
      timestamp: Date.now()
    });
    await emit(input.controller, {
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: input.messageId,
      delta: `Lucy 已生成 ${plan.tasks.length} 个计划任务，请在任务列表勾选执行。`,
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
      notice: "Lucy 已通过 Hermes 生成计划，请在任务列表勾选执行。",
      outputText: plan.summary
    });
  } catch (error) {
    const message =
      error instanceof HermesLucyError
        ? `Lucy 计划生成需处理：${error.message}`
        : error instanceof Error
          ? `Lucy 计划生成需处理：${error.message}`
          : "Lucy 计划生成需处理。";

    await emit(input.controller, {
      type: EventType.TOOL_CALL_END,
      toolCallId,
      timestamp: Date.now()
    });
    await emit(input.controller, {
      type: EventType.CUSTOM,
      name: "lucy_plan_failed",
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
      notice: "Lucy 返回了不可用的计划格式，需要处理。",
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
      action: "ask_lucy_review",
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
  const plan = await readLucyPlan();
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
  const taskResults = new Map<string, { status: "reviewing" | "blocked" | "deferred"; summary: string }>();

  const executingPlan: LucyPlan = {
    ...plan,
    stage: "executing",
    tasks: plan.tasks.map((task) =>
      selectedIds.has(task.id) ? { ...task, selected: true, planStatus: "selected", status: "waiting" } : task
    )
  };

  await writeLucyPlan(executingPlan);
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

    if (task.owner === "Ray") {
      const taskIntent = intentForTask(task);
      const localRun = await runLocalAgentAction(taskIntent, task.title);
      const codexRun = await runCodexExec({
        intent: taskIntent,
        taskTitle: task.title,
        command: localRun.command,
        runId: input.runId + "_" + task.id
      });
      failed = !codexRun.enabled || Boolean(codexRun.error) || codexRun.exitCode !== 0;
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

    const deliveryIssue = !failed ? validateTaskDelivery(task, outputText) : "";
    if (deliveryIssue) {
      failed = true;
      error = deliveryIssue;
    }

    hasFailure = hasFailure || failed;
    const summary = `${task.id} ${task.title}: ${failed ? `${task.owner} needs attention${error ? ` (${error})` : ""}` : `${task.owner} finished; awaiting review`}`;
    taskResults.set(task.id, { status: failed ? "blocked" : "reviewing", summary });
    summaries.push(summary);

    await emit(input.controller, {
      type: EventType.CUSTOM,
      name: "selected_task_result",
      value: {
        taskId: task.id,
        owner: task.owner,
        exitCode,
        enabled: true,
        mode,
        outputFile,
        outputText: outputText.slice(0, 1200),
        error,
        awaitingLucyReview: !failed && task.owner !== "Lucy"
      },
      timestamp: Date.now()
    });
    await emit(input.controller, {
      type: EventType.STATE_DELTA,
      delta: [
        { op: "replace", path: "/agents/" + task.owner + "/status", value: failed ? "blocked" : "idle" },
        { op: "replace", path: "/tasks/" + task.id + "/status", value: failed ? "blocked" : "reviewing" },
        { op: "replace", path: "/tasks/" + task.id + "/planStatus", value: failed ? "blocked" : "selected" }
      ],
      timestamp: Date.now()
    });
  }

  const nextPlan = await updateLucyPlan((current) => ({
    ...(current || executingPlan),
    stage: hasFailure ? "blocked" : "reviewing",
    tasks: (current || executingPlan).tasks.map((task) => {
      if (!selectedIds.has(task.id)) return task;
      const result = taskResults.get(task.id);
      if (result?.status === "blocked") return { ...task, planStatus: "blocked", status: "blocked" };
      if (result?.status === "deferred") return { ...task, planStatus: "deferred", status: "waiting" };
      return { ...task, planStatus: "selected", status: "reviewing" };
    })
  }));

  await emit(input.controller, {
    type: EventType.CUSTOM,
    name: "agent_execution_completed",
    value: {
      plan: nextPlan,
      summaries,
      awaitingLucyReview: !hasFailure
    },
    timestamp: Date.now()
  });
  await emit(input.controller, {
    type: EventType.STATE_DELTA,
    delta: [{ op: "replace", path: "/agents/Lucy/status", value: hasFailure ? "ready" : "waiting" }],
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
    resultStatus: hasFailure ? "needs_attention" : "awaiting_lucy_review",
    notice: hasFailure ? "Agent ?????????????" : "Agent ??????? Lucy ?????",
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
  const lucyToolCallId = `tool_lucy_review_${runId}`;
  const task = initialTasks.find((item) => item.id === intent.taskId) || initialTasks[0];
  const copy = actionCopy(intent.action);
  const triage = intent.action === "submit_requirement_to_lucy" ? triageRequirement(intent.message) : undefined;
  const shouldHandoffToRay = intent.action === "submit_requirement_to_lucy";

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
  if (intent.action === "submit_requirement_to_lucy") {
    await streamHermesLucyRequirement({ controller, intent, runId, threadId, messageId });
    return;
  }
  if (intent.action === "generate_lucy_plan") {
    await streamLucyPlan({ controller, intent, runId, threadId, messageId });
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
      name: "lucy_triage",
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
    ? `${command}\n\n---\n\n本地 Codex 执行结果：\n\n${codexRun.outputText}`
    : command;
  if (triage) {
    commandPreview = `${commandPreview}\n\n---\n\nLucy 分诊：\n\n${triageSummary(triage)}`;
  }

  let linkedRayRun: Awaited<ReturnType<typeof runLocalAgentAction>> | undefined;
  let linkedRayCodexRun: Awaited<ReturnType<typeof runCodexExec>> | undefined;
  let linkedLucyRun: Awaited<ReturnType<typeof runCodexExec>> | undefined;

  if (shouldHandoffToRay) {
    const rayIntent: AguiIntent = {
      action: "dispatch_to_ray",
      targetAgent: "Ray",
      projectId: "demo-project",
      taskId: intent.taskId,
      message: `Lucy 拆解后的 Ray 任务：${intent.message || task.title}`
    };

    await emit(controller, {
      type: EventType.CUSTOM,
      name: "lucy_plan_created",
      value: {
        requirement: intent.message,
        assignedTo: "Ray",
        acceptance: ["更新 Project Context Hub", "输出可验收结果", "交回 Lucy 验收"]
      },
      timestamp: Date.now()
    });
    await emit(controller, {
      type: EventType.CUSTOM,
      name: "handoff_to_ray",
      value: {
        from: "Lucy",
        to: "Ray",
        reason: "Lucy 已拆解用户需求，自动分配给 Ray 执行。"
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
        sourceAgent: "Lucy",
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
            ? "Ray 执行完成"
            : "Ray 执行需处理",
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
    const lucyIntent: AguiIntent = {
      action: "ask_lucy_review",
      targetAgent: "Lucy",
      projectId: "demo-project",
      taskId: intent.taskId,
      message:
        shouldHandoffToRay
          ? "Ray 已按 Lucy 拆解执行并写入 Project Context Hub，请 Lucy 自动验收。"
          : "Ray 已完成 Project Context Hub 写入，请基于共享上下文自动验收。"
    };
    const reviewSource = linkedRayRun || localRun;
    const lucyCommand = buildCommandTemplate({
      action: lucyIntent.action,
      targetAgent: lucyIntent.targetAgent,
      taskTitle: task.title,
      manualMessage: lucyIntent.message,
      localContextSummary: `${reviewSource.summary}\nProject Context Hub 文件：${reviewSource.contextHub.readFiles.join(", ")}\nRay 本次写入：${
        reviewSource.contextHub.writtenFiles.length ? reviewSource.contextHub.writtenFiles.join(", ") : "无"
      }`
    });

    await emit(controller, {
      type: EventType.CUSTOM,
      name: "handoff_to_lucy",
      value: {
        from: shouldHandoffToRay ? "Ray (via Lucy plan)" : "Ray",
        to: "Lucy",
        reason: "Ray 已写入 Project Context Hub，自动触发 Lucy 统筹验收。"
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
      toolCallId: lucyToolCallId,
      toolCallName: "linked_lucy_review",
      parentMessageId: messageId,
      timestamp: Date.now()
    });
    await emit(controller, {
      type: EventType.TOOL_CALL_ARGS,
      toolCallId: lucyToolCallId,
      delta: JSON.stringify({
        sourceAgent: "Ray",
        targetAgent: "Lucy",
        files: reviewSource.contextHub.readFiles,
        writtenFiles: reviewSource.contextHub.writtenFiles
      }),
      timestamp: Date.now()
    }, 0);

    linkedLucyRun = await runCodexExec({
      intent: lucyIntent,
      taskTitle: task.title,
      command: lucyCommand,
      runId: `${runId}_lucy`
    });

    await emit(controller, {
      type: EventType.TOOL_CALL_END,
      toolCallId: lucyToolCallId,
      timestamp: Date.now()
    });
    await emit(controller, {
      type: EventType.CUSTOM,
      name: "lucy_linked_review",
      value: {
        exitCode: linkedLucyRun.exitCode,
        outputFile: linkedLucyRun.outputFile,
        outputText: linkedLucyRun.outputText,
        error: linkedLucyRun.error
      },
      timestamp: Date.now()
    });
    await writeLastResult({
      status: linkedLucyRun.exitCode === 0 ? "Lucy 验收完成" : "Lucy 验收需处理",
      outputText: linkedLucyRun.outputText || linkedLucyRun.error,
      outputFile: linkedLucyRun.outputFile
    });

    const rayResultText =
      linkedRayCodexRun?.outputText ||
      codexRunNote("Ray", linkedRayCodexRun);

    commandPreview = `${commandPreview}\n\n---\n\n${
      shouldHandoffToRay ? "Lucy → Ray → Lucy 自动编排结果" : "Ray → Lucy 自动联动验收结果"
    }：\n\n${
      rayResultText ? `Ray 结果：\n\n${rayResultText}\n\n---\n\n` : ""
    }${
      linkedLucyRun.outputText || linkedLucyRun.error || "Lucy 未返回验收结果。"
    }`;
  }

  const hasRunFailure = Boolean(
    (codexRun.enabled && (codexRun.exitCode !== 0 || codexRun.error)) ||
      (linkedRayCodexRun && (!linkedRayCodexRun.enabled || linkedRayCodexRun.exitCode !== 0 || linkedRayCodexRun.error)) ||
      (linkedLucyRun?.enabled && (linkedLucyRun.exitCode !== 0 || linkedLucyRun.error))
  );
  const finalTaskStatus = hasRunFailure ? "blocked" : "idle";
  const failureSummary = [
    codexRunIssue(intent.targetAgent, codexRun),
    codexRunIssue("Ray", linkedRayCodexRun),
    codexRunIssue("Lucy", linkedLucyRun)
  ].filter(Boolean);
  const finalAgentPaths = new Set<string>([`/agents/${intent.targetAgent}/status`]);
  if (shouldHandoffToRay || intent.action === "dispatch_to_ray") {
    finalAgentPaths.add("/agents/Lucy/status");
    finalAgentPaths.add("/agents/Ray/status");
  }
  const finalAgentDeltas = Array.from(finalAgentPaths).map((path) => {
    if (hasRunFailure) return { op: "replace", path, value: "blocked" };
    return { op: "replace", path, value: "idle" };
  });

  await emit(controller, {
    type: EventType.STATE_DELTA,
    delta: [
      ...finalAgentDeltas,
      { op: "replace", path: `/tasks/${task.id}/status`, value: finalTaskStatus }
    ],
    timestamp: Date.now()
  });

  await emit(controller, {
    type: EventType.TOOL_CALL_END,
    toolCallId: codexToolCallId,
    timestamp: Date.now()
  });

  const completionMessage = hasRunFailure
    ? ` 流程已结束，但有执行步骤需处理：${failureSummary.join("；") || "本地执行未成功完成"}。`
    : codexRun.enabled
      ? ` 已写入 ${localRun.writtenFiles.join(", ")}，Ray 已执行，Lucy 已自动完成统筹验收。`
      : ` 已写入 ${localRun.writtenFiles.join(", ")}。Codex exec 未启用，仅生成本地执行指令。`;

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
    status: hasRunFailure ? "执行完成，但需要处理" : "已生成最终结果",
    command: commandPreview
  });
  const runNotice = hasRunFailure
    ? "流程结束，但有真实执行步骤需处理。"
    : "任务已完成，Lucy 已完成验收。";
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
