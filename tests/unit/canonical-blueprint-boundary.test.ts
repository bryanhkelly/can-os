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
