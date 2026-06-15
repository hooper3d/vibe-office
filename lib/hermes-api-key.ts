import { promises as fs } from "fs";
import crypto from "crypto";
import os from "os";
import path from "path";

const HERMES_ENV_FILES = [
  path.join(os.homedir(), ".hermes", ".env"),
  path.join(process.env.APPDATA || "", "hermes", ".env")
].filter(Boolean);
const PRIMARY_HERMES_ENV_FILE = HERMES_ENV_FILES[0];

function parseEnvValue(content: string, name: string) {
  const match = content.match(new RegExp(`^\\s*${name}\\s*=\\s*(.+?)\\s*$`, "m"));
  if (!match) return "";
  return match[1].trim().replace(/^["']|["']$/g, "");
}

export async function readHermesApiServerKey() {
  const processKey = process.env.HERMES_API_SERVER_KEY?.trim() || process.env.API_SERVER_KEY?.trim();
  if (processKey) return processKey;

  for (const filePath of HERMES_ENV_FILES) {
    try {
      const content = await fs.readFile(filePath, "utf8");
      const key = parseEnvValue(content, "API_SERVER_KEY");
      if (key) return key;
    } catch {
      // Missing local Hermes config is expected on first launch.
    }
  }

  return "";
}

function upsertEnvValue(content: string, name: string, value: string) {
  const line = `${name}=${value}`;
  const pattern = new RegExp(`^\\s*${name}\\s*=.*$`, "m");
  if (pattern.test(content)) return content.replace(pattern, line);
  const prefix = content.trimEnd();
  return `${prefix}${prefix ? "\n" : ""}${line}\n`;
}

async function readPrimaryHermesEnvFile() {
  try {
    return await fs.readFile(PRIMARY_HERMES_ENV_FILE, "utf8");
  } catch {
    return "";
  }
}

export async function writeHermesEnvValues(values: Record<string, string>) {
  await fs.mkdir(path.dirname(PRIMARY_HERMES_ENV_FILE), { recursive: true });
  let content = await readPrimaryHermesEnvFile();

  for (const [name, value] of Object.entries(values)) {
    if (!value.trim()) continue;
    content = upsertEnvValue(content, name, value.trim());
  }

  await fs.writeFile(PRIMARY_HERMES_ENV_FILE, content, "utf8");
}

export async function ensureHermesApiServerKey() {
  const existing = await readHermesApiServerKey();
  if (existing) return { created: false };

  await writeHermesEnvValues({
    API_SERVER_KEY: crypto.randomBytes(32).toString("hex")
  });

  return { created: true };
}
