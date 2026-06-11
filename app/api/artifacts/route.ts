import { readArtifacts, registerArtifacts } from "@/lib/artifacts";
import type { ArtifactInput } from "@/types/artifact";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const projectId = url.searchParams.get("projectId")?.trim();
  const artifacts = (await readArtifacts()).filter((artifact) => !projectId || artifact.projectId === projectId);

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
    const body = (await request.json()) as { artifacts?: ArtifactInput[] } | ArtifactInput;
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
