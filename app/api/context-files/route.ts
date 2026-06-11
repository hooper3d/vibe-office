import { promises as fs } from "fs";
import path from "path";
import { contextHubFiles } from "@/lib/context-hub";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WORKSPACE_ROOT = process.cwd();

const lastEditorByFile: Record<string, string> = {
  "PROJECT_BRIEF.md": "User",
  "PROGRESS_SUMMARY.md": "Ray",
  "DEV_LOG.md": "Ray",
  "HANDOFF.md": "Ray",
  "DECISIONS.md": "User/Lucy",
  "RELEASE_NOTES.md": "Tiger",
  "BLOG_CONTEXT.md": "Tiger",
  "ARTIFACTS.md": "Ray"
};

export async function GET() {
  const files = await Promise.all(
    contextHubFiles
      .filter((file) => file.label in lastEditorByFile)
      .map(async (file) => {
        const filePath = path.join(WORKSPACE_ROOT, file.path);

        try {
          const stat = await fs.stat(filePath);
          return {
            file: file.label,
            path: file.path,
            purpose: file.purpose,
            exists: true,
            updatedAt: stat.mtime.toISOString(),
            lastEditor: lastEditorByFile[file.label] ?? "Unknown"
          };
        } catch (error) {
          const code = (error as NodeJS.ErrnoException).code;
          if (code !== "ENOENT") throw error;

          return {
            file: file.label,
            path: file.path,
            purpose: file.purpose,
            exists: false,
            updatedAt: null,
            lastEditor: lastEditorByFile[file.label] ?? "Unknown"
          };
        }
      })
  );

  return Response.json(
    {
      ok: true,
      files
    },
    {
      headers: {
        "cache-control": "no-store"
      }
    }
  );
}
