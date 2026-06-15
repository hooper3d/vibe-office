import fs from "fs";
import { promises as fsp } from "fs";
import { execFile, spawn } from "child_process";
import os from "os";
import path from "path";
import { promisify } from "util";
import { ensureHermesApiServerKey, readHermesApiServerKey, writeHermesEnvValues } from "@/lib/hermes-api-key";

const execFileAsync = promisify(execFile);
const WORKSPACE_ROOT = process.cwd();
const LOGS_DIR = path.join(WORKSPACE_ROOT, "logs");
const HERMES_GATEWAY_OUT_LOG = path.join(LOGS_DIR, "hermes-gateway.out.log");
const HERMES_GATEWAY_ERR_LOG = path.join(LOGS_DIR, "hermes-gateway.err.log");
const DEFAULT_PROFILE_PORTS: Record<string, number> = {
  "vibe-engineer": 8650,
  "vibe-content": 8651,
  "vibe-tools": 8652
};

export type HermesCommandResolution = {
  installed: boolean;
  command?: string;
  source?: "env" | "windows-localappdata" | "path" | "wsl";
  runner?: "native" | "wsl";
};

export type HermesProfileGatewayStatus = "running" | "stopped" | "unknown";

export type HermesProfileGateway = {
  profileName: string;
  status: HermesProfileGatewayStatus;
  current: boolean;
};

export type HermesProfileRuntimeState = {
  profileName: string;
  gatewayStatus: HermesProfileGatewayStatus;
  current: boolean;
  port?: number;
  baseUrl?: string;
  chatAvailable: boolean;
  message: string;
};

export type HermesProfileStartResult = HermesProfileRuntimeState & {
  ok: boolean;
  started: boolean;
};

async function fileExists(filePath: string) {
  try {
    const stats = await fsp.stat(filePath);
    return stats.isFile();
  } catch {
    return false;
  }
}

function windowsHermesCandidates() {
  const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
  return [
    path.join(localAppData, "hermes", "hermes-agent", "venv", "Scripts", "hermes.exe"),
    path.join(localAppData, "hermes", "bin", "hermes.cmd")
  ];
}

async function resolveFromPath(): Promise<string> {
  try {
    if (process.platform === "win32") {
      const { stdout } = await execFileAsync("where.exe", ["hermes"], { timeout: 1200, windowsHide: true });
      return stdout.split(/\r?\n/).map((line) => line.trim()).find(Boolean) || "";
    }

    const { stdout } = await execFileAsync("sh", ["-lc", "command -v hermes"], { timeout: 1200 });
    return stdout.trim().split(/\r?\n/)[0] || "";
  } catch {
    return "";
  }
}

async function resolveFromWsl(): Promise<string> {
  if (process.platform !== "win32") return "";
  try {
    const { stdout } = await execFileAsync("wsl.exe", ["-e", "sh", "-lc", "command -v hermes"], {
      timeout: 1600,
      windowsHide: true
    });
    return stdout.trim().split(/\r?\n/)[0] || "";
  } catch {
    return "";
  }
}

export async function resolveHermesCommand(): Promise<HermesCommandResolution> {
  const envCommand = process.env.HERMES_BIN?.trim();
  if (envCommand) {
    return { installed: true, command: envCommand, source: "env", runner: "native" };
  }

  if (process.platform === "win32") {
    for (const candidate of windowsHermesCandidates()) {
      if (await fileExists(candidate)) {
        return { installed: true, command: candidate, source: "windows-localappdata", runner: "native" };
      }
    }
  }

  const pathCommand = await resolveFromPath();
  if (pathCommand) {
    return { installed: true, command: pathCommand, source: "path", runner: "native" };
  }

  const wslCommand = await resolveFromWsl();
  if (wslCommand) {
    return { installed: true, command: wslCommand, source: "wsl", runner: "wsl" };
  }

  return { installed: false };
}

function quoteCmdArg(value: string) {
  return `"${value.replace(/"/g, '\\"')}"`;
}

function gatewaySpawnCommand(command: string) {
  if (process.platform === "win32" && /\.(cmd|bat)$/i.test(command)) {
    return {
      command: process.env.ComSpec || "cmd.exe",
      args: ["/d", "/s", "/c", `${quoteCmdArg(command)} gateway`]
    };
  }

  return { command, args: ["gateway"] };
}

export function hermesExecTarget(resolution: HermesCommandResolution, args: string[]) {
  if (resolution.runner === "wsl") {
    const command = resolution.command || "hermes";
    return {
      command: "wsl.exe",
      args: ["-e", command, ...args],
      cwd: os.homedir()
    };
  }

  return {
    command: resolution.command || "hermes",
    args,
    cwd: os.homedir()
  };
}

function normalizeProfileEnvKey(profileName: string) {
  return profileName.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_");
}

function assertSafeProfileName(profileName: string) {
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(profileName)) {
    throw new Error(`Unsafe Hermes profile name: ${profileName}`);
  }
}

function normalizeOptionalUrl(value?: string) {
  return value?.trim().replace(/\/+$/, "");
}

export function readHermesProfileBaseUrl(profileName: string) {
  const profileKey = normalizeProfileEnvKey(profileName);
  const direct =
    process.env[`VIBE_OFFICE_HERMES_PROFILE_${profileKey}_BASE_URL`] ||
    process.env[`VIBE_OFFICE_HERMES_${profileKey}_BASE_URL`];

  if (direct?.trim()) return normalizeOptionalUrl(direct);

  const rawMap = process.env.VIBE_OFFICE_HERMES_PROFILE_BASE_URLS?.trim();
  if (!rawMap) return "";

  try {
    const parsed = JSON.parse(rawMap) as Record<string, unknown>;
    const mapped = parsed[profileName] || parsed[profileKey] || parsed[profileName.toLowerCase()];
    return typeof mapped === "string" ? normalizeOptionalUrl(mapped) || "" : "";
  } catch {
    return "";
  }
}

function defaultPortForProfile(profileName: string) {
  return DEFAULT_PROFILE_PORTS[profileName];
}

export function defaultHermesProfileBaseUrl(profileName: string) {
  const port = defaultPortForProfile(profileName);
  return port ? `http://127.0.0.1:${port}/v1` : "";
}

function parseEnvValue(content: string, name: string) {
  const match = content.match(new RegExp(`^\\s*${name}\\s*=\\s*(.+?)\\s*$`, "m"));
  if (!match) return "";
  return match[1].trim().replace(/^["']|["']$/g, "");
}

function upsertEnvValue(content: string, name: string, value: string) {
  const line = `${name}=${value}`;
  const pattern = new RegExp(`^\\s*${name}\\s*=.*$`, "m");
  if (pattern.test(content)) return content.replace(pattern, line);
  const prefix = content.trimEnd();
  return `${prefix}${prefix ? "\n" : ""}${line}\n`;
}

async function readWslTextFile(targetPath: string) {
  try {
    const { stdout } = await execFileAsync("wsl.exe", ["-e", "sh", "-lc", `cat "${targetPath}"`], {
      timeout: 3000,
      windowsHide: true
    });
    return stdout;
  } catch {
    return "";
  }
}

async function writeWslTextFile(targetPath: string, content: string) {
  const encoded = Buffer.from(content, "utf8").toString("base64");
  await execFileAsync(
    "wsl.exe",
    ["-e", "sh", "-lc", `mkdir -p "$(dirname "${targetPath}")" && printf '%s' '${encoded}' | base64 -d > "${targetPath}"`],
    {
      timeout: 5000,
      windowsHide: true
    }
  );
}

async function readNativeProfileEnv(profileName: string) {
  try {
    return await fsp.readFile(path.join(os.homedir(), ".hermes", "profiles", profileName, ".env"), "utf8");
  } catch {
    return "";
  }
}

async function writeNativeProfileEnv(profileName: string, content: string) {
  const filePath = path.join(os.homedir(), ".hermes", "profiles", profileName, ".env");
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  await fsp.writeFile(filePath, content, "utf8");
}

async function readProfileEnv(resolution: HermesCommandResolution, profileName: string) {
  assertSafeProfileName(profileName);
  if (resolution.runner === "wsl") {
    return readWslTextFile(`$HOME/.hermes/profiles/${profileName}/.env`);
  }
  return readNativeProfileEnv(profileName);
}

async function writeProfileEnv(resolution: HermesCommandResolution, profileName: string, content: string) {
  assertSafeProfileName(profileName);
  if (resolution.runner === "wsl") {
    await writeWslTextFile(`$HOME/.hermes/profiles/${profileName}/.env`, content);
    return;
  }
  await writeNativeProfileEnv(profileName, content);
}

export async function readHermesProfileApiServerKey(profileName: string) {
  const resolution = await resolveHermesCommand();
  if (!resolution.installed || !resolution.command) return "";
  const content = await readProfileEnv(resolution, profileName);
  return parseEnvValue(content, "API_SERVER_KEY");
}

async function ensureHermesProfileApiServerEnv(
  resolution: HermesCommandResolution,
  profileName: string,
  values: {
    apiKey: string;
    port: number;
  }
) {
  let content = await readProfileEnv(resolution, profileName);
  content = upsertEnvValue(content, "API_SERVER_ENABLED", "true");
  content = upsertEnvValue(content, "API_SERVER_HOST", "127.0.0.1");
  content = upsertEnvValue(content, "API_SERVER_PORT", String(values.port));
  content = upsertEnvValue(content, "API_SERVER_KEY", values.apiKey);
  content = upsertEnvValue(content, "API_SERVER_MODEL_NAME", profileName);
  await writeProfileEnv(resolution, profileName, content);
}

function parseHermesGatewayList(output: string): HermesProfileGateway[] {
  const profiles: HermesProfileGateway[] = [];

  output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .forEach((line) => {
      const match = line.match(/^([\u2713\u2717])\s+([^\s]+)(?:\s+\(current\))?/u);
      if (!match) return;
      profiles.push({
        profileName: match[2],
        status: match[1] === "\u2713" ? "running" : "stopped",
        current: line.includes("(current)")
      });
    });

  return profiles;
}

export async function listHermesProfileGateways(): Promise<HermesProfileGateway[]> {
  const resolution = await resolveHermesCommand();
  if (!resolution.installed || !resolution.command) return [];

  const target = hermesExecTarget(resolution, ["gateway", "list"]);
  const { stdout } = await execFileAsync(target.command, target.args, {
    cwd: target.cwd,
    timeout: 10000,
    windowsHide: true
  });

  return parseHermesGatewayList(stdout);
}

function hermesProfileRuntimeStateFromGateways(profileName: string, gateways: HermesProfileGateway[]): HermesProfileRuntimeState {
  const normalizedProfileName = profileName.trim() || "default";
  const isChief = normalizedProfileName === "default";
  const gateway = gateways.find((item) => item.profileName === normalizedProfileName);
  const gatewayStatus = gateway?.status || "unknown";

  if (isChief) {
    return {
      profileName: normalizedProfileName,
      gatewayStatus,
      current: Boolean(gateway?.current),
      chatAvailable: gatewayStatus !== "stopped",
      message:
        gatewayStatus === "stopped"
          ? "The default Hermes gateway is not running."
          : "The default Hermes gateway is available."
    };
  }

  const baseUrl = readHermesProfileBaseUrl(normalizedProfileName);
  const defaultBaseUrl = defaultHermesProfileBaseUrl(normalizedProfileName);
  const resolvedBaseUrl = baseUrl || defaultBaseUrl;
  const port = defaultPortForProfile(normalizedProfileName);
  if (!resolvedBaseUrl) {
    return {
      profileName: normalizedProfileName,
      gatewayStatus,
      current: Boolean(gateway?.current),
      chatAvailable: false,
      message: `Profile ${normalizedProfileName} has no dedicated Hermes API base URL configured.`
    };
  }

  if (gatewayStatus !== "running") {
    return {
      profileName: normalizedProfileName,
      gatewayStatus,
      current: Boolean(gateway?.current),
      port,
      baseUrl: resolvedBaseUrl,
      chatAvailable: false,
      message: `Profile ${normalizedProfileName} gateway is not running.`
    };
  }

  return {
    profileName: normalizedProfileName,
    gatewayStatus,
    current: Boolean(gateway?.current),
    port,
    baseUrl: resolvedBaseUrl,
    chatAvailable: true,
    message: `Profile ${normalizedProfileName} gateway is available.`
  };
}

export async function getHermesProfileRuntimeState(profileName: string): Promise<HermesProfileRuntimeState> {
  let gateways: HermesProfileGateway[] = [];

  try {
    gateways = await listHermesProfileGateways();
  } catch {
    gateways = [];
  }

  return hermesProfileRuntimeStateFromGateways(profileName, gateways);
}

export async function getHermesProfileRuntimeStates(profileNames: string[]): Promise<HermesProfileRuntimeState[]> {
  let gateways: HermesProfileGateway[] = [];

  try {
    gateways = await listHermesProfileGateways();
  } catch {
    gateways = [];
  }

  return profileNames.map((profileName) => hermesProfileRuntimeStateFromGateways(profileName, gateways));
}

async function waitForHermesProfileApi(baseUrl: string, apiKey: string) {
  const modelsUrl = `${baseUrl.replace(/\/+$/, "")}/models`;
  const deadline = Date.now() + 12000;
  let lastMessage = "Profile gateway did not answer before timeout.";

  while (Date.now() < deadline) {
    try {
      const response = await fetch(modelsUrl, {
        headers: {
          authorization: `Bearer ${apiKey}`
        },
        cache: "no-store"
      });
      if (response.ok) return { ok: true, message: "Profile API server is reachable." };
      lastMessage = `Profile API server returned ${response.status}.`;
    } catch (error) {
      lastMessage = error instanceof Error ? error.message : "Profile API server is not reachable yet.";
    }

    await new Promise((resolve) => setTimeout(resolve, 800));
  }

  return { ok: false, message: lastMessage };
}

export async function startHermesProfileGateway(profileName: string, options: { apiKey?: string; port?: number } = {}): Promise<HermesProfileStartResult> {
  const normalizedProfileName = profileName.trim();
  assertSafeProfileName(normalizedProfileName);

  if (normalizedProfileName === "default") {
    const state = await getHermesProfileRuntimeState(normalizedProfileName);
    return { ...state, ok: state.chatAvailable, started: false };
  }

  const resolution = await resolveHermesCommand();
  if (!resolution.installed || !resolution.command) {
    return {
      profileName: normalizedProfileName,
      gatewayStatus: "unknown",
      current: false,
      chatAvailable: false,
      ok: false,
      started: false,
      message: "Hermes command was not found on this computer."
    };
  }

  const port = options.port || defaultPortForProfile(normalizedProfileName);
  if (!port) {
    return {
      profileName: normalizedProfileName,
      gatewayStatus: "unknown",
      current: false,
      chatAvailable: false,
      ok: false,
      started: false,
      message: `No default API port is registered for profile ${normalizedProfileName}.`
    };
  }

  const apiKey = options.apiKey?.trim() || (await readHermesProfileApiServerKey(normalizedProfileName)) || (await readHermesApiServerKey());
  if (!apiKey) {
    return {
      profileName: normalizedProfileName,
      gatewayStatus: "unknown",
      current: false,
      port,
      baseUrl: `http://127.0.0.1:${port}/v1`,
      chatAvailable: false,
      ok: false,
      started: false,
      message: "Hermes API server key is missing."
    };
  }

  await ensureHermesProfileApiServerEnv(resolution, normalizedProfileName, { apiKey, port });
  const before = await getHermesProfileRuntimeState(normalizedProfileName);
  if (before.gatewayStatus === "running") {
    const health = await waitForHermesProfileApi(before.baseUrl || `http://127.0.0.1:${port}/v1`, apiKey);
    return {
      ...before,
      chatAvailable: health.ok,
      ok: health.ok,
      started: false,
      message: health.ok ? before.message : health.message
    };
  }

  await fsp.mkdir(LOGS_DIR, { recursive: true });

  if (resolution.runner === "wsl") {
    const outFd = fs.openSync(path.join(LOGS_DIR, `hermes-${normalizedProfileName}-gateway.out.log`), "a");
    const errFd = fs.openSync(path.join(LOGS_DIR, `hermes-${normalizedProfileName}-gateway.err.log`), "a");
    try {
      const child = spawn("wsl.exe", ["-e", resolution.command, "-p", normalizedProfileName, "gateway", "run", "--replace"], {
        cwd: os.homedir(),
        detached: true,
        stdio: ["ignore", outFd, errFd],
        windowsHide: true
      });
      child.unref();
    } finally {
      fs.closeSync(outFd);
      fs.closeSync(errFd);
    }
  } else {
    const outFd = fs.openSync(path.join(LOGS_DIR, `hermes-${normalizedProfileName}-gateway.out.log`), "a");
    const errFd = fs.openSync(path.join(LOGS_DIR, `hermes-${normalizedProfileName}-gateway.err.log`), "a");
    try {
      const child = spawn(resolution.command, ["-p", normalizedProfileName, "gateway", "run", "--replace"], {
        cwd: os.homedir(),
        detached: true,
        env: {
          ...process.env,
          API_SERVER_ENABLED: "true",
          API_SERVER_HOST: "127.0.0.1",
          API_SERVER_PORT: String(port),
          API_SERVER_KEY: apiKey,
          API_SERVER_MODEL_NAME: normalizedProfileName
        },
        stdio: ["ignore", outFd, errFd],
        windowsHide: true
      });
      child.unref();
    } finally {
      fs.closeSync(outFd);
      fs.closeSync(errFd);
    }
  }

  const baseUrl = `http://127.0.0.1:${port}/v1`;
  const health = await waitForHermesProfileApi(baseUrl, apiKey);
  const state = await getHermesProfileRuntimeState(normalizedProfileName);

  return {
    ...state,
    port,
    baseUrl,
    chatAvailable: health.ok,
    ok: health.ok,
    started: true,
    message: health.ok ? `Profile ${normalizedProfileName} gateway started.` : health.message
  };
}

export async function startManagedHermesGateway() {
  const resolution = await resolveHermesCommand();
  if (!resolution.installed || !resolution.command) {
    return {
      ok: false,
      started: false,
      reason: "not_installed",
      message: "Hermes is not installed on this computer yet."
    };
  }

  const apiServerKey = await ensureHermesApiServerKey();
  const key = await readHermesApiServerKey();

  await writeHermesEnvValues({
    API_SERVER_ENABLED: "true",
    API_SERVER_HOST: "127.0.0.1",
    API_SERVER_PORT: "8642"
  });
  await fsp.mkdir(LOGS_DIR, { recursive: true });

  const outFd = fs.openSync(HERMES_GATEWAY_OUT_LOG, "a");
  const errFd = fs.openSync(HERMES_GATEWAY_ERR_LOG, "a");
  const spawnTarget = gatewaySpawnCommand(resolution.command);

  try {
    const child = fs.existsSync(resolution.command) || resolution.source === "path" || resolution.source === "env"
      ? spawn(spawnTarget.command, spawnTarget.args, {
          cwd: os.homedir(),
          detached: true,
          env: {
            ...process.env,
            API_SERVER_ENABLED: "true",
            API_SERVER_HOST: "127.0.0.1",
            API_SERVER_PORT: "8642",
            API_SERVER_KEY: key
          },
          stdio: ["ignore", outFd, errFd],
          windowsHide: true
        })
      : null;

    if (!child) {
      return {
        ok: false,
        started: false,
        reason: "not_installed",
        message: "Hermes command could not be resolved."
      };
    }

    child.unref();

    return {
      ok: true,
      started: true,
      apiServerKeyCreated: apiServerKey.created,
      commandSource: resolution.source,
      message: "Agent Engine is starting."
    };
  } finally {
    fs.closeSync(outFd);
    fs.closeSync(errFd);
  }
}
