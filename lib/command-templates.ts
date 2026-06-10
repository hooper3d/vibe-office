import type { AgentAction, AgentName } from "@/types/agent";

type CommandTemplateInput = {
  action: AgentAction;
  targetAgent: AgentName;
  taskTitle?: string;
  manualMessage?: string;
  localContextSummary?: string;
};

export function buildCommandTemplate(input: CommandTemplateInput) {
  const contextBlock = input.localContextSummary
    ? `\n\n本地上下文读取结果：\n${input.localContextSummary}`
    : "";

  if (input.action === "daily_report") {
    return `@Lucy

请基于本地工作区当前状态生成一份项目日报：
- 今日完成
- 当前阻塞
- 下一步计划

保持简洁，先输出给用户确认。${contextBlock}`;
  }

  if (input.action === "submit_requirement_to_lucy") {
    return `@Lucy

用户发布了一个新需求：

${input.manualMessage || "请基于当前项目目标提出下一步任务。"}

请先完成统筹编排：
- 读取 Project Context Hub
- 判断需求优先级 P0 / P1 / P2
- 拆解目标、验收标准和风险
- 写入 DECISIONS / PROGRESS_SUMMARY
- 生成分配给 Ray 的开发任务
- Ray 完成后继续验收

保持输出简洁，重点说明优先级、分配给 Ray 的任务和验收标准。${contextBlock}`;
  }

  if (input.action === "ask_lucy_review") {
    return `@Lucy

请统筹验收当前 Project Context Hub 流程：
- 读取 PROJECT_BRIEF / PROGRESS_SUMMARY / DEV_LOG / HANDOFF / DECISIONS
- 检查 Ray 是否把开发过程沉淀成共享上下文
- 标记风险和需要 Ray 返工的点
- 输出一段简短验收结论

优先基于本地 ops 文档和当前 git 状态判断。${contextBlock}`;
  }

  if (input.action === "ask_tiger_blog" || input.action === "ask_tiger_publish") {
    return `@Tiger

请基于 Project Context Hub 生成一篇 Blog 草稿：
- 优先读取 ops/BLOG_CONTEXT.md
- 同时参考 ops/RELEASE_NOTES.md
- 不要要求用户重新讲开发过程
- 输出标题、导语、正文结构、发布摘要

先不要执行真实发布，只生成 Blog / 发布内容草稿。${contextBlock}`;
  }

  if (input.action === "manual_message") {
    return `@${input.targetAgent}

${input.manualMessage || "请处理这条来自控制台的手动测试消息。"}

请通过 AG-UI 事件流返回执行状态和结果。${contextBlock}`;
  }

  const rayTask = input.manualMessage || input.taskTitle || "搭建推广页首屏与核心卖点";

  return `@Ray

请读取当前项目的：
- AGENTS.md
- ops/PROJECT_BRIEF.md
- ops/PROGRESS_SUMMARY.md
- ops/DEV_LOG.md
- ops/HANDOFF.md
- ops/BLOG_CONTEXT.md
- ops/CODEX_RULES.md

Lucy 分配的具体开发任务：
${rayTask}

执行要求：
- 只做完成该任务所需的最小代码改动。
- 理解 Lucy 分配的具体需求，不要依赖固定句式或 hard-coded demo 补丁。
- 不要把任务只记录到 Project Context Hub 后就结束；除非环境不允许写入，否则必须完成代码改动。
- 完成后运行合适的检查，并说明改了什么、如何验证。
- 最后把开发过程沉淀到 Project Context Hub。${contextBlock}`;
}
