import { defineConfig } from "vite";
import type { Plugin, ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const IGNORED_DIRECTORY_NAMES = new Set([".git", "node_modules", "dist", ".next", ".vite", "coverage"]);
const MAX_LIST_ENTRIES = 300;
const MAX_READ_BYTES = 160 * 1024;
const MAX_SEARCH_BYTES = 96 * 1024;
const MAX_SEARCH_RESULTS = 80;
const MAX_MEDIA_BYTES = 8 * 1024 * 1024;
const WSL_MEDIA_ROOTS = ["/tmp/mmx-gen", "/tmp/vibe-office-media"];
const WINDOWS_MEDIA_ROOTS = [os.tmpdir(), path.join(os.tmpdir(), "vibe-office-m4-demo")];
const LOCAL_TRUSTED_AGENT_REGISTRY_PATH = path.join(os.homedir(), ".vibe-office", "agent-registry.local.json");

type LocalTrustedAgentRecord = {
  id: string;
  endpoint: string;
  a2aEndpoint: string;
  agentCardUrl: string;
  runtimeProvider: "hermes" | "openai" | "anthropic";
  apiKey?: string;
};

export default defineConfig({
  plugins: [react(), localWorkspaceFileLayer()],
  server: {
    proxy: {
      "/hermes-local": {
        target: "http://127.0.0.1:8642",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/hermes-local/, ""),
        configure: (proxy) => {
          proxy.on("proxyReq", (proxyReq) => {
            proxyReq.removeHeader("origin");
          });
        },
      },
      "/hermes-hooper": {
        target: "https://hooper.ink",
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/hermes-hooper/, ""),
        configure: (proxy) => {
          proxy.on("proxyReq", (proxyReq) => {
            proxyReq.removeHeader("origin");
          });
        },
      },
    },
  },
});

function localWorkspaceFileLayer(): Plugin {
  return {
    name: "vibe-office-local-workspace-file-layer",
    configureServer(server: ViteDevServer) {
      server.middlewares.use("/agent-local/agents/upsert", async (req, res) => {
        if (req.method !== "POST") return sendJson(res, 405, { error: "Use POST for local agent registry requests." });

        try {
          const body = await readJsonBody(req);
          const agent = getVerifiedTrustedAgentRecord(body.agent);
          const registry = await readLocalTrustedAgentRegistry();
          const existing = registry[agent.id];
          registry[agent.id] = {
            ...existing,
            ...agent,
            apiKey: agent.apiKey ?? existing?.apiKey,
          };
          await writeLocalTrustedAgentRegistry(registry);
          sendJson(res, 200, { ok: true });
        } catch (error) {
          sendJson(res, 400, { error: getSafeErrorMessage(error) });
        }
      });

      server.middlewares.use("/agent-local/agents/delete", async (req, res) => {
        if (req.method !== "POST") return sendJson(res, 405, { error: "Use POST for local agent registry requests." });

        try {
          const body = await readJsonBody(req);
          const agentId = String(body.agentId || "").trim();
          if (!agentId) throw new Error("Agent id is required.");
          const registry = await readLocalTrustedAgentRegistry();
          delete registry[agentId];
          await writeLocalTrustedAgentRegistry(registry);
          sendJson(res, 200, { ok: true });
        } catch (error) {
          sendJson(res, 400, { error: getSafeErrorMessage(error) });
        }
      });

      server.middlewares.use("/agent-local/request", async (req, res) => {
        if (req.method !== "POST") return sendJson(res, 405, { error: "Use POST for local provider requests." });

        try {
          const body = await readJsonBody(req);
          const providerRequest = getVerifiedProviderRequest(body);
          const trustedAgent = providerRequest.agentId ? await getLocalTrustedAgent(providerRequest.agentId) : undefined;
          if (trustedAgent) {
            assertProviderTargetBelongsToAgent(providerRequest.url, trustedAgent);
            injectLocalTrustedCredential(providerRequest.headers, trustedAgent);
          }
          const response = await fetch(providerRequest.url, {
            method: providerRequest.method,
            headers: providerRequest.headers,
            body: providerRequest.body,
          });
          const contentType = response.headers.get("content-type") || "application/json";
          const responseBody = await response.text();

          res.statusCode = response.status;
          res.setHeader("Content-Type", contentType);
          res.setHeader("Cache-Control", "no-store");
          res.end(responseBody);
        } catch (error) {
          sendJson(res, 400, { error: getSafeErrorMessage(error) });
        }
      });

      server.middlewares.use("/workspace-local/list", async (req, res) => {
        if (req.method !== "POST") return sendJson(res, 405, { error: "Use POST for workspace file requests." });

        try {
          const body = await readJsonBody(req);
          const root = await getVerifiedRoot(String(body.root || ""));
          const target = resolveInsideRoot(root, String(body.path || ""));
          const stat = await fs.stat(target);

          if (!stat.isDirectory()) {
            return sendJson(res, 400, { error: "Workspace path is not a folder." });
          }

          const entries = await fs.readdir(target, { withFileTypes: true });
          const visibleEntries = entries
            .filter((entry) => !shouldIgnore(entry.name, entry.isDirectory()))
            .slice(0, MAX_LIST_ENTRIES);
          const normalizedEntries = await Promise.all(
            visibleEntries.map(async (entry) => {
              const entryPath = path.join(target, entry.name);
              const entryStat = await fs.stat(entryPath);
              const entryType: "directory" | "file" = entry.isDirectory() ? "directory" : "file";
              return {
                name: entry.name,
                path: normalizeRelativePath(root, entryPath),
                type: entryType,
                size: entry.isDirectory() ? undefined : entryStat.size,
                updatedAt: entryStat.mtime.toISOString(),
              };
            }),
          );

          sendJson(res, 200, {
            rootName: path.basename(root),
            path: normalizeRelativePath(root, target),
            parentPath: target === root ? undefined : normalizeRelativePath(root, path.dirname(target)),
            entries: normalizedEntries.sort(sortWorkspaceEntries),
          });
        } catch (error) {
          sendJson(res, 400, { error: getSafeErrorMessage(error) });
        }
      });

      server.middlewares.use("/workspace-local/read", async (req, res) => {
        if (req.method !== "POST") return sendJson(res, 405, { error: "Use POST for workspace file requests." });

        try {
          const body = await readJsonBody(req);
          const root = await getVerifiedRoot(String(body.root || ""));
          const target = resolveInsideRoot(root, String(body.path || ""));
          const stat = await fs.stat(target);

          if (!stat.isFile()) {
            return sendJson(res, 400, { error: "Select a file to preview." });
          }

          if (stat.size > MAX_READ_BYTES) {
            return sendJson(res, 413, { error: `File is larger than ${formatBytes(MAX_READ_BYTES)}.` });
          }

          const content = await fs.readFile(target, "utf8");
          if (content.includes("\u0000")) {
            return sendJson(res, 415, { error: "Binary files cannot be previewed." });
          }

          sendJson(res, 200, {
            path: normalizeRelativePath(root, target),
            content,
            size: stat.size,
            updatedAt: stat.mtime.toISOString(),
            truncated: false,
          });
        } catch (error) {
          sendJson(res, 400, { error: getSafeErrorMessage(error) });
        }
      });

      server.middlewares.use("/workspace-local/search", async (req, res) => {
        if (req.method !== "POST") return sendJson(res, 405, { error: "Use POST for workspace file requests." });

        try {
          const body = await readJsonBody(req);
          const root = await getVerifiedRoot(String(body.root || ""));
          const query = String(body.query || "").trim();

          if (query.length < 2) {
            return sendJson(res, 400, { error: "Search query must be at least 2 characters." });
          }

          const matches = [];
          let truncated = false;

          for await (const filePath of walkTextFiles(root)) {
            if (matches.length >= MAX_SEARCH_RESULTS) {
              truncated = true;
              break;
            }

            const stat = await fs.stat(filePath);
            if (stat.size > MAX_SEARCH_BYTES) continue;

            const content = await fs.readFile(filePath, "utf8");
            if (content.includes("\u0000")) continue;

            const lines = content.split(/\r?\n/);
            for (let index = 0; index < lines.length; index += 1) {
              if (!lines[index].toLowerCase().includes(query.toLowerCase())) continue;

              matches.push({
                path: normalizeRelativePath(root, filePath),
                lineNumber: index + 1,
                preview: lines[index].trim().slice(0, 220),
              });

              if (matches.length >= MAX_SEARCH_RESULTS) {
                truncated = true;
                break;
              }
            }
          }

          sendJson(res, 200, { query, matches, truncated });
        } catch (error) {
          sendJson(res, 400, { error: getSafeErrorMessage(error) });
        }
      });

      server.middlewares.use("/workspace-local/media", async (req, res) => {
        if (req.method !== "GET") return sendJson(res, 405, { error: "Use GET for workspace media requests." });

        try {
          const requestUrl = new URL(req.url || "/", "http://vibe-office.local");
          const mediaPath = String(requestUrl.searchParams.get("path") || "").trim();
          const mimeType = getImageMimeType(mediaPath);

          if (!mediaPath || !mimeType) {
            return sendJson(res, 400, { error: "Select a supported image artifact." });
          }

          if (isWslMediaPath(mediaPath)) {
            const buffer = await readWslMediaFile(mediaPath);
            return sendBinary(res, 200, buffer, mimeType);
          }

          const target = getVerifiedLocalMediaPath(mediaPath);
          const stat = await fs.stat(target);
          if (!stat.isFile()) {
            return sendJson(res, 400, { error: "Media artifact is not a readable file." });
          }
          if (stat.size > MAX_MEDIA_BYTES) {
            return sendJson(res, 413, { error: `Media artifact is larger than ${formatBytes(MAX_MEDIA_BYTES)}.` });
          }

          const buffer = await fs.readFile(target);
          sendBinary(res, 200, buffer, mimeType);
        } catch (error) {
          sendJson(res, 400, { error: getSafeErrorMessage(error) });
        }
      });
    },
  };
}

function getVerifiedProviderRequest(body: Record<string, unknown>) {
  const url = String(body.url || "").trim();
  const method = String(body.method || "GET").trim().toUpperCase();
  const agentId = String(body.agentId || "").trim();
  const parsed = new URL(url);

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Provider requests must use http or https.");
  }

  if (!["GET", "POST"].includes(method)) {
    throw new Error("Provider request method is not supported.");
  }

  return {
    url,
    method,
    agentId,
    headers: getVerifiedProviderHeaders(body.headers),
    body: typeof body.body === "string" && method !== "GET" ? body.body : undefined,
  };
}

function getVerifiedProviderHeaders(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  const headers: Record<string, string> = {};
  for (const [rawKey, rawValue] of Object.entries(value)) {
    const key = rawKey.toLowerCase();
    if (!isForwardableProviderHeader(key)) continue;
    if (typeof rawValue !== "string") continue;
    headers[rawKey] = rawValue;
  }

  return headers;
}

function isForwardableProviderHeader(key: string) {
  return [
    "accept",
    "a2a-version",
    "authorization",
    "anthropic-version",
    "content-type",
    "x-api-key",
  ].includes(key);
}

function getVerifiedTrustedAgentRecord(value: unknown): LocalTrustedAgentRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Agent registry payload is invalid.");
  }

  const agent = value as Record<string, unknown>;
  const id = String(agent.id || "").trim();
  const endpoint = String(agent.endpoint || "").trim().replace(/\/+$/, "");
  const a2aEndpoint = String(agent.a2aEndpoint || "").trim().replace(/\/+$/, "");
  const agentCardUrl = String(agent.agentCardUrl || "").trim();
  const runtimeProvider = getVerifiedRuntimeProvider(agent.runtimeProvider);
  const apiKey = typeof agent.apiKey === "string" && agent.apiKey.trim() ? agent.apiKey.trim() : undefined;

  if (!id) throw new Error("Agent id is required.");
  assertHttpUrl(endpoint, "Agent endpoint");
  assertHttpUrl(a2aEndpoint, "Agent task endpoint");
  assertHttpUrl(agentCardUrl, "Agent capability URL");

  return {
    id,
    endpoint,
    a2aEndpoint,
    agentCardUrl,
    runtimeProvider,
    apiKey,
  };
}

function getVerifiedRuntimeProvider(value: unknown): LocalTrustedAgentRecord["runtimeProvider"] {
  if (value === "openai" || value === "anthropic") return value;
  return "hermes";
}

function assertHttpUrl(value: string, label: string) {
  const parsed = new URL(value);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`${label} must use http or https.`);
  }
}

async function getLocalTrustedAgent(agentId: string) {
  const registry = await readLocalTrustedAgentRegistry();
  const agent = registry[agentId];
  if (!agent) {
    throw new Error("Agent is not registered in the local trusted layer.");
  }
  return agent;
}

async function readLocalTrustedAgentRegistry(): Promise<Record<string, LocalTrustedAgentRecord>> {
  try {
    const raw = await fs.readFile(LOCAL_TRUSTED_AGENT_REGISTRY_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};

    return Object.fromEntries(
      Object.entries(parsed)
        .map(([id, value]) => {
          try {
            const agent = getVerifiedTrustedAgentRecord({ ...(value as object), id });
            return [agent.id, agent] as const;
          } catch {
            return null;
          }
        })
        .filter((entry): entry is readonly [string, LocalTrustedAgentRecord] => Boolean(entry)),
    );
  } catch {
    return {};
  }
}

async function writeLocalTrustedAgentRegistry(registry: Record<string, LocalTrustedAgentRecord>) {
  await fs.mkdir(path.dirname(LOCAL_TRUSTED_AGENT_REGISTRY_PATH), { recursive: true });
  await fs.writeFile(LOCAL_TRUSTED_AGENT_REGISTRY_PATH, JSON.stringify(registry, null, 2), "utf8");
}

function assertProviderTargetBelongsToAgent(url: string, agent: LocalTrustedAgentRecord) {
  const target = new URL(url);
  const allowedBases = [agent.endpoint, agent.a2aEndpoint, agent.agentCardUrl];
  if (allowedBases.some((base) => isUrlInsideBase(target, base))) return;
  throw new Error("Provider request target does not match the registered agent.");
}

function isUrlInsideBase(target: URL, base: string) {
  const parsed = new URL(base);
  const basePath = parsed.pathname.replace(/\/+$/, "");
  return (
    target.origin === parsed.origin &&
    (target.pathname === basePath || target.pathname.startsWith(`${basePath}/`))
  );
}

function injectLocalTrustedCredential(headers: Record<string, string>, agent: LocalTrustedAgentRecord) {
  if (!agent.apiKey) return;

  if (agent.runtimeProvider === "anthropic") {
    headers["x-api-key"] = agent.apiKey;
  }
  headers.Authorization = `Bearer ${agent.apiKey}`;
}

async function getVerifiedRoot(rootInput: string) {
  if (!rootInput.trim()) {
    throw new Error("Bind a real local project directory first.");
  }

  const root = path.resolve(rootInput);
  const stat = await fs.stat(root);
  if (!stat.isDirectory()) {
    throw new Error("Project directory is not a readable folder.");
  }

  return root;
}

function resolveInsideRoot(root: string, relativePath: string) {
  const target = path.resolve(root, relativePath || ".");
  const relative = path.relative(root, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Workspace access is limited to the selected project directory.");
  }
  return target;
}

function normalizeRelativePath(root: string, target: string) {
  return path.relative(root, target).replace(/\\/g, "/");
}

async function* walkTextFiles(directory: string): AsyncGenerator<string> {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (shouldIgnore(entry.name, entry.isDirectory())) continue;

    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      yield* walkTextFiles(entryPath);
    } else if (entry.isFile()) {
      yield entryPath;
    }
  }
}

function shouldIgnore(name: string, isDirectory: boolean) {
  return isDirectory && IGNORED_DIRECTORY_NAMES.has(name);
}

function sortWorkspaceEntries(
  first: { name: string; type: "directory" | "file" },
  second: { name: string; type: "directory" | "file" },
) {
  if (first.type !== second.type) return first.type === "directory" ? -1 : 1;
  return first.name.localeCompare(second.name);
}

function getVerifiedLocalMediaPath(mediaPath: string) {
  const target = path.resolve(mediaPath);
  const allowed = WINDOWS_MEDIA_ROOTS.some((root) => {
    const resolvedRoot = path.resolve(root);
    const relative = path.relative(resolvedRoot, target);
    return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
  });

  if (!allowed) {
    throw new Error("Media artifact access is limited to local generated media folders.");
  }

  return target;
}

function isWslMediaPath(mediaPath: string) {
  const normalized = mediaPath.replace(/\\/g, "/");
  return WSL_MEDIA_ROOTS.some((root) => normalized === root || normalized.startsWith(`${root}/`));
}

function readWslMediaFile(mediaPath: string) {
  return new Promise<Buffer>((resolve, reject) => {
    const child = spawn("wsl", ["cat", mediaPath], { stdio: ["ignore", "pipe", "pipe"] });
    const chunks: Buffer[] = [];
    const errorChunks: Buffer[] = [];
    let totalBytes = 0;
    let tooLarge = false;

    child.stdout.on("data", (chunk: Buffer) => {
      totalBytes += chunk.length;
      if (totalBytes > MAX_MEDIA_BYTES) {
        tooLarge = true;
        child.kill();
        return;
      }
      chunks.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      errorChunks.push(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (tooLarge) {
        reject(new Error(`Media artifact is larger than ${formatBytes(MAX_MEDIA_BYTES)}.`));
        return;
      }
      if (code !== 0) {
        reject(new Error(Buffer.concat(errorChunks).toString("utf8").trim() || "Unable to read WSL media artifact."));
        return;
      }
      resolve(Buffer.concat(chunks));
    });
  });
}

function getImageMimeType(mediaPath: string) {
  const extension = path.extname(mediaPath).toLowerCase();
  if (extension === ".png") return "image/png";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".gif") return "image/gif";
  if (extension === ".webp") return "image/webp";
  if (extension === ".avif") return "image/avif";
  if (extension === ".bmp") return "image/bmp";
  if (extension === ".svg") return "image/svg+xml";
  return "";
}

function readJsonBody(req: NodeJS.ReadableStream) {
  return new Promise<Record<string, unknown>>((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error("Invalid JSON request."));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res: { statusCode: number; setHeader: (name: string, value: string) => void; end: (body: string) => void }, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function sendBinary(
  res: { statusCode: number; setHeader: (name: string, value: string) => void; end: (body: Buffer) => void },
  status: number,
  body: Buffer,
  contentType: string,
) {
  res.statusCode = status;
  res.setHeader("Content-Type", contentType);
  res.setHeader("Cache-Control", "no-store");
  res.end(body);
}

function getSafeErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Workspace file request failed.";
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  return `${Math.round(bytes / 1024)} KB`;
}
