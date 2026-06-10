import { promises as fs } from "fs";
import path from "path";
import { triageRequirement, triageSummary } from "@/lib/workflow-triage";
import type { AgentName, AguiIntent } from "@/types/agent";

const WORKSPACE_ROOT = process.cwd();
const OPS_DIR = path.join(WORKSPACE_ROOT, "ops");

export const contextHubFiles = [
  {
    path: "ops/PROJECT_BRIEF.md",
    label: "PROJECT_BRIEF.md",
    purpose: "目标 / 范围"
  },
  {
    path: "ops/PROGRESS_SUMMARY.md",
    label: "PROGRESS_SUMMARY.md",
    purpose: "进展摘要"
  },
  {
    path: "ops/DEV_LOG.md",
    label: "DEV_LOG.md",
    purpose: "开发时间线"
  },
  {
    path: "ops/HANDOFF.md",
    label: "HANDOFF.md",
    purpose: "Agent 交接"
  },
  {
    path: "ops/DECISIONS.md",
    label: "DECISIONS.md",
    purpose: "关键决策"
  },
  {
    path: "ops/RELEASE_NOTES.md",
    label: "RELEASE_NOTES.md",
    purpose: "发布摘要"
  },
  {
    path: "ops/BLOG_CONTEXT.md",
    label: "BLOG_CONTEXT.md",
    purpose: "Blog 素材"
  },
  {
    path: "docs/AG_UI_FIRST_MVP_DEV.md",
    label: "AG_UI_FIRST_MVP_DEV.md",
    purpose: "MVP dev doc"
  }
] as const;

export type ContextHubFilePath = (typeof contextHubFiles)[number]["path"];

export type ContextHubWriteResult = {
  readFiles: string[];
  writtenFiles: string[];
};

export type ContextHubSnapshotFile = {
  path: string;
  label: string;
  purpose: string;
  exists: boolean;
  content: string;
};

function resolveInsideWorkspace(filePath: string) {
  const resolved = path.resolve(WORKSPACE_ROOT, filePath);
  if (!resolved.startsWith(WORKSPACE_ROOT)) {
    throw new Error(`Blocked path outside workspace: ${filePath}`);
  }
  return resolved;
}

async function writeFile(filePath: string, content: string) {
  await fs.writeFile(resolveInsideWorkspace(filePath), content, "utf8");
}

async function appendFile(filePath: string, content: string) {
  await fs.appendFile(resolveInsideWorkspace(filePath), content, "utf8");
}

export async function ensureContextHubFiles() {
  await fs.mkdir(OPS_DIR, { recursive: true });

  const defaults: Partial<Record<ContextHubFilePath, string>> = {
    "ops/PROJECT_BRIEF.md": `# Project Brief

项目：AG-UI 推广网页开发

目标：做一个轻量推广网页，用来解释 AI Agent Console 如何通过 AG-UI 事件通信和 Project Context Hub 共享上下文。

范围：
- 单页推广网页概念验证。
- 重点展示统一入口、共享记忆、上下文分发。
- 不做复杂多项目后台、设置中心、权限系统或真实发布。

受众：想理解 AG-UI + 多 Agent 协作方式的产品和开发同学。
`,
    "ops/PROGRESS_SUMMARY.md": `# Progress Summary

当前状态：Project Context Hub MVP 正在搭建。

已完成：
- 确定安全示例项目：AG-UI 推广网页开发。
- 确定共享记忆文件组。

阻塞：
- 等待 Ray 把开发过程写入共享上下文。

下一步：
- Ray 继续实现推广网页 MVP，并沉淀 DEV_LOG / HANDOFF / BLOG_CONTEXT。
`,
    "ops/DEV_LOG.md": `# Dev Log

用于记录 Ray 的开发过程，供 Lucy 验收和 Tiger 写 Blog 时复用。
`,
    "ops/HANDOFF.md": `# Handoff

用于记录 Ray 向 Lucy / Tiger 交接的上下文。
`,
    "ops/DECISIONS.md": `# Decisions

- 采用 Markdown 文件模拟 Project Context Hub。
- 第一版只验证 AG-UI 事件通信和共享上下文，不做复杂后台。
- 测试项目使用 AG-UI 推广网页开发，避免污染真实项目。
`,
    "ops/RELEASE_NOTES.md": `# Release Notes

当前暂无正式发布内容。Tiger 可基于后续 Ray 写入的开发摘要生成发布说明。
`,
    "ops/BLOG_CONTEXT.md": `# Blog Context

Tiger 写 Blog 时优先读取此文件。

当前核心叙事：
- AI Agent Console 是统一入口。
- Project Context Hub 是共享记忆。
- Ray 负责开发并写入项目事实。
- Lucy 负责统筹和验收。
- Tiger 复用上下文生成 Blog / 发布内容。
`
  };

  await Promise.all(
    contextHubFiles.map(async (file) => {
      try {
        await fs.access(resolveInsideWorkspace(file.path));
      } catch {
        const defaultContent = defaults[file.path];
        if (!defaultContent) return;
        await writeFile(file.path, defaultContent);
      }
    })
  );
}

export async function readContextHubSnapshot(): Promise<ContextHubSnapshotFile[]> {
  await ensureContextHubFiles();

  return Promise.all(
    contextHubFiles.map(async (file) => {
      try {
        const content = await fs.readFile(resolveInsideWorkspace(file.path), "utf8");
        return {
          path: file.path,
          label: file.label,
          purpose: file.purpose,
          exists: true,
          content
        };
      } catch {
        return {
          path: file.path,
          label: file.label,
          purpose: file.purpose,
          exists: false,
          content: ""
        };
      }
    })
  );
}

function formatTimestamp() {
  return new Date().toISOString();
}

function buildRunSummary(input: {
  intent: AguiIntent;
  taskTitle: string;
  agent: AgentName;
}) {
  const message = input.intent.message?.trim();
  return [
    `时间：${formatTimestamp()}`,
    `Agent：${input.agent}`,
    `动作：${input.intent.action}`,
    `任务：${input.taskTitle}`,
    message ? `补充说明：${message}` : "补充说明：无"
  ].join("\n");
}

export async function updateContextHubForIntent(input: {
  intent: AguiIntent;
  taskTitle: string;
}): Promise<ContextHubWriteResult> {
  await ensureContextHubFiles();
  const readFiles = contextHubFiles.map((file) => file.path);
  const writtenFiles: string[] = [];
  const runSummary = buildRunSummary({
    intent: input.intent,
    taskTitle: input.taskTitle,
    agent: input.intent.targetAgent
  });

  if (input.intent.targetAgent !== "Ray" || input.intent.action !== "dispatch_to_ray") {
    if (input.intent.targetAgent === "Lucy" && input.intent.action === "submit_requirement_to_lucy") {
      const triage = triageRequirement(input.intent.message);
      await appendFile(
        "ops/DECISIONS.md",
        `\n\n## ${formatTimestamp()} · 用户需求\n\n${runSummary}\n\nLucy 分诊：${triageSummary(triage)}\n\nLucy 决策：先拆解需求和验收标准，再分配给 Ray 执行；Ray 完成后由 Lucy 基于真实执行结果验收。\n`
      );
      writtenFiles.push("ops/DECISIONS.md");

      await writeFile(
        "ops/PROGRESS_SUMMARY.md",
        `# Progress Summary

当前项目：AG-UI 推广网页开发

当前状态：Lucy 已接收用户需求，正在进行优先级分诊。

用户需求：
${input.intent.message || "未提供详细需求。"}

分诊结果：
- ${triageSummary(triage)}

已完成：
- 用户从控制台发布需求给 Lucy。
- Lucy 读取 Project Context Hub 并记录分诊决策。

当前任务：
- ${input.taskTitle}

下一步：
- Lucy handoff 给 Ray，Ray 执行具体开发任务并沉淀上下文。
- Lucy 基于 Ray 的真实执行结果进行验收。

最近一次记录：
${runSummary}
`
      );
      writtenFiles.push("ops/PROGRESS_SUMMARY.md");
    }

    return { readFiles, writtenFiles };
  }

  await appendFile(
    "ops/DEV_LOG.md",
    `\n\n## ${formatTimestamp()} · Ray 开发记录\n\n${runSummary}\n\n结果：已通过控制台派发开发任务，并沉淀到 Project Context Hub。\n`
  );
  writtenFiles.push("ops/DEV_LOG.md");

  await writeFile(
    "ops/PROGRESS_SUMMARY.md",
    `# Progress Summary

当前项目：AG-UI 推广网页开发

当前状态：Ray 已接收开发任务，Project Context Hub 已更新。

已完成：
- 控制台通过 AG-UI 发送 Ray 开发意图。
- Ray 的开发过程写入 DEV_LOG。
- Blog 和发布素材同步给 Tiger。

当前任务：
- ${input.taskTitle}

下一步：
- Lucy 读取共享上下文进行统筹验收。
- Tiger 读取 BLOG_CONTEXT / RELEASE_NOTES 生成 Blog 草稿。

最近一次记录：
${runSummary}
`
  );
  writtenFiles.push("ops/PROGRESS_SUMMARY.md");

  await writeFile(
    "ops/HANDOFF.md",
    `# Handoff

## Ray → Lucy / Tiger

${runSummary}

交接说明：
- Lucy：请读取 PROJECT_BRIEF、PROGRESS_SUMMARY、DEV_LOG、DECISIONS，检查目标、进展和风险。
- Tiger：请读取 BLOG_CONTEXT、RELEASE_NOTES，直接生成 Blog / 发布内容，不需要用户重新讲开发过程。
`
  );
  writtenFiles.push("ops/HANDOFF.md");

  await writeFile(
    "ops/RELEASE_NOTES.md",
    `# Release Notes

项目：AG-UI 推广网页开发

本次更新摘要：
- 引入 Project Context Hub 作为共享项目事实源。
- Ray 的开发记录会沉淀到 Markdown 共享记忆。
- Lucy / Tiger 可复用同一份上下文。

适合对外表达：
- 统一入口管理多 Agent 协作。
- 共享记忆减少重复沟通。
- Tiger 可以基于 BLOG_CONTEXT 直接生成内容。
`
  );
  writtenFiles.push("ops/RELEASE_NOTES.md");

  await writeFile(
    "ops/BLOG_CONTEXT.md",
    `# Blog Context

博客主题：AI Agent Console 如何用 Project Context Hub 减少重复沟通

项目背景：
- 当前示例项目是 AG-UI 推广网页开发。
- 控制台负责统一入口和 AG-UI 事件通信。
- Project Context Hub 负责沉淀共享上下文。

开发过程摘要：
${runSummary}

可写入 Blog 的亮点：
- 用户只需要提出目标和关键决策。
- Ray 开发过程写入 DEV_LOG / HANDOFF。
- Lucy 读取共享上下文做统筹验收。
- Tiger 读取 BLOG_CONTEXT / RELEASE_NOTES 生成发布内容，不需要用户复述开发过程。

建议结构：
1. 为什么多 Agent 协作容易丢上下文。
2. Project Context Hub 如何作为共享记忆。
3. Ray / Lucy / Tiger 如何分工。
4. 下一步如何扩展到真实项目。
`
  );
  writtenFiles.push("ops/BLOG_CONTEXT.md");

  return { readFiles, writtenFiles };
}
