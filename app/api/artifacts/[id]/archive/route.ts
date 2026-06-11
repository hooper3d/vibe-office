import { archiveArtifactInHub } from "@/lib/artifacts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  try {
    const artifact = await archiveArtifactInHub(params.id);

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

    return Response.json(
      {
        ok: true,
        artifact
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
        error: error instanceof Error ? error.message : "Artifact archive failed"
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
