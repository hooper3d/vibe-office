import { defineConfig } from "vite";
import type { Plugin, ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs/promises";
import path from "node:path";

const IGNORED_DIRECTORY_NAMES = new Set([".git", "node_modules", "dist", ".next", ".vite", "coverage"]);
const MAX_LIST_ENTRIES = 300;
const MAX_READ_BYTES = 160 * 1024;
const MAX_SEARCH_BYTES = 96 * 1024;
const MAX_SEARCH_RESULTS = 80;

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
    },
  };
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

function getSafeErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Workspace file request failed.";
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  return `${Math.round(bytes / 1024)} KB`;
}
