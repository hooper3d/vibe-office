import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { hermesExecTarget, resolveHermesCommand, type HermesCommandResolution } from "@/lib/hermes-runtime";
import { getOfficeTemplate } from "@/lib/office-templates";
import type { AgentTemplate } from "@/types/provisioning";

const execFileAsync = promisify(execFile);
const HERMES_HOME = path.join(os.homedir(), ".hermes");
const HERMES_PROFILES_DIR = path.join(HERMES_HOME, "profiles");

type ProfileApplyResult = {
  profileName: string;
  displayName: string;
  role: string;
  status: "created" | "exists" | "failed";
  message: string;
};

type ProfileNameOverride = {
  profileName: string;
  displayName: string;
};

function soulForAgent(agent: AgentTemplate, displayName = agent.displayName) {
  return [
    `# ${displayName}`,
    "",
    `Role: ${agent.role}`,
    "",
    "You are a Vibe Office worker Agent. The user's default Hermes Agent is the Chief Agent and remains the coordinator.",
    "Do not assume you are the Chief Agent. Coordinate through shared project context and keep outputs focused.",
    "",
    "Default context files:",
    ...agent.contextFiles.map((file) => `- ${file}`),
    "",
    "Default tools:",
    ...agent.defaultTools.map((tool) => `- ${tool}`),
    ""
  ].join("\n");
}

function memoryForAgent(agent: AgentTemplate, displayName = agent.displayName) {
  return [
    `# ${displayName} Memory`,
    "",
    "This profile is managed by Vibe Office as an isolated worker Agent.",
    "The user's default Hermes profile is the Chief Agent and must remain separate from this worker profile.",
    "",
    `Role: ${agent.role}`,
    `Hermes profile: ${agent.profileName}`,
    "",
    "Project Context Hub files this worker should consult when available:",
    ...agent.contextFiles.map((file) => `- ${file}`),
    "",
    "Rules:",
    "- Do not claim access to the Chief Agent's private memory.",
    "- Treat Project Context Hub files as shared project context, not personal memory.",
    "- Keep outputs focused on this worker role.",
    ""
  ].join("\n");
}

function userMemoryForWorker(displayName: string) {
  return [
    `# User Notes for ${displayName}`,
    "",
    "No copied user-specific memories are seeded into this Vibe Office worker profile.",
    "Learn only from explicit user messages and shared Project Context Hub files.",
    ""
  ].join("\n");
}

function contextManifestForAgent(agent: AgentTemplate, displayName = agent.displayName) {
  return [
    `# Vibe Office Context: ${displayName}`,
    "",
    `Profile: ${agent.profileName}`,
    `Role: ${agent.role}`,
    "",
    "Shared context files:",
    ...agent.contextFiles.map((file) => `- ${file}`),
    "",
    "Default tools:",
    ...agent.defaultTools.map((tool) => `- ${tool}`),
    ""
  ].join("\n");
}

async function nativePathExists(targetPath: string) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function wslPathExists(targetPath: string) {
  try {
    await execFileAsync("wsl.exe", ["-e", "sh", "-lc", `test -d "${targetPath}"`], {
      timeout: 3000,
      windowsHide: true
    });
    return true;
  } catch {
    return false;
  }
}

async function profileDirExists(resolution: HermesCommandResolution, profileName: string) {
  if (resolution.runner === "wsl") {
    return wslPathExists(`$HOME/.hermes/profiles/${profileName}`);
  }

  return nativePathExists(path.join(HERMES_PROFILES_DIR, profileName));
}

async function writeSoul(resolution: HermesCommandResolution, profileName: string, content: string) {
  if (resolution.runner === "wsl") {
    const encoded = Buffer.from(content, "utf8").toString("base64");
    await execFileAsync("wsl.exe", ["-e", "sh", "-lc", `printf '%s' '${encoded}' | base64 -d > "$HOME/.hermes/profiles/${profileName}/SOUL.md"`], {
      timeout: 5000,
      windowsHide: true
    });
    return;
  }

  await fs.writeFile(path.join(HERMES_PROFILES_DIR, profileName, "SOUL.md"), content, "utf8");
}

function assertSafeRelativePath(relativePath: string) {
  if (path.isAbsolute(relativePath) || relativePath.split(/[\\/]+/).includes("..")) {
    throw new Error(`Unsafe profile template path: ${relativePath}`);
  }
}

function shellSingleQuote(value: string) {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

async function writeProfileFile(resolution: HermesCommandResolution, profileName: string, relativePath: string, content: string) {
  assertSafeRelativePath(relativePath);

  if (resolution.runner === "wsl") {
    const encoded = Buffer.from(content, "utf8").toString("base64");
    const quotedRelativePath = shellSingleQuote(relativePath);
    await execFileAsync(
      "wsl.exe",
      [
        "-e",
        "sh",
        "-lc",
        [
          `target="$HOME/.hermes/profiles/${profileName}/${relativePath}"`,
          "mkdir -p \"$(dirname \"$target\")\"",
          `printf '%s' '${encoded}' | base64 -d > "$target"`,
          `chmod 600 "$target" 2>/dev/null || true`,
          `test -f "$HOME/.hermes/profiles/${profileName}/"${quotedRelativePath}`
        ].join(" && ")
      ],
      {
        timeout: 5000,
        windowsHide: true
      }
    );
    return;
  }

  const targetPath = path.join(HERMES_PROFILES_DIR, profileName, relativePath);
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, content, "utf8");
}

async function writeWorkerTemplates(resolution: HermesCommandResolution, agent: AgentTemplate, displayName: string) {
  await writeSoul(resolution, agent.profileName, soulForAgent(agent, displayName));
  await writeProfileFile(resolution, agent.profileName, "memories/MEMORY.md", memoryForAgent(agent, displayName));
  await writeProfileFile(resolution, agent.profileName, "memories/USER.md", userMemoryForWorker(displayName));
  await writeProfileFile(resolution, agent.profileName, "VIBE_OFFICE_CONTEXT.md", contextManifestForAgent(agent, displayName));
}

async function runHermesProfileCreate(resolution: HermesCommandResolution, profileName: string) {
  const target = hermesExecTarget(resolution, ["profile", "create", profileName, "--clone"]);
  await execFileAsync(target.command, target.args, {
    cwd: target.cwd,
    timeout: 30000,
    windowsHide: true
  });
}

async function ensureWorkerProfile(resolution: HermesCommandResolution, agent: AgentTemplate, displayName = agent.displayName): Promise<ProfileApplyResult> {
  const existed = await profileDirExists(resolution, agent.profileName);

  if (!existed) {
    await runHermesProfileCreate(resolution, agent.profileName);
  }

  if (!(await profileDirExists(resolution, agent.profileName))) {
    return {
      profileName: agent.profileName,
      displayName: agent.displayName,
      role: agent.role,
      status: "failed",
      message: "Profile directory was not created."
    };
  }

  await writeWorkerTemplates(resolution, agent, displayName);

  return {
    profileName: agent.profileName,
    displayName,
    role: agent.role,
    status: existed ? "exists" : "created",
    message: existed ? "Profile already exists; Vibe Office worker template refreshed." : "Profile created and Vibe Office worker template applied."
  };
}

export async function applyVibeOfficeWorkerProfiles(templateId: string, agentNames: ProfileNameOverride[] = []) {
  const template = getOfficeTemplate(templateId);
  if (!template) {
    return {
      ok: false,
      message: "Unknown office template.",
      profiles: [] as ProfileApplyResult[]
    };
  }

  const resolution = await resolveHermesCommand();
  if (!resolution.installed || !resolution.command) {
    return {
      ok: false,
      message: "Hermes command was not found on this computer.",
      profiles: [] as ProfileApplyResult[]
    };
  }

  const workers = template.agents.filter((agent) => !agent.isChief);
  const profiles: ProfileApplyResult[] = [];

  for (const agent of workers) {
    const displayName = agentNames.find((item) => item.profileName === agent.profileName)?.displayName?.trim() || agent.displayName;
    try {
      profiles.push(await ensureWorkerProfile(resolution, agent, displayName));
    } catch (error) {
      profiles.push({
        profileName: agent.profileName,
        displayName,
        role: agent.role,
        status: "failed",
        message: error instanceof Error ? error.message : "Profile creation failed."
      });
    }
  }

  return {
    ok: profiles.every((profile) => profile.status !== "failed"),
    message: "Worker profile setup finished.",
    profiles
  };
}
