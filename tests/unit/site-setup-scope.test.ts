import { describe, expect, it } from "vitest";
import type { AccessContext } from "@/domain/access-context";
import { assertSiteLocationProgramScope, assertSiteSetupScope } from "@/domain/site-setup-scope";

const site={id:"site-one",organizationId:"church-one"};
const actor:AccessContext={
  accountId:"verified",sessionId:"session",grantId:"grant",role:"site_admin",
  grantSiteId:"site-one",actorPersonId:"person",
  capabilities:new Set(["program.read","program.launch.start"]),
  scope:{organizationIds:["church-one"],siteIds:["site-one"],programIds:["program-one"]},
};
const permitted=(person:AccessContext, resource=site,cap:"program.read"|"program.launch.start"="program.read")=>
  ()=>assertSiteSetupScope(person,resource,cap);

describe("Agent S verified Site and Program access",()=>{
  it("requires an authenticated registrar with the actual server grant",()=>{
    expect(permitted(actor)).not.toThrow();
    expect(permitted({...actor,actorPersonId:null})).toThrow();
    expect(permitted({...actor,role:"guardian"})).toThrow();
    expect(permitted({...actor,role:"can_jurisdiction_reviewer"})).toThrow();
    expect(permitted({...actor,role:"site_website_editor"})).toThrow();
    expect(permitted({...actor,capabilities:new Set(["program.read"])},site,"program.read")).not.toThrow();
    expect(permitted({...actor,capabilities:new Set(["program.read"])},site,"program.launch.start")).toThrow();
  });
  it("does not use URL identifiers to grant access to sibling Sites or churches",()=>{
    expect(permitted(actor,{id:"sibling-site",organizationId:"church-one"})).toThrow();
    expect(permitted(actor,{id:"foreign-site",organizationId:"foreign-church"})).toThrow();
    expect(permitted(actor,{id:"site-one",organizationId:"foreign-church"})).toThrow();
    expect(permitted({...actor,scope:{organizationIds:["church-one"],siteIds:["site-one"]}},site)).not.toThrow();
  });
  it("requires Site-scoped registrars to cover every Program affected by address revisions",()=>{
    expect(()=>assertSiteLocationProgramScope(actor,["program-one"])).not.toThrow();
    expect(()=>assertSiteLocationProgramScope(actor,["program-one","sibling-program"])).toThrow();
    expect(()=>assertSiteLocationProgramScope(actor,[])).not.toThrow();
    expect(()=>assertSiteLocationProgramScope({...actor,scope:{organizationIds:["church-one"],siteIds:["site-one"]}},["program-one"])).toThrow();
  });
  it("honors organization-wide registrar grant without conferring CAN institutional approvals",()=>{
    const orgWide={...actor,role:"registrar",grantSiteId:null,
      scope:{organizationIds:["church-one"]}};
    expect(permitted(orgWide,{id:"site-two",organizationId:"church-one"})).not.toThrow();
    expect(permitted(orgWide,{id:"foreign",organizationId:"foreign"})).toThrow();
    expect(()=>assertSiteLocationProgramScope(orgWide,["program-one","program-two"])).not.toThrow();
  });
});
