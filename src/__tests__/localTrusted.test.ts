import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { getUserFacingAgentError } from "../services/agentErrorText";
import { applyLocalTrustedAgentStatusMap } from "../services/agentReadinessState";

import { agent, participant } from "./testSupport";

test("local trusted registry preserves credentials when metadata is rewritten without keys", async () => {
  const localTrustedHome = await mkdtemp(path.join(os.tmpdir(), "vibe-office-local-trusted-"));
  const previousHome = process.env.VIBE_OFFICE_LOCAL_TRUSTED_HOME;
  process.env.VIBE_OFFICE_LOCAL_TRUSTED_HOME = localTrustedHome;

  try {
    const { readLocalTrustedAgentRegistry, writeLocalTrustedAgentRegistry } = await import("../../localTrusted/agentRegistry");

    await writeLocalTrustedAgentRegistry({
      "agent-secret": {
        ...agent,
        id: "agent-secret",
        name: "Secret Agent",
        a2aEndpoint: "http://127.0.0.1:8642/a2a",
        agentCardUrl: "http://127.0.0.1:8642/.well-known/agent-card.json",
        runtimeProvider: "hermes",
        apiKey: "local-trusted-secret",
      },
      "agent-delete": {
        ...participant,
        id: "agent-delete",
        name: "Delete Agent",
        a2aEndpoint: "http://127.0.0.1:8643/a2a",
        agentCardUrl: "http://127.0.0.1:8643/.well-known/agent-card.json",
        runtimeProvider: "hermes",
        apiKey: "delete-secret",
      },
    });

    await writeLocalTrustedAgentRegistry({
      "agent-secret": {
        ...agent,
        id: "agent-secret",
        name: "Secret Agent",
        a2aEndpoint: "http://127.0.0.1:8642/a2a",
        agentCardUrl: "http://127.0.0.1:8642/.well-known/agent-card.json",
        runtimeProvider: "hermes",
      },
    });

    const registryRaw = await readFile(path.join(localTrustedHome, "agent-registry.local.json"), "utf8");
    const credentialRaw = await readFile(path.join(localTrustedHome, "agent-credentials.local.json"), "utf8");
    const credentials = JSON.parse(credentialRaw);
    const hydrated = await readLocalTrustedAgentRegistry();
    const hydratedAgent = hydrated["agent-secret"];

    assert.equal(registryRaw.includes("local-trusted-secret"), false);
    assert.equal(JSON.parse(registryRaw)["agent-secret"].apiKey, undefined);
    assert.equal(credentials["agent-secret"].apiKey, "local-trusted-secret");
    assert.equal(credentials["agent-delete"], undefined);
    assert.ok(hydratedAgent);
    assert.equal(hydratedAgent.apiKey, "local-trusted-secret");
  } finally {
    if (previousHome === undefined) {
      delete process.env.VIBE_OFFICE_LOCAL_TRUSTED_HOME;
    } else {
      process.env.VIBE_OFFICE_LOCAL_TRUSTED_HOME = previousHome;
    }
    await rm(localTrustedHome, { recursive: true, force: true });
  }
});

test("local trusted registry update sync keeps saved credentials while refreshing provider metadata", async () => {
  const localTrustedHome = await mkdtemp(path.join(os.tmpdir(), "vibe-office-local-trusted-"));
  const previousHome = process.env.VIBE_OFFICE_LOCAL_TRUSTED_HOME;
  process.env.VIBE_OFFICE_LOCAL_TRUSTED_HOME = localTrustedHome;

  try {
    const {
      readLocalTrustedAgentRegistry,
      updateLocalTrustedAgentRegistry,
      writeLocalTrustedAgentRegistry,
    } = await import("../../localTrusted/agentRegistry");

    await writeLocalTrustedAgentRegistry({
      "agent-provider-sync": {
        ...agent,
        id: "agent-provider-sync",
        name: "Provider Sync",
        endpoint: "https://api.example.com/v1",
        a2aEndpoint: "https://api.example.com/a2a",
        agentCardUrl: "https://api.example.com/.well-known/agent-card.json",
        model: "old-model",
        runtimeProvider: "openai",
        apiKey: "saved-provider-key",
      },
    });

    await updateLocalTrustedAgentRegistry((registry) => ({
      ...registry,
      "agent-provider-sync": {
        ...registry["agent-provider-sync"],
        endpoint: "https://api.example.com/v1",
        a2aEndpoint: "https://api.example.com/a2a",
        agentCardUrl: "https://api.example.com/.well-known/agent-card.json",
        model: "new-model",
        runtimeProvider: "anthropic",
        apiKey: undefined,
      },
    }));

    const registryRaw = await readFile(path.join(localTrustedHome, "agent-registry.local.json"), "utf8");
    const credentialRaw = await readFile(path.join(localTrustedHome, "agent-credentials.local.json"), "utf8");
    const hydrated = await readLocalTrustedAgentRegistry();

    assert.equal(registryRaw.includes("saved-provider-key"), false);
    assert.equal(JSON.parse(credentialRaw)["agent-provider-sync"].apiKey, "saved-provider-key");
    assert.equal(hydrated["agent-provider-sync"].apiKey, "saved-provider-key");
    assert.equal(hydrated["agent-provider-sync"].model, "new-model");
    assert.equal(hydrated["agent-provider-sync"].runtimeProvider, "anthropic");
  } finally {
    if (previousHome === undefined) {
      delete process.env.VIBE_OFFICE_LOCAL_TRUSTED_HOME;
    } else {
      process.env.VIBE_OFFICE_LOCAL_TRUSTED_HOME = previousHome;
    }
    await rm(localTrustedHome, { recursive: true, force: true });
  }
});

test("local trusted credential files use private atomic write helpers", async () => {
  const credentialStore = await readFile(path.join(process.cwd(), "localTrusted", "credentialStore.ts"), "utf8");
  const agentRegistry = await readFile(path.join(process.cwd(), "localTrusted", "agentRegistry.ts"), "utf8");
  const credentialUpdater = await readFile(path.join(process.cwd(), "scripts", "update-local-agent-credential.mjs"), "utf8");

  assert.match(credentialStore, /LOCAL_TRUSTED_DIRECTORY_MODE = 0o700/);
  assert.match(credentialStore, /LOCAL_TRUSTED_PRIVATE_FILE_MODE = 0o600/);
  assert.match(credentialStore, /writeLocalTrustedPrivateJsonFile/);
  assert.match(credentialStore, /fs\.chmod/);
  assert.match(agentRegistry, /writeLocalTrustedPrivateJsonFile\(registryPath/);
  assert.match(credentialUpdater, /localTrustedDirectoryMode = 0o700/);
  assert.match(credentialUpdater, /localTrustedPrivateFileMode = 0o600/);
  assert.match(credentialUpdater, /fs\.chmod/);
  assert.match(credentialStore, /cleanupStaleLocalTrustedTempFiles/);
});

test("local trusted temp cleanup removes only stale atomic-write leftovers", async () => {
  const { cleanupStaleLocalTrustedTempFiles } = await import("../../localTrusted/credentialStore");
  const localTrustedHome = await mkdtemp(path.join(os.tmpdir(), "vibe-office-temp-cleanup-"));
  const nowMs = Date.now();
  const oldTemp = path.join(localTrustedHome, "agent-credentials.local.1.1.old.tmp");
  const freshTemp = path.join(localTrustedHome, "agent-credentials.local.1.1.fresh.tmp");
  const unrelatedTemp = path.join(localTrustedHome, "agent-registry.local.1.1.old.tmp");
  const realCredentialFile = path.join(localTrustedHome, "agent-credentials.local.json");

  try {
    await writeFile(oldTemp, "old", "utf8");
    await writeFile(freshTemp, "fresh", "utf8");
    await writeFile(unrelatedTemp, "other", "utf8");
    await writeFile(realCredentialFile, "{}", "utf8");
    await utimes(oldTemp, new Date(nowMs - 120_000), new Date(nowMs - 120_000));
    await utimes(freshTemp, new Date(nowMs - 10_000), new Date(nowMs - 10_000));
    await utimes(unrelatedTemp, new Date(nowMs - 120_000), new Date(nowMs - 120_000));

    await cleanupStaleLocalTrustedTempFiles(localTrustedHome, "agent-credentials.local", {
      maxAgeMs: 60_000,
      nowMs,
    });

    const remaining = await readdir(localTrustedHome);
    assert.equal(remaining.includes(path.basename(oldTemp)), false);
    assert.equal(remaining.includes(path.basename(freshTemp)), true);
    assert.equal(remaining.includes(path.basename(unrelatedTemp)), true);
    assert.equal(remaining.includes(path.basename(realCredentialFile)), true);
  } finally {
    await rm(localTrustedHome, { recursive: true, force: true });
  }
});

test("local trusted registry exposes safe agent status without credentials", async () => {
  const localTrustedHome = await mkdtemp(path.join(os.tmpdir(), "vibe-office-local-trusted-"));
  const previousHome = process.env.VIBE_OFFICE_LOCAL_TRUSTED_HOME;
  process.env.VIBE_OFFICE_LOCAL_TRUSTED_HOME = localTrustedHome;

  try {
    const { getLocalTrustedAgentSafeStatuses, writeLocalTrustedAgentRegistry } = await import("../../localTrusted/agentRegistry");

    await writeLocalTrustedAgentRegistry({
      "agent-deepseek": {
        ...agent,
        id: "agent-deepseek",
        endpoint: "https://api.deepseek.com",
        a2aEndpoint: "https://api.deepseek.com/a2a",
        agentCardUrl: "https://api.deepseek.com/.well-known/agent-card.json",
        model: "deepseek-v4-flash",
        runtimeProvider: "openai",
      },
      "agent-minimax": {
        ...participant,
        id: "agent-minimax",
        endpoint: "https://api.minimaxi.com/v1",
        a2aEndpoint: "https://api.minimaxi.com/a2a",
        agentCardUrl: "https://api.minimaxi.com/.well-known/agent-card.json",
        model: "MiniMax-M3",
        runtimeProvider: "openai",
        apiKey: "local-trusted-secret",
      },
      "agent-hermes": {
        ...agent,
        id: "agent-hermes",
        endpoint: "https://example-agent.local/v1",
        a2aEndpoint: "https://example-agent.local/a2a",
        agentCardUrl: "https://example-agent.local/.well-known/agent-card.json",
        model: "hermes-agent",
        runtimeProvider: "hermes",
      },
    });

    const statuses = await getLocalTrustedAgentSafeStatuses();
    const deepseekStatus = statuses.find((status) => status.id === "agent-deepseek");
    const minimaxStatus = statuses.find((status) => status.id === "agent-minimax");
    const hermesStatus = statuses.find((status) => status.id === "agent-hermes");

    assert.ok(deepseekStatus);
    assert.ok(minimaxStatus);
    assert.ok(hermesStatus);
    assert.equal("apiKey" in deepseekStatus, false);
    assert.equal("apiKey" in minimaxStatus, false);
    assert.equal(deepseekStatus.registered, true);
    assert.equal(deepseekStatus.hasCredential, false);
    assert.match(deepseekStatus.issues.join("\n"), /API key is not saved/);
    assert.equal(minimaxStatus.registered, true);
    assert.equal(minimaxStatus.hasCredential, true);
    assert.match(minimaxStatus.issues.join("\n"), /MiniMax M3 should be configured as Anthropic-compatible/);
    assert.equal(hermesStatus.registered, true);
    assert.equal(hermesStatus.hasCredential, false);
    assert.deepEqual(hermesStatus.issues, []);

    const [missingStatus] = await getLocalTrustedAgentSafeStatuses(["agent-missing"]);
    assert.equal(missingStatus.registered, false);
    assert.equal(missingStatus.hasCredential, false);
    assert.match(missingStatus.issues.join("\n"), /not registered/);
  } finally {
    if (previousHome === undefined) {
      delete process.env.VIBE_OFFICE_LOCAL_TRUSTED_HOME;
    } else {
      process.env.VIBE_OFFICE_LOCAL_TRUSTED_HOME = previousHome;
    }
    await rm(localTrustedHome, { recursive: true, force: true });
  }
});

test("local trusted agent registry commands upsert, report status, and delete safely", async () => {
  const localTrustedHome = await mkdtemp(path.join(os.tmpdir(), "vibe-office-local-trusted-"));
  const previousHome = process.env.VIBE_OFFICE_LOCAL_TRUSTED_HOME;
  process.env.VIBE_OFFICE_LOCAL_TRUSTED_HOME = localTrustedHome;

  try {
    const { executeAgentRegistryCommand } = await import("../../localTrusted/agentRegistryCommands");

    const upsert = await executeAgentRegistryCommand({
      command: "agent.upsert",
      payload: {
        agent: {
          ...agent,
          id: "agent-registry-command",
          endpoint: "https://api.deepseek.com/v1",
          a2aEndpoint: "https://api.deepseek.com/a2a",
          agentCardUrl: "https://api.deepseek.com/.well-known/agent-card.json",
          model: "deepseek-chat",
          runtimeProvider: "openai",
          apiKey: "local-command-secret",
        },
      },
    });
    const status = await executeAgentRegistryCommand({
      command: "agent.status",
      payload: { agentIds: ["agent-registry-command"] },
    });
    const registryRaw = await readFile(path.join(localTrustedHome, "agent-registry.local.json"), "utf8");
    const credentialRaw = await readFile(path.join(localTrustedHome, "agent-credentials.local.json"), "utf8");

    assert.deepEqual(upsert, { status: 200, body: { ok: true } });
    assert.equal(registryRaw.includes("local-command-secret"), false);
    assert.equal(JSON.parse(credentialRaw)["agent-registry-command"].apiKey, "local-command-secret");
    assert.equal(
      ((status.body as { statuses: Array<{ id: string; hasCredential: boolean }> }).statuses[0]?.hasCredential),
      true,
    );

    const deleted = await executeAgentRegistryCommand({
      command: "agent.delete",
      payload: { agentId: "agent-registry-command" },
    });
    const missing = await executeAgentRegistryCommand({
      command: "agent.status",
      payload: { agentIds: ["agent-registry-command"] },
    });

    assert.deepEqual(deleted, { status: 200, body: { ok: true } });
    assert.equal(
      ((missing.body as { statuses: Array<{ registered: boolean }> }).statuses[0]?.registered),
      false,
    );
  } finally {
    if (previousHome === undefined) {
      delete process.env.VIBE_OFFICE_LOCAL_TRUSTED_HOME;
    } else {
      process.env.VIBE_OFFICE_LOCAL_TRUSTED_HOME = previousHome;
    }
    await rm(localTrustedHome, { recursive: true, force: true });
  }
});

test("local trusted credential assertion rejects provider agents without saved keys", async () => {
  const previousWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  const previousFetch = globalThis.fetch;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {},
  });
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        statuses: [
          {
            id: "agent-missing-key",
            runtimeProvider: "openai",
            model: "deepseek-chat",
            hasCredential: false,
            registered: true,
            issues: ["API key is not saved in the local trusted layer."],
          },
        ],
      }),
      {
        headers: { "Content-Type": "application/json" },
        status: 200,
      },
    );

  try {
    const { assertLocalTrustedAgentCredential } = await import("../services/localTrustedAgentRegistry");

    await assert.rejects(
      assertLocalTrustedAgentCredential({
        ...agent,
        id: "agent-missing-key",
        endpoint: "https://api.deepseek.com",
        a2aEndpoint: "https://api.deepseek.com/a2a",
        agentCardUrl: "https://api.deepseek.com/.well-known/agent-card.json",
        model: "deepseek-chat",
        runtimeProvider: "openai",
      }),
      /API key is missing in the local trusted layer/,
    );
  } finally {
    globalThis.fetch = previousFetch;
    if (previousWindowDescriptor) {
      Object.defineProperty(globalThis, "window", previousWindowDescriptor);
    } else {
      Reflect.deleteProperty(globalThis, "window");
    }
  }
});

test("local trusted provider commands stop missing provider keys before forwarding", async () => {
  const localTrustedHome = await mkdtemp(path.join(os.tmpdir(), "vibe-office-local-trusted-"));
  const previousHome = process.env.VIBE_OFFICE_LOCAL_TRUSTED_HOME;
  process.env.VIBE_OFFICE_LOCAL_TRUSTED_HOME = localTrustedHome;

  try {
    const { writeLocalTrustedAgentRegistry } = await import("../../localTrusted/agentRegistry");
    const { getVerifiedProviderCommandRequest } = await import("../../localTrusted/providerRequests");

    await writeLocalTrustedAgentRegistry({
      "agent-openai-missing-key": {
        ...agent,
        id: "agent-openai-missing-key",
        endpoint: "https://api.deepseek.com/v1",
        a2aEndpoint: "https://api.deepseek.com/a2a",
        agentCardUrl: "https://api.deepseek.com/.well-known/agent-card.json",
        model: "deepseek-chat",
        runtimeProvider: "openai",
      },
      "agent-anthropic-missing-key": {
        ...participant,
        id: "agent-anthropic-missing-key",
        endpoint: "https://api.minimaxi.com/anthropic",
        a2aEndpoint: "https://api.minimaxi.com/a2a",
        agentCardUrl: "https://api.minimaxi.com/.well-known/agent-card.json",
        model: "MiniMax-M3",
        runtimeProvider: "anthropic",
      },
    });

    await assert.rejects(
      getVerifiedProviderCommandRequest({
        agentId: "agent-openai-missing-key",
        command: "openai.chatCompletions",
        payload: {
          messages: [{ role: "user", content: "hi" }],
        },
      }),
      /OpenAI-compatible API key is missing in the local trusted layer/,
    );
    await assert.rejects(
      getVerifiedProviderCommandRequest({
        agentId: "agent-anthropic-missing-key",
        command: "anthropic.messages",
        payload: {
          messages: [{ role: "user", content: "hi" }],
        },
      }),
      /Anthropic-compatible API key is missing in the local trusted layer/,
    );

    assert.equal(
      getUserFacingAgentError(
        new Error("OpenAI-compatible chat failed: 400: OpenAI-compatible API key is missing in the local trusted layer."),
      ),
      "Agent API key is missing. Open this agent's settings, save the API key again, then retry.",
    );
  } finally {
    if (previousHome === undefined) {
      delete process.env.VIBE_OFFICE_LOCAL_TRUSTED_HOME;
    } else {
      process.env.VIBE_OFFICE_LOCAL_TRUSTED_HOME = previousHome;
    }
    await rm(localTrustedHome, { recursive: true, force: true });
  }
});

test("agent readiness status map preserves safe local trusted diagnostics", () => {
  const status = {
    id: "agent-deepseek",
    runtimeProvider: "openai" as const,
    model: "deepseek-v4-flash",
    hasCredential: false,
    registered: true,
    issues: ["API key is not saved in the local trusted layer."],
  };

  const replaced = applyLocalTrustedAgentStatusMap({
    currentStatuses: {
      stale: {
        id: "stale",
        runtimeProvider: "hermes",
        model: "old",
        hasCredential: false,
        registered: false,
        issues: ["stale"],
      },
    },
    replace: true,
    statuses: [status],
  });
  assert.deepEqual(Object.keys(replaced), ["agent-deepseek"]);
  assert.equal(replaced["agent-deepseek"].hasCredential, false);
  assert.equal(replaced["agent-deepseek"].registered, true);
});
