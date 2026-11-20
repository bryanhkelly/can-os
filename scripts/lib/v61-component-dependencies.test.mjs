import assert from "node:assert/strict";
import test from "node:test";
import ts from "typescript";
import { sharedUiImportViolation, sourceDependencySpecifiers, resolveSourceDependency } from "./v61-component-dependencies.mjs";

test("V6.1 primitives can only depend on other primitives and utilities", () => {
  const file = "src/components/ui/field.tsx";
  assert.equal(sharedUiImportViolation(file, "./label"), null);
  assert.equal(sharedUiImportViolation(file, "@/components/ui/input"), null);
  assert.equal(sharedUiImportViolation(file, "@/lib/utils"), null);
  assert.equal(sharedUiImportViolation(file, "react"), null);
  assert.match(sharedUiImportViolation(file, "@/components/workspace/notice"), /must not import higher-level/);
  assert.match(sharedUiImportViolation(file, "../learning/ClassEditor"), /must not import higher-level/);
  assert.match(sharedUiImportViolation(file, "@/modules/learning/read.server"), /cannot import/);
});

test("V6.1 patterns compose peers and primitives without importing business features", () => {
  const file = "src/components/workspace/action-dialog.tsx";
  assert.equal(sharedUiImportViolation(file, "@/components/ui/button"), null);
  assert.equal(sharedUiImportViolation(file, "./action-footer"), null);
  assert.equal(sharedUiImportViolation(file, "@/components/workflow/workflow-workspace"), null);
  assert.equal(sharedUiImportViolation(file, "@/components/shell/workspace-session-context"), null);
  assert.match(sharedUiImportViolation(file, "@/components/launch-studio/LaunchPrepareV61"), /cannot import feature/);
  assert.match(sharedUiImportViolation(file, "../learning/ClassEditor"), /cannot import feature/);
  assert.match(sharedUiImportViolation(file, "@/routes/class"), /cannot import route/);
  assert.match(sharedUiImportViolation(file, "../shell/WorkspaceSidebar"), /cannot import feature/);
});

test("V6.1 dependency guard does not constrain domain-specific component composition", () => {
  assert.equal(sharedUiImportViolation("src/components/learning/ClassEditor.tsx", "@/components/workspace/workspace-panel"), null);
  assert.equal(sharedUiImportViolation("src/routes/class.tsx", "@/components/learning/ClassEditor"), null);
});

test("V6.1 primitives cannot acquire domain policy, feature hooks, or platform commands", () => {
  const file = "src/components/ui/field.tsx";
  assert.match(sharedUiImportViolation(file, "@/domain/site-timezone"), /must not depend on domain/);
  assert.match(sharedUiImportViolation(file, "../../platform/mutation"), /must not depend on domain/);
  assert.match(sharedUiImportViolation(file, "@/hooks/useLaunchModelPresets"), /must not depend on domain/);
  assert.equal(sharedUiImportViolation("src/components/workspace/SiteTimezoneField.tsx", "@/domain/site-timezone"), null);
});

test("architecture inventory catches static, exported, type-only, and lazy dependencies", () => {
  const parsed = ts.createSourceFile("example.ts", `
    import { Button } from "@/components/ui/button";
    export { Bad } from "@/routes/bad";
    export * from "@/modules/learning/read.server";
    type T = import("@/modules/learning/read.server").Thing;
    const lazy = import("../learning/Feature");
    const required = require("@/db/client");
    const computed = import(variableName);
  `, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  assert.deepEqual(new Set(sourceDependencySpecifiers(parsed, ts)), new Set([
    "@/components/ui/button", "@/routes/bad", "@/modules/learning/read.server",
    "../learning/Feature", "@/db/client",
  ]));
});

test("source resolver treats relative paths and aliases as the same dependency", () => {
  const file = "src/components/launch-studio/SchoolHubWorkflow.tsx";
  assert.equal(resolveSourceDependency(file, "@/routes/admin"), "src/routes/admin");
  assert.equal(resolveSourceDependency(file, "../../routes/admin"), "src/routes/admin");
  assert.equal(resolveSourceDependency(file, "@/db/canonical-v301"), "src/db/canonical-v301");
  assert.equal(resolveSourceDependency(file, "../../db/canonical-v301"), "src/db/canonical-v301");
  assert.equal(resolveSourceDependency(file, "react"), null);
});
