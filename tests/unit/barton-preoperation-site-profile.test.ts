import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read=(path:string)=>readFileSync(path,"utf8");

describe("Barton and other unapproved Site Profile edits",()=>{
  it("has no mandatory reasons for an existing Site name, time zone or location",()=>{
    const form=read("src/components/launch-studio/EstablishSiteProfileUnified.tsx");
    const service=read("src/modules/programs/site-configuration.functions.ts");
    expect(form).not.toContain("Reason for changing the Site name or time zone");
    expect(form).not.toContain("Reason for entering or changing this location");
    expect(form).not.toContain("identityReason");
    expect(form).not.toContain("locationReason");
    expect(form).toContain("address: hasAddress && validAddress?.success ? validAddress.data : null");
    expect(service).toContain("address: physicalSiteAddressSchema.nullable()");
    expect(service).toContain("changeReason:z.string().trim().min(5).max(1000).optional()");
    expect(service).toContain("changeReason: z.string().trim().min(5).max(1000).optional()");
  });

  it("still checks Program operational approval and independent release before editing",()=>{
    const service=read("src/modules/programs/site-configuration.functions.ts");
    expect(service).toContain('program.status==="active" || program.status==="ready"');
    expect(service).toContain('inArray(schoolConfigurationVersions.status,["approved","suspended"])');
    expect(service).toContain('inArray(programSiteAuthorizations.status,["approved","suspended"])');
    expect(service).toContain('eq(programPublications.status,"published")');
    expect(service).toContain("assertSiteSetupScope(actor,site");
    expect(service).toContain('action:"site.identity.draft.update"');
    expect(service).toContain('action:"site.location.update"');
    expect(service).not.toContain('sitePublication?.status==="published"');
    expect(service).not.toContain('publication[0]?.status==="published"');
  });

  it("saves before signing out of the protected Site-first Launch Studio",()=>{
    const route=read("src/routes/launch.site.tsx");
    const profile=read("src/components/launch-studio/EstablishSiteProfileUnified.tsx");
    const info=read("src/components/launch-studio/EstablishSiteInformationV61.tsx");
    const programs=read("src/components/launch-studio/EstablishProgramsAudiencesV61.tsx");
    const website=read("src/routes/site-website.tsx");
    const logout=read("src/components/shell/workspace-sign-out.ts");
    expect(route).toContain("onSaveAndExit={signOutOfWorkspace}");
    expect(route.match(/onExit=\{signOutOfWorkspace\}/g)).toHaveLength(2);
    expect(profile).toContain("await saveSiteProfileSequentially");
    expect(profile).toContain("await navigate()");
    expect(profile).toContain("Save &amp; Sign Out");
    expect(info).toContain("await onSaveAndExit()");
    expect(programs).toContain("await onSaveAndExit()");
    expect(website).toContain("await signOutOfWorkspace()");
    expect(logout).toContain('fetch("/access/logout"');
    expect(logout).toContain('window.location.assign("/access")');
  });
});
