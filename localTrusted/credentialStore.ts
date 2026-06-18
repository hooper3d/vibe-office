import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const LOCAL_TRUSTED_CREDENTIAL_PATH = path.join(os.homedir(), ".vibe-office", "agent-credentials.local.json");
let credentialUpdateQueue = Promise.resolve();

export type LocalTrustedCredentialRecord = {
  apiKey?: string;
};

export async function readLocalTrustedCredentials(): Promise<Record<string, LocalTrustedCredentialRecord>> {
  try {
    const raw = await fs.readFile(LOCAL_TRUSTED_CREDENTIAL_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};

    const credentials: Record<string, LocalTrustedCredentialRecord> = {};
    Object.entries(parsed).forEach(([id, value]) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return;
      const apiKey = typeof (value as Record<string, unknown>).apiKey === "string" ? (value as Record<string, string>).apiKey.trim() : "";
      if (apiKey) credentials[id] = { apiKey };
    });
    return credentials;
  } catch {
    return {};
  }
}

export async function writeLocalTrustedCredentials(credentials: Record<string, LocalTrustedCredentialRecord>) {
  const credentialDirectory = path.dirname(LOCAL_TRUSTED_CREDENTIAL_PATH);
  const temporaryPath = path.join(
    credentialDirectory,
    `agent-credentials.local.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`,
  );
  const safeCredentials = Object.fromEntries(
    Object.entries(credentials).filter((entry): entry is [string, Required<LocalTrustedCredentialRecord>] => Boolean(entry[1].apiKey)),
  );

  await fs.mkdir(credentialDirectory, { recursive: true });
  await fs.writeFile(temporaryPath, JSON.stringify(safeCredentials, null, 2), "utf8");
  await fs.rename(temporaryPath, LOCAL_TRUSTED_CREDENTIAL_PATH);
}

export function updateLocalTrustedCredentials(
  updater: (
    credentials: Record<string, LocalTrustedCredentialRecord>,
  ) => Record<string, LocalTrustedCredentialRecord> | Promise<Record<string, LocalTrustedCredentialRecord>>,
) {
  const update = credentialUpdateQueue.then(async () => {
    const credentials = await readLocalTrustedCredentials();
    const nextCredentials = await updater({ ...credentials });
    await writeLocalTrustedCredentials(nextCredentials);
    return nextCredentials;
  });

  credentialUpdateQueue = update.then(
    () => undefined,
    () => undefined,
  );

  return update;
}
