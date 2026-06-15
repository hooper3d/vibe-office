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
    purpose: "Goal / scope"
  },
  {
    path: "ops/PROGRESS_SUMMARY.md",
    label: "PROGRESS_SUMMARY.md",
    purpose: "Progress summary"
  },
  {
    path: "ops/DEV_LOG.md",
    label: "DEV_LOG.md",
    purpose: "Development timeline"
  },
  {
    path: "ops/HANDOFF.md",
    label: "HANDOFF.md",
    purpose: "Agent handoff"
  },
  {
    path: "ops/DECISIONS.md",
    label: "DECISIONS.md",
    purpose: "Decisions"
  },
  {
    path: "ops/RELEASE_NOTES.md",
    label: "RELEASE_NOTES.md",
    purpose: "Release summary"
  },
  {
    path: "ops/BLOG_CONTEXT.md",
    label: "BLOG_CONTEXT.md",
    purpose: "Publishing context"
  },
  {
    path: "ops/ARTIFACTS.md",
    label: "ARTIFACTS.md",
    purpose: "Artifact index"
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

Project: Vibe Office Preview - Product Team
Goal: demonstrate an AG-UI first agent office where a product team shares tasks, materials, outputs, and event history through Project Context Hub.
Scope:
- Keep the first version focused and preview-ready.
- Show the Product Team template with Chief, Builder, Writer, and Operator.
- Use Markdown files as the local shared context layer.
- Avoid turning the MVP into a large admin backend.
`,
    "ops/PROGRESS_SUMMARY.md": `# Progress Summary

Current status: Product Team preview is being assembled.
Completed:
- Product Team naming direction selected.
- Project Context Hub is the shared memory surface.
Next:
- Keep connecting the visible UI to the runtime data model.
`,
    "ops/DEV_LOG.md": `# Dev Log

Records implementation notes from Builder / Ray so the planning agent and Writer can reuse project facts.
`,
    "ops/HANDOFF.md": `# Handoff

Records handoff context between planning, build, writing, and operations agents.
`,
    "ops/DECISIONS.md": `# Decisions

- The default office template is Product Team.
- Project Context Hub is the shared project context layer.
- The first version stays AG-UI First and preview-focused.
`,
    "ops/RELEASE_NOTES.md": `# Release Notes

No formal release notes yet.
`,
    "ops/BLOG_CONTEXT.md": `# Blog Context

Writer should use this file when drafting product updates or release content.
`,
    "ops/ARTIFACTS.md": `# Artifacts

Shared materials and generated outputs for the current project.
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
    `Time: ${formatTimestamp()}`,
    `Agent: ${input.agent}`,
    `Action: ${input.intent.action}`,
    `Task: ${input.taskTitle}`,
    message ? `Message: ${message}` : "Message: none"
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
    if (input.intent.targetAgent === "Lucy" && input.intent.action === "submit_requirement_to_planning_agent") {
      const triage = triageRequirement(input.intent.message);
      await appendFile(
        "ops/DECISIONS.md",
        `\n\n## ${formatTimestamp()} - User Requirement\n\n${runSummary}\n\nPlanning triage: ${triageSummary(triage)}\n\nDecision: break down the requirement, assign executable work to Builder / Ray, and validate against Project Context Hub.\n`
      );
      writtenFiles.push("ops/DECISIONS.md");

      await writeFile(
        "ops/PROGRESS_SUMMARY.md",
        `# Progress Summary

Current project: Vibe Office Preview - Product Team
Current status: the planning agent received a user requirement and classified the next execution path.

User requirement:
${input.intent.message || "No detailed requirement provided."}

Triage:
- ${triageSummary(triage)}

Current task:
- ${input.taskTitle}

Next:
- Builder / Ray executes the concrete implementation task.
- The planning agent validates the result from Project Context Hub.

Latest record:
${runSummary}
`
      );
      writtenFiles.push("ops/PROGRESS_SUMMARY.md");
    }

    return { readFiles, writtenFiles };
  }

  await appendFile(
    "ops/DEV_LOG.md",
    `\n\n## ${formatTimestamp()} - Builder Development Record\n\n${runSummary}\n\nResult: the console dispatched development work and recorded it in Project Context Hub.\n`
  );
  writtenFiles.push("ops/DEV_LOG.md");

  await writeFile(
    "ops/PROGRESS_SUMMARY.md",
    `# Progress Summary

Current project: Vibe Office Preview - Product Team
Current status: Builder / Ray received a development task and Project Context Hub was updated.

Completed:
- AG-UI sent a development intent.
- The development record was written to DEV_LOG.
- Writer can reuse BLOG_CONTEXT and RELEASE_NOTES.

Current task:
- ${input.taskTitle}

Next:
- The planning agent validates implementation context.
- Writer can draft release or blog content from the shared context.

Latest record:
${runSummary}
`
  );
  writtenFiles.push("ops/PROGRESS_SUMMARY.md");

  await writeFile(
    "ops/HANDOFF.md",
    `# Handoff

## Builder / Ray -> Planning Agent / Writer

${runSummary}

Handoff notes:
- Planning agent: read PROJECT_BRIEF, PROGRESS_SUMMARY, DEV_LOG, and DECISIONS to check goal, progress, and risk.
- Writer: read BLOG_CONTEXT and RELEASE_NOTES to draft user-facing content without asking the user to restate the development process.
`
  );
  writtenFiles.push("ops/HANDOFF.md");

  await writeFile(
    "ops/RELEASE_NOTES.md",
    `# Release Notes

Project: Vibe Office Preview - Product Team
Update summary:
- Project Context Hub is the shared project fact source.
- Builder / Ray records implementation context into Markdown memory.
- Planning and writing agents can reuse the same context.
`
  );
  writtenFiles.push("ops/RELEASE_NOTES.md");

  await writeFile(
    "ops/BLOG_CONTEXT.md",
    `# Blog Context

Topic: how Vibe Office uses Project Context Hub to reduce repeated context sharing between agents.

Project background:
- The current template is Product Team.
- The console owns the AG-UI event stream.
- Project Context Hub stores shared context.

Development record:
${runSummary}

Suggested article structure:
1. Why multi-agent work loses context.
2. How Project Context Hub acts as shared memory.
3. How Chief, Builder, Writer, and Operator divide responsibilities.
4. How this can grow into real project templates.
`
  );
  writtenFiles.push("ops/BLOG_CONTEXT.md");

  return { readFiles, writtenFiles };
}
