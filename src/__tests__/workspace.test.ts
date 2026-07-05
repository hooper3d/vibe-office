import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  deriveInitialChatScope,
  FREE_CHAT_ENTRY_PROJECT_ID,
  normalizeOutputMode,
} from "../services/appBootstrapState";
import { getCanonicalLocalhostRedirectUrl } from "../services/canonicalHost";
import { createLocalTrustedAgentRegistryCommandRequest } from "../services/localTrustedAgentRegistry";
import { getSplitPercentFromClientX, nudgeSplitPercent } from "../services/splitPaneState";
import { loadUiState, saveUiState } from "../services/uiStateStorage";
import { attachWorkspaceFileState, detachWorkspaceFileState } from "../services/workspaceAttachmentState";
import {
  createLocalTrustedWorkspaceCommandRequest,
  readWorkspaceFile,
  type WorkspaceFileAttachment,
  type WorkspaceFileReadResult,
} from "../services/workspaceFileClient";
import { applyWorkspaceStateDefaults, emptyWorkspaceState, loadWorkspaceState, saveWorkspaceState } from "../services/workspaceStorage";

import { artifact, at, conversation, MemoryLocalStorage, project, run, task, userMessage, withWindowStorage } from "./testSupport";

test("local trusted agent registry client sends command-shaped requests", () => {
  const request = createLocalTrustedAgentRegistryCommandRequest({
    command: "agent.status",
    payload: {
      agentIds: ["agent-deepseek"],
    },
  });

  assert.equal(request.method, "POST");
  assert.equal(JSON.parse(String(request.body)).command, "agent.status");
  assert.deepEqual(JSON.parse(String(request.body)).payload, { agentIds: ["agent-deepseek"] });
});

test("workspace file client sends command-shaped local trusted requests", () => {
  const request = createLocalTrustedWorkspaceCommandRequest({
    command: "workspace.read",
    payload: {
      root: "C:/workspace/project",
      path: "src/App.tsx",
    },
  });
  const body = JSON.parse(String(request.body));

  assert.equal(request.method, "POST");
  assert.equal(body.command, "workspace.read");
  assert.deepEqual(body.payload, {
    root: "C:/workspace/project",
    path: "src/App.tsx",
  });
});

test("workspace file client preserves local trusted error details", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ error: { message: "Workspace file context could not be restored." } }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })) as typeof fetch;

  try {
    await assert.rejects(
      () => readWorkspaceFile("C:/workspace/project", "src/App.tsx"),
      /Workspace file context could not be restored/,
    );
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("workspace attachment state deduplicates, caps, and detaches files", () => {
  const makeFile = (name: string): WorkspaceFileReadResult => ({
    path: `docs/${name}.md`,
    content: name,
    size: name.length,
    updatedAt: at,
    truncated: false,
  });
  let attachments = ["one", "two", "three"].reduce<WorkspaceFileAttachment[]>(
    (current, name) =>
      attachWorkspaceFileState({
        attachments: current,
        file: makeFile(name),
        attachedAt: `${at}-${name}`,
        limit: 3,
      }),
    [],
  );

  assert.deepEqual(attachments.map((item) => item.path), ["docs/one.md", "docs/two.md", "docs/three.md"]);
  assert.equal(
    attachWorkspaceFileState({
      attachments,
      file: makeFile("two"),
      attachedAt: `${at}-duplicate`,
      limit: 3,
    }),
    attachments,
  );

  attachments = attachWorkspaceFileState({
    attachments,
    file: makeFile("four"),
    attachedAt: `${at}-four`,
    limit: 3,
  });

  assert.deepEqual(attachments.map((item) => item.path), ["docs/two.md", "docs/three.md", "docs/four.md"]);
  assert.deepEqual(
    detachWorkspaceFileState({ attachments, path: "docs/three.md" }).map((item) => item.path),
    ["docs/two.md", "docs/four.md"],
  );
});

test("local trusted workspace commands list, read, search, and reject path escape", async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "vibe-office-workspace-command-"));
  await mkdir(path.join(workspaceRoot, "docs"));
  await writeFile(path.join(workspaceRoot, "docs", "README.md"), "hello workspace needle\nsecond line", "utf8");

  try {
    const { executeWorkspaceCommand } = await import("../../localTrusted/workspaceFiles");

    const listed = await executeWorkspaceCommand({
      command: "workspace.list",
      payload: {
        root: workspaceRoot,
        path: "",
      },
    });
    assert.equal(listed.status, 200);
    assert.equal((listed.body as { entries: Array<{ name: string }> }).entries[0]?.name, "docs");

    const read = await executeWorkspaceCommand({
      command: "workspace.read",
      payload: {
        root: workspaceRoot,
        path: "docs/README.md",
      },
    });
    assert.equal(read.status, 200);
    assert.equal((read.body as { content: string }).content.includes("needle"), true);

    const searched = await executeWorkspaceCommand({
      command: "workspace.search",
      payload: {
        root: workspaceRoot,
        query: "needle",
      },
    });
    assert.equal(searched.status, 200);
    assert.equal((searched.body as { matches: Array<{ path: string; lineNumber: number }> }).matches[0]?.path, "docs/README.md");

    await assert.rejects(
      executeWorkspaceCommand({
        command: "workspace.read",
        payload: {
          root: workspaceRoot,
          path: "../outside.md",
        },
      }),
      /limited to the selected project directory/,
    );
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});


test("canonical host redirect keeps local storage on one loopback origin", () => {
  assert.equal(
    getCanonicalLocalhostRedirectUrl({
      protocol: "http:",
      hostname: "localhost",
      port: "5180",
      pathname: "/project",
      search: "?tab=workspace",
      hash: "#files",
    }),
    "http://127.0.0.1:5180/project?tab=workspace#files",
  );
  assert.equal(
    getCanonicalLocalhostRedirectUrl({
      protocol: "http:",
      hostname: "127.0.0.1",
      port: "5180",
      pathname: "/",
      search: "",
      hash: "",
    }),
    "",
  );
});


test("ui state storage restores selected chrome and tolerates corrupt or unavailable storage", () => {
  withWindowStorage(new MemoryLocalStorage(), () => {
    saveUiState({
      selectedAgentId: "agent-lucy",
      selectedProjectId: "project-vibe",
      chatScope: "project",
      conversationMode: "task-room",
      outputMode: "outputs",
      browserUrl: "http://127.0.0.1:5180/",
      previewOutput: {
        ownerAgentId: "agent-lucy",
        openedAt: 1780000000000,
        url: "http://127.0.0.1:5180/",
      },
      activeFreeChatConversationIds: {
        "agent-lucy": "free-conversation-1",
      },
    });

    assert.deepEqual(loadUiState(), {
      selectedAgentId: "agent-lucy",
      selectedProjectId: "project-vibe",
      chatScope: "project",
      conversationMode: "task-room",
      outputMode: "outputs",
      browserUrl: "http://127.0.0.1:5180/",
      previewOutput: {
        ownerAgentId: "agent-lucy",
        openedAt: 1780000000000,
        url: "http://127.0.0.1:5180/",
      },
      activeFreeChatConversationIds: {
        "agent-lucy": "free-conversation-1",
      },
    });
  });

  withWindowStorage(new MemoryLocalStorage(), () => {
    window.localStorage.setItem(
      "vibe-office.ui.v1",
      JSON.stringify({
        outputMode: "artifacts",
      }),
    );

    assert.equal(loadUiState().outputMode, "outputs");
  });

  withWindowStorage(new MemoryLocalStorage(), () => {
    window.localStorage.setItem(
      "vibe-office.ui.v1",
      JSON.stringify({
        selectedAgentId: 12,
        selectedProjectId: "project-vibe",
        chatScope: "workspace",
        conversationMode: "task-room",
        outputMode: "floating",
        browserUrl: 123,
        previewOutput: {
          ownerAgentId: 456,
          openedAt: "yesterday",
          url: "",
        },
        activeFreeChatConversationIds: {
          valid: "conversation-id",
          invalid: 123,
        },
      }),
    );

    assert.deepEqual(loadUiState(), {
      selectedAgentId: undefined,
      selectedProjectId: "project-vibe",
      chatScope: undefined,
      conversationMode: "task-room",
      outputMode: undefined,
      browserUrl: undefined,
      previewOutput: undefined,
      activeFreeChatConversationIds: {
        valid: "conversation-id",
      },
    });
  });

  withWindowStorage(new MemoryLocalStorage(), () => {
    window.localStorage.setItem("vibe-office.ui.v1", "{bad json");
    assert.deepEqual(loadUiState(), {});
  });

  assert.doesNotThrow(() =>
    withWindowStorage(new MemoryLocalStorage(true), () => {
      saveUiState({ selectedAgentId: "agent-lucy" });
    }),
  );
});

test("app bootstrap state derives stable free chat and output defaults", () => {
  assert.equal(
    deriveInitialChatScope({
      freeChatEntryProjectId: FREE_CHAT_ENTRY_PROJECT_ID,
      selectedProjectId: undefined,
      storedChatScope: undefined,
    }),
    "free",
  );
  assert.equal(
    deriveInitialChatScope({
      freeChatEntryProjectId: FREE_CHAT_ENTRY_PROJECT_ID,
      selectedProjectId: "project-vibe",
      storedChatScope: undefined,
    }),
    "project",
  );
  assert.equal(
    deriveInitialChatScope({
      freeChatEntryProjectId: FREE_CHAT_ENTRY_PROJECT_ID,
      selectedProjectId: "project-vibe",
      storedChatScope: "free",
    }),
    "free",
  );
  assert.equal(normalizeOutputMode("workspace"), "workspace");
  assert.equal(normalizeOutputMode("browser"), "browser");
  assert.equal(normalizeOutputMode("artifacts"), "outputs");
  assert.equal(normalizeOutputMode("runs"), "outputs");
  assert.equal(normalizeOutputMode("floating"), "workspace");
});

test("workspace storage migrates recoverable state and falls back safely", () => {
  withWindowStorage(new MemoryLocalStorage(), () => {
    saveWorkspaceState({
      projects: [project],
      conversations: [conversation()],
      messages: [userMessage({ requestId: undefined, requestAttempt: undefined, requestStartedAt: undefined })],
      runs: [run({ summary: "Recovered run summary." })],
      tasks: [task()],
      artifacts: [],
    });

    const restored = loadWorkspaceState();
    assert.equal(restored.projects[0].id, project.id);
    assert.equal(restored.conversations[0].updatedAt, at);
    assert.equal(restored.messages[0].requestId, "message-1");
    assert.equal(restored.messages[0].requestAttempt, 1);
    assert.equal(restored.messages[0].requestStartedAt, at);
    assert.equal(restored.runs[0].summary, "Recovered run summary.");
  });

  withWindowStorage(new MemoryLocalStorage(), () => {
    window.localStorage.setItem(
      "vibe-office.workspace.v1",
      JSON.stringify({
        version: 1,
        projects: [{ id: "project-vibe", name: "Vibe Office", namespace: "project-vibe-office" }, { id: 5 }],
        conversations: [{ id: "conversation-1", projectId: "project-vibe", mode: "direct" }, { id: "bad" }],
        messages: [
          {
            id: "message-1",
            conversationId: "conversation-1",
            projectId: "project-vibe",
            role: "user",
            status: "sending",
            contentParts: [{ kind: "text", text: "hello" }, { kind: "file", file: {} }],
            workspaceContext: [{ path: "src/App.tsx", size: "big" }],
            createdAt: at,
          },
          { id: "bad-message", role: "robot" },
        ],
        runs: [{ id: "run-1", projectId: "project-vibe", conversationId: "conversation-1", type: "direct_message", ownerAgentId: "agent-lucy", state: "completed" }],
        tasks: [{ id: "task-1", projectId: "project-vibe", contextId: "project-vibe-office", title: "Task", ownerAgentId: "agent-lucy", state: "working" }],
        artifacts: [{ id: "artifact-1", projectId: "project-vibe", taskId: "task-1", agentId: "agent-lucy", name: "Result", kind: "text" }],
      }),
    );

    const restored = loadWorkspaceState();
    assert.equal(restored.projects.length, 1);
    assert.equal(restored.conversations.length, 1);
    assert.equal(restored.messages.length, 1);
    assert.equal(restored.messages[0].contentParts.length, 1);
    assert.deepEqual(restored.messages[0].workspaceContext, [{ path: "src/App.tsx", size: 0, attachedAt: restored.messages[0].workspaceContext?.[0].attachedAt }]);
    assert.equal(restored.runs.length, 1);
    assert.equal(restored.tasks.length, 1);
    assert.equal(restored.artifacts.length, 1);
  });

  withWindowStorage(new MemoryLocalStorage(), () => {
    window.localStorage.setItem("vibe-office.workspace.v1", "{bad json");
    assert.deepEqual(loadWorkspaceState(), emptyWorkspaceState);
  });

  assert.doesNotThrow(() =>
    withWindowStorage(new MemoryLocalStorage(true), () => {
      saveWorkspaceState(emptyWorkspaceState);
    }),
  );
});

test("workspace state defaults fill only empty persisted collections", () => {
  const defaults = {
    ...emptyWorkspaceState,
    projects: [project],
    conversations: [conversation()],
    messages: [userMessage()],
    runs: [run()],
    tasks: [task()],
    artifacts: [artifact()],
  };
  const persistedProject = { ...project, id: "persisted-project", name: "Persisted" };

  const initialized = applyWorkspaceStateDefaults(
    {
      ...emptyWorkspaceState,
      projects: [persistedProject],
    },
    defaults,
  );

  assert.deepEqual(initialized.projects.map((item) => item.id), [persistedProject.id]);
  assert.deepEqual(initialized.conversations.map((item) => item.id), ["conversation-1"]);
  assert.deepEqual(initialized.messages.map((item) => item.id), ["message-1"]);
  assert.deepEqual(initialized.runs.map((item) => item.id), ["run-1"]);
  assert.deepEqual(initialized.tasks.map((item) => item.id), ["task-1"]);
  assert.deepEqual(initialized.artifacts.map((item) => item.id), ["artifact-1"]);
});

test("split pane state clamps pointer and keyboard changes", () => {
  assert.equal(getSplitPercentFromClientX({ clientX: 540, left: 0, width: 1000 }), 54);
  assert.equal(getSplitPercentFromClientX({ clientX: 200, left: 0, width: 1000 }), 35);
  assert.equal(getSplitPercentFromClientX({ clientX: 900, left: 0, width: 1000 }), 70);
  assert.equal(getSplitPercentFromClientX({ clientX: 500, left: 100, width: 0 }), 35);
  assert.equal(nudgeSplitPercent(54, "left"), 50);
  assert.equal(nudgeSplitPercent(54, "right"), 58);
  assert.equal(nudgeSplitPercent(35, "left"), 35);
  assert.equal(nudgeSplitPercent(70, "right"), 70);
});
