import { createProvisioningPlan } from "@/lib/hermes-provisioner";
import type { ProvisioningMode, ProvisioningUserPath } from "@/types/provisioning";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isUserPath(value: unknown): value is ProvisioningUserPath {
  return value === "model_key_only" || value === "existing_hermes";
}

function isMode(value: unknown): value is ProvisioningMode {
  return (
    value === "dry_run" ||
    value === "local_install" ||
    value === "connect_existing" ||
    value === "create_profiles_from_existing"
  );
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      userPath?: unknown;
      mode?: unknown;
      providerId?: string;
      officeTemplateId?: string;
      hermesBaseUrl?: string;
    };
    const userPath = isUserPath(body.userPath) ? body.userPath : "model_key_only";
    const mode = isMode(body.mode) ? body.mode : "dry_run";
    const plan = createProvisioningPlan({
      userPath,
      mode,
      providerId: body.providerId,
      officeTemplateId: body.officeTemplateId,
      hermesBaseUrl: body.hermesBaseUrl
    });

    return Response.json(
      {
        ok: true,
        plan
      },
      {
        headers: { "cache-control": "no-store" }
      }
    );
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Provisioning plan failed."
      },
      {
        status: 400,
        headers: { "cache-control": "no-store" }
      }
    );
  }
}

