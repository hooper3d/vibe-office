import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

let credentialUpdateQueue = Promise.resolve();

export type LocalTrustedCredentialRecord = {
  apiKey?: string;
};

export const LOCAL_TRUSTED_DIRECTORY_MODE = 0o700;
export const LOCAL_TRUSTED_PRIVATE_FILE_MODE = 0o600;
export const LOCAL_TRUSTED_TEMP_FILE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function getLocalTrustedFilePath(fileName: string) {
  return path.join(process.env.VIBE_OFFICE_LOCAL_TRUSTED_HOME || path.join(os.homedir(), ".vibe-office"), fileName);
}

export async function readLocalTrustedCredentials(): Promise<Record<string, LocalTrustedCredentialRecord>> {
  try {
    const raw = await fs.readFile(getLocalTrustedFilePath("agent-credentials.local.json"), "utf8");
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
  const credentialPath = getLocalTrustedFilePath("agent-credentials.local.json");
  const safeCredentials = Object.fromEntries(
    Object.entries(credentials).filter((entry): entry is [string, Required<LocalTrustedCredentialRecord>] => Boolean(entry[1].apiKey)),
  );

  await writeLocalTrustedPrivateJsonFile(credentialPath, safeCredentials, "agent-credentials.local");
}

export async function writeLocalTrustedPrivateJsonFile(filePath: string, value: unknown, prefix = path.basename(filePath)) {
  const directory = path.dirname(filePath);
  const temporaryPath = path.join(
    directory,
    `${prefix}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`,
  );

  await ensureLocalTrustedPrivateDirectory(directory);
  await cleanupStaleLocalTrustedTempFiles(directory, prefix);
  await fs.writeFile(temporaryPath, JSON.stringify(value, null, 2), {
    encoding: "utf8",
    mode: LOCAL_TRUSTED_PRIVATE_FILE_MODE,
  });
  await chmodLocalTrustedPath(temporaryPath, LOCAL_TRUSTED_PRIVATE_FILE_MODE);
  await fs.rename(temporaryPath, filePath);
  await chmodLocalTrustedPath(filePath, LOCAL_TRUSTED_PRIVATE_FILE_MODE);
}

export async function cleanupStaleLocalTrustedTempFiles(
  directory: string,
  prefix: string,
  options: { maxAgeMs?: number; nowMs?: number } = {},
) {
  const maxAgeMs = options.maxAgeMs ?? LOCAL_TRUSTED_TEMP_FILE_MAX_AGE_MS;
  const nowMs = options.nowMs ?? Date.now();
  let entries: string[];

  try {
    entries = await fs.readdir(directory);
  } catch {
    return;
  }

  await Promise.all(
    entries.map(async (entry) => {
      if (!isLocalTrustedTempFile(entry, prefix)) return;

      const filePath = path.join(directory, entry);
      try {
        const stat = await fs.stat(filePath);
        if (!stat.isFile()) return;
        if (nowMs - stat.mtimeMs < maxAgeMs) return;
        await fs.rm(filePath, { force: true });
      } catch {
        // Temp-file cleanup is best effort; credential writes should not fail because cleanup did.
      }
    }),
  );
}

function isLocalTrustedTempFile(fileName: string, prefix: string) {
  return fileName.startsWith(`${prefix}.`) && fileName.endsWith(".tmp");
}

export async function ensureLocalTrustedPrivateDirectory(directory: string) {
  await fs.mkdir(directory, { recursive: true, mode: LOCAL_TRUSTED_DIRECTORY_MODE });
  await chmodLocalTrustedPath(directory, LOCAL_TRUSTED_DIRECTORY_MODE);
}

async function chmodLocalTrustedPath(targetPath: string, mode: number) {
  try {
    await fs.chmod(targetPath, mode);
  } catch {
    // chmod is best effort on some Windows filesystems; writes still stay inside the local trusted directory.
  }
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
