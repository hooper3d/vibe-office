import { findArtifact, readArtifactPreview } from "@/lib/artifacts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    const preview = await readArtifactPreview(artifact);

    return Response.json(
      {
        ok: true,
        ...preview
      },
      {
        headers: {
          "cache-control": "private, max-age=60"
        }
      }
    );
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Artifact preview is unavailable"
      },
      {
        status: 415,
        headers: {
          "cache-control": "no-store"
        }
      }
    );
  }
}
