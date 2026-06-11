import { promises as fs } from "fs";
import path from "path";
import type { AgentName, ProjectId } from "@/types/agent";
import type { Artifact, ArtifactInput, ArtifactType } from "@/types/artifact";

const WORKSPACE_ROOT = process.cwd();
const OPS_DIR = path.join(WORKSPACE_ROOT, "ops");
const REGISTRY_FILE = path.join(OPS_DIR, "ARTIFACT_REGISTRY.json");
const HUB_FILE = path.join(OPS_DIR, "ARTIFACTS.md");

const IMAGE_EXTENSIONS = new Set([".avif", ".gif", ".jpg", ".jpeg", ".png", ".svg", ".webp"]);
const MARKDOWN_EXTENSIONS = new Set([".md", ".markdown"]);
const TEXT_PREVIEW_EXTENSIONS = new Set([".csv", ".json", ".md", ".markdown", ".txt"]);
const FILE_EXTENSIONS = new Set([
  ".csv",
  ".doc",
  ".docx",
  ".json",
  ".pdf",
  ".ppt",
  ".pptx",
  ".txt",
  ".xls",
  ".xlsx",
  ".zip"
]);
const TEXT_PREVIEW_MAX_CHARS = 12000;

function nowIso() {
  return new Date().toISOString();
}

function artifactId() {
  return `artifact_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function accessUrl(id: string) {
  return `/api/artifacts/${encodeURIComponent(id)}/content`;
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function extensionFromValue(value: string) {
  try {
    const url = new URL(value);
    return path.extname(url.pathname).toLowerCase();
  } catch {
    return path.extname(value.split(/[?#]/)[0]).toLowerCase();
  }
}

function inferType(input: { type?: ArtifactType; sourceUrl?: string; path?: string; mimeType?: string }): ArtifactType {
  if (input.type) return input.type;
  if (input.mimeType?.startsWith("image/")) return "image";
  if (input.mimeType === "text/markdown") return "markdown";

  const ext = extensionFromValue(input.sourceUrl || input.path || "");
  if (IMAGE_EXTENSIONS.has(ext)) return "image";
  if (MARKDOWN_EXTENSIONS.has(ext)) return "markdown";
  if (FILE_EXTENSIONS.has(ext)) return "file";
  return input.sourceUrl ? "url" : "file";
}

function inferMimeType(type: ArtifactType, value?: string) {
  if (type === "markdown") return "text/markdown";
  if (type === "image") {
    const ext = extensionFromValue(value || "");
    if (ext === ".svg") return "image/svg+xml";
    if (ext === ".webp") return "image/webp";
    if (ext === ".gif") return "image/gif";
    if (ext === ".avif") return "image/avif";
    if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
    return "image/png";
  }
  return undefined;
}

function titleFromInput(input: ArtifactInput) {
  if (input.title?.trim()) return input.title.trim();
  const value = input.sourceUrl || input.path || "Artifact";
  try {
    const url = new URL(value);
    const filename = decodeURIComponent(url.pathname.split("/").filter(Boolean).pop() || url.hostname);
    return filename || url.hostname;
  } catch {
    return path.basename(value) || "Artifact";
  }
}

function resolveWorkspacePath(filePath: string) {
  const resolved = path.resolve(WORKSPACE_ROOT, filePath);
  if (!resolved.startsWith(WORKSPACE_ROOT)) {
    throw new Error("Artifact path is outside the workspace.");
  }
  return resolved;
}

function isWorkspacePath(filePath: string) {
  try {
    resolveWorkspacePath(filePath);
    return true;
  } catch {
    return false;
  }
}

async function ensureRegistry() {
  await fs.mkdir(OPS_DIR, { recursive: true });
  try {
    await fs.access(REGISTRY_FILE);
  } catch {
    await fs.writeFile(REGISTRY_FILE, "[]\n", "utf8");
  }
  try {
    await fs.access(HUB_FILE);
  } catch {
    await fs.writeFile("# Artifact Requirements\n\n## Registered Artifacts\n\n", "utf8");
  }
}

async function readRegistryUnsafe(): Promise<Artifact[]> {
  await ensureRegistry();
  const content = await fs.readFile(REGISTRY_FILE, "utf8");
  if (!content.trim()) return [];
  return JSON.parse(content) as Artifact[];
}

async function writeRegistry(artifacts: Artifact[]) {
  await ensureRegistry();
  await fs.writeFile(REGISTRY_FILE, `${JSON.stringify(artifacts, null, 2)}\n`, "utf8");
}

function normalizeInput(input: ArtifactInput): Artifact {
  const type = inferType(input);
  const id = artifactId();
  const sourceUrl = input.sourceUrl?.trim();
  let artifactPath = input.path?.trim();

  if (sourceUrl && !isHttpUrl(sourceUrl)) {
    throw new Error("Artifact sourceUrl must be http or https.");
  }
  if (artifactPath && !isWorkspacePath(artifactPath)) {
    if (!sourceUrl) throw new Error("Artifact path is outside the workspace.");
    artifactPath = undefined;
  }

  return {
    id,
    type,
    title: titleFromInput(input),
    owner: input.owner,
    projectId: input.projectId,
    createdAt: nowIso(),
    sourceUrl,
    path: artifactPath,
    accessUrl: sourceUrl || artifactPath ? accessUrl(id) : undefined,
    mimeType: input.mimeType || inferMimeType(type, sourceUrl || artifactPath),
    size: input.size,
    description: input.description,
    runId: input.runId,
    messageId: input.messageId
  };
}

function markdownForArtifact(artifact: Artifact) {
  const location = artifact.sourceUrl || artifact.path || artifact.accessUrl || "";
  return [
    `\n### ${artifact.title}`,
    "",
    `- id: ${artifact.id}`,
    `- type: ${artifact.type}`,
    `- owner: ${artifact.owner}`,
    `- projectId: ${artifact.projectId}`,
    `- createdAt: ${artifact.createdAt}`,
    artifact.archivedAt ? `- archivedAt: ${artifact.archivedAt}` : "",
    artifact.mimeType ? `- mimeType: ${artifact.mimeType}` : "",
    location ? `- location: ${location}` : "",
    artifact.description ? `- description: ${artifact.description}` : ""
  ]
    .filter(Boolean)
    .join("\n");
}

export async function readArtifacts() {
  return readRegistryUnsafe();
}

export async function findArtifact(id: string) {
  const artifacts = await readRegistryUnsafe();
  return artifacts.find((artifact) => artifact.id === id) || null;
}

function isTextMimeType(value?: string) {
  if (!value) return false;
  const mimeType = value.split(";")[0].trim().toLowerCase();
  return (
    mimeType.startsWith("text/") ||
    mimeType === "application/json" ||
    mimeType === "application/ld+json" ||
    mimeType === "application/x-ndjson"
  );
}

export function isPreviewableTextArtifact(artifact: Artifact) {
  if (artifact.type === "markdown") return true;
  if (isTextMimeType(artifact.mimeType)) return true;
  return TEXT_PREVIEW_EXTENSIONS.has(extensionFromValue(artifact.sourceUrl || artifact.path || artifact.title));
}

export async function archiveArtifactInHub(id: string) {
  const artifacts = await readRegistryUnsafe();
  const index = artifacts.findIndex((artifact) => artifact.id === id);
  if (index < 0) return null;

  const current = artifacts[index];
  if (current.archivedAt) return current;

  const archived: Artifact = {
    ...current,
    archivedAt: nowIso()
  };
  const next = [...artifacts];
  next[index] = archived;

  await writeRegistry(next);
  await fs.appendFile(HUB_FILE, `\n\n## Archived Artifact ${archived.archivedAt}\n${markdownForArtifact(archived)}\n`, "utf8");

  return archived;
}

export async function registerArtifacts(inputs: ArtifactInput[]) {
  if (!inputs.length) return [];

  const existing = await readRegistryUnsafe();
  const nextArtifacts: Artifact[] = [];
  const seenLocations = new Set(existing.map((artifact) => artifact.sourceUrl || artifact.path).filter(Boolean));

  for (const input of inputs) {
    const location = input.sourceUrl || input.path;
    if (location && seenLocations.has(location)) continue;
    const artifact = normalizeInput(input);
    nextArtifacts.push(artifact);
    if (location) seenLocations.add(location);
  }

  if (!nextArtifacts.length) return [];

  await writeRegistry([...existing, ...nextArtifacts]);
  await fs.appendFile(HUB_FILE, `\n\n## Registered Artifacts ${nowIso()}\n${nextArtifacts.map(markdownForArtifact).join("\n")}\n`, "utf8");

  return nextArtifacts;
}

function parseStructuredArtifact(value: unknown, owner: AgentName, projectId: ProjectId, runId: string, messageId: string): ArtifactInput | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const sourceUrl = typeof record.url === "string" ? record.url : typeof record.sourceUrl === "string" ? record.sourceUrl : undefined;
  const artifactPath = typeof record.path === "string" ? record.path : undefined;
  if (!sourceUrl && !artifactPath) return null;

  return {
    owner,
    projectId,
    runId,
    messageId,
    sourceUrl,
    path: artifactPath,
    type: typeof record.type === "string" ? (record.type as ArtifactType) : undefined,
    title: typeof record.title === "string" ? record.title : undefined,
    mimeType: typeof record.mimeType === "string" ? record.mimeType : undefined,
    size: typeof record.size === "number" ? record.size : undefined,
    description: typeof record.description === "string" ? record.description : undefined
  };
}

function extractStructuredArtifacts(text: string, owner: AgentName, projectId: ProjectId, runId: string, messageId: string) {
  const inputs: ArtifactInput[] = [];
  const blocks = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)].map((match) => match[1]);
  const candidates = [...blocks, text];

  for (const candidate of candidates) {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start < 0 || end <= start) continue;

    try {
      const parsed = JSON.parse(candidate.slice(start, end + 1)) as unknown;
      const record = parsed as { artifacts?: unknown };
      const rawArtifacts = Array.isArray(record.artifacts) ? record.artifacts : [parsed];
      for (const rawArtifact of rawArtifacts) {
        const input = parseStructuredArtifact(rawArtifact, owner, projectId, runId, messageId);
        if (input) inputs.push(input);
      }
    } catch {
      // Plain text responses are expected; URL extraction below is the fallback.
    }
  }

  return inputs;
}

export function extractArtifactInputsFromText(input: {
  text: string;
  owner: AgentName;
  projectId: ProjectId;
  runId: string;
  messageId: string;
}) {
  const structured = extractStructuredArtifacts(input.text, input.owner, input.projectId, input.runId, input.messageId);
  const urlMatches = input.text.match(/https?:\/\/[^\s<>"')\]]+/g) || [];
  const urlInputs: ArtifactInput[] = urlMatches.map((rawUrl) => {
    const sourceUrl = rawUrl.replace(/[-.,;:!?，。；：、）)\]】]+$/, "");
    return {
      owner: input.owner,
      projectId: input.projectId,
      runId: input.runId,
      messageId: input.messageId,
      sourceUrl,
      type: inferType({ sourceUrl }),
      title: titleFromInput({ owner: input.owner, projectId: input.projectId, sourceUrl })
    } satisfies ArtifactInput;
  });

  const seen = new Set<string>();
  return [...structured, ...urlInputs].filter((artifact) => {
    const location = artifact.sourceUrl || artifact.path;
    if (!location || seen.has(location)) return false;
    seen.add(location);
    return true;
  });
}

export async function registerArtifactsFromText(input: {
  text: string;
  owner: AgentName;
  projectId: ProjectId;
  runId: string;
  messageId: string;
}) {
  const artifacts = extractArtifactInputsFromText(input);
  return registerArtifacts(artifacts);
}

export async function readArtifactContent(artifact: Artifact) {
  if (artifact.sourceUrl) {
    const response = await fetch(artifact.sourceUrl);
    if (!response.ok) throw new Error(`Artifact source returned ${response.status}`);
    const contentType = response.headers.get("content-type") || artifact.mimeType || "application/octet-stream";
    const body = await response.arrayBuffer();
    return {
      body,
      contentType,
      filename: artifact.title
    };
  }

  if (!artifact.path) throw new Error("Artifact has no readable location.");
  const filePath = resolveWorkspacePath(artifact.path);
  const body = await fs.readFile(filePath);
  return {
    body,
    contentType: artifact.mimeType || "application/octet-stream",
    filename: artifact.title
  };
}

export async function readArtifactPreview(artifact: Artifact) {
  const content = await readArtifactContent(artifact);
  if (!isTextMimeType(content.contentType) && !isPreviewableTextArtifact(artifact)) {
    throw new Error("Artifact is not previewable as text.");
  }

  const text = new TextDecoder("utf-8", { fatal: false }).decode(content.body);
  const truncated = text.length > TEXT_PREVIEW_MAX_CHARS;

  return {
    content: truncated ? text.slice(0, TEXT_PREVIEW_MAX_CHARS) : text,
    contentType: content.contentType,
    truncated
  };
}
