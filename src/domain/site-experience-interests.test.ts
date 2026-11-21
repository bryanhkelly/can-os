import { describe, expect, it } from "vitest";
import { siteExperienceCatalog, suggestedSiteExperiences } from "./site-experience-interests";
import {
  applySiteProgramsAudiencesV61, readSiteProgramsAudiencesV61,
  siteProgramsAudiencesV61Schema, siteLaunchPreferencesSchema,
} from "./site-launch-preferences";

describe("Establish Experiences planning", () => {
  const adultPlan={
    interestIds:["adult","senior"] as Array<"adult"|"senior">,
    audienceIds:["adults","older_adults"] as Array<"adults"|"older_adults">,
    timingIds:[] as Array<"weekdays">, startingFocus:null,
    experienceIds:["digital-confidence","arts-creativity"] as Array<"digital-confidence"|"arts-creativity">,
    customExperiences:["Gardening club"],
  };
  it("suggests adult and older-adult experiences without deleting other selected interests",()=>{
    const matches=suggestedSiteExperiences(adultPlan).map(item=>item.id);
    expect(matches).toContain("digital-confidence");
    expect(matches).toContain("social-connection");
    expect(matches).not.toContain("study-support");
    expect(siteExperienceCatalog).toHaveLength(14);
  });
  it("round trips selection through canonical Site metadata and legacy readers",()=>{
    const stored=applySiteProgramsAudiencesV61(null,adultPlan,"physical");
    expect(siteLaunchPreferencesSchema.parse(stored).experienceIds).toEqual(adultPlan.experienceIds);
    expect(readSiteProgramsAudiencesV61(stored).customExperiences).toEqual(["Gardening club"]);
    expect(readSiteProgramsAudiencesV61({delivery:"physical",interestIds:["adult"]})
      .experienceIds).toEqual([]);
  });
  it("keeps experience choices when Program/audience selections change",()=>{
    const saved=applySiteProgramsAudiencesV61(null,adultPlan,"both");
    const changed=applySiteProgramsAudiencesV61(saved,{
      ...adultPlan,interestIds:["grades-9-12"],audienceIds:["teens"],
    },"both");
    expect(changed.experienceIds).toEqual(adultPlan.experienceIds);
    expect(changed.customExperiences).toEqual(["Gardening club"]);
  });
  it("rejects duplicated, HTML and unsupported Experiences",()=>{
    expect(siteProgramsAudiencesV61Schema.safeParse({...adultPlan,
      experienceIds:["digital-confidence","digital-confidence"]}).success).toBe(false);
    expect(siteProgramsAudiencesV61Schema.safeParse({...adultPlan,
      customExperiences:["Painting","painting"]}).success).toBe(false);
    expect(siteProgramsAudiencesV61Schema.safeParse({...adultPlan,
      customExperiences:["<script>alert(1)</script>"]}).success).toBe(false);
    expect(siteProgramsAudiencesV61Schema.safeParse({...adultPlan,
      experienceIds:["official-accredited-program"]}).success).toBe(false);
  });
});
