import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(
  new URL("../../" + path, import.meta.url), "utf8",
);

describe("V6.1 Prepare operational integration boundaries", () => {
  it("integrates the three workflows in the same Launch Studio module frame", () => {
    const prepare = read("src/components/launch-studio/LaunchPrepareV61.tsx");
    const operations = read("src/components/launch-studio/PrepareOperationsV61.tsx");
    for (const exported of ["PrepareFacilitiesV61", "PrepareTeamV61", "PrepareSchedulesV61"]) {
      expect(prepare).toContain("<" + exported);
      expect(operations).toContain("export function " + exported);
    }
    expect(prepare).toContain('<LaunchReadinessPanelV61');
    expect(prepare).not.toContain('aria-label="Prepare modules"');
  });

  it("saves learning environment through the existing audited Site Information command", () => {
    const operations = read("src/components/launch-studio/PrepareOperationsV61.tsx");
    const saved = read("src/modules/programs/site-information-v61.server.ts");
    const sdk = read("src/lib/api/browser-site-planning.ts");
    expect(operations).toContain("readSiteInformation(siteId, controller.signal)");
    expect(sdk).toContain('GET("/api/v1/sites/{siteId}/information"');
    expect(operations).toContain("saveSiteInformation(siteId, {");
    expect(sdk).toContain('POST("/api/v1/sites/{siteId}/information"');
    expect(operations).toContain('section: "environment"');
    expect(operations).toContain("siteEnvironmentV61Schema.safeParse");
    expect(operations).toContain("expectedRevision");
    expect(operations).toContain("setReconciliationRequired(true)");
    expect(operations).toContain("useLaunchUnsavedChanges(");
    expect(saved).toContain('assertSiteSetupScope(actor, site, "program.launch.start")');
    expect(saved).toContain("applySiteEnvironmentDeliveryV61");
    expect(saved).toContain("writeAudit(tx, actor");
    expect(operations).not.toContain("localStorage");
  });

  it("reuses Site-locked staff invitations and accepted qualification status", () => {
    const operations = read("src/components/launch-studio/PrepareOperationsV61.tsx");
    const admin = read("src/components/operations/ScopedAdminConsole.tsx");
    const route = read("src/routes/admin.tsx");
    expect(operations).toContain("lockedSiteId={siteId}");
    expect(operations).toContain('mode={view} hubMode');
    expect(admin).toContain("inviteStaffMember({");
    expect(admin).toContain("listAccessAccounts()");
    expect(admin).toContain("grant.siteId===lockedSiteId");
    expect(admin).toContain('values.siteId !== lockedSiteId');
    expect(admin).toContain("includeRoomCoverage");
    expect(route).toContain('from "@/components/operations/ScopedAdminConsole"');
    expect(admin).not.toContain("insert(accountPersonGrants)");
  });

  it("uses existing canonical Site Spaces and Classes, not old Section coverage", () => {
    const operations = read("src/components/launch-studio/PrepareOperationsV61.tsx");
    const facilities = read("src/components/launch-studio/LaunchSiteFacilitiesWorkspaceV61.tsx");
    const classes = read("src/components/launch-studio/LaunchClassFacilitiesWorkspaceV61.tsx");
    expect(operations).toContain("<LaunchSiteFacilitiesWorkspaceV61");
    expect(operations).toContain("<LaunchClassFacilitiesWorkspaceV61");
    expect(operations).not.toContain("<RoomCoverageWorkspace");
    expect(operations).toContain("onDraftCreated={()=>queryClient.invalidateQueries");
    expect(facilities).toContain("readLaunchSiteFacilitiesV61");
    expect(facilities).toContain("saveLaunchSiteSpaceV61");
    expect(facilities).toContain("createLaunchSiteSpaceV61");
    expect(classes).toContain("readLaunchClassFacilitiesV61");
    expect(classes).toContain("saveLaunchClassPhysicalPlanV61");
    expect(classes).toContain("assignNativeClassStaff");
  });

  it("reuses the real academic-year reader and creator in the Site-locked schedule module", () => {
    const operations = read("src/components/launch-studio/PrepareOperationsV61.tsx");
    const editor = read("src/components/operations/SchoolYearCreateForm.tsx");
    expect(operations).toContain("getSchoolYearStudio()");
    expect(operations).toContain("<SchoolYearCreateForm");
    expect(operations).toContain('selection={{siteId}} lockedSiteId={siteId} embedded');
    expect(operations).toContain("onDataChanged={() => years.refetch({throwOnError:true})}");
    expect(operations).toContain('year.siteId === siteId');
    expect(editor).toContain('createStudioYear({ data: { siteId');
    expect(editor).toContain("if (lockedSiteId && siteId !== lockedSiteId) return");
    expect(editor).toContain("data.sites.filter(site => !lockedSiteId || site.id === lockedSiteId)");
    expect(editor).toContain("if (onCreated) await onCreated(createdId)");
    expect(editor).toContain("createStudioGradeScale");
  });

  it("enforces exact-Site class selection within embedded Prepare", () => {
    const classes = read("src/components/learning/NativeClassManager.tsx");
    expect(classes).toContain("prepareOnly && (!preferredSiteId || siteId!==preferredSiteId)");
    expect(classes).toContain("disabled={prepareOnly}");
    expect(classes).toContain("!prepareOnly||site.id===preferredSiteId");
    expect(classes).toContain("operatorSites.isError||prepareOnly");
    expect(classes).not.toContain("distinct cohort");
  });

  it("preserves one V6.1 navigation guard for embedded school-year editing", () => {
    const parent = read("src/components/launch-studio/PrepareOperationsV61.tsx");
    const form = read("src/components/operations/SchoolYearCreateForm.tsx");
    expect(parent).toContain("useLaunchUnsavedChanges(yearFormDirty");
    expect(parent).toContain("onDirtyChange={setYearFormDirty}");
    expect(form).toContain("useUnsavedChangesGuard(touched && !embedded)");
    expect(form).toContain("cancel={!embedded && <Link");
  });

  it("keeps Prepare Class creation draft-only, not an enrollment shortcut", () => {
    const operations = read("src/components/launch-studio/PrepareOperationsV61.tsx");
    const classes = read("src/components/learning/NativeClassManager.tsx");
    expect(operations).toContain("<NativeClassManager");
    expect(operations).toContain("embedded prepareOnly");
    expect(classes).toContain("terms:!prepareOnly&&createWithOffering?");
    expect(classes).toContain("{!prepareOnly&&item.offeringState");
    expect(classes).toContain("!prepareOnly&&item.state");
    expect(classes).toContain("independently authorized operations");
    expect(classes).toContain("getUnifiedClassCourseOptions");
    expect(classes).toContain("createUnifiedClassDraft");
  });
});
