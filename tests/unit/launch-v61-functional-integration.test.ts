import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const read = (path:string) => readFileSync(new URL("../../"+path,import.meta.url),"utf8");

describe("Launch Studio current persisted workflows", () => {
  it("lets an operator explicitly remove unavailable Program references", () => {
    const ui = read("src/components/launch-studio/EstablishProgramsAudiencesV61.tsx");
    const service = read("src/modules/programs/site-programs-audiences-v61.functions.ts");
    expect(ui).toContain("const unavailablePrograms = programCatalog");
    expect(ui).toContain('aria-label="Unavailable selected Programs"');
    expect(ui).toContain('onClick={() => toggleProgram(code, false)}');
    expect(ui).toContain("startingProgramCode: current.startingProgramCode");
    expect(service).toContain("const previouslySelected = new Set(");
    expect(service).toContain("const addedCodes =");
    expect(service).toContain("await readPublishedBlueprintReferences(tx)");
    expect(service).toContain('eq(sites.id, data.siteId)).for("update")');
  });
  it("reads actual saved Site evidence rather than claiming progress by page visit", () => {
    const route = read("src/routes/launch.site.tsx");
    const frame = read("src/components/launch-studio/LaunchSiteFrameV61.tsx");
    expect(route).toContain("nextLaunchAction(site.id, overview, site.lifecycleStatus)");
    expect(route).toContain("Promise.allSettled");
    expect(route).toContain("site.lifecycleStatus");
    expect(frame).toContain("{statusLabel ??");
    expect(frame).toContain("previewAvailable ?");
    expect(route).not.toContain('statusLabel: "Site established"');
    expect(route).not.toContain('title: "Begin with Site Profile"');
  });
  it("composes read-only canonical records in Prepare and Open without granting enrollment", () => {
    const view = read("src/components/launch-studio/LaunchReadinessPanelV61.tsx");
    const prepare = read("src/components/launch-studio/LaunchPrepareV61.tsx");
    const open = read("src/components/launch-studio/LaunchModuleDestinationV61.tsx");
    expect(view).toContain("listLaunches({data:{includeActive:true,siteId}})");
    expect(view).toContain("readCanonicalBlueprintWorkspace({data:{siteId}})");
    expect(view).toContain("readLaunchSitePublication({data:{siteId}})");
    expect(view).toContain("launches.value.launches.filter(item=>item.siteId===siteId)");
    expect(view).toContain("blocking && item.status!==\"complete\"");
    expect(view).toContain("No status is inferred");
    expect(view).not.toMatch(/\benableEnrollment\s*\(/);
    expect(prepare).toContain('context="prepare"');
    expect(open).toContain('context="open"');
  });
  it("reads publisher-authorized noncredit Offering releases only in Open", () => {
    const view = read("src/components/launch-studio/LaunchReadinessPanelV61.tsx");
    const publisher = read("src/modules/enrollment/noncredit-enrollment-publication.functions.ts");
    expect(view).toContain('context === "open" ? getNoncreditEnrollmentPublisher()');
    expect(view).toContain("releases=noncredit.value.published.filter(item=>item.siteId===siteId)");
    expect(view).toContain("...item.siteOptions,...item.digitalSiteOptions");
    expect(view).toContain('context==="open" && <section');
    expect(view).toContain('publicSiteId:siteId');
    expect(view).toContain('noncredit.state==="unavailable"');
    expect(publisher).toContain('requireCanonicalLabProvider("noncredit.enrollment.read")');
    expect(view).not.toContain("publishNoncreditSelfEnrollment(");
    expect(view).not.toContain("publishNoncreditAcrossAuthorizedSites(");
  });

  it("renders shared V6.1 navigation dialog with browser unload protection", () => {
    const hook=read("src/components/launch-studio/useLaunchUnsavedChanges.ts");
    const provider=read("src/components/launch-studio/LaunchNavigationGuardProvider.tsx");
    const frame=read("src/components/launch-studio/LaunchSiteFrameV61.tsx");
    expect(provider).toContain("withResolver: true");
    expect(provider).toContain('title="Leave with unsaved changes?"');
    expect(provider).toContain("blocker.proceed()");
    expect(provider).toContain("blocker.reset()");
    expect(provider).toContain("enableBeforeUnload:");
    expect(hook).toContain("LaunchNavigationContext");
    expect(frame).toContain("<LaunchNavigationGuardProvider>");
  });
});
