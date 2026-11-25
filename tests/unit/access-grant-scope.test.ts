import { describe, expect, it } from "vitest";
import { hasValidAccessGrantScope } from "@/domain/access-grant-scope";
describe("Verified membership scope shape",()=>{
  it("requires platform and personal memberships to be tenant-free",()=>{
    for(const role of ["account_holder","app_admin","platform_owner"]){
      expect(hasValidAccessGrantScope({role,organizationId:null,siteId:null})).toBe(true);
      expect(hasValidAccessGrantScope({role,organizationId:"org",siteId:null})).toBe(false);
      expect(hasValidAccessGrantScope({role,organizationId:null,siteId:"site"})).toBe(false);
    }
  });
  it("requires an organization for institutional membership",()=>{
    for(const role of ["teacher","registrar","network_admin","academic_content_creator"]){
      expect(hasValidAccessGrantScope({role,organizationId:"org",siteId:null})).toBe(true);
      expect(hasValidAccessGrantScope({role,organizationId:"org",siteId:"site"})).toBe(true);
      expect(hasValidAccessGrantScope({role,organizationId:null,siteId:"site"})).toBe(false);
      expect(hasValidAccessGrantScope({role,organizationId:null,siteId:null})).toBe(false);
      expect(hasValidAccessGrantScope({role,organizationId:" ",siteId:null})).toBe(false);
      expect(hasValidAccessGrantScope({role,organizationId:"org",siteId:" "})).toBe(false);
    }
  });
});
