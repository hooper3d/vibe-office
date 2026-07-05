import { spawnSync } from "node:child_process";
import { mkdir, readdir, rm } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const tmpdir = join(root, ".tmp");
const outdir = join(tmpdir, "service-tests");
const sourceTestDir = join(root, "src", "__tests__");

await rm(tmpdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });

const sourceTestFiles = (await readdir(sourceTestDir))
  .filter((fileName) => fileName.endsWith(".test.ts"))
  .sort();

if (sourceTestFiles.length === 0) {
  console.error("No service test files found in src/__tests__.");
  process.exit(1);
}

const bundledTestFiles = [];
for (const fileName of sourceTestFiles) {
  const outfile = join(outdir, basename(fileName, ".ts") + ".mjs");
  await build({
    entryPoints: [join(sourceTestDir, fileName)],
    outfile,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
    sourcemap: "inline",
    external: ["node:test", "node:assert/strict"],
    logLevel: "silent",
  });
  bundledTestFiles.push(outfile);
}

const result = spawnSync(process.execPath, ["--test", ...bundledTestFiles], {
  cwd: root,
  stdio: "inherit",
});

await rm(tmpdir, { recursive: true, force: true });

process.exit(result.status ?? 1);
