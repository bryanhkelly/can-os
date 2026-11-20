import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const script = fileURLToPath(new URL("./check-local-import-exports.mjs", import.meta.url));
function runFixture(files) {
  const directory = mkdtempSync(join(tmpdir(), "can-local-exports-"));
  try {
    mkdirSync(join(directory, "src"));
    writeFileSync(join(directory, "tsconfig.json"), JSON.stringify({
      compilerOptions: {module: "ESNext", moduleResolution: "Bundler", baseUrl: ".",
        paths: {"@/*": ["src/*"]}},
      include: ["src/**/*.ts"],
    }));
    for (const [name, content] of Object.entries(files))
      writeFileSync(join(directory, "src", name), content);
    return spawnSync(process.execPath, [script], {
      cwd: directory, encoding: "utf8",
    });
  } finally {
    rmSync(directory, {recursive: true, force: true});
  }
}

test("valid named, type, default and barrel imports pass", () => {
  const result = runFixture({
    "brand.server.ts": `export const readSaved = () => true;
export type Brand = {id:string};
export default 42;`,
    "barrel.ts": `export * from "./brand.server";`,
    "consumer.ts": `import defaultValue, { readSaved, type Brand } from "./brand.server";
import { readSaved as a, type Brand as B } from "@/barrel";
export { readSaved as publishedRead } from "./brand.server";
void [defaultValue, readSaved, a];`,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /7 local imported\/re-exported bindings resolved/);
});

test("missing named export fails before any bundler phase", () => {
  const result = runFixture({
    "brand.functions.ts": `export const saveBrand = () => true;`,
    "family.server.ts": `import { requireSavedSiteBrand } from "./brand.functions";
void requireSavedSiteBrand;`,
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /does not export "requireSavedSiteBrand"/);
  assert.match(result.stderr, /family\.server\.ts:1:/);
});

test("missing re-export and renamed imports are detected", () => {
  const result = runFixture({
    "source.ts": `export const allowed = true;`,
    "consumer.ts": `import { absent as renamed } from "@/source";
export { alsoAbsent } from "./source";`,
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /does not export "absent"/);
  assert.match(result.stderr, /does not export "alsoAbsent"/);
  assert.match(result.stderr, /2 missing named exports/);
});
