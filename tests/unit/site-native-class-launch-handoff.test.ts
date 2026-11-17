import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source=(path:string)=>readFileSync(new URL(`../../${path}`,import.meta.url),"utf8");

describe("single-Site native Class handoff",()=>{
  it("uses the same Site ID, never an identity crosswalk or a second Class",()=>{
    const panel=source("src/components/launch-studio/SiteNativeClassHandoff.tsx");
    const scope=source("src/modules/programs/program-discovery.functions.ts");
    expect(panel).toContain('getLaunchSiteClassScope({data:{siteId:publicSiteId}})');
    expect(panel).toContain('scope.data?.kind==="ready"?publicSiteId:null');
    expect(panel).not.toContain("getSiteIdentityLinkStatus");
    expect(panel).not.toContain("resolveSiteClassLink");
    expect(scope).toContain("export const getLaunchSiteClassScope");
    expect(scope).toContain("resolveLaunchSiteCatalogContext(getRequest(),data.siteId)");
  });

  it("queries authorized Site Classes before limiting results",()=>{
    const panel=source("src/components/launch-studio/SiteNativeClassHandoff.tsx");
    const commands=source("src/modules/classes/unified-class.functions.ts");
    expect(panel).toContain('getMyUnifiedClassDrafts({data:{siteId:canonicalSiteId!}})');
    expect(panel).toContain('enabled:Boolean(canonicalSiteId)');
    expect(commands).toContain('if(data.siteId&&!operator.siteIds.includes(data.siteId))');
    expect(commands).toContain('data.siteId?eq(canonicalClasses.siteId,data.siteId):undefined');
    expect(panel).not.toContain(".filter(item=>item.siteId===canonicalSiteId)");
    expect(panel).toContain('No native Classes appear in the authorized Site result (up to 100)');
  });

  it("reuses the 6.1 readiness projection and production Class workspace",()=>{
    const panel=source("src/components/launch-studio/SiteNativeClassHandoff.tsx");
    const manager=source("src/components/learning/NativeClassManager.tsx");
    const readiness=source("src/components/learning/NativeClassLaunchReadiness.tsx");
    expect(panel).toContain("<NativeClassLaunchReadiness state={{");
    expect(manager).toContain("<NativeClassLaunchReadiness state={{");
    expect(readiness).toContain("projectClassLaunchReadiness(state)");
    expect(panel).toContain('to="/class" search={{view:"manage",siteId:canonicalSiteId??undefined}}');
    expect(panel).toContain('tab:"sessions"');
    expect(panel).toContain("Assign a Class facilitator");
    expect(panel).not.toContain('aria-label="Class activation progression"');
  });

  it("never treats an unverified Site or publisher adoption as permission",()=>{
    const panel=source("src/components/launch-studio/SiteNativeClassHandoff.tsx");
    expect(panel).toContain('scope.data?.kind!=="ready"');
    expect(panel).toContain("No additional Site or identity correspondence is created.");
    expect(panel).toContain("getUnifiedClassCourseOptions");
    expect(panel).toContain("adoptedCourses.isError");
  });

  it("preselects only authorized Site and Course combinations",()=>{
    const manager=source("src/components/learning/NativeClassManager.tsx");
    expect(source("src/routes/class.tsx")).toContain("siteId:selectedClassUuid(value.siteId)");
    expect(manager).toContain("selectAuthorizedClassSite(row.siteOptions,preferredSiteId,mode)");
    expect(manager).toContain("createUnifiedClassDraft({data:");
    expect(manager).toContain("filtered:Boolean(search)");
  });
});
