import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("M9 provider regression script keeps Chinese context probes readable", async () => {
  const source = await readFile(path.join(process.cwd(), "scripts", "run-provider-regression.mjs"), "utf8");

  assert.match(source, /用一句中文回复：M9 free chat ok/);
  assert.match(source, /请记住暗号：海盐柠檬。只回复：记住了。/);
  assert.match(source, /刚才暗号是什么？请只回答暗号。/);
  assert.doesNotMatch(source, /鐢|璇|娴|鏌|锛|銆|閻/);
});

test("M9 provider regression uses command-shaped local trusted registry requests", async () => {
  const source = await readFile(path.join(process.cwd(), "scripts", "run-provider-regression.mjs"), "utf8");

  assert.match(source, /agent-local\/registry-command/);
  assert.match(source, /command:\s*"agent\.upsert"/);
  assert.match(source, /command:\s*"agent\.delete"/);
  assert.doesNotMatch(source, /agent-local\/agents\/upsert/);
  assert.doesNotMatch(source, /agent-local\/agents\/delete/);
});

test("M9 provider connection probe accepts a short reachable response", async () => {
  const source = await readFile(path.join(process.cwd(), "scripts", "run-provider-regression.mjs"), "utf8");

  assert.match(source, /Reply with one short sentence confirming the provider connection works\./);
  assert.match(source, /maxTokens: 64/);
  assert.doesNotMatch(source, /Reply with exactly: ok/);
});

test("M9 provider project probe keeps the system scope but asks for a short response", async () => {
  const source = await readFile(path.join(process.cwd(), "scripts", "run-provider-regression.mjs"), "utf8");

  assert.match(source, /Vibe Office project namespace: m9-regression/);
  assert.match(source, /Reply briefly: Vibe Office M9 project regression ok\./);
  assert.match(source, /maxTokens: 80/);
});

test("M9 provider regression retries empty model responses without masking forced timeouts", async () => {
  const source = await readFile(path.join(process.cwd(), "scripts", "run-provider-regression.mjs"), "utf8");

  assert.match(source, /const attempts = timeoutMs === forcedTimeoutMs \? 1 : 3/);
  assert.match(source, /const text = getProviderResponseText\(provider, payload\)/);
  assert.match(source, /if \(text\.trim\(\) \|\| attempt === attempts\) return text/);
  assert.match(source, /await delay\(250 \* attempt\)/);
  assert.match(source, /function delay\(ms\)/);
  assert.match(source, /function getProviderResponseText/);
});

test("M9 provider list output avoids printing local trusted endpoints", async () => {
  const localTrustedHome = await mkdtemp(path.join(os.tmpdir(), "vibe-office-m9-list-privacy-"));
  try {
    await writeFile(
      path.join(localTrustedHome, "agent-registry.local.json"),
      JSON.stringify({
        "agent-private-endpoint": {
          id: "agent-private-endpoint",
          name: "Private Endpoint",
          runtimeProvider: "openai",
          endpoint: "https://private-provider.example/v1",
          model: "private-model",
        },
      }),
      "utf8",
    );

    const list = spawnSync(process.execPath, ["scripts/run-provider-regression.mjs", "--list"], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        VIBE_OFFICE_LOCAL_TRUSTED_HOME: localTrustedHome,
      },
    });

    assert.equal(list.status, 0);
    assert.match(list.stdout, /agent-private-endpoint/);
    assert.match(list.stdout, /provider=openai/);
    assert.doesNotMatch(list.stdout, /private-provider\.example/);
    assert.doesNotMatch(list.stdout, /endpoint=/);
  } finally {
    await rm(localTrustedHome, { recursive: true, force: true });
  }
});

test("browser smoke cleanup uses command-shaped local trusted registry requests", async () => {
  const source = await readFile(path.join(process.cwd(), "scripts", "run-browser-smoke.mjs"), "utf8");

  assert.match(source, /agent-local\/registry-command/);
  assert.match(source, /command:\s*"agent\.delete"/);
  assert.doesNotMatch(source, /agent-local\/agents\/delete/);
});

test("M9 provider regression fails selected targets that are not ready", async () => {
  const localTrustedHome = await mkdtemp(path.join(os.tmpdir(), "vibe-office-m9-regression-"));
  try {
    const missing = spawnSync(process.execPath, ["scripts/run-provider-regression.mjs", "--target", "deepseek"], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        VIBE_OFFICE_LOCAL_TRUSTED_HOME: localTrustedHome,
      },
    });
    assert.equal(missing.status, 1);
    assert.match(`${missing.stdout}\n${missing.stderr}`, /DeepSeek OpenAI-compatible/);
    assert.match(`${missing.stdout}\n${missing.stderr}`, /setup: FAIL not ready: NOT_FOUND/);

    await writeFile(
      path.join(localTrustedHome, "agent-registry.local.json"),
      JSON.stringify({
        "agent-minimax": {
          id: "agent-minimax",
          name: "MiniMax",
          runtimeProvider: "openai",
          endpoint: "https://api.minimaxi.com/v1",
          model: "MiniMax-M3",
        },
      }),
    );
    const mismatch = spawnSync(process.execPath, ["scripts/run-provider-regression.mjs", "--target", "minimax"], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        VIBE_OFFICE_LOCAL_TRUSTED_HOME: localTrustedHome,
      },
    });
    assert.equal(mismatch.status, 1);
    assert.match(`${mismatch.stdout}\n${mismatch.stderr}`, /MiniMax Anthropic-compatible/);
    assert.match(`${mismatch.stdout}\n${mismatch.stderr}`, /PROVIDER_MISMATCH agent-minimax/);
    assert.match(`${mismatch.stdout}\n${mismatch.stderr}`, /repair=VIBE_AGENT_ID=agent-minimax VIBE_AGENT_M9_TARGET=minimax npm run local-agent:credential optionalKey=VIBE_AGENT_API_KEY=<key>/);

    await writeFile(
      path.join(localTrustedHome, "agent-registry.local.json"),
      JSON.stringify({
        "agent-deepseek-a": {
          id: "agent-deepseek-a",
          name: "DeepSeek A",
          runtimeProvider: "openai",
          endpoint: "https://api.deepseek.com",
          model: "deepseek-chat",
        },
        "agent-deepseek-b": {
          id: "agent-deepseek-b",
          name: "DeepSeek B",
          runtimeProvider: "openai",
          endpoint: "https://api.deepseek.com",
          model: "deepseek-v4-flash",
        },
      }),
    );
    const list = spawnSync(process.execPath, ["scripts/run-provider-regression.mjs", "--list", "--target", "deepseek"], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        VIBE_OFFICE_LOCAL_TRUSTED_HOME: localTrustedHome,
      },
    });
    assert.equal(list.status, 0);
    assert.match(list.stdout, /Local trusted home: <custom via VIBE_OFFICE_LOCAL_TRUSTED_HOME>/);
    assert.match(list.stdout, /MISSING_KEY agent-deepseek-a/);
    assert.match(list.stdout, /candidates=2 selected=agent-deepseek-a/);
    assert.match(list.stdout, /candidateStatus=agent-deepseek-a:openai:no-key,agent-deepseek-b:openai:no-key/);
  } finally {
    await rm(localTrustedHome, { recursive: true, force: true });
  }
});

test("local agent credential updater applies M9 target presets without leaking keys", async () => {
  const localTrustedHome = await mkdtemp(path.join(os.tmpdir(), "vibe-office-m9-credential-"));
  const secret = "super-secret-m9-test-key";

  try {
    await writeFile(
      path.join(localTrustedHome, "agent-registry.local.json"),
      JSON.stringify(
        {
          "agent-minimax": {
            id: "agent-minimax",
            name: "MiniMax",
            endpoint: "https://api.minimaxi.com/v1",
            a2aEndpoint: "https://api.minimaxi.com/a2a",
            agentCardUrl: "https://api.minimaxi.com/.well-known/agent-card.json",
            model: "MiniMax-M3",
            runtimeProvider: "openai",
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    const result = spawnSync(process.execPath, ["scripts/update-local-agent-credential.mjs"], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        VIBE_OFFICE_LOCAL_TRUSTED_HOME: localTrustedHome,
        VIBE_AGENT_ID: "agent-minimax",
        VIBE_AGENT_M9_TARGET: "minimax",
        VIBE_AGENT_API_KEY: secret,
      },
    });
    const registryRaw = await readFile(path.join(localTrustedHome, "agent-registry.local.json"), "utf8");
    const credentialRaw = await readFile(path.join(localTrustedHome, "agent-credentials.local.json"), "utf8");
    const registry = JSON.parse(registryRaw);
    const credentials = JSON.parse(credentialRaw);
    const output = `${result.stdout}\n${result.stderr}`;

    assert.equal(result.status, 0);
    assert.match(output, /m9Target=minimax/);
    assert.match(output, /m9Readiness=READY:agent-minimax/);
    assert.equal(output.includes(secret), false);
    assert.equal(registryRaw.includes(secret), false);
    assert.equal(registry["agent-minimax"].runtimeProvider, "anthropic");
    assert.equal(registry["agent-minimax"].endpoint, "https://api.minimaxi.com/anthropic");
    assert.equal(registry["agent-minimax"].model, "MiniMax-M3");
    assert.equal(credentials["agent-minimax"].apiKey, secret);
  } finally {
    await rm(localTrustedHome, { recursive: true, force: true });
  }
});

test("local agent credential updater can repair M9 metadata while preserving saved keys", async () => {
  const localTrustedHome = await mkdtemp(path.join(os.tmpdir(), "vibe-office-m9-metadata-repair-"));
  const secret = "saved-m9-provider-key";

  try {
    await writeFile(
      path.join(localTrustedHome, "agent-registry.local.json"),
      JSON.stringify(
        {
          "agent-minimax": {
            id: "agent-minimax",
            name: "MiniMax",
            endpoint: "https://api.minimaxi.com/v1",
            a2aEndpoint: "https://api.minimaxi.com/a2a",
            agentCardUrl: "https://api.minimaxi.com/.well-known/agent-card.json",
            model: "MiniMax-M3",
            runtimeProvider: "openai",
          },
        },
        null,
        2,
      ),
      "utf8",
    );
    await writeFile(
      path.join(localTrustedHome, "agent-credentials.local.json"),
      JSON.stringify({ "agent-minimax": { apiKey: secret } }, null, 2),
      "utf8",
    );

    const result = spawnSync(process.execPath, ["scripts/update-local-agent-credential.mjs"], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        VIBE_OFFICE_LOCAL_TRUSTED_HOME: localTrustedHome,
        VIBE_AGENT_ID: "agent-minimax",
        VIBE_AGENT_M9_TARGET: "minimax",
      },
    });
    const registryRaw = await readFile(path.join(localTrustedHome, "agent-registry.local.json"), "utf8");
    const credentialRaw = await readFile(path.join(localTrustedHome, "agent-credentials.local.json"), "utf8");
    const registry = JSON.parse(registryRaw);
    const credentials = JSON.parse(credentialRaw);
    const output = `${result.stdout}\n${result.stderr}`;

    assert.equal(result.status, 0);
    assert.match(output, /credential=preserved/);
    assert.match(output, /m9Readiness=READY:agent-minimax/);
    assert.equal(output.includes(secret), false);
    assert.equal(registryRaw.includes(secret), false);
    assert.equal(registry["agent-minimax"].runtimeProvider, "anthropic");
    assert.equal(registry["agent-minimax"].endpoint, "https://api.minimaxi.com/anthropic");
    assert.equal(credentials["agent-minimax"].apiKey, secret);
  } finally {
    await rm(localTrustedHome, { recursive: true, force: true });
  }
});

test("local agent credential updater cleans only stale atomic-write temp files", async () => {
  const localTrustedHome = await mkdtemp(path.join(os.tmpdir(), "vibe-office-m9-script-temp-cleanup-"));
  const secret = "script-temp-cleanup-key";
  const nowMs = Date.parse("2026-06-19T00:00:00.000Z");
  const oldRegistryTemp = path.join(localTrustedHome, "agent-registry.local.json.1.1.old.tmp");
  const freshRegistryTemp = path.join(localTrustedHome, "agent-registry.local.json.1.1.fresh.tmp");
  const oldCredentialTemp = path.join(localTrustedHome, "agent-credentials.local.json.1.1.old.tmp");
  const unrelatedTemp = path.join(localTrustedHome, "other.local.json.1.1.old.tmp");

  try {
    await writeFile(
      path.join(localTrustedHome, "agent-registry.local.json"),
      JSON.stringify(
        {
          "agent-deepseek": {
            id: "agent-deepseek",
            name: "DeepSeek",
            endpoint: "https://api.deepseek.com",
            a2aEndpoint: "https://api.deepseek.com/a2a",
            agentCardUrl: "https://api.deepseek.com/.well-known/agent-card.json",
            model: "deepseek-v4-flash",
            runtimeProvider: "openai",
          },
        },
        null,
        2,
      ),
      "utf8",
    );
    await writeFile(oldRegistryTemp, "old", "utf8");
    await writeFile(freshRegistryTemp, "fresh", "utf8");
    await writeFile(oldCredentialTemp, "old", "utf8");
    await writeFile(unrelatedTemp, "other", "utf8");
    await utimes(oldRegistryTemp, new Date(nowMs - 48 * 60 * 60 * 1000), new Date(nowMs - 48 * 60 * 60 * 1000));
    await utimes(freshRegistryTemp, new Date(nowMs - 10_000), new Date(nowMs - 10_000));
    await utimes(oldCredentialTemp, new Date(nowMs - 48 * 60 * 60 * 1000), new Date(nowMs - 48 * 60 * 60 * 1000));
    await utimes(unrelatedTemp, new Date(nowMs - 48 * 60 * 60 * 1000), new Date(nowMs - 48 * 60 * 60 * 1000));

    const result = spawnSync(process.execPath, ["scripts/update-local-agent-credential.mjs"], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        VIBE_OFFICE_LOCAL_TRUSTED_HOME: localTrustedHome,
        VIBE_AGENT_ID: "agent-deepseek",
        VIBE_AGENT_M9_TARGET: "deepseek",
        VIBE_AGENT_API_KEY: secret,
      },
    });
    const remaining = await readdir(localTrustedHome);

    assert.equal(result.status, 0);
    assert.equal(remaining.includes(path.basename(oldRegistryTemp)), false);
    assert.equal(remaining.includes(path.basename(freshRegistryTemp)), true);
    assert.equal(remaining.includes(path.basename(oldCredentialTemp)), false);
    assert.equal(remaining.includes(path.basename(unrelatedTemp)), true);
  } finally {
    await rm(localTrustedHome, { recursive: true, force: true });
  }
});
