import type { A2APart } from "../domain/a2a";
import type { ProjectArtifact } from "../domain/projectScope";
import { createTextParts, getImageFileParts } from "./artifactState";
import { getTextPartContent } from "./messageContent";

export function getArtifactParts(artifact: ProjectArtifact) {
  return artifact.contentParts ?? createTextParts(artifact.summary);
}

export function getArtifactDataContent(parts: A2APart[]) {
  return parts
    .filter((part) => part.kind === "data")
    .map((part) => JSON.stringify(part.data, null, 2))
    .join("\n\n");
}

export function getArtifactPreviewContent(artifact: ProjectArtifact) {
  const parts = getArtifactParts(artifact);
  return {
    data: getArtifactDataContent(parts),
    imageParts: getImageFileParts(parts),
    text: getTextPartContent(parts),
  };
}

export function getArtifactCopyText(artifact: ProjectArtifact) {
  const parts = getArtifactParts(artifact);
  const text = getTextPartContent(parts);
  const data = getArtifactDataContent(parts);
  const files = parts
    .flatMap((part) => (part.kind === "file" && part.file.uri ? [part.file.uri] : []))
    .join("\n");
  return [text, data, files].filter(Boolean).join("\n\n");
}

export function getDownloadableFilePart(artifact: ProjectArtifact) {
  const parts = artifact.contentParts ?? [];
  return parts.find((part): part is Extract<A2APart, { kind: "file" }> => part.kind === "file" && Boolean(part.file.uri));
}

export function getOpenableArtifactUrl(artifact: ProjectArtifact) {
  const parts = artifact.contentParts ?? [];
  const fileUri = parts.find((part) => part.kind === "file" && isOpenableUrl(part.file.uri ?? ""));
  if (fileUri?.kind === "file") return fileUri.file.uri ?? "";

  const textUrl = getTextPartContent(parts)
    .split(/\s+/)
    .find((value) => isOpenableUrl(value));
  if (textUrl) return textUrl;

  return artifact.kind === "url" && isOpenableUrl(artifact.summary) ? artifact.summary : "";
}

export function safeArtifactFileName(value: string) {
  const cleaned = value.trim().replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "-").replace(/\s+/g, " ");
  return cleaned || "artifact";
}

function isOpenableUrl(value?: string) {
  return Boolean(value && (/^https?:\/\//i.test(value) || value.startsWith("/workspace-local/media")));
}
