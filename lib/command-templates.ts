import type { AgentAction, AgentName } from "@/types/agent";

type CommandTemplateInput = {
  action: AgentAction;
  targetAgent: AgentName;
  taskTitle?: string;
  manualMessage?: string;
  localContextSummary?: string;
};

function withContext(body: string, localContextSummary?: string) {
  if (!localContextSummary) return body;
  return `${body}\n\nLocal context summary:\n${localContextSummary}`;
}

export function buildCommandTemplate(input: CommandTemplateInput) {
  if (input.action === "daily_report") {
    return withContext(
      `@Chief

Create a concise project daily report from the current workspace state:
- completed today
- current blockers
- next plan

Return the draft for user review first.`,
      input.localContextSummary
    );
  }

  if (input.action === "submit_requirement_to_planning_agent") {
    return withContext(
      `@Chief

The user submitted a new requirement:

${input.manualMessage || "Propose the next useful task from the current project goal."}

Plan the work before execution:
- read the Project Context Hub
- assign priority P0 / P1 / P2
- break down goal, acceptance criteria, and risks
- update Decisions / Progress Summary when useful
- create the development task for Ray
- keep the output concise and action-oriented.`,
      input.localContextSummary
    );
  }

  if (input.action === "ask_planning_agent_review") {
    return withContext(
      `@Chief

Review the current Project Context Hub workflow:
- read PROJECT_BRIEF / PROGRESS_SUMMARY / DEV_LOG / HANDOFF / DECISIONS
- check whether Ray recorded the implementation context
- call out risks or rework needed
- return a short validation conclusion based on local files and current git state.`,
      input.localContextSummary
    );
  }

  if (input.action === "ask_tiger_blog" || input.action === "ask_tiger_publish") {
    return withContext(
      `@Writer

Use the Project Context Hub to draft publishing content:
- read ops/BLOG_CONTEXT.md first
- also reference ops/RELEASE_NOTES.md
- do not ask the user to restate the development process
- output title, hook, article outline, and publishing summary

Do not perform a real publication.`,
      input.localContextSummary
    );
  }

  if (input.action === "manual_message") {
    return withContext(
      `@${input.targetAgent}

${input.manualMessage || "Handle this manual message from the Vibe Office console."}

Return status and result through the AG-UI event stream.`,
      input.localContextSummary
    );
  }

  const rayTask = input.manualMessage || input.taskTitle || "Build the next product-facing improvement.";

  return withContext(
    `@Ray

Read the current project context:
- AGENTS.md
- ops/PROJECT_BRIEF.md
- ops/PROGRESS_SUMMARY.md
- ops/DEV_LOG.md
- ops/HANDOFF.md
- ops/BLOG_CONTEXT.md
- ops/CODEX_RULES.md

Development task:
${rayTask}

Execution rules:
- make the smallest code change needed for this task
- do not rely on hard-coded demo patches
- do not only write notes to Project Context Hub unless the environment blocks code edits
- run the appropriate checks after implementation
- record useful implementation context back to Project Context Hub.`,
    input.localContextSummary
  );
}
