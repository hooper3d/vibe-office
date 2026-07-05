import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

test("release hygiene warnings ignore expected generated dependency and build directories", async () => {
  const source = await readFile(path.join(process.cwd(), "scripts", "run-release-check.mjs"), "utf8");

  assert.match(source, /filter\(shouldWarnOnIgnoredArtifact\)/);
  assert.match(source, /function shouldWarnOnIgnoredArtifact/);
  assert.match(source, /\^\(\?:node_modules\|dist\|\\\.tmp\)/);
  assert.match(source, /Ignored local artifacts present/);
});
