import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const requiredFiles = [
  "README.md",
  "LICENSE",
  "CONTRIBUTING.md",
  "SECURITY.md",
  ".env.example",
  ".github/workflows/ci.yml",
  ".gitignore",
  "docs/RELEASE_CHECKLIST.md",
];
const blockedTrackedPatterns = [
  /^\.env$/i,
  /^\.env\.(?!example$).+/i,
  /^dist[\\/]/i,
  /^node_modules[\\/]/i,
  /^\.tmp[\\/]/i,
  /\.log$/i,
  /\.local$/i,
];
const extensionlessReleaseTextFiles = new Set(["LICENSE", ".gitignore"]);

const errors = [];
const warnings = [];
const trackedFiles = getGitLines(["ls-files"]);
const untrackedFiles = getGitLines(["ls-files", "--others", "--exclude-standard"]);
const releaseCandidateFiles = [...new Set([...trackedFiles, ...untrackedFiles])].filter(isReleaseTextFile);

for (const filePath of requiredFiles) {
  if (!existsSync(path.join(root, filePath))) {
    errors.push(`Missing required release file: ${filePath}`);
  }
}

for (const filePath of trackedFiles) {
  if (blockedTrackedPatterns.some((pattern) => pattern.test(normalizePath(filePath)))) {
    errors.push(`Generated or local-only file is tracked: ${filePath}`);
  }
}

validatePackageMetadata();
validateGitignore();

for (const filePath of releaseCandidateFiles) {
  const absolutePath = path.join(root, filePath);
  if (!existsSync(absolutePath)) continue;
  const text = readFileSync(absolutePath, "utf8");
  if (/C:\\Users\\[^\\\s]+|\/Users\/[^/\s]+|\/home\/[^/\s]+/.test(text)) {
    errors.push(`Release candidate file contains a machine-specific home path: ${filePath}`);
  }
  if (/\bhooper\\?\.ink\b/i.test(text)) {
    errors.push(`Release candidate file contains a private endpoint: ${filePath}`);
  }
  if (containsLikelySecretValue(text)) {
    errors.push(`Release candidate file appears to contain a filled secret value: ${filePath}`);
  }
}

const envExample = path.join(root, ".env.example");
if (existsSync(envExample)) {
  const envText = readFileSync(envExample, "utf8");
  for (const line of envText.split(/\r?\n/)) {
    if (!line || line.trimStart().startsWith("#")) continue;
    const [name, ...valueParts] = line.split("=");
    const value = valueParts.join("=").trim();
    if (/KEY|TOKEN|SECRET|PASSWORD/i.test(name) && value && value !== "<key>") {
      errors.push(`Secret-like .env.example variable must stay empty: ${name}`);
    }
  }
}

const ignoredArtifacts = getGitLines(["status", "--porcelain", "--ignored"])
  .filter((line) => line.startsWith("!! "))
  .map((line) => line.slice(3))
  .filter(shouldWarnOnIgnoredArtifact);
if (ignoredArtifacts.length > 0) {
  warnings.push(`Ignored local artifacts present: ${ignoredArtifacts.slice(0, 8).join(", ")}${ignoredArtifacts.length > 8 ? ", ..." : ""}`);
}

if (warnings.length > 0) {
  console.log("Release hygiene warnings:");
  for (const warning of warnings) console.log(`- ${warning}`);
}

if (errors.length > 0) {
  console.error("Release hygiene failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log("Release hygiene checks passed.");

function getGitLines(args) {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    errors.push(`git ${args.join(" ")} failed: ${result.stderr.trim()}`);
    return [];
  }
  return result.stdout.split(/\r?\n/).filter(Boolean);
}

function normalizePath(filePath) {
  return filePath.replaceAll("\\", "/");
}

function isReleaseTextFile(filePath) {
  return extensionlessReleaseTextFiles.has(normalizePath(filePath)) || /\.(css|env\.example|html|js|json|md|mjs|ts|tsx|ya?ml)$/i.test(filePath);
}

function shouldWarnOnIgnoredArtifact(filePath) {
  const normalized = normalizePath(filePath);
  if (/^(?:node_modules|dist|\.tmp)(?:\/|$)/i.test(normalized)) return false;
  return true;
}

function validatePackageMetadata() {
  const packageJsonPath = path.join(root, "package.json");
  if (!existsSync(packageJsonPath)) {
    errors.push("Missing package.json");
    return;
  }

  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  if (packageJson.license !== "MIT") {
    errors.push("package.json license must match LICENSE: MIT");
  }

  for (const scriptName of ["ci", "typecheck", "typecheck:unused", "test", "build", "release:check"]) {
    if (!packageJson.scripts?.[scriptName]) {
      errors.push(`package.json is missing required script: ${scriptName}`);
    }
  }
}

function validateGitignore() {
  const gitignorePath = path.join(root, ".gitignore");
  if (!existsSync(gitignorePath)) return;

  const entries = new Set(readFileSync(gitignorePath, "utf8").split(/\r?\n/).map((line) => line.trim()).filter(Boolean));
  for (const requiredEntry of ["node_modules/", "dist/", ".tmp/", ".env", ".env.*", "!.env.example", "*.local", "*.log"]) {
    if (!entries.has(requiredEntry)) {
      errors.push(`.gitignore is missing required release entry: ${requiredEntry}`);
    }
  }
}

function containsLikelySecretValue(text) {
  return text.split(/\r?\n/).some((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("//")) return false;
    if (/(^|[^A-Za-z0-9_])(?:sk|ak)-[A-Za-z0-9_-]{20,}/.test(trimmed)) return true;

    const envAssignment = trimmed.match(/^([A-Z0-9_]*(?:API_KEY|TOKEN|SECRET|PASSWORD)[A-Z0-9_]*)=(.+)$/);
    if (!envAssignment) return false;

    const value = envAssignment[2].trim();
    return Boolean(value) && !/^(?:\.\.\.|<[^>]+>|your-.+|example.*|placeholder.*)$/i.test(value);
  });
}
