import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) { return readFileSync(resolve(path), "utf8"); }

describe("canonical v3.0.1 stays net-new", () => {
  it("uses canonical session context for every Blueprint handler", () => {
    const handler = source("src/modules/blueprints/blueprint-studio.functions.ts");
    expect(handler).toContain("getCanonicalCommandContext(getRequest())");
    expect(handler).not.toContain("getCommandContext(getRequest())");
  });

  it("uses native authorization without a global Blueprint write feature toggle", () => {
    for (const path of [
      "src/modules/blueprints/blueprint-studio.functions.ts",
      "src/modules/blueprints/blueprint-workspace.server.ts",
      "src/modules/blueprints/blueprint-review-queue.server.ts",
    ]) {
      const module = source(path);
      expect(module).not.toContain("CAN_CANONICAL_BLUEPRINT_WRITE_ENABLED");
      expect(module).not.toContain("requireCanonicalBlueprintWriteEnabled");
    }
    const handlers = source("src/modules/blueprints/blueprint-studio.functions.ts");
    expect(handlers).toContain("getCanonicalCommandContext(getRequest())");
    expect(handlers).toContain("requireBlueprintSiteScope");
    expect(source("src/modules/blueprints/blueprint-workspace.server.ts"))
      .toContain('blueprintDatabaseRole(context, "blueprint_author")');
    expect(source("src/modules/blueprints/blueprint-review-queue.server.ts"))
      .toContain('blueprintDatabaseRole(context, "blueprint_reviewer")');
  });

  it("keeps the author and reviewer pages outside old School Hub and sign-in", () => {
    const author = source("src/routes/canonical.blueprints.tsx");
    const reviewer = source("src/routes/canonical.blueprint-reviews.tsx");
    const oldHub = source("src/components/launch-studio/SchoolHubWorkflow.tsx");
    for (const page of [author, reviewer]) {
      expect(page).toContain("CanonicalBlueprintLoadError");
      expect(page).not.toContain("LoaderFailure");
      expect(page).not.toContain('to="/access"');
    }
    expect(oldHub).not.toContain("<CanonicalBlueprintWorkspace");
    expect(oldHub).not.toContain("<BlueprintReferenceCatalogPanel");
  });

  it("submits the saved revision and clears stale Operation selection between plans", () => {
    const editor = source("src/components/launch-studio/CanonicalBlueprintWorkspace.tsx");
    const submission = editor.slice(
      editor.indexOf("async function submit()"),
      editor.indexOf("async function createPlanningDeployment()"),
    );
    expect(submission).toContain("const saved = await saveCanonicalBlueprintConfiguration");
    expect(submission).toContain("expectedRevision: saved.revision");
    expect(submission.indexOf("await saveCanonicalBlueprintConfiguration"))
      .toBeLessThan(submission.indexOf("await submitCanonicalBlueprintConfiguration"));
    const loading = editor.slice(
      editor.indexOf("async function openConfiguration("),
      editor.indexOf("function versionInput("),
    );
    expect(loading).toContain('setOperationId("")');
    expect(editor).toContain("saved.revision > detail.revision");
  });

  it("retains isolated, reversible database acceptance", () => {
    const runner = source("scripts/check-canonical-v301-blueprint-flow.mjs");
    expect(runner).toContain('process.env.APP_ENV !== "test"');
    expect(runner).toContain("assertIsolatedTestDatabaseTarget");
    expect(runner).toContain("CAN_CANONICAL_TEST_APP_DATABASE_URL");
    expect(runner).toContain('await q("ROLLBACK")');
    expect(runner).toContain("blueprint_component_approval_decisions");
    expect(runner).toContain("deployment_offering_adoptions");
  });
});
