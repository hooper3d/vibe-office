import { findArtifact, readArtifactContent } from "@/lib/artifacts";

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
    const content = await readArtifactContent(artifact);

    return new Response(content.body, {
      headers: {
        "cache-control": "private, max-age=300",
        "content-disposition": `inline; filename="${encodeURIComponent(content.filename)}"`,
        "content-type": content.contentType
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
