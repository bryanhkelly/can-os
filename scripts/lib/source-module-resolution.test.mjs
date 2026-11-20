import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { unresolvedLocalSourceModule } from "./source-module-resolution.mjs";

test("source-module guard resolves aliases, relatives, barrels, assets and Vite modifiers", t => {
  const root = mkdtempSync(join(tmpdir(), "can-os-imports-"));
  t.after(() => rmSync(root, { recursive:true, force:true }));
  mkdirSync(join(root, "src", "components"), { recursive:true });
  mkdirSync(join(root, "src", "domain", "shared"), { recursive:true });
  writeFileSync(join(root, "src", "domain", "policy.ts"), "export const policy = true;");
  writeFileSync(join(root, "src", "domain", "claims.server.ts"), "export {};");
  writeFileSync(join(root, "src", "domain", "shared", "index.ts"), "export {};");
  writeFileSync(join(root, "src", "components", "logo.svg"), "<svg></svg>");
  const importer = join(root, "src", "components", "card.tsx");
  assert.equal(unresolvedLocalSourceModule(root, importer, "@/domain/policy"), null);
  assert.equal(unresolvedLocalSourceModule(root, importer, "@/domain/claims.server"), null);
  assert.equal(unresolvedLocalSourceModule(root, importer, "../domain/policy.js"), null);
  assert.equal(unresolvedLocalSourceModule(root, importer, "@/domain/shared"), null);
  assert.equal(unresolvedLocalSourceModule(root, importer, "./logo.svg?url"), null);
  assert.equal(unresolvedLocalSourceModule(root, importer, "react"), null);
  assert.equal(unresolvedLocalSourceModule(root, importer, "node:path"), null);
  assert.equal(unresolvedLocalSourceModule(root, importer, "@/routeTree.gen"), null);
  assert.equal(unresolvedLocalSourceModule(root, importer, "@/domain/missing"), "src/domain/missing");
  assert.equal(unresolvedLocalSourceModule(root, importer, "../components/not-found"), "src/components/not-found");
});
