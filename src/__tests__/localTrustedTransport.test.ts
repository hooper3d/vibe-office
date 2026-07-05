import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  createBrowserAgentHttpTransport,
  readErrorSuffix,
} from "../services/agentHttpTransport";

test("agent http transport delegates provider commands to the local trusted layer", async () => {
  const previousFetch = globalThis.fetch;
  const requestedUrls: string[] = [];
  const requestedBodies: Array<Record<string, unknown>> = [];
  const requestedHeaders: Array<Headers> = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    requestedUrls.push(String(url));
    requestedBodies.push(JSON.parse(String(init?.body || "{}")));
    requestedHeaders.push(new Headers(init?.headers));
    if (String(init?.body).includes("fail")) {
      return new Response(JSON.stringify({ error: { message: "bad key" } }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const transport = createBrowserAgentHttpTransport();
    assert.deepEqual(
      await transport.commandJson<{ ok: boolean }>(
        {
          agentId: "agent-lucy",
          command: "openai.chatCompletions",
          payload: {
            messages: [{ role: "user", content: "hi" }],
          },
        },
        {
          timeoutMs: 1000,
          timeoutMessage: "timed out",
          failurePrefix: "Provider command failed",
        },
      ),
      { ok: true },
    );
    assert.equal(requestedUrls[0], "/agent-local/command");
    assert.equal(requestedBodies[0].agentId, "agent-lucy");
    assert.equal(requestedBodies[0].command, "openai.chatCompletions");
    assert.equal("url" in requestedBodies[0], false);
    assert.equal("endpoint" in requestedBodies[0], false);
    assert.equal("apiKey" in requestedBodies[0], false);
    assert.equal(requestedHeaders[0].has("Authorization"), false);
    assert.equal(requestedHeaders[0].has("x-api-key"), false);

    await assert.rejects(
      () =>
        transport.commandJson(
          {
            agentId: "agent-lucy",
            command: "openai.chatCompletions",
            payload: {
              messages: [{ role: "user", content: "fail" }],
            },
          },
          {
            timeoutMs: 1000,
            timeoutMessage: "timed out",
            failurePrefix: "Provider failed",
            agentId: "agent-lucy",
          },
        ),
      /Provider failed: 401: bad key/,
    );
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("agent http transport preserves local trusted error details", async () => {
  const objectError = await readErrorSuffix(
    new Response(JSON.stringify({ error: { message: "API key is missing in the local trusted layer." } }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    }),
  );
  const stringError = await readErrorSuffix(
    new Response(JSON.stringify({ error: "Legacy local trusted error." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    }),
  );

  assert.equal(objectError, ": API key is missing in the local trusted layer.");
  assert.equal(stringError, ": Legacy local trusted error.");
});

test("local trusted middleware exposes command-only provider and workspace routes", async () => {
  const source = await readFile(path.join(process.cwd(), "localTrusted", "vitePlugin.ts"), "utf8");

  assert.match(source, /agent-local\/command/);
  assert.match(source, /agent-local\/registry-command/);
  assert.doesNotMatch(source, /agent-local\/agents\/upsert/);
  assert.doesNotMatch(source, /agent-local\/agents\/delete/);
  assert.doesNotMatch(source, /agent-local\/agents\/status/);
  assert.doesNotMatch(source, /agent-local\/request/);
  assert.match(source, /workspace-local\/command/);
  assert.match(source, /sendSafeError/);
  assert.doesNotMatch(source, /error:\s*getSafeErrorMessage/);
  assert.doesNotMatch(source, /workspace-local\/list/);
  assert.doesNotMatch(source, /workspace-local\/read/);
  assert.doesNotMatch(source, /workspace-local\/search/);
});

test("local trusted safe error messages redact secrets before returning to the UI", async () => {
  const { getSafeErrorMessage, redactSensitiveText } = await import("../../localTrusted/http");
  const raw =
    'Authorization: Bearer secret-token api_key=query-secret x-api-key: header-secret {"apiKey":"json-secret"} https://user:pass@example.com/path?token=url-secret';
  const redacted = redactSensitiveText(raw);

  assert.equal(redacted.includes("secret-token"), false);
  assert.equal(redacted.includes("query-secret"), false);
  assert.equal(redacted.includes("header-secret"), false);
  assert.equal(redacted.includes("json-secret"), false);
  assert.equal(redacted.includes("user:pass"), false);
  assert.equal(redacted.includes("url-secret"), false);
  assert.match(redacted, /Authorization: Bearer \[redacted\]/i);
  assert.match(getSafeErrorMessage(new Error(raw)), /\[redacted\]/);
});

test("local trusted provider forwarding redacts failed provider response bodies only", async () => {
  const { forwardProviderRequest } = await import("../../localTrusted/http");
  const originalFetch = globalThis.fetch;
  const forwardedBodies: string[] = [];
  const response = {
    statusCode: 0,
    setHeader() { },
    end(body: string) {
      forwardedBodies.push(body);
    },
  };

  try {
    globalThis.fetch = async () =>
      new Response('{"error":"Authorization: Bearer failed-secret api_key=failed-key"}', {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    await forwardProviderRequest(response, {
      body: "{}",
      headers: {},
      method: "POST",
      url: "https://provider.example/v1/chat/completions",
    });

    globalThis.fetch = async () =>
      new Response('{"content":"Bearer success-token should remain in successful model output"}', {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    await forwardProviderRequest(response, {
      body: "{}",
      headers: {},
      method: "POST",
      url: "https://provider.example/v1/chat/completions",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(forwardedBodies[0].includes("failed-secret"), false);
  assert.equal(forwardedBodies[0].includes("failed-key"), false);
  assert.match(forwardedBodies[0], /\[redacted\]/);
  assert.equal(forwardedBodies[1].includes("success-token"), true);
});
