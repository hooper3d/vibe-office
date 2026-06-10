import { promises as fs } from "fs";
import path from "path";
import { contextHubFiles } from "@/lib/context-hub";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WORKSPACE_ROOT = process.cwd();

function findContextFile(fileName: string | null) {
  if (!fileName) return null;
  const normalized = fileName.replace(/\\/g, "/").replace(/^ops\//, "");

  return contextHubFiles.find((file) => file.label === normalized) ?? null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const contextFile = findContextFile(searchParams.get("file"));

  if (!contextFile) {
    return Response.json(
      {
        ok: false,
        error: "Unsupported context file"
      },
      {
        status: 400,
        headers: {
          "cache-control": "no-store"
        }
      }
    );
  }

  const filePath = path.join(WORKSPACE_ROOT, contextFile.path);

  try {
    const [content, stat] = await Promise.all([fs.readFile(filePath, "utf8"), fs.stat(filePath)]);

    return Response.json(
      {
        ok: true,
        file: contextFile.label,
        path: contextFile.path,
        purpose: contextFile.purpose,
        exists: true,
        updatedAt: stat.mtime.toISOString(),
        content
      },
      {
        headers: {
          "cache-control": "no-store"
        }
      }
    );
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") throw error;

    return Response.json(
      {
        ok: true,
        file: contextFile.label,
        path: contextFile.path,
        purpose: contextFile.purpose,
        exists: false,
        updatedAt: null,
        content: ""
      },
      {
        headers: {
          "cache-control": "no-store"
        }
      }
    );
  }
}
