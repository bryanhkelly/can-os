import { describe, expect, it } from "vitest";
import { assertGuardianApplicationOpening } from "@/domain/guardian-application-opening";

const program={status:"active",organizationId:"host",siteId:"church-site"};
const grant={organizationIds:["host"],siteIds:["church-site"]};

describe("guardian application opening",()=>{
  it("allows active schools in the original verified organization and site grant",()=>{
    expect(()=>assertGuardianApplicationOpening(program,grant)).not.toThrow();
  });
  it("denies programs without active status, an onsite Site, or exact membership scope",()=>{
    const blocked=[
      null,
      {...program,status:"draft"},
      {...program,status:"launching"},
      {...program,siteId:null},
      {...program,organizationId:"another-church"},
      {...program,siteId:"sibling-site"},
    ];
    for(const candidate of blocked)
      expect(()=>assertGuardianApplicationOpening(candidate,grant)).toThrow();
    expect(()=>assertGuardianApplicationOpening(program,{organizationIds:["host"],siteIds:[]})).toThrow();
    expect(()=>assertGuardianApplicationOpening(program,{organizationIds:[],siteIds:["church-site"]})).toThrow();
  });
});
