import assert from "node:assert/strict";
import test from "node:test";
import { sharedUiImportViolation } from "./v61-component-dependencies.mjs";

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
