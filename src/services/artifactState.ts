import type { A2APart, A2ATask } from "../domain/a2a";
import type { ConversationMessage, ProjectArtifact } from "../domain/projectScope";
import { mediaFileUrl } from "./workspaceFileClient";

export function mapA2AArtifacts(task: A2ATask, projectId: string, agentId: string): ProjectArtifact[] {
  return (task.artifacts ?? []).map((artifact, index) => {
    const text = artifact.parts.find((part) => part.kind === "text")?.text;
    const contentParts = addMediaPartsToParts(artifact.parts);
    const hasFile = contentParts.some((part) => part.kind === "file");
    return {
      id: artifact.artifactId ?? `${task.id}-artifact-${index}`,
      projectId,
      taskId: task.id,
      agentId,
      name: artifact.name ?? `Artifact ${index + 1}`,
      kind: hasFile ? "file" : text ? "text" : "json",
      summary: artifact.description ?? text ?? "Artifact returned by the agent.",
      contentParts,
      createdAt: task.status.timestamp ?? new Date().toISOString(),
    };
  });
}

export function createTextArtifact({
  projectId,
  taskId,
  agentId,
  name,
  text,
  createdAt,
}: {
  projectId: string;
  taskId: string;
  agentId: string;
  name: string;
  text: string;
  createdAt: string;
}): ProjectArtifact {
  const contentParts = createMediaAwareParts(text);
  return {
    id: crypto.randomUUID(),
    projectId,
    taskId,
    agentId,
    name,
    kind: getImageFileParts(contentParts).length > 0 ? "file" : "text",
    summary: text,
    contentParts,
    createdAt,
  };
}

export function createMediaArtifactFromText({
  projectId,
  taskId,
  agentId,
  name,
  text,
  createdAt,
}: {
  projectId: string;
  taskId: string;
  agentId: string;
  name: string;
  text: string;
  createdAt: string;
}) {
  if (extractMediaReferences(text).length === 0) return undefined;
  return createTextArtifact({ projectId, taskId, agentId, name, text, createdAt });
}

export function createBackfilledMediaArtifacts(messages: ConversationMessage[]) {
  return messages.flatMap((message) => {
    if (message.role !== "agent" || !message.agentId || !message.taskId) return [];

    const text = getPartText(message.contentParts);
    return extractMediaReferences(text).map((reference, index) => ({
      runId: message.runId,
      artifact: {
        id: `${message.id}-media-${index}`,
        projectId: message.projectId,
        taskId: message.taskId ?? message.runId ?? message.id,
        agentId: message.agentId ?? "",
        name: index === 0 ? "Generated media" : `Generated media ${index + 1}`,
        kind: "file" as const,
        summary: text,
        contentParts: createMediaAwareParts(text),
        createdAt: message.createdAt,
      },
    }));
  });
}

export function createTextParts(text: string): A2APart[] {
  return [
    {
      kind: "text",
      text,
    },
  ];
}

export function createMediaAwareParts(text: string): A2APart[] {
  return addMediaPartsToParts(createTextParts(text));
}

export function addMediaPartsToParts(parts: A2APart[]) {
  const mediaParts = parts.flatMap((part) => (part.kind === "text" ? createMediaFileParts(part.text) : []));
  if (mediaParts.length === 0) return parts;

  const existingUris = new Set(
    parts.flatMap((part) => (part.kind === "file" && part.file.uri ? [part.file.uri] : [])),
  );
  const uniqueMediaParts = mediaParts.filter((part) => part.file.uri && !existingUris.has(part.file.uri));
  return uniqueMediaParts.length > 0 ? [...parts, ...uniqueMediaParts] : parts;
}

export function getImageFileParts(parts: A2APart[]) {
  return parts.filter(
    (part) =>
      part.kind === "file" &&
      Boolean(part.file.uri) &&
      (part.file.mimeType?.startsWith("image/") || isImageUrl(part.file.uri ?? "")),
  );
}

function createMediaFileParts(text: string): Extract<A2APart, { kind: "file" }>[] {
  return extractMediaReferences(text).map((reference) => ({
    kind: "file",
    file: {
      name: reference.name,
      mimeType: reference.mimeType,
      uri: mediaFileUrl(reference.path),
    },
  }));
}

function extractMediaReferences(text: string) {
  const references: Array<{ path: string; name: string; mimeType: string }> = [];
  const seen = new Set<string>();
  const mediaLinePattern = /(?:^|\s)MEDIA:\s*([^\r\n]+)/gi;
  let match: RegExpExecArray | null;

  while ((match = mediaLinePattern.exec(text)) !== null) {
    const mediaPath = cleanMediaPath(match[1]);
    const mimeType = getImageMimeTypeFromPath(mediaPath);
    if (!mediaPath || !mimeType || seen.has(mediaPath)) continue;

    seen.add(mediaPath);
    references.push({
      path: mediaPath,
      name: getFileNameFromPath(mediaPath),
      mimeType,
    });
  }

  return references;
}

function cleanMediaPath(value: string) {
  const [pathToken = ""] = value.trim().split(/\s+/);
  return pathToken
    .trim()
    .replace(/^["'`]+|["'`,.;]+$/g, "")
    .trim();
}

function getFileNameFromPath(filePath: string) {
  return filePath.split(/[\\/]/).filter(Boolean).pop() ?? "media artifact";
}

function getImageMimeTypeFromPath(filePath: string) {
  const extension = filePath.split(/[?#]/)[0]?.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
  if (extension === "png") return "image/png";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "gif") return "image/gif";
  if (extension === "webp") return "image/webp";
  if (extension === "avif") return "image/avif";
  if (extension === "bmp") return "image/bmp";
  if (extension === "svg") return "image/svg+xml";
  return "";
}

function isImageUrl(uri: string) {
  return /\.(png|jpe?g|gif|webp|svg|bmp|avif)(\?.*)?$/i.test(uri) || uri.startsWith("data:image/");
}

function getPartText(parts: A2APart[]) {
  return parts
    .map((part) => {
      if (part.kind === "text") return part.text;
      if (part.kind === "data") return JSON.stringify(part.data, null, 2);
      return part.file.name ?? part.file.uri ?? "File";
    })
    .join("\n");
}
