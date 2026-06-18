import { access } from "node:fs/promises";
import { chromium } from "playwright-core";

const appUrl = process.env.VIBE_OFFICE_URL ?? "http://127.0.0.1:5180/";
const edgePath =
  process.env.VIBE_OFFICE_BROWSER ??
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

await access(edgePath).catch(() => {
  throw new Error(`Browser executable not found: ${edgePath}. Set VIBE_OFFICE_BROWSER to an installed Chromium/Edge executable.`);
});

const browser = await chromium.launch({
  executablePath: edgePath,
  headless: true,
});

try {
  await runRefreshRestoreSmoke();
  await runTimeoutFailureSmoke();
  console.log("Browser smoke checks passed.");
} finally {
  await browser.close();
}

async function runRefreshRestoreSmoke() {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(appUrl);
    await seedStorage(page, createRefreshSeed());
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".app-shell");

    const before = await collectChromeState(page);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".app-shell");
    const after = await collectChromeState(page);

    assertEqual(after.activeAgent, before.activeAgent, "active agent should survive reload");
    assertEqual(after.activeProject, before.activeProject, "active project should survive reload");
    assertEqual(after.activeOutputTab, before.activeOutputTab, "active output tab should survive reload");
    assertEqual(after.composerPlaceholder, before.composerPlaceholder, "composer placeholder should survive reload");
    assertIncludes(after.outputPanel, "Project files", "Workspace panel should still show project files after reload");
  } finally {
    await context.close();
  }
}

async function runTimeoutFailureSmoke() {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(appUrl);
    await seedStorage(page, createTimeoutSeed());
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".app-shell");

    const state = await collectTimeoutState(page);
    assertIncludes(state.activeAgent, "Smoke Agent", "timeout smoke should select the seeded agent");
    assertEqual(state.activeProject, "Free Chatpersonal conversations", "timeout smoke should stay in Free Chat");
    assertEqual(state.panelTitle, "Smoke Agent", "timeout smoke should show the seeded conversation");
    assertEqual(state.failureKind, "Timeout", "failed message should show typed timeout label");
    assertIncludes(state.failureText, "Agent did not respond before the timeout.", "failed message should show user-facing timeout text");
    assertEqual(state.retryText, "Retry", "failed user message should show Retry action");
  } finally {
    await context.close();
  }
}

async function seedStorage(page, seed) {
  await page.evaluate((state) => {
    localStorage.clear();
    localStorage.setItem("vibe-office.configured-agents", JSON.stringify(state.agents));
    localStorage.setItem("vibe-office.workspace.v1", JSON.stringify(state.workspace));
    localStorage.setItem("vibe-office.ui.v1", JSON.stringify(state.ui));
    localStorage.setItem("vibe-office.theme", "light");
  }, seed);
}

async function collectChromeState(page) {
  return page.evaluate(() => {
    const clean = (value) => value?.trim().replace(/\s+/g, " ") ?? "";
    return {
      activeAgent: clean(document.querySelector(".agent-row.active .nav-item")?.textContent),
      activeProject: clean(document.querySelector(".project-row.active .project-item")?.textContent),
      activeOutputTab: clean(document.querySelector(".tab-button.active")?.textContent),
      composerPlaceholder: document.querySelector("textarea")?.getAttribute("placeholder") ?? "",
      outputPanel: clean(document.querySelector(".output-panel")?.textContent),
    };
  });
}

async function collectTimeoutState(page) {
  return page.evaluate(() => {
    const clean = (value) => value?.trim().replace(/\s+/g, " ") ?? "";
    return {
      activeAgent: clean(document.querySelector(".agent-row.active .nav-item")?.textContent),
      activeProject: clean(document.querySelector(".project-row.active .project-item")?.textContent),
      panelTitle: clean(document.querySelector(".conversation-panel .panel-header h2")?.textContent),
      failureKind: clean(document.querySelector(".message-error-kind")?.textContent),
      failureText: clean(document.querySelector(".message-error-text")?.textContent),
      retryText: clean(document.querySelector(".message-retry-button")?.textContent),
    };
  });
}

function createRefreshSeed() {
  const now = "2026-06-18T12:00:00.000Z";
  const agent = createSmokeAgent("smoke-agent-refresh", "Lucy");
  const project = {
    id: "project-vibe-smoke",
    name: "Vibe Office",
    namespace: "project-vibe-office",
    description: "Project workspace.",
    directory: "C:\\Users\\hooper\\Documents\\VibeOffice",
  };

  return {
    agents: [agent],
    workspace: {
      version: 1,
      projects: [project],
      conversations: [],
      messages: [],
      runs: [],
      tasks: [],
      artifacts: [],
    },
    ui: {
      selectedAgentId: agent.id,
      selectedProjectId: project.id,
      chatScope: "project",
      conversationMode: "single",
      outputMode: "workspace",
      activeFreeChatConversationIds: {},
    },
  };
}

function createTimeoutSeed() {
  const now = "2026-06-18T12:00:00.000Z";
  const agent = createSmokeAgent("smoke-agent-timeout", "Smoke Agent");
  const conversation = {
    id: "smoke-timeout-conversation",
    projectId: "__free_chat__",
    mode: "direct",
    title: "Timeout smoke chat",
    primaryAgentId: agent.id,
    participantAgentIds: [agent.id],
    a2aContextId: "free-chat:smoke-agent-timeout",
    createdAt: now,
    updatedAt: now,
  };
  const message = {
    id: "smoke-timeout-message",
    conversationId: conversation.id,
    projectId: "__free_chat__",
    role: "user",
    contentParts: [{ kind: "text", text: "Trigger timeout smoke." }],
    requestId: "smoke-timeout-request",
    requestAttempt: 1,
    requestStartedAt: now,
    requestCompletedAt: now,
    status: "failed",
    errorKind: "timeout",
    errorText: "Agent did not respond before the timeout. You can retry, or increase this agent's timeout in Advanced settings.",
    createdAt: now,
  };

  return {
    agents: [agent],
    workspace: {
      version: 1,
      projects: [],
      conversations: [conversation],
      messages: [message],
      runs: [],
      tasks: [],
      artifacts: [],
    },
    ui: {
      selectedAgentId: agent.id,
      selectedProjectId: "default",
      chatScope: "free",
      conversationMode: "single",
      outputMode: "workspace",
      activeFreeChatConversationIds: {
        [agent.id]: conversation.id,
      },
    },
  };
}

function createSmokeAgent(id, name) {
  return {
    id,
    name,
    role: "stability / smoke",
    officeRole: "operator",
    location: "local smoke",
    endpoint: "http://127.0.0.1:9/v1/chat/completions",
    a2aEndpoint: "http://127.0.0.1:9/a2a",
    agentCardUrl: "http://127.0.0.1:9/.well-known/agent-card.json",
    model: "smoke-model",
    runtimeProvider: "openai",
    tags: ["testing"],
    status: "online",
  };
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertIncludes(actual, expected, label) {
  if (!actual.includes(expected)) {
    throw new Error(`${label}: expected ${JSON.stringify(actual)} to include ${JSON.stringify(expected)}`);
  }
}
