import { readArtifacts, registerArtifacts, registerArtifactsFromText } from "@/lib/artifacts";
import type { ArtifactInput } from "@/types/artifact";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_PROJECT_ID = "office-default-project";
const LEGACY_OFFICE_PROJECT_IDS = new Set(["office-provisioning-empty", "office-provisioning-setup-your-office"]);

function artifactBelongsToProject(artifactProjectId: string, projectId?: string) {
  if (!projectId) return true;
  if (artifactProjectId === projectId) return true;
  return projectId === DEFAULT_PROJECT_ID && LEGACY_OFFICE_PROJECT_IDS.has(artifactProjectId);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const projectId = url.searchParams.get("projectId")?.trim();
  const artifacts = (await readArtifacts()).filter((artifact) => artifactBelongsToProject(artifact.projectId, projectId || undefined));

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
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as
      | { artifacts?: ArtifactInput[] }
      | {
          text?: string;
          owner?: ArtifactInput["owner"];
          projectId?: ArtifactInput["projectId"];
          runId?: string;
          messageId?: string;
        }
      | ArtifactInput;

    if (typeof (body as { text?: unknown }).text === "string") {
      const textBody = body as {
        text: string;
        owner?: ArtifactInput["owner"];
        projectId?: ArtifactInput["projectId"];
        runId?: string;
        messageId?: string;
      };
      const artifacts = await registerArtifactsFromText({
        text: textBody.text,
        owner: textBody.owner || "User",
        projectId: textBody.projectId || DEFAULT_PROJECT_ID,
        runId: textBody.runId || `manual-${Date.now().toString(36)}`,
        messageId: textBody.messageId || `message-${Date.now().toString(36)}`
      });

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
    }

    const inputs = Array.isArray((body as { artifacts?: ArtifactInput[] }).artifacts)
      ? (body as { artifacts: ArtifactInput[] }).artifacts
      : [body as ArtifactInput];
    const artifacts = await registerArtifacts(inputs);

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
        error: error instanceof Error ? error.message : "Artifact registration failed"
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
