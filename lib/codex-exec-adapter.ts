import { spawn } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import { triageRequirement, triageSummary } from "@/lib/workflow-triage";
import type { AgentName, AguiIntent } from "@/types/agent";

const WORKSPACE_ROOT = process.cwd();
const CODEX_EXE = process.env.AG_UI_CODEX_PATH || "C:\\Users\\hooper\\AppData\\Local\\OpenAI\\Codex\\bin\\codex.exe";
const CODEX_MODEL = process.env.AG_UI_CODEX_MODEL || "gpt-5.3-codex-spark";
const OUTPUT_DIR = path.join(WORKSPACE_ROOT, "ops", "runs");
const CODEX_TIMEOUT_MS = Number(process.env.AG_UI_CODEX_TIMEOUT_MS || 180_000);

export type CodexExecResult = {
  enabled: boolean;
  mode: "disabled" | "read-only" | "workspace-write";
  exitCode?: number | null;
  outputFile?: string;
  outputText?: string;
  stdoutTail?: string;
  stderrTail?: string;
  error?: string;
};

function isEnabled() {
  return process.env.AG_UI_ENABLE_CODEX_EXEC === "1";
}

function canWrite(intent: AguiIntent) {
  if (intent.targetAgent !== "Ray") return false;
  return process.env.AG_UI_CODEX_WRITE_ACTIONS === "1";
}

function relativeOutputFile(agent: AgentName, runId: string) {
  return `ops/runs/${agent.toUpperCase()}_${runId}.md`;
}

function tail(value: string, max = 4000) {
  return value.length > max ? value.slice(value.length - max) : value;
}

function buildCodexPrompt(input: {
  intent: AguiIntent;
  taskTitle: string;
  command: string;
  mode: "read-only" | "workspace-write";
}) {
  if (input.intent.targetAgent === "Lucy" && input.intent.action === "manual_message") {
    return `你是 Vibe Office 里的 Lucy，角色是项目经理 Agent。

当前项目是 AG-UI Agent Console + Project Context Hub，不是普通网页，也不是后台管理系统。
你正在和用户进行第一阶段的自然对话：只理解、回应、澄清，不生成计划，不拆 P0-P6，不派发 Ray，不输出验收标准。

对话要求：
- 像一个真实项目经理和用户聊天，不要像表单、模板、客服话术。
- 先结合当前项目语境直接回答用户的问题，可以表达你的判断和建议。
- 如果确实需要确认，最多问一个最关键的问题。
- 不要说“请补充目标、范围、验收方式”这种泛化句子。
- 不要提 P0-P6、任务拆解、风险清单、验收清单。
- 用中文，简洁自然，控制在 80 到 180 字。

用户刚刚说：
${input.intent.message || input.command}`;
  }

  if (input.intent.targetAgent === "Ray" && input.mode === "workspace-write") {
    return `你是本地 Ray 开发 Agent。

当前项目：AG-UI 推广网页开发
当前任务：${input.taskTitle}

Lucy 分配给你的具体开发任务：
${input.intent.message || input.command}

执行要求：
- 先快速读取 AGENTS.md、package.json，以及和任务直接相关的源码文件。
- 只做完成该任务所需的最小真实代码改动。
- 不要写固定句式补丁，不要只更新 ops 文档来假装完成。
- 不要启动长期服务。
- 修改后运行必要检查；如果来不及完整检查，说明原因。
- 最后用简短中文说明改了什么、验证了什么。`;
  }

  const writeNote =
    input.mode === "workspace-write"
      ? "你可以在当前工作区内做必要的小范围代码修改。完成后说明改了什么、如何验证。"
      : "只做分析、验收、计划或日报，不要修改工作区文件。";

  return `你是本地 ${input.intent.targetAgent} Agent。

当前项目：AG-UI 推广网页开发
当前动作：${input.intent.action}
当前任务：${input.taskTitle}

执行约束：
- ${writeNote}
- 优先读取 AGENTS.md、Project Context Hub 的 ops 文档、README.md、package.json 和 git 状态。
- 输出要简洁，包含结果、风险、下一步。
- 不要启动长期服务。

控制台生成的指令如下：

${input.command}`;
}

function buildLocalContextHubReview(input: { taskTitle: string; command: string }) {
  return `Lucy 统筹验收结论：

**结果**
- 已确认当前任务「${input.taskTitle}」进入 Project Context Hub 验证链路。
- Ray 写入链路应沉淀 DEV_LOG / PROGRESS_SUMMARY / HANDOFF / BLOG_CONTEXT / RELEASE_NOTES。
- Tiger 可直接读取 BLOG_CONTEXT / RELEASE_NOTES 生成 Blog 草稿，不需要用户重新讲开发过程。

**风险**
- 如果 Ray 未持续更新 BLOG_CONTEXT，Tiger 的内容会变成旧上下文。
- 如果 PROGRESS_SUMMARY 过长，Hub 会失去“共享项目事实源”的轻量优势。

**下一步**
- 继续用 AG-UI Event Stream 验证 context_hub_read / context_hub_write。
- 完成浏览器端点击验收，确认页面不再出现旧的交易类测试项目。

---

本地指令摘要：

${input.command}`;
}

function buildLocalLucyPlan(input: { taskTitle: string; requirement?: string; command: string }) {
  const triage = triageRequirement(input.requirement);

  return `Lucy 需求拆解与派发计划：

**用户需求**
${input.requirement || "未提供详细需求。"}

**分诊结论**
- ${triageSummary(triage)}

**拆解结果**
- 当前任务：${input.taskTitle}
- 目标：围绕 Project Context Hub 的价值优化推广页表达。
- 执行 Agent：Ray
- 验收 Agent：Lucy

**分配给 Ray**
- 读取 PROJECT_BRIEF / PROGRESS_SUMMARY / DECISIONS。
- 按用户需求完成真实代码改动，不使用固定句式或 hard-coded demo 补丁。
- 写入 DEV_LOG / HANDOFF / BLOG_CONTEXT / RELEASE_NOTES。

**验收标准**
- 用户需求被明确记录。
- Ray 的执行过程进入 Project Context Hub。
- Lucy 基于 Ray 的真实执行结果验收。
- Lucy 可基于共享上下文完成验收，不需要用户重复说明。

---

本地指令摘要：

${input.command}`;
}

export async function runCodexExec(input: {
  intent: AguiIntent;
  taskTitle: string;
  command: string;
  runId: string;
}): Promise<CodexExecResult> {
  if (!isEnabled()) {
    return {
      enabled: false,
      mode: "disabled",
      error: "Set AG_UI_ENABLE_CODEX_EXEC=1 to run local Codex exec."
    };
  }

  if (input.intent.targetAgent === "Ray" && input.intent.action === "dispatch_to_ray" && !canWrite(input.intent)) {
    return {
      enabled: false,
      mode: "disabled",
      error: "Ray workspace-write is disabled. Set AG_UI_CODEX_WRITE_ACTIONS=1 before dispatching Ray to modify local files."
    };
  }

  const mode = canWrite(input.intent) ? "workspace-write" : "read-only";
  const relOutputFile = relativeOutputFile(input.intent.targetAgent, input.runId);
  const outputFile = path.join(WORKSPACE_ROOT, relOutputFile);
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  if (input.intent.action === "submit_requirement_to_lucy" || input.intent.action === "ask_lucy_review") {
    const outputText =
      input.intent.action === "submit_requirement_to_lucy"
        ? buildLocalLucyPlan({
            taskTitle: input.taskTitle,
            requirement: input.intent.message,
            command: input.command
          })
        : buildLocalContextHubReview({
            taskTitle: input.taskTitle,
            command: input.command
          });
    await fs.writeFile(outputFile, outputText, "utf8");
    return {
      enabled: true,
      mode,
      exitCode: 0,
      outputFile: relOutputFile,
      outputText,
      stdoutTail: "",
      stderrTail: ""
    };
  }

  const prompt = buildCodexPrompt({
    intent: input.intent,
    taskTitle: input.taskTitle,
    command: input.command,
    mode
  });

  return new Promise((resolve) => {
    const args = [
      "exec",
      "--cd",
      WORKSPACE_ROOT,
      "--skip-git-repo-check",
      "--ignore-user-config",
      "--model",
      CODEX_MODEL
    ];
    if (mode === "workspace-write") {
      args.push("--dangerously-bypass-approvals-and-sandbox");
    } else {
      args.push("--sandbox", mode);
    }
    args.push(
      "--output-last-message",
      outputFile,
      "--json",
      "-"
    );
    const child = spawn(CODEX_EXE, args, {
      cwd: WORKSPACE_ROOT,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = async (result: Omit<CodexExecResult, "enabled" | "mode" | "outputFile" | "stdoutTail" | "stderrTail">) => {
      if (settled) return;
      settled = true;
      let outputText = "";
      try {
        outputText = await fs.readFile(outputFile, "utf8");
      } catch {
        outputText = "";
      }
      resolve({
        enabled: true,
        mode,
        outputFile: relOutputFile,
        outputText,
        stdoutTail: tail(stdout),
        stderrTail: tail(stderr),
        ...result
      });
    };

    const timeout = setTimeout(() => {
      child.kill();
      void finish({ exitCode: null, error: `Codex exec timed out after ${CODEX_TIMEOUT_MS}ms.` });
    }, CODEX_TIMEOUT_MS);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      void finish({ exitCode: null, error: error.message });
    });
    child.on("close", (exitCode) => {
      clearTimeout(timeout);
      void finish({ exitCode });
    });
    child.stdin.end(prompt, "utf8");
  });
}
