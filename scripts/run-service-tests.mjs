import { spawnSync } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const tmpdir = join(root, ".tmp");
const outdir = join(tmpdir, "service-tests");
const outfile = join(outdir, "stability.test.mjs");

await rm(tmpdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });

await build({
  entryPoints: [join(root, "src", "__tests__", "stability.test.ts")],
  outfile,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  sourcemap: "inline",
  external: ["node:test", "node:assert/strict"],
  logLevel: "silent",
});

const result = spawnSync(process.execPath, ["--test", outfile], {
  cwd: root,
  stdio: "inherit",
});

await rm(tmpdir, { recursive: true, force: true });

process.exit(result.status ?? 1);
