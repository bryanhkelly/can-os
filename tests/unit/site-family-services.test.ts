import {describe,expect,it} from "vitest";
import {
  siteFamilyServicesSchema,projectPublicFamilyServices,readSiteFamilyServices,
} from "@/domain/site-family-services";
const id="e7bf4692-3470-48a8-98a2-d70da3d4e4f6";
const snapshot={
  version:1 as const,revision:2,reviewedByPersonId:id,
  reviewedAt:"2026-11-02T10:00:00.000Z",
  entries:[
    {category:"meals" as const,status:"available" as const,
      description:"Lunch is available for enrolled students.",
      evidenceReference:"Reviewed food services contract",expiresOn:"2026-12-31"},
    {category:"transportation" as const,status:"planned" as const,
      description:"Exploring a family shuttle service.",
      evidenceReference:null,expiresOn:null},
    {category:"before_care" as const,status:"not_offered" as const,
      description:"",evidenceReference:null,expiresOn:null},
  ],
};
describe("reviewed family service projections",()=>{
  it("labels proposed services without claiming operating availability",()=>{
    const projected=projectPublicFamilyServices({familyServices:snapshot},
      new Date("2026-11-03T00:00:00Z"));
    expect(projected.find(item=>item.category==="meals")?.description.value)
      .toContain("Lunch");
    expect(projected.find(item=>item.category==="transportation")?.description.value)
      .toContain("not currently available");
    expect(projected.find(item=>item.category==="before_care")?.description.value)
      .toBe("Not offered");
    expect(projected.find(item=>item.category==="after_care")?.description.canDisplay)
      .toBe(false);
  });
  it("withdraws stale services and malformed snapshots",()=>{
    const expired=projectPublicFamilyServices({familyServices:snapshot},
      new Date("2027-01-05T00:00:00Z"));
    expect(expired[0]?.description.canDisplay).toBe(false);
    expect(readSiteFamilyServices({familyServices:{...snapshot,
      entries:[snapshot.entries[0],snapshot.entries[0]]}})).toBeNull();
  });
  it("includes consented/reviewed communication and family visit descriptions",()=>{
    const result=projectPublicFamilyServices({familyServices:{
      ...snapshot,entries:[...snapshot.entries,
        {category:"communication",status:"available",
          description:"Families can contact the reviewed school office.",
          evidenceReference:"Reviewed office communication plan",expiresOn:null},
        {category:"family_visits",status:"planned",
          description:"Information sessions are under consideration.",
          evidenceReference:null,expiresOn:null},
      ],
    }},new Date("2026-11-03T00:00:00Z"));
    expect(result.find(item=>item.category==="communication")?.description.value)
      .toContain("Families can contact");
    expect(result.find(item=>item.category==="family_visits")?.description.value)
      .toContain("not currently available");
  });
  it("requires substantive evidence for a claimed available service",()=>{
    const result=siteFamilyServicesSchema.safeParse({
      ...snapshot,entries:[{...snapshot.entries[0],evidenceReference:null}],
    });
    expect(result.success).toBe(false);
  });
});
