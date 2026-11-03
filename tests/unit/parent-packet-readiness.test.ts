import { describe, expect, it } from "vitest";
import { projectApprovedParentInformation, unconfiguredClaim, verifiedPublicClaim } from "@/domain/parent-information";
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
  it("requires reviewed address and tuition for an information-complete school profile",()=>{
    const p=profile();
    const r=projectPublicInformationReadiness({
      profile:p,siteId:"5d7a7cf5-00b7-4b38-82db-8f334c5af889",
      marketingPublished:true,externalHostReachable:true,
      admissionsAuthorized:true,openingConfirmed:true,
    });
    const location=r.gaps.find(g=>g.message.includes("public-facing location"));
    const tuition=r.gaps.find(g=>g.message.includes("tuition/fee statement"));
    expect(location?.required).toBe(true);
    expect(location?.destination).toBe("/sites/5d7a7cf5-00b7-4b38-82db-8f334c5af889/parent-information");
    expect(tuition?.required).toBe(true);
    expect(r.information).toBe("incomplete");
    expect(r.marketing).toBe("published");
  });

  it("matches Program schedules by ID even for duplicate Program names and grades",()=>{
    const make=(programId:string)=>({
      programId,title:"Shared Academy Title",
      summary:"Reviewed instruction",typeLabel:"Academy",
      grades:{min:"K",max:"5"},
      delivery:{onsite:true,asynchronous:false,liveOnline:false,onsiteDaysPerWeek:2},
      availability:"planned" as const,
    });
    const p=projectApprovedParentInformation({
      site:{name:"Oak Academy",organizationName:"Partner Church"},
      academicPrograms:[make("program-a"),make("program-b")],
      offerings:[],localContent:null,
      programSchedules:[{
        programId:"program-a",
        name:verifiedPublicClaim("Shared Academy Title","program_publication"),
        grades:verifiedPublicClaim({min:"K",max:"5"},"program_publication"),
        timezone:verifiedPublicClaim("America/Los_Angeles","calendar",9),
        effectiveFrom:unconfiguredClaim<string>("calendar"),
        effectiveThrough:unconfiguredClaim<string>("calendar"),
        weeklyPattern:verifiedPublicClaim([
          {dayOfWeek:0,startsAtLocal:"09:00",endsAtLocal:"10:00",
            timezone:"America/Los_Angeles"},
        ],"calendar",9),
      }],
    });
    const r=projectPublicInformationReadiness({
      profile:p,marketingPublished:true,externalHostReachable:false,
      admissionsAuthorized:false,openingConfirmed:false,
    });
    expect(r.gaps.filter(g=>g.category==="school_day")).toHaveLength(1);
    expect(r.gaps.find(g=>g.category==="school_day")?.required).toBe(true);
  });

  it("prints only reviewed Site address, consented biographies, signed multi-Program days and dates",()=>{
    const p=projectApprovedParentInformation({
      site:{name:"East Academy",organizationName:"Partner Church"},
      academicPrograms:[],localContent:null,offerings:[],
      publicAddress:verifiedPublicClaim("123 Public Road, Oakland","organization_site",5),
      people:[{displayName:"Dr. A. Example",publicTitle:"Lead Teacher",
        biography:"A reviewed <science> teaching biography."}],
      programSchedules:[],
    });
    p.programSchedules=[{
      programId:"published-a",
      name:verifiedPublicClaim("Early Years","program_publication"),
      grades:verifiedPublicClaim({min:"K",max:"5"},"program_publication"),
      timezone:verifiedPublicClaim("America/Los_Angeles","calendar",9),
      effectiveFrom:verifiedPublicClaim("2026-09-01","calendar",9),
      effectiveThrough:verifiedPublicClaim("2027-06-30","calendar",9),
      weeklyPattern:verifiedPublicClaim([
        {dayOfWeek:0,startsAtLocal:"09:00",endsAtLocal:"10:00",
          timezone:"America/Los_Angeles"},
        {dayOfWeek:0,startsAtLocal:"11:00",endsAtLocal:"12:00",
          timezone:"America/Los_Angeles"},
      ],"calendar",9),
    }];
    const html=renderParentPacket(p,new Date("2026-11-03T00:00:00Z"));
    expect(html).toContain("123 Public Road, Oakland");
    expect(html).toContain("Early Years");
    expect(html).toContain("Sunday · 09:00–10:00");
    expect(html).toContain("Sunday · 11:00–12:00");
    expect(html).toContain("Effective 2026-09-01 to 2027-06-30");
    expect(html).toContain("A reviewed &lt;science&gt;");
    expect(html).not.toContain("<science>");
    expect(html).toContain("Holidays and one-off calendar changes");
  });

  it("reports distinct Site fact and Program schedule review gaps with owned links", () => {
    const p=projectApprovedParentInformation({
      site:{name:"Oak Academy",organizationName:"Oak Church"},
      academicPrograms:[{
        programId:"published-school-a",title:"Early Program",
        summary:"Reviewed Program",typeLabel:"Academy",
        grades:{min:"K",max:"5"},
        delivery:{onsite:true,asynchronous:false,liveOnline:false,onsiteDaysPerWeek:2},
        availability:"planned",
      }],
      offerings:[],localContent:null,
    });
    const diagnostics=projectPublicInformationReadiness({
      profile:p,siteId:"5d7a7cf5-00b7-4b38-82db-8f334c5af889",
      marketingPublished:true,externalHostReachable:false,
      admissionsAuthorized:false,openingConfirmed:false,
    });
    expect(diagnostics.gaps.some(g=>g.category==="identity_contact" &&
      g.message.includes("private legal/physical address"))).toBe(true);
    expect(diagnostics.gaps.find(g=>g.category==="school_day")?.message).toContain("Early Program");
    expect(diagnostics.gaps.find(g=>g.category==="school_day")?.destination)
      .toBe("/operations/school-years");
    expect(diagnostics.gaps.some(g=>g.category==="leadership")).toBe(true);
    expect(diagnostics.gaps.find(g=>g.category==="identity_contact" &&
      g.message.includes("public contact"))?.destination).toContain("/sites/5d7a7cf5");
  });

});
