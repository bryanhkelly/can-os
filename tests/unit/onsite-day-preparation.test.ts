import { describe, expect, it } from "vitest";
import { assertSchoolDayPreparation } from "@/domain/onsite-day-preparation";
import type { AccessContext } from "@/domain/access-context";
const actor={role:"site_leader",actorPersonId:"director",accountId:"account",sessionId:"session",grantId:"grant",grantSiteId:"site",
  capabilities:new Set(["onsite.attendance.record"]),scope:{organizationIds:["church"],siteIds:["site"],programIds:["program"]}} as AccessContext;
const site={id:"site",organizationId:"church",timezone:"America/Los_Angeles"};
const now=new Date("2026-11-01T01:00:00Z");
describe("director school-day preparation scope",()=>{
  it("allows the local director to prepare tomorrow in school-local time",()=>{
    expect(assertSchoolDayPreparation(actor,site,"2026-11-01",now)).toEqual({today:"2026-10-31",through:"2026-11-30"});
  });
  it.each(["room_facilitator","site_staff","teacher","guardian","registrar"])("does not grant the %s future preparation access",role=>{
    expect(()=>assertSchoolDayPreparation({...actor,role} as AccessContext,site,"2026-11-01",now)).toThrow();
  });
  it("denies another Site, Organization or invalid date window",()=>{
    expect(()=>assertSchoolDayPreparation({...actor,grantSiteId:"other"},site,"2026-11-01",now)).toThrow();
    expect(()=>assertSchoolDayPreparation(actor,{...site,organizationId:"other"},"2026-11-01",now)).toThrow();
    for(const date of ["2026-10-30","2026-12-01","2026-02-30"])
      expect(()=>assertSchoolDayPreparation(actor,site,date,now)).toThrow();
  });
});
