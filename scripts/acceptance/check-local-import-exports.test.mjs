import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const script = fileURLToPath(new URL("./check-local-import-exports.mjs", import.meta.url));
function runFixture(files, options = {}, rootFiles = {}) {
  const directory = mkdtempSync(join(tmpdir(), "can-local-exports-"));
  try {
    mkdirSync(join(directory, "src"));
    writeFileSync(join(directory, "tsconfig.json"), JSON.stringify({
      compilerOptions: {module: "ESNext", moduleResolution: "Bundler", baseUrl: ".",
        resolveJsonModule: true, esModuleInterop: true,
        paths: {"@/*": ["src/*"]}, ...options},
      include: ["src/**/*.ts", "*.ts"],
    }));
    for (const [name, content] of Object.entries(files))
      writeFileSync(join(directory, "src", name), content);
    for (const [name, content] of Object.entries(rootFiles))
      writeFileSync(join(directory, name), content);
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
  assert.match(result.stdout, /6 local imported\/re-exported bindings resolved/);
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

test("JSON defaults from relative and aliased paths are valid", () => {
  const result = runFixture({
    "legacy.json": '{"files":[{"key":"hero.jpg"}]}',
    "staged.json": '{"version":2,"files":[]}',
    "consumer.ts": 'import legacy from "./legacy.json";\n' +
      'import staged from "@/staged.json";\n' +
      'import same from "@/legacy.json";\nvoid [legacy,staged,same];',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /3 local imported\/re-exported bindings resolved/);
});

test("missing TypeScript default exports remain errors", () => {
  const result = runFixture({
    "source.ts": "export const named = 1;",
    "consumer.ts": 'import missing from "./source"; void missing;',
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /does not export "default"/);
});

test("JSON named imports do not receive a default-export exemption", () => {
  const result = runFixture({
    "legacy.json": '{"files":[]}',
    "consumer.ts": 'import { missing } from "./legacy.json"; void missing;',
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /does not export "missing"/);
});

test("JSON default exemption requires compatible compiler options", () => {
  const result = runFixture({
    "legacy.json": '{"files":[]}',
    "consumer.ts": 'import legacy from "./legacy.json"; void legacy;',
  }, { esModuleInterop: false, allowSyntheticDefaultImports: false });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /does not export "default"/);
});

test("missing named export in repository-root Vite config fails before bundling", () => {
  const result = runFixture({
    "revision.ts": "export const knownRevision = () => 'local';",
  }, {}, {
    "vite.config.ts": 'import { missingRevision } from "./src/revision"; void missingRevision;',
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /vite\\.config\\.ts:1:/);
  assert.match(result.stderr, /does not export "missingRevision"/);
});

test("valid root build-config named export is accepted", () => {
  const result = runFixture({
    "revision.ts": "export const knownRevision = () => 'local';",
  }, {}, {
    "vite.config.ts": 'import { knownRevision } from "./src/revision"; void knownRevision;',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /1 local imported\\/re-exported bindings resolved/);
});
