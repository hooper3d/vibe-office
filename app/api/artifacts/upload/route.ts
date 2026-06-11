import { promises as fs } from "fs";
import path from "path";
import { registerArtifacts } from "@/lib/artifacts";
import type { ProjectId } from "@/types/agent";
import type { ArtifactInput } from "@/types/artifact";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WORKSPACE_ROOT = process.cwd();
const UPLOAD_DIR = path.join(WORKSPACE_ROOT, "ops", "ARTIFACT_UPLOADS");
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const IMAGE_EXTENSIONS: Record<string, string> = {
  "image/avif": ".avif",
  "image/gif": ".gif",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp"
};

function projectIdFromForm(value: FormDataEntryValue | null): ProjectId {
  const projectId = value?.toString().trim();
  return projectId || "demo-project";
}

function safeTitle(value: string) {
  return value.replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "pasted-image";
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return Response.json({ ok: false, error: "Image file is required" }, { status: 400 });
    }

    const mimeType = file.type.toLowerCase();
    const extension = IMAGE_EXTENSIONS[mimeType];
    if (!extension) {
      return Response.json({ ok: false, error: "Only pasted image files are supported" }, { status: 415 });
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return Response.json({ ok: false, error: "Image is larger than 8MB" }, { status: 413 });
    }

    await fs.mkdir(UPLOAD_DIR, { recursive: true });

    const now = Date.now().toString(36);
    const random = Math.random().toString(36).slice(2, 8);
    const title = safeTitle((formData.get("title")?.toString() || file.name || "pasted-image").replace(/\.[^.]+$/, ""));
    const filename = `${now}-${random}-${title}${extension}`;
    const absolutePath = path.join(UPLOAD_DIR, filename);
    const relativePath = `ops/ARTIFACT_UPLOADS/${filename}`;

    const bytes = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(absolutePath, bytes);

    const input: ArtifactInput = {
      owner: "User",
      projectId: projectIdFromForm(formData.get("projectId")),
      type: "image",
      title: formData.get("title")?.toString() || "Pasted image",
      path: relativePath,
      mimeType,
      size: file.size,
      description: "Image pasted into the Vibe Office composer."
    };
    const artifacts = await registerArtifacts([input]);

    return Response.json(
      {
        ok: true,
        artifacts
      },
      {
        headers: {
          "cache-control": "no-store"
        }
      }
    );
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Image upload failed"
      },
      {
        status: 400,
        headers: {
          "cache-control": "no-store"
        }
      }
    );
  }
}
