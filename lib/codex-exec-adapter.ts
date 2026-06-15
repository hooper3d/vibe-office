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

export function getCodexExecStatus() {
  return {
    enabled: isEnabled(),
    rayWorkspaceWriteEnabled: process.env.AG_UI_CODEX_WRITE_ACTIONS === "1"
  };
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
    return `You are Chief, the planning agent inside Vibe Office.

Current product: AG-UI Agent Console + Project Context Hub. This is a product-development team template, not a generic admin panel.
This is a natural clarification conversation. Understand and respond first; do not generate a task plan, P0-P6 breakdown, Ray handoff, or acceptance checklist unless the user explicitly asks for planning.

Conversation rules:
- Speak like a real product lead coordinating work, not a form or support script.
- Answer the user's immediate question with judgment and useful context.
- If clarification is needed, ask at most one key question.
- Do not mention task priorities, risk lists, or acceptance criteria in this mode.
- Keep the reply concise and natural.

User just said:
${input.intent.message || input.command}`;
  }

  if (input.intent.targetAgent === "Ray" && input.mode === "workspace-write") {
    return `You are Ray, the local development agent for this workspace.

Current project: AG_UI / Vibe Office.
Current task: ${input.taskTitle}

Planning-agent assignment:
${input.intent.message || input.command}

Execution rules:
- Read AGENTS.md, package.json, and the directly relevant source files before editing.
- Make the smallest real code change needed for this task.
- Do not fake completion by only updating ops documents.
- Do not start long-running services.
- Run the necessary checks after edits; if a check cannot run, explain why.
- Finish with a concise summary of what changed and how it was verified.`;
  }

  const writeNote =
    input.mode === "workspace-write"
      ? "You may make small, necessary edits inside the current workspace. Summarize what changed and how it was verified."
      : "Analyze, review, plan, or report only. Do not modify workspace files.";

  return `You are the local ${input.intent.targetAgent} agent.

Current project: AG_UI / Vibe Office.
Current action: ${input.intent.action}
Current task: ${input.taskTitle}

Execution constraints:
- ${writeNote}
- Prefer AGENTS.md, Project Context Hub ops files, README.md, package.json, and git status for context.
- Keep output concise and include result, risk, and next step.
- Do not start long-running services.

Generated control command:

${input.command}`;
}

function buildLocalContextHubReview(input: { taskTitle: string; command: string }) {
  return `Planning-agent review:

**Result**
- Current task "${input.taskTitle}" has entered Project Context Hub review.
- Ray should record implementation facts in DEV_LOG / PROGRESS_SUMMARY / HANDOFF / BLOG_CONTEXT / RELEASE_NOTES.
- Writer can later read BLOG_CONTEXT / RELEASE_NOTES without asking the user to repeat implementation details.

**Risk**
- If Ray does not keep BLOG_CONTEXT current, Writer output will use stale context.
- If PROGRESS_SUMMARY becomes too long, the hub loses its value as a lightweight shared source of truth.

**Next step**
- Verify context_hub_read and context_hub_write in the AG-UI Event Stream.
- Confirm the browser UI no longer surfaces old private-test project semantics.

---

Local command summary:

${input.command}`;
}

function buildLocalPlanWorkflow(input: { taskTitle: string; requirement?: string; command: string }) {
  const triage = triageRequirement(input.requirement);

  return `Planning-agent requirement breakdown and dispatch plan:

**User requirement**
${input.requirement || "No detailed requirement provided."}

**Triage**
- ${triageSummary(triage)}

**Breakdown**
- Current task: ${input.taskTitle}
- Goal: improve the Vibe Office / Project Context Hub product experience.
- Execution agent: Ray
- Review agent: Planning Agent

**Assigned to Ray**
- Read PROJECT_BRIEF / PROGRESS_SUMMARY / DECISIONS.
- Make real code changes for the user requirement. Do not rely on hard-coded demo filler.
- Record material changes in DEV_LOG / HANDOFF / BLOG_CONTEXT / RELEASE_NOTES as needed.

**Acceptance**
- The user requirement is recorded clearly.
- Ray's execution process enters Project Context Hub.
- Planning Agent reviews Ray's real execution result from shared context.
- The user does not need to repeat context for review.

---

Local command summary:

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

  if (input.intent.action === "submit_requirement_to_planning_agent" || input.intent.action === "ask_planning_agent_review") {
    const outputText =
      input.intent.action === "submit_requirement_to_planning_agent"
        ? buildLocalPlanWorkflow({
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
    args.push("--output-last-message", outputFile, "--json", "-");
    const child = spawn(CODEX_EXE, args, {
      cwd: WORKSPACE_ROOT,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = async (
      result: Omit<CodexExecResult, "enabled" | "mode" | "outputFile" | "stdoutTail" | "stderrTail">
    ) => {
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
