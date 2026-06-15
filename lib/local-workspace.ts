import { promises as fs } from "fs";
import path from "path";
import { readHermesApiServerKey } from "@/lib/hermes-api-key";
import { resolveHermesCommand, startManagedHermesGateway } from "@/lib/hermes-runtime";
import type {
  LocalRuntimeHealth,
  LocalUserProfile,
  LocalWorkspaceConfig,
  LocalWorkspaceSnapshot,
  RuntimeComponentHealth,
  RuntimeHealthStatus,
  RuntimeQuickStartState,
  RuntimeQuickStartStep
} from "@/types/workspace";

const WORKSPACE_ROOT = process.cwd();
const CONFIG_DIR = path.join(WORKSPACE_ROOT, "config");
const LOCAL_WORKSPACE_DIR = path.join(WORKSPACE_ROOT, "workspace");
const LOCAL_PROJECTS_DIR = path.join(LOCAL_WORKSPACE_DIR, "projects");
const DEFAULT_PROJECT_ID = "default-project";
const DEFAULT_PROJECT_CONTEXT_DIR = path.join(LOCAL_PROJECTS_DIR, DEFAULT_PROJECT_ID, "context");
const LOGS_DIR = path.join(WORKSPACE_ROOT, "logs");
const EMBEDDED_HERMES_DIR = path.join(WORKSPACE_ROOT, "runtime", "hermes");
const RUNTIME_CONFIG_FILE = path.join(CONFIG_DIR, "runtime.json");
const USER_PROFILE_FILE = path.join(LOCAL_WORKSPACE_DIR, "user.json");
const DEFAULT_HERMES_BASE_URL = process.env.VIBE_OFFICE_EMBEDDED_HERMES_BASE_URL || "http://127.0.0.1:8642/v1";
const DEFAULT_AGUI_BASE_URL = process.env.VIBE_OFFICE_AGUI_BASE_URL || "http://localhost:3000";
const HEALTH_TIMEOUT_MS = 2500;

const DEFAULT_CONTEXT_FILES: Array<{ name: string; content: string }> = [
  {
    name: "PROJECT_BRIEF.md",
    content: "# Project Brief\n\nThis is the first local Agent Office created by Vibe Office Portable Preview.\n"
  },
  {
    name: "PROGRESS_SUMMARY.md",
    content: "# Progress Summary\n\nNo project progress has been recorded yet.\n"
  },
  {
    name: "DEV_LOG.md",
    content: "# Dev Log\n\nLocal workspace initialized.\n"
  },
  {
    name: "HANDOFF.md",
    content: "# Handoff\n\nNo handoff notes yet.\n"
  },
  {
    name: "BLOG_CONTEXT.md",
    content: "# Blog Context\n\nNo publishing context yet.\n"
  }
];

function nowIso() {
  return new Date().toISOString();
}

function toPortablePath(filePath: string) {
  return path.relative(WORKSPACE_ROOT, filePath).replace(/\\/g, "/");
}

function hermesHealthUrl(baseUrl: string) {
  const clean = baseUrl.trim().replace(/\/+$/, "");
  return clean.endsWith("/v1") ? `${clean.slice(0, -3)}/health` : `${clean}/health`;
}

function defaultRuntimeConfig(): LocalWorkspaceConfig {
  return {
    appVersion: "0.1.0-preview",
    portablePreview: true,
    workspaceRoot: toPortablePath(LOCAL_WORKSPACE_DIR),
    defaultProjectId: DEFAULT_PROJECT_ID,
    runtime: {
      mode: "embedded",
      developerMode: false,
      hermes: {
        enabled: true,
        managedByVibeOffice: true,
        baseUrl: DEFAULT_HERMES_BASE_URL,
        healthUrl: hermesHealthUrl(DEFAULT_HERMES_BASE_URL),
        apiKeyEnvName: "HERMES_API_SERVER_KEY",
        runtimeDir: toPortablePath(EMBEDDED_HERMES_DIR)
      },
      aguiConnector: {
        enabled: true,
        managedByVibeOffice: true,
        baseUrl: DEFAULT_AGUI_BASE_URL
      }
    }
  };
}

function defaultUserProfile(): LocalUserProfile {
  const timestamp = nowIso();
  return {
    id: `local-${Date.now().toString(36)}`,
    displayName: "Local User",
    createdAt: timestamp,
    lastOpenedAt: timestamp
  };
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8")) as T;
  } catch (error) {
    const code = error instanceof Error && "code" in error ? (error as NodeJS.ErrnoException).code : undefined;
    if (code === "ENOENT") return null;
    return null;
  }
}

async function writeJsonFile(filePath: string, value: unknown) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function ensureContextFiles() {
  await fs.mkdir(DEFAULT_PROJECT_CONTEXT_DIR, { recursive: true });
  await Promise.all(
    DEFAULT_CONTEXT_FILES.map(async (file) => {
      const filePath = path.join(DEFAULT_PROJECT_CONTEXT_DIR, file.name);
      try {
        await fs.access(filePath);
      } catch {
        await fs.writeFile(filePath, file.content, "utf8");
      }
    })
  );
}

async function canWriteDirectory(dirPath: string) {
  const probe = path.join(dirPath, `.health-${Date.now().toString(36)}.tmp`);
  try {
    await fs.mkdir(dirPath, { recursive: true });
    await fs.writeFile(probe, "ok", "utf8");
    await fs.unlink(probe);
    return true;
  } catch {
    return false;
  }
}

function component(input: RuntimeComponentHealth): RuntimeComponentHealth {
  return input;
}

function summaryFromComponents(components: RuntimeComponentHealth[]): RuntimeHealthStatus {
  if (components.some((item) => item.status === "failed")) return "failed";
  if (components.some((item) => item.status === "unreachable")) return "unreachable";
  if (components.some((item) => item.status === "not_installed")) return "not_installed";
  if (components.some((item) => item.status === "needs_key")) return "needs_key";
  if (components.some((item) => item.status === "checking")) return "checking";
  return "ready";
}

async function probeHttp(url: string, init?: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal
    });
    return {
      reachable: true,
      ok: response.ok,
      status: response.status
    };
  } catch (error) {
    return {
      reachable: false,
      ok: false,
      message: error instanceof Error ? error.message : "Not reachable"
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function checkEmbeddedHermes(config: LocalWorkspaceConfig): Promise<RuntimeComponentHealth> {
  let runtimeDirExists = false;
  try {
    const stats = await fs.stat(path.join(WORKSPACE_ROOT, config.runtime.hermes.runtimeDir));
    runtimeDirExists = stats.isDirectory();
  } catch {
    runtimeDirExists = false;
  }

  const hermesCommand = await resolveHermesCommand();
  const hermesInstalled = runtimeDirExists || hermesCommand.installed;
  const health = await probeHttp(config.runtime.hermes.healthUrl);
  const apiKey = await readHermesApiServerKey();
  const models = await probeHttp(`${config.runtime.hermes.baseUrl.replace(/\/+$/, "")}/models`, {
    headers: apiKey
      ? {
          authorization: `Bearer ${apiKey}`
        }
      : undefined
  });

  if (models.ok) {
    return component({
      id: "embedded-hermes",
      label: "Agent Engine",
      status: "ready",
      tone: "ready",
      message: hermesCommand.installed && !runtimeDirExists ? "Local Hermes Agent Engine is ready." : "Agent Engine API is ready."
    });
  }

  if (models.reachable && !models.ok && (models.status === 401 || models.status === 403)) {
    return component({
      id: "embedded-hermes",
      label: "Agent Engine",
      status: "needs_key",
      tone: "attention",
      message: "Agent Engine is running, but setup must be refreshed."
    });
  }

  if (health.ok) {
    return component({
      id: "embedded-hermes",
      label: "Agent Engine",
      status: "unreachable",
      tone: "attention",
      message: "Agent Engine is running, but its API is not ready."
    });
  }

  if (!hermesInstalled) {
    return component({
      id: "embedded-hermes",
      label: "Agent Engine",
      status: "not_installed",
      tone: "attention",
      message: "Hermes Agent is not installed on this computer yet.",
      detail: config.runtime.hermes.runtimeDir
    });
  }

  return component({
    id: "embedded-hermes",
    label: "Agent Engine",
    status: "unreachable",
    tone: "attention",
    message: "Agent Engine is not running yet."
  });
}

function quickStartStep(componentHealth: RuntimeComponentHealth): RuntimeQuickStartStep {
  if (componentHealth.status === "ready") {
    return {
      id: componentHealth.id,
      label: componentHealth.label,
      status: "done",
      healthStatus: componentHealth.status,
      message: componentHealth.message
    };
  }

  if (componentHealth.status === "failed") {
    return {
      id: componentHealth.id,
      label: componentHealth.label,
      status: "error",
      healthStatus: componentHealth.status,
      message: componentHealth.message
    };
  }

  if (componentHealth.status === "checking" || componentHealth.status === "unreachable") {
    return {
      id: componentHealth.id,
      label: componentHealth.label,
      status: "waiting",
      healthStatus: componentHealth.status,
      message: componentHealth.message
    };
  }

  return {
    id: componentHealth.id,
    label: componentHealth.label,
    status: "action",
    healthStatus: componentHealth.status,
    message: componentHealth.message
  };
}

export function buildRuntimeQuickStartState(health: LocalRuntimeHealth): RuntimeQuickStartState {
  const engine = health.components.find((item) => item.id === "embedded-hermes");
  const hasFailedCore = health.components.some((item) => item.id !== "embedded-hermes" && item.status === "failed");
  const ready = health.summary === "ready";
  const engineNeedsInstall = engine?.status === "not_installed";
  const engineNeedsKey = engine?.status === "needs_key";
  const engineStarting = engine?.status === "unreachable" || engine?.status === "checking";

  if (ready) {
    return {
      checkedAt: health.checkedAt,
      ready: true,
      title: "Agent Office is ready",
      summary: "Workspace, shared context, logs, Agent Engine, and AG-UI are connected.",
      primaryAction: "open_office",
      steps: health.components.map(quickStartStep)
    };
  }

  if (hasFailedCore) {
    return {
      checkedAt: health.checkedAt,
      ready: false,
      title: "Local workspace needs repair",
      summary: "Vibe Office could not prepare one of the local folders it needs.",
      primaryAction: "repair",
      steps: health.components.map(quickStartStep)
    };
  }

  if (engineNeedsKey) {
    return {
      checkedAt: health.checkedAt,
      ready: false,
      title: "Agent Engine needs setup",
      summary: "Save one model provider key, then Vibe Office will restart the local Hermes connection for you.",
      primaryAction: "prepare_runtime",
      steps: health.components.map(quickStartStep)
    };
  }

  if (engineStarting) {
    return {
      checkedAt: health.checkedAt,
      ready: false,
      title: "Agent Engine is starting",
      summary: "The local workspace is ready. Vibe Office is waiting for Hermes to answer.",
      primaryAction: "prepare_runtime",
      steps: health.components.map(quickStartStep)
    };
  }

  if (engineNeedsInstall) {
    return {
      checkedAt: health.checkedAt,
      ready: false,
      title: "Install Hermes Agent",
      summary: "This preview uses the local Hermes Agent runtime. Install Hermes once, then Vibe Office can open straight into the Agent conversation.",
      primaryAction: "prepare_runtime",
      steps: health.components.map(quickStartStep)
    };
  }

  return {
    checkedAt: health.checkedAt,
    ready: false,
    title: "Runtime needs attention",
    summary: "Vibe Office prepared the local workspace, but one runtime component needs review.",
    primaryAction: "repair",
    steps: health.components.map(quickStartStep)
  };
}

export async function ensureLocalWorkspace(): Promise<{ config: LocalWorkspaceConfig; user: LocalUserProfile }> {
  await Promise.all([fs.mkdir(CONFIG_DIR, { recursive: true }), fs.mkdir(LOGS_DIR, { recursive: true }), fs.mkdir(LOCAL_WORKSPACE_DIR, { recursive: true })]);
  await ensureContextFiles();

  const currentConfig = await readJsonFile<LocalWorkspaceConfig>(RUNTIME_CONFIG_FILE);
  const config = currentConfig || defaultRuntimeConfig();
  await writeJsonFile(RUNTIME_CONFIG_FILE, config);

  const currentUser = await readJsonFile<LocalUserProfile>(USER_PROFILE_FILE);
  const user = currentUser ? { ...currentUser, lastOpenedAt: nowIso() } : defaultUserProfile();
  await writeJsonFile(USER_PROFILE_FILE, user);

  return { config, user };
}

export async function getLocalRuntimeHealth(configInput?: LocalWorkspaceConfig): Promise<LocalRuntimeHealth> {
  const { config } = configInput ? { config: configInput } : await ensureLocalWorkspace();
  const workspaceWritable = await canWriteDirectory(LOCAL_WORKSPACE_DIR);
  const logsWritable = await canWriteDirectory(LOGS_DIR);
  const contextFiles = await Promise.all(
    DEFAULT_CONTEXT_FILES.map(async (file) => {
      try {
        await fs.access(path.join(DEFAULT_PROJECT_CONTEXT_DIR, file.name));
        return true;
      } catch {
        return false;
      }
    })
  );
  const hermes = await checkEmbeddedHermes(config);

  const components: RuntimeComponentHealth[] = [
    component({
      id: "workspace",
      label: "Workspace",
      status: workspaceWritable ? "ready" : "failed",
      tone: workspaceWritable ? "ready" : "error",
      message: workspaceWritable ? "Workspace is ready." : "Workspace is not writable."
    }),
    component({
      id: "context-hub",
      label: "Project Context Hub",
      status: contextFiles.every(Boolean) ? "ready" : "failed",
      tone: contextFiles.every(Boolean) ? "ready" : "error",
      message: contextFiles.every(Boolean) ? "Project Context Hub is ready." : "Project Context Hub needs repair."
    }),
    component({
      id: "logs",
      label: "Logs",
      status: logsWritable ? "ready" : "failed",
      tone: logsWritable ? "ready" : "error",
      message: logsWritable ? "Logs are ready." : "Log folder is not writable."
    }),
    hermes,
    component({
      id: "agui-connector",
      label: "AG-UI Connector",
      status: "ready",
      tone: "ready",
      message: "AG-UI Connector is available through Vibe Office."
    })
  ];

  return {
    checkedAt: nowIso(),
    mode: config.runtime.mode,
    developerMode: config.runtime.developerMode,
    summary: summaryFromComponents(components),
    components
  };
}

export async function getLocalWorkspaceSnapshot(): Promise<LocalWorkspaceSnapshot> {
  const { config, user } = await ensureLocalWorkspace();
  const health = await getLocalRuntimeHealth(config);
  return {
    config,
    user,
    health,
    quickStart: buildRuntimeQuickStartState(health)
  };
}

export async function prepareLocalRuntime(): Promise<LocalWorkspaceSnapshot> {
  const before = await getLocalWorkspaceSnapshot();
  const engine = before.health.components.find((item) => item.id === "embedded-hermes");

  if (engine?.status === "unreachable" || engine?.status === "needs_key" || engine?.status === "checking") {
    await startManagedHermesGateway();
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  return getLocalWorkspaceSnapshot();
}
