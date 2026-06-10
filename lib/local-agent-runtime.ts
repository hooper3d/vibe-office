import { execFile } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import { promisify } from "util";
import { buildCommandTemplate } from "@/lib/command-templates";
import { contextHubFiles, ensureContextHubFiles, updateContextHubForIntent, type ContextHubWriteResult } from "@/lib/context-hub";
import type { AgentName, AguiIntent } from "@/types/agent";

const execFileAsync = promisify(execFile);

const WORKSPACE_ROOT = process.cwd();
const OPS_DIR = path.join(WORKSPACE_ROOT, "ops");
const MAX_FILE_CHARS = 3600;

const CONTEXT_FILES = [
  "AGENTS.md",
  "ops/PROJECT_BRIEF.md",
  "ops/PROGRESS_SUMMARY.md",
  "ops/DEV_LOG.md",
  "ops/TASKS.md",
  "ops/HANDOFF.md",
  "ops/DECISIONS.md",
  "ops/RELEASE_NOTES.md",
  "ops/BLOG_CONTEXT.md",
  "ops/CODEX_RULES.md",
  "docs/AG_UI_FIRST_MVP_DEV.md",
  "README.md",
  "package.json"
];

export type LocalContextFile = {
  path: string;
  exists: boolean;
  preview?: string;
};

export type LocalAgentRunResult = {
  mode: "local-agent-inbox";
  command: string;
  contextFiles: LocalContextFile[];
  contextHub: ContextHubWriteResult;
  gitStatus: string;
  writtenFiles: string[];
  summary: string;
};

function assertInsideWorkspace(filePath: string) {
  const resolved = path.resolve(WORKSPACE_ROOT, filePath);
  if (!resolved.startsWith(WORKSPACE_ROOT)) {
    throw new Error(`Blocked path outside workspace: ${filePath}`);
  }
  return resolved;
}

async function readContextFile(filePath: string): Promise<LocalContextFile> {
  const resolved = assertInsideWorkspace(filePath);

  try {
    const content = await fs.readFile(resolved, "utf8");
    return {
      path: filePath,
      exists: true,
      preview: content.slice(0, MAX_FILE_CHARS)
    };
  } catch (error) {
    const code = error instanceof Error && "code" in error ? (error as NodeJS.ErrnoException).code : undefined;
    if (code === "ENOENT") return { path: filePath, exists: false };
    throw error;
  }
}

async function getGitStatus() {
  try {
    const { stdout } = await execFileAsync("git", ["status", "--short", "--branch"], {
      cwd: WORKSPACE_ROOT,
      timeout: 3000,
      windowsHide: true
    });
    return stdout.trim() || "clean";
  } catch {
    return "git status unavailable";
  }
}

function inboxFileFor(agent: AgentName) {
  return `ops/${agent.toUpperCase()}_INBOX.md`;
}

function formatContextSummary(files: LocalContextFile[], gitStatus: string) {
  const found = files.filter((file) => file.exists).map((file) => file.path);
  const missing = files.filter((file) => !file.exists).map((file) => file.path);

  return [
    `已读取文件：${found.length ? found.join(", ") : "无"}`,
    `缺失文件：${missing.length ? missing.join(", ") : "无"}`,
    `Git 状态：${gitStatus.split("\n").slice(0, 6).join(" / ")}`
  ].join("\n");
}

function buildInboxEntry(input: {
  intent: AguiIntent;
  taskTitle: string;
  command: string;
  summary: string;
}) {
  return `\n## ${new Date().toISOString()} · ${input.intent.action}\n\nTarget: ${input.intent.targetAgent}\nTask: ${input.taskTitle}\n\n### Local Context\n${input.summary}\n\n### Command\n\n\`\`\`md\n${input.command}\n\`\`\`\n`;
}

export async function runLocalAgentAction(intent: AguiIntent, taskTitle: string): Promise<LocalAgentRunResult> {
  await ensureContextHubFiles();
  const contextFiles = await Promise.all(CONTEXT_FILES.map(readContextFile));
  const gitStatus = await getGitStatus();
  const summary = formatContextSummary(contextFiles, gitStatus);
  const hubSummary = `Project Context Hub 文件：${contextHubFiles.map((file) => `${file.label}(${file.purpose})`).join(", ")}`;
  const localContextSummary = `${summary}\n${hubSummary}`;
  const command = buildCommandTemplate({
    action: intent.action,
    targetAgent: intent.targetAgent,
    taskTitle,
    manualMessage: intent.message,
    localContextSummary
  });
  const inboxFile = inboxFileFor(intent.targetAgent);
  const inboxPath = assertInsideWorkspace(inboxFile);
  const contextHub = await updateContextHubForIntent({ intent, taskTitle });
  const writtenFiles = [inboxFile, ...contextHub.writtenFiles];

  await fs.mkdir(OPS_DIR, { recursive: true });
  await fs.appendFile(
    inboxPath,
    buildInboxEntry({
      intent,
      taskTitle,
      command,
      summary
    }),
    "utf8"
  );

  return {
    mode: "local-agent-inbox",
    command,
    contextFiles,
    contextHub,
    gitStatus,
    writtenFiles,
    summary
  };
}
