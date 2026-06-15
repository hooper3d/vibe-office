import { applyVibeOfficeWorkerProfiles } from "@/lib/hermes-profiles";
import { getHermesProfileRuntimeStates, startHermesProfileGateway } from "@/lib/hermes-runtime";
import { assertLocalWriteRequest } from "@/lib/local-action-guard";
import { officeTemplates } from "@/lib/office-templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const template = officeTemplates.find((item) => item.id === "default-product-team") || officeTemplates[0];
    const profileNames = template.agents.map((agent) => agent.profileName);
    const profiles = await getHermesProfileRuntimeStates(profileNames);

    return Response.json(
      {
        ok: true,
        profiles
      },
      {
        headers: { "cache-control": "no-store" }
      }
    );
  } catch (error) {
    return Response.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Profile runtime status failed.",
        profiles: []
      },
      {
        status: 400,
        headers: { "cache-control": "no-store" }
      }
    );
  }
}

export async function POST(request: Request) {
  const blocked = assertLocalWriteRequest(request);
  if (blocked) return blocked;

  try {
    const body = (await request.json()) as {
      templateId?: string;
      agentNames?: Array<{ profileName: string; displayName: string }>;
      startRuntimes?: boolean;
      hermesApiKey?: string;
    };
    const result = await applyVibeOfficeWorkerProfiles(body.templateId || "default-product-team", body.agentNames || []);

    if (!result.ok || !body.startRuntimes) {
      return Response.json(result, {
        status: result.ok ? 200 : 400,
        headers: { "cache-control": "no-store" }
      });
    }

    const runtimeResults = await Promise.all(
      result.profiles
        .filter((profile) => profile.status !== "failed")
        .map((profile) => startHermesProfileGateway(profile.profileName, { apiKey: body.hermesApiKey }))
    );
    const ok = result.ok && runtimeResults.every((profile) => profile.ok);

    return Response.json({
      ...result,
      ok,
      message: ok ? "Worker profile setup and runtime startup finished." : "Worker profiles were prepared, but one or more runtimes did not start.",
      runtimes: runtimeResults
    }, {
      status: ok ? 200 : 409,
      headers: { "cache-control": "no-store" }
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Profile setup failed.",
        profiles: []
      },
      {
        status: 400,
        headers: { "cache-control": "no-store" }
      }
    );
  }
}
