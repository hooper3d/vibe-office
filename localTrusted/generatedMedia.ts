import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const MAX_MEDIA_BYTES = 8 * 1024 * 1024;
const WSL_MEDIA_ROOTS = ["/tmp/mmx-gen", "/tmp/vibe-office-media"];
const WINDOWS_MEDIA_ROOTS = [os.tmpdir(), path.join(os.tmpdir(), "vibe-office-m4-demo")];

export type LocalTrustedMediaResult =
  | {
      kind: "json";
      status: number;
      body: unknown;
    }
  | {
      kind: "binary";
      status: number;
      body: Buffer;
      contentType: string;
    };

export async function readGeneratedMedia(requestUrl: string): Promise<LocalTrustedMediaResult> {
  const parsedRequestUrl = new URL(requestUrl || "/", "http://vibe-office.local");
  const mediaPath = String(parsedRequestUrl.searchParams.get("path") || "").trim();
  const mimeType = getImageMimeType(mediaPath);

  if (!mediaPath || !mimeType) {
    return { kind: "json", status: 400, body: { error: "Select a supported image artifact." } };
  }

  if (isWslMediaPath(mediaPath)) {
    const buffer = await readWslMediaFile(mediaPath);
    return { kind: "binary", status: 200, body: buffer, contentType: mimeType };
  }

  const target = getVerifiedLocalMediaPath(mediaPath);
  const stat = await fs.stat(target);
  if (!stat.isFile()) {
    return { kind: "json", status: 400, body: { error: "Media artifact is not a readable file." } };
  }
  if (stat.size > MAX_MEDIA_BYTES) {
    return { kind: "json", status: 413, body: { error: `Media artifact is larger than ${formatBytes(MAX_MEDIA_BYTES)}.` } };
  }

  const buffer = await fs.readFile(target);
  return { kind: "binary", status: 200, body: buffer, contentType: mimeType };
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

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  return `${Math.round(bytes / 1024)} KB`;
}
