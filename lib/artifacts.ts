import { lookup } from "dns/promises";
import { promises as fs } from "fs";
import net from "net";
import path from "path";
import type { ProjectId } from "@/types/agent";
import type { Artifact, ArtifactInput, ArtifactOwner, ArtifactType } from "@/types/artifact";

const WORKSPACE_ROOT = process.cwd();
const OPS_DIR = path.join(WORKSPACE_ROOT, "ops");
const REGISTRY_FILE = path.join(OPS_DIR, "ARTIFACT_REGISTRY.json");
const HUB_FILE = path.join(OPS_DIR, "ARTIFACTS.md");
const INLINE_ARTIFACT_DIR = path.join(OPS_DIR, "ARTIFACT_UPLOADS");

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
const REMOTE_ARTIFACT_TIMEOUT_MS = 10_000;
const REMOTE_ARTIFACT_MAX_BYTES = 12 * 1024 * 1024;
const BLOCKED_REMOTE_HOSTNAMES = new Set(["localhost", "localhost.localdomain"]);

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

function sanitizeHttpUrl(value: string) {
  const trimmed = value.trim();
  const match = trimmed.match(/^(https?:\/\/[^/\s?#]+)([^\s?#]*)?([?#][^\s]*)?$/i);
  if (!match) return null;

  const origin = match[1];
  let pathname = match[2] || "";
  let suffix = match[3] || "";
  const cjkBoundary = pathname.search(/[\u3400-\u9fff\uff00-\uffef]/u);
  if (cjkBoundary >= 0) {
    pathname = pathname.slice(0, cjkBoundary);
    suffix = "";
  }

  const sourceUrl = `${origin}${pathname}${suffix}`.replace(/[-.,;:!?，。；：、！？）\])`]+$/u, "");
  if (!isHttpUrl(sourceUrl)) return null;
  return sourceUrl.endsWith(origin) ? `${origin}/` : sourceUrl;
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
  const relative = path.relative(WORKSPACE_ROOT, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Artifact path is outside the workspace.");
  }
  return resolved;
}

function normalizeHostname(hostname: string) {
  return hostname.trim().toLowerCase().replace(/^\[|\]$/g, "");
}

function isBlockedIpv4(address: string) {
  const parts = address.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = parts;

  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isBlockedIpv6(address: string) {
  const normalized = normalizeHostname(address);
  if (normalized === "::" || normalized === "::1") return true;

  const mappedIpv4 = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i)?.[1];
  if (mappedIpv4) return isBlockedIpv4(mappedIpv4);

  return (
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb") ||
    normalized.startsWith("ff")
  );
}

function isBlockedIpAddress(address: string) {
  const family = net.isIP(normalizeHostname(address));
  if (family === 4) return isBlockedIpv4(normalizeHostname(address));
  if (family === 6) return isBlockedIpv6(normalizeHostname(address));
  return false;
}

async function assertRemoteArtifactUrlAllowed(value: string) {
  const url = new URL(value);
  const hostname = normalizeHostname(url.hostname);
  if (BLOCKED_REMOTE_HOSTNAMES.has(hostname) || isBlockedIpAddress(hostname)) {
    throw new Error("This remote artifact address points to a local or private network and was not opened.");
  }

  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((address) => isBlockedIpAddress(address.address))) {
    throw new Error("This remote artifact address resolves to a local or private network and was not opened.");
  }
}

function isWorkspacePath(filePath: string) {
  try {
    resolveWorkspacePath(filePath);
    return true;
  } catch {
    return false;
  }
}

function toWorkspaceRelativePath(filePath: string) {
  const resolved = resolveWorkspacePath(filePath);
  return path.relative(WORKSPACE_ROOT, resolved).replace(/\\/g, "/");
}

function withRemoteLocationDescription(description: string | undefined, remoteLocation: string | undefined) {
  if (!remoteLocation) return description;
  const note = `Remote location: ${remoteLocation}. This path is not directly accessible from Vibe Office.`;
  return [description?.trim(), note].filter(Boolean).join("\n");
}

function safeFilename(value: string) {
  return value
    .trim()
    .replace(/\.[^.]+$/, "")
    .replace(/[^\p{L}\p{N}_.-]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "inline-artifact";
}

async function uniqueWorkspacePath(filePath: string) {
  const parsed = path.parse(filePath);
  const timestamp = new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
  let candidate = filePath;
  let index = 1;

  while (true) {
    try {
      await fs.access(resolveWorkspacePath(candidate));
      candidate = path.join(parsed.dir, `${parsed.name}-${timestamp}${index > 1 ? `-${index}` : ""}${parsed.ext}`).replace(/\\/g, "/");
      index += 1;
    } catch {
      return candidate;
    }
  }
}

async function materializeInlineContent(input: ArtifactInput): Promise<ArtifactInput> {
  const content = input.content?.trimEnd();
  if (!content) return input;

  const type = inferType(input);
  const extension = type === "markdown" ? ".md" : ".txt";
  const requestedPath = input.path?.trim();
  const inlineArtifactDir = toWorkspaceRelativePath(INLINE_ARTIFACT_DIR);
  const artifactPath =
    requestedPath && isWorkspacePath(requestedPath)
      ? toWorkspaceRelativePath(requestedPath)
      : `${inlineArtifactDir}/${Date.now().toString(36)}-${safeFilename(input.title || "inline-artifact")}${extension}`;
  const finalPath = await uniqueWorkspacePath(artifactPath);
  const absolutePath = resolveWorkspacePath(finalPath);

  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, `${content}\n`, "utf8");

  const stats = await fs.stat(absolutePath);
  return {
    ...input,
    sourceUrl: input.sourceUrl && isHttpUrl(input.sourceUrl) ? input.sourceUrl : undefined,
    path: finalPath,
    type,
    mimeType: input.mimeType || inferMimeType(type, finalPath) || "text/plain",
    size: stats.size,
    content: undefined
  };
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
  const seenMessageTitles = new Set(
    existing
      .filter((artifact) => artifact.messageId)
      .map((artifact) => `${artifact.messageId}::${artifact.title.toLowerCase()}`)
  );

  for (const input of inputs) {
    const materializedInput = await materializeInlineContent(input);
    const title = titleFromInput(materializedInput);
    const messageTitleKey = materializedInput.messageId ? `${materializedInput.messageId}::${title.toLowerCase()}` : "";
    const location = materializedInput.sourceUrl || materializedInput.path;
    if (location && seenLocations.has(location)) continue;
    if (messageTitleKey && seenMessageTitles.has(messageTitleKey)) continue;
    let artifact: Artifact;
    try {
      artifact = normalizeInput(materializedInput);
    } catch {
      continue;
    }
    nextArtifacts.push(artifact);
    if (location) seenLocations.add(location);
    if (messageTitleKey) seenMessageTitles.add(messageTitleKey);
  }

  if (!nextArtifacts.length) return [];

  await writeRegistry([...existing, ...nextArtifacts]);
  await fs.appendFile(HUB_FILE, `\n\n## Registered Artifacts ${nowIso()}\n${nextArtifacts.map(markdownForArtifact).join("\n")}\n`, "utf8");

  return nextArtifacts;
}

function parseStructuredArtifact(value: unknown, owner: ArtifactOwner, projectId: ProjectId, runId: string, messageId: string): ArtifactInput | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const rawUrl = typeof record.url === "string" ? record.url : typeof record.sourceUrl === "string" ? record.sourceUrl : undefined;
  const rawPath = typeof record.path === "string" ? record.path : undefined;
  const content = typeof record.content === "string" ? record.content : undefined;
  const sourceUrl = rawUrl && isHttpUrl(rawUrl) ? rawUrl : undefined;
  const artifactPath = rawPath && isWorkspacePath(rawPath) ? rawPath : undefined;
  const remoteLocation = !sourceUrl && rawUrl ? rawUrl : !artifactPath && rawPath ? rawPath : undefined;
  const hasStructuredArtifactShape = Boolean(
    record.type || record.title || record.mimeType || record.description || rawUrl || rawPath || content
  );
  if (!sourceUrl && !artifactPath && !content && !hasStructuredArtifactShape) return null;

  return {
    owner,
    projectId,
    runId,
    messageId,
    sourceUrl,
    path: artifactPath,
    content,
    type: typeof record.type === "string" ? (record.type as ArtifactType) : undefined,
    title: typeof record.title === "string" ? record.title : undefined,
    mimeType: typeof record.mimeType === "string" ? record.mimeType : undefined,
    size: typeof record.size === "number" ? record.size : undefined,
    description: withRemoteLocationDescription(
      typeof record.description === "string" ? record.description : undefined,
      remoteLocation
    )
  };
}

function extractStructuredArtifacts(text: string, owner: ArtifactOwner, projectId: ProjectId, runId: string, messageId: string) {
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

function extractInlineContentArtifacts(
  text: string,
  owner: ArtifactOwner,
  projectId: ProjectId,
  runId: string,
  messageId: string
): ArtifactInput[] {
  const pathMatch =
    text.match(/Save this as a Vibe Office project file\s*(?:->|:)?\s*([^\s,.;]+?\.(?:md|markdown|txt|json|csv))/i) ||
    text.match(/Vibe Office project file\s*(?:->|:)?\s*([^\s,.;]+?\.(?:md|markdown|txt|json|csv))/i) ||
    text.match(/需要平台保存为项目文件\s*(?:->|→|:|：)?\s*([^\s，。；;]+?\.(?:md|markdown|txt|json|csv))/i);
  const bodyMatch =
    text.match(/Content\s*:\s*([\s\S]*?)\n\s*End of file[.]?/i) ||
    text.match(/正文如下\s*[:：]\s*([\s\S]*?)\n\s*正文结束[。.]?/);
  if (!pathMatch || !bodyMatch) return [];

  const requestedPath = pathMatch[1].replace(/^[`"'“”*]+|[`"'“”，。*]+$/g, "");
  const artifactPath =
    requestedPath.includes("/") || requestedPath.includes("\\")
      ? requestedPath
      : `${toWorkspaceRelativePath(INLINE_ARTIFACT_DIR)}/${safeFilename(requestedPath)}${path.extname(requestedPath) || ".md"}`;
  if (!isWorkspacePath(artifactPath)) return [];

  const content = bodyMatch[1].trim();
  if (!content) return [];

  const type = inferType({ path: artifactPath });
  return [
    {
      owner,
      projectId,
      runId,
      messageId,
      path: toWorkspaceRelativePath(artifactPath),
      content,
      type,
      title: path.basename(artifactPath),
      mimeType: inferMimeType(type, artifactPath) || (type === "markdown" ? "text/markdown" : "text/plain"),
      description: "Saved from inline agent response."
    } satisfies ArtifactInput
  ];
}

function titleFromMentionedFile(value: string) {
  return value
    .trim()
    .replace(/^[`"'\u201c\u201d\u2018\u2019]+|[`"'\u201c\u201d\u2018\u2019,.;:!?，。；：！？）\])]+$/gu, "")
    .split(/[\\/]/)
    .filter(Boolean)
    .pop();
}

function extractMentionedFileArtifact(
  text: string,
  owner: ArtifactOwner,
  projectId: ProjectId,
  runId: string,
  messageId: string
): ArtifactInput[] {
  const hasDeliveryLanguage =
    /(desktop|saved|written|created|document|markdown|file|download|artifact)/i.test(text) ||
    /[\u5199\u4fdd\u5b58\u6587\u4ef6\u6587\u6863\u684c\u9762\u4e0b\u8f7d\u751f\u6210]/u.test(text) ||
    /(鍐欏ソ|淇濆瓨|鏂囦欢|鏂囨。|妗岄潰|鐢熸垚|涓嬭浇)/.test(text);
  if (!hasDeliveryLanguage) return [];

  const filenameMatches = Array.from(
    text.matchAll(/(?:^|[\s:：,，`"'（(])([^\s`"'<>|:：,，。；;]+?\.(?:md|markdown|txt|json|csv))(?:$|[\s`"',.;:!?，。；：！？）)\]])/gi)
  );
  const filename = filenameMatches.length ? titleFromMentionedFile(filenameMatches[filenameMatches.length - 1][1]) : null;
  if (!filename) return [];

  const type = inferType({ path: filename });
  const content = [
    `# ${filename}`,
    "",
    "Vibe Office captured this fallback artifact because the agent mentioned a delivered file but did not provide a structured artifact envelope.",
    "",
    "## Original agent reply",
    "",
    text.trim()
  ].join("\n");

  return [
    {
      owner,
      projectId,
      runId,
      messageId,
      content,
      type,
      title: filename,
      mimeType: inferMimeType(type, filename) || (type === "markdown" ? "text/markdown" : "text/plain"),
      description: "Fallback capture from an agent file-delivery message."
    } satisfies ArtifactInput
  ];
}

export function extractArtifactInputsFromText(input: {
  text: string;
  owner: ArtifactOwner;
  projectId: ProjectId;
  runId: string;
  messageId: string;
}) {
  const structured = extractStructuredArtifacts(input.text, input.owner, input.projectId, input.runId, input.messageId);
  const inlineContent = extractInlineContentArtifacts(input.text, input.owner, input.projectId, input.runId, input.messageId);
  const mentionedFile = extractMentionedFileArtifact(input.text, input.owner, input.projectId, input.runId, input.messageId);
  const explicitArtifacts = [...structured, ...inlineContent, ...mentionedFile];

  if (explicitArtifacts.length) {
    const seen = new Set<string>();
    return explicitArtifacts.filter((artifact, index) => {
      const location = artifact.sourceUrl || artifact.path || artifact.title || `inline:${index}`;
      if (seen.has(location)) return false;
      seen.add(location);
      return true;
    });
  }

  const urlMatches = input.text.match(/https?:\/\/[^\s<>"')\]]+/g) || [];
  const urlInputs: ArtifactInput[] = urlMatches.flatMap((rawUrl) => {
    const sourceUrl = sanitizeHttpUrl(rawUrl);
    if (!sourceUrl) return [];
    return [
      {
        owner: input.owner,
        projectId: input.projectId,
        runId: input.runId,
        messageId: input.messageId,
        sourceUrl,
        type: inferType({ sourceUrl }),
        title: titleFromInput({ owner: input.owner, projectId: input.projectId, sourceUrl })
      } satisfies ArtifactInput
    ];
  });

  const seen = new Set<string>();
  return urlInputs.filter((artifact) => {
    const location = artifact.sourceUrl || artifact.path;
    if (!location || seen.has(location)) return false;
    seen.add(location);
    return true;
  });
}

export async function registerArtifactsFromText(input: {
  text: string;
  owner: ArtifactOwner;
  projectId: ProjectId;
  runId: string;
  messageId: string;
}) {
  const artifacts = extractArtifactInputsFromText(input);
  return registerArtifacts(artifacts);
}

function remoteArtifactTooLargeMessage() {
  return `Artifact source is larger than ${Math.round(REMOTE_ARTIFACT_MAX_BYTES / 1024 / 1024)}MB.`;
}

async function readRemoteArtifactBody(response: Response) {
  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > REMOTE_ARTIFACT_MAX_BYTES) {
    throw new Error(remoteArtifactTooLargeMessage());
  }

  if (!response.body) {
    const body = await response.arrayBuffer();
    if (body.byteLength > REMOTE_ARTIFACT_MAX_BYTES) {
      throw new Error(remoteArtifactTooLargeMessage());
    }
    return body;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;

    received += value.byteLength;
    if (received > REMOTE_ARTIFACT_MAX_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new Error(remoteArtifactTooLargeMessage());
    }
    chunks.push(value);
  }

  const body = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body.buffer;
}

export async function readArtifactContent(artifact: Artifact) {
  if (artifact.sourceUrl) {
    await assertRemoteArtifactUrlAllowed(artifact.sourceUrl);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REMOTE_ARTIFACT_TIMEOUT_MS);

    try {
      const response = await fetch(artifact.sourceUrl, { signal: controller.signal });
      if (!response.ok) throw new Error(`Artifact source returned ${response.status}`);
      const contentType = response.headers.get("content-type") || artifact.mimeType || "application/octet-stream";
      const body = await readRemoteArtifactBody(response);
      return {
        body,
        contentType,
        filename: artifact.title
      };
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error("Artifact source timed out.");
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
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
