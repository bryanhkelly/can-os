import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path:string):string{
  return readFileSync(new URL("../../"+path,import.meta.url),"utf8");
}
describe("Launch catalog, Class and persistence contracts",()=>{
  it("uses the same platform Site ID without consulting an identity bridge",()=>{
    const server=source("src/modules/programs/launch-site-catalog.server.ts");
    const handoff=source("src/components/launch-studio/SiteNativeClassHandoff.tsx");
    const publicClasses=source("src/modules/sites/site-published-classes.server.ts");
    expect(server).toContain("assertSiteSetupScope(publicActor,site");
    expect(server).toContain("lifecycleStatus:sites.lifecycleStatus");
    expect(server).toContain('if(!site.lifecycleStatus||site.lifecycleStatus==="closed")');
    expect(server).not.toContain("catalogSites");
    expect(server).toContain("getCanonicalCommandContext(request)");
    expect(server).toContain("actor.scope.siteIds?.includes(site.id)");
    expect(server).not.toContain("site_canonical_identity_links");
    expect(handoff).toContain("getLaunchSiteClassScope");
    expect(handoff).not.toContain("getSiteIdentityLinkStatus");
    expect(publicClasses).toContain("WHERE c.site_id=${publicSiteId}::uuid");
    expect(publicClasses).not.toContain("site_canonical_identity_links");
  });
  it("never treats the public Site ID as a canonical Offering discovery subject",()=>{
    const commands=source("src/modules/programs/program-discovery.functions.ts");
    const hub=source("src/modules/programs/school-hub.functions.ts");
    expect(commands).toContain("resolveLaunchSiteCatalogContext(getRequest(),data.publicSiteId)");
    expect(commands).toContain("siteId:scope.canonicalSiteId");
    expect(hub).not.toContain("const canonicalCatalogEnabled=true");
    expect(hub).toContain('catalogState=resolved.kind');
  });
  it("reuses canonical /class creator and preserves verified Offering version",()=>{
    const panel=source("src/components/launch-studio/ProgramDiscoveryPanel.tsx");
    const route=source("src/routes/class.tsx");
    const manager=source("src/components/learning/NativeClassManager.tsx");
    expect(panel).toContain("discoverLaunchSitePrograms");
    expect(panel).toContain('to="/class"');
    expect(panel).toContain("offeringVersionId:offering.offeringVersionId");
    expect(route).toContain("preferredOfferingVersionId={selected.offeringVersionId}");
    expect(manager).toContain("offeringVersionId:preferredOfferingVersionId");
    expect(panel).not.toContain("createUnifiedClassDraft");
  });
  it("commits first Site preferences in the Site transaction, not a second mutation",()=>{
    const site=source("src/modules/programs/launch.functions.ts");
    const wizard=source("src/components/launch-studio/SiteFirstLaunch.tsx");
    expect(site).toContain("launchPreferences:siteLaunchPreferencesSchema.optional()");
    expect(site).toContain("launchPreferences:data.launchPreferences");
    expect(wizard).toContain("launchPreferences:{delivery,interestIds:chosen}");
    expect(wizard).not.toContain("siteId:saved.value.siteId,preferences");
  });
  it("protects edited Site channels and reuses 6.1 form controls",()=>{
    const ui=source("src/components/launch-studio/SiteContentChannelEditor.tsx");
    const launch=source("src/components/launch-studio/SiteFirstLaunch.tsx");
    expect(ui).toContain("useLaunchUnsavedChanges(");
    expect(ui).toContain("setSavedSnapshot(");
    expect(ui).toContain("<Textarea ");
    expect(ui).toContain("<Checkbox ");
    expect(launch).toContain("<Radio ");
  });
  it("preserves native Course discovery independently of legacy school preparation reads",()=>{
    const ui=source("src/components/launch-studio/SchoolHubWorkflow.tsx");
    expect(ui).toContain("const catalogDiscovery=module");
    expect(ui).toContain("if(!data.launches)return <>{catalogDiscovery}");
    expect(ui).toContain("if(data.selectionError || (data.launches.length && !current))return <>{catalogDiscovery}");
    expect(ui).toContain("if(data.draftFailed)return <>{catalogDiscovery}");
    expect(ui).toContain("if(!site)return");
  });
  it("hides school opening actions for enrichment-only Site previews",()=>{
    const ui=source("src/components/launch-studio/SiteFirstLaunch.tsx");
    expect(ui).toContain("siteLaunchPreparation(sitePrograms,chosen)");
    expect(ui).toContain("siteId&&preparation.showSchoolOpeningPreparation");
  });
  it("uses the v6.1 rectilinear affiliation card",()=>{
    const ui=source("src/components/operations/SiteAffiliationPanel.tsx");
    expect(ui).toContain('className="mt-3 border border-border bg-card p-5"');
    expect(ui).not.toContain("rounded-xl");
    expect(ui).not.toContain("rounded-lg");
  });
});
