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

  it("reopens newly saved and resumed plans using the refreshed authorized Site projection", () => {
    const editor = source("src/components/launch-studio/CanonicalBlueprintWorkspace.tsx");
    const catalog = source("src/components/launch-studio/SolutionCatalogV61.tsx");
    const workspaceReader = source("src/modules/blueprints/blueprint-workspace.server.ts");
    const save = editor.slice(editor.indexOf("async function save()"), editor.indexOf("async function submit()"));
    expect(save.match(/const current = await reload\(\)/g)).toHaveLength(2);
    expect(save).toContain("await openConfiguration(configurationId, current)");
    expect(save).toContain("await openConfiguration(detail.configurationId, current)");
    expect(save).toContain("onWorkspaceChanged?.(current)");
    expect(editor).toContain("initialConfigurationId");
    expect(editor).toContain("openConfiguration(initialConfigurationId, result)");
    expect(editor).toContain("result.blueprintVersionId !== initialBlueprintVersionId");
    expect(editor).toContain("result.config.siteId !== siteId");
    expect(catalog).toContain("Continue saved plans");
    expect(catalog).toContain("initialConfigurationId={resumeConfigurationId ?? undefined}");
    expect(catalog).toContain("selectSavedSolutionPlans");
    expect(workspaceReader).toContain('assertCapability(context, "blueprint.configure")');
    expect(workspaceReader).toContain('eq(blueprintVersions.lifecycle, "published")');
  });

  it("requires reconciliation after an uncertain Solution write rather than blind replay", () => {
    const editor = source("src/components/launch-studio/CanonicalBlueprintWorkspace.tsx");
    const save = editor.slice(editor.indexOf("async function save()"), editor.indexOf("async function submit()"));
    const submit = editor.slice(editor.indexOf("async function submit()"), editor.indexOf("async function createPlanningDeployment()"));
    expect(save).toContain("let attemptedWrite = false");
    expect(submit).toContain("let attemptedWrite = false");
    expect(submit).toContain("attemptedWrite = true");
    expect(save).toContain("setReconciliationRequired(true)");
    expect(submit).toContain("setReconciliationRequired(true)");
    expect(editor).toContain("reconciliationRequired ||");
    expect(editor).toContain("Reload before creating or updating another Solution plan");
  });

  it("guards unsaved changes and ignores stale published-product discovery", () => {
    const editor = source("src/components/launch-studio/CanonicalBlueprintWorkspace.tsx");
    const catalog = source("src/components/launch-studio/SolutionCatalogV61.tsx");
    const picker = source("src/components/launch-studio/BlueprintOfferingAdoptionPicker.tsx");
    expect(editor).toContain("useLaunchUnsavedChanges(");
    expect(editor).toContain("solutionDraftSnapshot");
    expect(editor).toContain("replaceVisibleOfferingIntents(previous, next, editableProgramComponentIds)");
    expect(editor).toContain('initialDelivery = "onsite"');
    expect(catalog).toContain('ActionDialog open={Boolean(pendingSwitch)}');
    expect(catalog).toContain("editorState.reconciliationRequired");
    expect(catalog).toContain("editorState.busy");
    expect(catalog).toContain("onUnsavedChange={setEditorState}");
    expect(catalog).toContain("initialDelivery={preferredCatalogDelivery(delivery)}");
    expect(picker).toContain("const version = ++requestVersion.current");
    expect(picker).toContain("requestVersion.current === version");
    expect(picker).toContain("return () => { requestVersion.current += 1; }");
  });

  it("keeps approved plans read-only until the author explicitly starts a revision", () => {
    const editor = source("src/components/launch-studio/CanonicalBlueprintWorkspace.tsx");
    expect(editor).toContain('detail?.lifecycle === "frozen" && !revisingFrozen');
    expect(editor).toContain("disabled={editingDisabled}");
    expect(editor).toContain("Revise submitted Blueprint");
    expect(editor).toContain("Discard revision edits");
    expect(editor).toContain('workspace.canExecute && !revisingFrozen');
    expect(editor).toContain('setRevisingFrozen(false)');
  });

  it("enforces independent review across the whole Blueprint configuration", () => {
    const review = source("src/modules/blueprints/blueprint-review.server.ts");
    const queue = source("src/modules/blueprints/blueprint-review-queue.server.ts");
    const independence = review.slice(
      review.indexOf("const authors = await tx.select"),
      review.indexOf("const selectedComponents = await tx.select"),
    );
    expect(independence).toContain("eq(auditEvents.entityId, version.configurationId)");
    expect(independence).toContain("authors.some(author => author.actorPersonId === actorPersonId)");
    expect(independence).not.toContain("payload}->>'versionId'");
    const filterStart = queue.indexOf("return pending");
    const queueFilter = queue.slice(filterStart, queue.indexOf(".map(version =>", filterStart));
    expect(queueFilter).toContain("author.configurationId === version.configurationId");
    expect(queueFilter).toContain("author.authorPersonId === context.actorPersonId");
    expect(queueFilter).not.toContain("author.payload.versionId");
  });

  it("retains isolated, reversible database acceptance", () => {
    const runner = source("scripts/check-canonical-v301-blueprint-flow.mjs");
    expect(runner).toContain('process.env.APP_ENV !== "test"');
    expect(runner).toContain("assertIsolatedTestDatabaseTarget");
    expect(runner).toContain("CAN_CANONICAL_TEST_APP_DATABASE_URL");
    expect(runner).toContain("blueprint_policies_ready");
    expect(runner).toContain("blueprint_rls_ready");
    expect(runner).toContain('await q("ROLLBACK")');
    expect(runner).toContain("blueprint_component_approval_decisions");
    expect(runner).toContain("deployment_offering_adoptions");
  });
});
