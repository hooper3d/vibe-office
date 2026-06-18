import fs from "node:fs/promises";
import path from "node:path";

const IGNORED_DIRECTORY_NAMES = new Set([".git", "node_modules", "dist", ".next", ".vite", "coverage"]);
const MAX_LIST_ENTRIES = 300;
const MAX_READ_BYTES = 160 * 1024;
const MAX_SEARCH_BYTES = 96 * 1024;
const MAX_SEARCH_RESULTS = 80;

export type LocalTrustedJsonResult = {
  status: number;
  body: unknown;
};

export async function listWorkspaceDirectory(rootInput: string, pathInput: string): Promise<LocalTrustedJsonResult> {
  const root = await getVerifiedRoot(rootInput);
  const target = resolveInsideRoot(root, pathInput);
  const stat = await fs.stat(target);

  if (!stat.isDirectory()) {
    return { status: 400, body: { error: "Workspace path is not a folder." } };
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

  return {
    status: 200,
    body: {
      rootName: path.basename(root),
      path: normalizeRelativePath(root, target),
      parentPath: target === root ? undefined : normalizeRelativePath(root, path.dirname(target)),
      entries: normalizedEntries.sort(sortWorkspaceEntries),
    },
  };
}

export async function readWorkspaceTextFile(rootInput: string, pathInput: string): Promise<LocalTrustedJsonResult> {
  const root = await getVerifiedRoot(rootInput);
  const target = resolveInsideRoot(root, pathInput);
  const stat = await fs.stat(target);

  if (!stat.isFile()) {
    return { status: 400, body: { error: "Select a file to preview." } };
  }

  if (stat.size > MAX_READ_BYTES) {
    return { status: 413, body: { error: `File is larger than ${formatBytes(MAX_READ_BYTES)}.` } };
  }

  const content = await fs.readFile(target, "utf8");
  if (content.includes("\u0000")) {
    return { status: 415, body: { error: "Binary files cannot be previewed." } };
  }

  return {
    status: 200,
    body: {
      path: normalizeRelativePath(root, target),
      content,
      size: stat.size,
      updatedAt: stat.mtime.toISOString(),
      truncated: false,
    },
  };
}

export async function searchWorkspaceFiles(rootInput: string, queryInput: string): Promise<LocalTrustedJsonResult> {
  const root = await getVerifiedRoot(rootInput);
  const query = queryInput.trim();

  if (query.length < 2) {
    return { status: 400, body: { error: "Search query must be at least 2 characters." } };
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

  return {
    status: 200,
    body: {
      query,
      matches,
      truncated,
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

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  return `${Math.round(bytes / 1024)} KB`;
}
