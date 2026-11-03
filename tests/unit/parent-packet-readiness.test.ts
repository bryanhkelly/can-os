import { describe, expect, it } from "vitest";
import { projectApprovedParentInformation, verifiedPublicClaim } from "@/domain/parent-information";
import { projectPublicInformationReadiness } from "@/domain/public-information-readiness";
import { renderParentPacket } from "@/domain/parent-packet";

function profile(){
  return projectApprovedParentInformation({
    site:{name:"East <Academy>",organizationName:"Partner Church"},
    academicPrograms:[],
    localContent:null,
    offerings:[],
  });
}
describe("approved parent packet and independent publishing gates", () => {
  it("does not expose unapproved fields and escapes public school names", () => {
    const p=profile();
    p.tuition.description={value:"$500 <unapproved>",source:"institutional_record",
      audience:"public",status:"planned",revision:1,canDisplay:false};
    const html=renderParentPacket(p,new Date("2026-11-03T00:00:00Z"));
    expect(html).toContain("East &lt;Academy&gt;");
    expect(html).not.toContain("$500");
    expect(html).toContain("Request institution-approved tuition");
    expect(html).toContain("Generated 2026-11-03");
  });
  it("displays only approved claims and does not persist private identifiers", () => {
    const p=profile();
    p.tuition.description=verifiedPublicClaim("Approved tuition information","institutional_record",2);
    p.site.contact=verifiedPublicClaim("admissions@example.org","organization_site");
    const html=renderParentPacket(p,new Date("2026-11-03T00:00:00Z"));
    expect(html).toContain("Approved tuition information");
    expect(html).toContain("admissions@example.org");
    expect(html).not.toContain("<script");
  });
  it("keeps public completeness independent of admissions, host and operating gates", () => {
    const r=projectPublicInformationReadiness({
      profile:profile(),marketingPublished:true,externalHostReachable:false,
      admissionsAuthorized:false,openingConfirmed:false,
    });
    expect(r.marketing).toBe("published");
    expect(r.externalHost).toBe("unverified");
    expect(r.admissions).toBe("not_authorized");
    expect(r.opening).toBe("not_confirmed");
    expect(r.information).toBe("incomplete");
    expect(r.gaps.find(g=>g.category==="tuition")?.required).toBe(false);
    expect(r.gaps.every(g=>g.destination.startsWith("/"))).toBe(true);
  });
});
