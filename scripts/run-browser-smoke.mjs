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
  await runDirectRetrySmoke();
  await runTaskRoomRetrySmoke();
  await runDirectPendingRecoverySmoke();
  await runTaskRoomPendingRecoverySmoke();
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

async function runDirectRetrySmoke() {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await installSmokeProviderRoute(page, "Recovered direct retry reply.");
    await page.goto(appUrl);
    await seedStorage(page, createTimeoutSeed("direct-retry"));
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".app-shell");

    await page.locator(".message-retry-button").click();
    await page.waitForFunction(() => {
      const state = JSON.parse(localStorage.getItem("vibe-office.workspace.v1") || "{}");
      const message = state.messages.find((item) => item.id === "smoke-direct-retry-message");
      return message?.status === "sent" && message.requestAttempt === 2;
    });

    const state = await collectDirectRetryState(page);
    assertEqual(state.userMessageStatus, "sent", "direct retry should mark the failed user message sent");
    assertEqual(state.userMessageAttempt, 2, "direct retry should increment the original request attempt");
    assertIncludes(state.conversationText, "Recovered direct retry reply.", "direct retry should render the recovered agent reply");
    assertEqual(state.retryText, "", "direct retry should remove the Retry action after success");
  } finally {
    await context.close();
  }
}

async function runTaskRoomRetrySmoke() {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await installSmokeProviderRoute(page, "Recovered task room retry result.");
    await page.goto(appUrl);
    await seedStorage(page, createTaskRoomRetrySeed());
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".app-shell");

    await page.locator(".message-retry-button").click();
    await page.waitForFunction(() => {
      const state = JSON.parse(localStorage.getItem("vibe-office.workspace.v1") || "{}");
      const message = state.messages.find((item) => item.id === "smoke-task-room-retry-message");
      const task = state.tasks.find((item) => item.id === "smoke-task-room-retry-task");
      return message?.status === "sent" && message.requestAttempt === 2 && task?.state === "completed";
    });

    const state = await collectTaskRoomRetryState(page);
    assertEqual(state.userMessageStatus, "sent", "task room retry should mark the failed user message sent");
    assertEqual(state.userMessageAttempt, 2, "task room retry should increment the original request attempt");
    assertEqual(state.taskState, "completed", "task room retry should update the project task state");
    assertIncludes(state.conversationText, "Recovered task room retry result.", "task room retry should render the recovered task summary");
    assertEqual(state.retryText, "", "task room retry should remove the Retry action after success");
  } finally {
    await context.close();
  }
}

async function runDirectPendingRecoverySmoke() {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await installSmokeProviderRoute(page, "Recovered pending direct reply.");
    await page.goto(appUrl);
    await seedStorage(page, createDirectPendingRecoverySeed());
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".app-shell");

    await page.waitForFunction(() => {
      const state = JSON.parse(localStorage.getItem("vibe-office.workspace.v1") || "{}");
      const message = state.messages.find((item) => item.id === "smoke-direct-pending-message");
      return message?.status === "sent" && message.requestAttempt === 2;
    });

    const state = await collectDirectPendingRecoveryState(page);
    assertEqual(state.userMessageStatus, "sent", "direct pending recovery should mark the original user message sent");
    assertEqual(state.userMessageAttempt, 2, "direct pending recovery should keep one stable request identity and advance the attempt");
    assertIncludes(state.conversationText, "Recovered pending direct reply.", "direct pending recovery should render the recovered agent reply");
    assertEqual(state.retryText, "", "direct pending recovery should not leave a Retry action after success");
  } finally {
    await context.close();
  }
}

async function runTaskRoomPendingRecoverySmoke() {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(appUrl);
    await seedStorage(page, createTaskRoomPendingRecoverySeed());
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".app-shell");

    await page.waitForFunction(() => {
      const state = JSON.parse(localStorage.getItem("vibe-office.workspace.v1") || "{}");
      const message = state.messages.find((item) => item.id === "smoke-task-room-pending-message");
      const task = state.tasks.find((item) => item.id === "smoke-task-room-pending-task");
      const run = state.runs.find((item) => item.id === "smoke-task-room-pending-run");
      return message?.status === "failed" && task?.state === "failed" && run?.state === "failed";
    });

    const state = await collectTaskRoomPendingRecoveryState(page);
    assertEqual(state.userMessageStatus, "failed", "task room pending recovery should fail the interrupted user message");
    assertEqual(state.failureKind, "Interrupted", "task room pending recovery should show an interrupted failure label");
    assertIncludes(state.failureText, "Task Room was interrupted before the agent returned.", "task room pending recovery should explain what happened");
    assertEqual(state.taskState, "failed", "task room pending recovery should fail the project task");
    assertEqual(state.runState, "failed", "task room pending recovery should fail the project run");
    assertEqual(state.retryText, "Retry", "task room pending recovery should leave a visible Retry action");
  } finally {
    await context.close();
  }
}

async function installSmokeProviderRoute(page, content) {
  await page.route("**/smoke-openai/**", async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        "access-control-allow-origin": "*",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        choices: [
          {
            message: {
              content,
            },
          },
        ],
      }),
    });
  });
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

async function collectDirectRetryState(page) {
  return page.evaluate(() => {
    const clean = (value) => value?.trim().replace(/\s+/g, " ") ?? "";
    const state = JSON.parse(localStorage.getItem("vibe-office.workspace.v1") || "{}");
    const message = state.messages.find((item) => item.id === "smoke-direct-retry-message");
    return {
      conversationText: clean(document.querySelector(".conversation-body")?.textContent),
      retryText: clean(document.querySelector(".message-retry-button")?.textContent),
      userMessageStatus: message?.status ?? "",
      userMessageAttempt: message?.requestAttempt ?? 0,
    };
  });
}

async function collectTaskRoomRetryState(page) {
  return page.evaluate(() => {
    const clean = (value) => value?.trim().replace(/\s+/g, " ") ?? "";
    const state = JSON.parse(localStorage.getItem("vibe-office.workspace.v1") || "{}");
    const message = state.messages.find((item) => item.id === "smoke-task-room-retry-message");
    const task = state.tasks.find((item) => item.id === "smoke-task-room-retry-task");
    return {
      conversationText: clean(document.querySelector(".conversation-body")?.textContent),
      retryText: clean(document.querySelector(".message-retry-button")?.textContent),
      userMessageStatus: message?.status ?? "",
      userMessageAttempt: message?.requestAttempt ?? 0,
      taskState: task?.state ?? "",
    };
  });
}

async function collectDirectPendingRecoveryState(page) {
  return page.evaluate(() => {
    const clean = (value) => value?.trim().replace(/\s+/g, " ") ?? "";
    const state = JSON.parse(localStorage.getItem("vibe-office.workspace.v1") || "{}");
    const message = state.messages.find((item) => item.id === "smoke-direct-pending-message");
    return {
      conversationText: clean(document.querySelector(".conversation-body")?.textContent),
      retryText: clean(document.querySelector(".message-retry-button")?.textContent),
      userMessageStatus: message?.status ?? "",
      userMessageAttempt: message?.requestAttempt ?? 0,
    };
  });
}

async function collectTaskRoomPendingRecoveryState(page) {
  return page.evaluate(() => {
    const clean = (value) => value?.trim().replace(/\s+/g, " ") ?? "";
    const state = JSON.parse(localStorage.getItem("vibe-office.workspace.v1") || "{}");
    const message = state.messages.find((item) => item.id === "smoke-task-room-pending-message");
    const task = state.tasks.find((item) => item.id === "smoke-task-room-pending-task");
    const run = state.runs.find((item) => item.id === "smoke-task-room-pending-run");
    return {
      failureKind: clean(document.querySelector(".message-error-kind")?.textContent),
      failureText: clean(document.querySelector(".message-error-text")?.textContent),
      retryText: clean(document.querySelector(".message-retry-button")?.textContent),
      userMessageStatus: message?.status ?? "",
      taskState: task?.state ?? "",
      runState: run?.state ?? "",
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

function createDirectPendingRecoverySeed() {
  const now = "2026-06-18T12:00:00.000Z";
  const agent = createSmokeAgent("smoke-agent-direct-pending", "Smoke Agent");
  const conversation = {
    id: "smoke-direct-pending-conversation",
    projectId: "__free_chat__",
    mode: "direct",
    title: "Pending direct smoke chat",
    primaryAgentId: agent.id,
    participantAgentIds: [agent.id],
    a2aContextId: "free-chat:smoke-agent-direct-pending",
    createdAt: now,
    updatedAt: now,
  };
  const message = {
    id: "smoke-direct-pending-message",
    conversationId: conversation.id,
    projectId: "__free_chat__",
    role: "user",
    contentParts: [{ kind: "text", text: "Recover this pending direct message." }],
    requestId: "smoke-direct-pending-request",
    requestAttempt: 1,
    requestStartedAt: now,
    status: "sending",
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

function createTimeoutSeed(idPrefix = "timeout") {
  const now = "2026-06-18T12:00:00.000Z";
  const agent = createSmokeAgent(`smoke-agent-${idPrefix}`, "Smoke Agent");
  const conversation = {
    id: `smoke-${idPrefix}-conversation`,
    projectId: "__free_chat__",
    mode: "direct",
    title: "Timeout smoke chat",
    primaryAgentId: agent.id,
    participantAgentIds: [agent.id],
    a2aContextId: `free-chat:smoke-agent-${idPrefix}`,
    createdAt: now,
    updatedAt: now,
  };
  const message = {
    id: `smoke-${idPrefix}-message`,
    conversationId: conversation.id,
    projectId: "__free_chat__",
    role: "user",
    contentParts: [{ kind: "text", text: "Trigger timeout smoke." }],
    requestId: `smoke-${idPrefix}-request`,
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

function createTaskRoomPendingRecoverySeed() {
  const seed = createTaskRoomRetrySeed();
  const now = "2026-06-18T12:00:00.000Z";
  const conversation = seed.workspace.conversations[0];
  const chief = seed.agents[0];
  const participant = seed.agents[1];
  const project = seed.workspace.projects[0];
  const task = {
    id: "smoke-task-room-pending-task",
    projectId: project.id,
    contextId: conversation.a2aContextId,
    title: "Recover interrupted task room request",
    ownerAgentId: chief.id,
    participantAgentIds: [participant.id],
    state: "submitting",
    summary: "Task submitted to Chief.",
    events: [
      {
        id: "smoke-task-room-pending-task-submitted",
        taskId: "smoke-task-room-pending-task",
        agentId: chief.id,
        label: "Task submitted to Chief.",
        state: "submitting",
        timestamp: now,
      },
    ],
    artifactIds: [],
    updatedAt: now,
  };
  const run = {
    id: "smoke-task-room-pending-run",
    projectId: project.id,
    conversationId: conversation.id,
    taskId: task.id,
    type: "chief_delegation",
    ownerAgentId: chief.id,
    participantAgentIds: [chief.id, participant.id],
    state: "submitting",
    summary: "Chief-led task submitted.",
    eventIds: ["smoke-task-room-pending-run-submitted"],
    artifactIds: [],
    createdAt: now,
    updatedAt: now,
  };
  const message = {
    id: "smoke-task-room-pending-message",
    conversationId: conversation.id,
    projectId: project.id,
    role: "user",
    contentParts: [{ kind: "text", text: "Recover interrupted task room request." }],
    taskId: task.id,
    runId: run.id,
    requestId: "smoke-task-room-pending-request",
    requestAttempt: 1,
    requestStartedAt: now,
    status: "sending",
    createdAt: now,
  };

  return {
    ...seed,
    workspace: {
      ...seed.workspace,
      messages: [message],
      runs: [run],
      tasks: [task],
    },
  };
}

function createTaskRoomRetrySeed() {
  const now = "2026-06-18T12:00:00.000Z";
  const chief = createSmokeAgent("smoke-chief-retry", "Chief Smoke", {
    isChief: true,
    officeRole: "chief",
    tags: ["planning"],
    supportsTaskLifecycle: true,
  });
  const participant = createSmokeAgent("smoke-participant-retry", "Participant Smoke", {
    officeRole: "writer",
    tags: ["drafts"],
  });
  const project = {
    id: "project-task-room-retry-smoke",
    name: "Retry Smoke Project",
    namespace: "retry-smoke-project",
    description: "Project workspace.",
  };
  const conversation = {
    id: "smoke-task-room-retry-conversation",
    projectId: project.id,
    mode: "task_room",
    title: "Retry Smoke Project task room",
    chiefAgentId: chief.id,
    participantAgentIds: [participant.id],
    a2aContextId: "retry-smoke-project:task-room",
    createdAt: now,
    updatedAt: now,
  };
  const task = {
    id: "smoke-task-room-retry-task",
    projectId: project.id,
    contextId: conversation.a2aContextId,
    title: "Recover task room retry",
    ownerAgentId: chief.id,
    participantAgentIds: [participant.id],
    state: "failed",
    summary: "Previous task room failure.",
    events: [
      {
        id: "smoke-task-room-retry-task-failed",
        taskId: "smoke-task-room-retry-task",
        agentId: chief.id,
        label: "Task Room request failed.",
        state: "failed",
        timestamp: now,
      },
    ],
    artifactIds: [],
    updatedAt: now,
  };
  const run = {
    id: "smoke-task-room-retry-run",
    projectId: project.id,
    conversationId: conversation.id,
    taskId: task.id,
    type: "chief_delegation",
    ownerAgentId: chief.id,
    participantAgentIds: [chief.id, participant.id],
    state: "failed",
    summary: "Previous task room failure.",
    eventIds: ["smoke-task-room-retry-run-failed"],
    artifactIds: [],
    createdAt: now,
    updatedAt: now,
  };
  const message = {
    id: "smoke-task-room-retry-message",
    conversationId: conversation.id,
    projectId: project.id,
    role: "user",
    contentParts: [{ kind: "text", text: "Recover task room retry." }],
    taskId: task.id,
    runId: run.id,
    requestId: "smoke-task-room-retry-request",
    requestAttempt: 1,
    requestStartedAt: now,
    requestCompletedAt: now,
    status: "failed",
    errorKind: "interrupted",
    errorText: "Task Room was interrupted before the agent returned. You can retry this request.",
    createdAt: now,
  };

  return {
    agents: [chief, participant],
    workspace: {
      version: 1,
      projects: [project],
      conversations: [conversation],
      messages: [message],
      runs: [run],
      tasks: [task],
      artifacts: [],
    },
    ui: {
      selectedAgentId: chief.id,
      selectedProjectId: project.id,
      chatScope: "project",
      conversationMode: "task-room",
      outputMode: "runs",
      activeFreeChatConversationIds: {},
    },
  };
}

function createSmokeAgent(id, name, overrides = {}) {
  return {
    id,
    name,
    role: "stability / smoke",
    officeRole: "operator",
    location: "local smoke",
    endpoint: `${new URL(appUrl).origin}/smoke-openai`,
    a2aEndpoint: "http://127.0.0.1:9/a2a",
    agentCardUrl: "http://127.0.0.1:9/.well-known/agent-card.json",
    model: "smoke-model",
    runtimeProvider: "openai",
    tags: ["testing"],
    status: "online",
    ...overrides,
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
