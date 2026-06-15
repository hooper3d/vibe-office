import { findArtifact, readArtifactContent } from "@/lib/artifacts";
import type { Artifact } from "@/types/artifact";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function contentTypeWithUtf8(contentType: string) {
  const normalized = contentType.toLowerCase();
  if (normalized.includes("charset=")) return contentType;
  if (
    normalized.startsWith("text/") ||
    normalized === "application/json" ||
    normalized === "application/ld+json" ||
    normalized === "application/x-ndjson"
  ) {
    return `${contentType}; charset=utf-8`;
  }
  return contentType;
}

function extensionFromMimeType(contentType: string) {
  const normalized = contentType.split(";")[0].trim().toLowerCase();
  if (normalized === "text/markdown") return ".md";
  if (normalized === "text/plain") return ".txt";
  if (normalized === "text/csv") return ".csv";
  if (normalized === "application/json") return ".json";
  if (normalized === "application/pdf") return ".pdf";
  if (normalized === "image/png") return ".png";
  if (normalized === "image/jpeg") return ".jpg";
  if (normalized === "image/gif") return ".gif";
  if (normalized === "image/webp") return ".webp";
  if (normalized === "image/svg+xml") return ".svg";
  return "";
}

function extensionFromLocation(value?: string) {
  if (!value) return "";
  try {
    const url = new URL(value);
    return url.pathname.match(/\.[a-z0-9]+$/i)?.[0] || "";
  } catch {
    return value.split(/[?#]/)[0].match(/\.[a-z0-9]+$/i)?.[0] || "";
  }
}

function filenameFromLocation(value?: string) {
  if (!value) return "";
  try {
    const url = new URL(value);
    return decodeURIComponent(url.pathname.split("/").filter(Boolean).pop() || "");
  } catch {
    return value.split(/[?#]/)[0].split(/[\\/]/).filter(Boolean).pop() || "";
  }
}

function downloadFilename(artifact: Artifact, fallbackFilename: string, contentType: string) {
  const locationFilename = filenameFromLocation(artifact.path || artifact.sourceUrl);
  const locationExtension = extensionFromLocation(artifact.path || artifact.sourceUrl);
  const inferredExtension = locationExtension || extensionFromMimeType(contentType);
  const base = locationFilename || fallbackFilename || artifact.title || "artifact";

  if (!inferredExtension || /\.[a-z0-9]+$/i.test(base)) return base;
  return `${base}${inferredExtension}`;
}

function contentDisposition(filename: string) {
  const fallback = filename.replace(/[^\x20-\x7e]+/g, "_").replace(/["\\]/g, "");
  return `inline; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const artifact = await findArtifact(params.id);

  if (!artifact) {
    return Response.json(
      {
        ok: false,
        error: "Artifact not found"
      },
      {
        status: 404,
        headers: {
          "cache-control": "no-store"
        }
      }
    );
  }

  try {
    const content = await readArtifactContent(artifact);
    const filename = downloadFilename(artifact, content.filename, content.contentType);

    return new Response(content.body, {
      headers: {
        "cache-control": "private, max-age=300",
        "content-disposition": contentDisposition(filename),
        "content-type": contentTypeWithUtf8(content.contentType)
      }
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Artifact content is unavailable"
      },
      {
        status: 502,
        headers: {
          "cache-control": "no-store"
        }
      }
    );
  }
}
