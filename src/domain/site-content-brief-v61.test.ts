import { describe,it,expect } from "vitest";
import { projectSiteContentBriefV61 } from "./site-content-brief-v61";
import { emptySiteStoryV61 } from "./site-information-v61";
const input={
  siteId:"123e4567-e89b-42d3-a456-426614174000",
  siteName:"Community Learning",timezone:"America/New_York",
  siteRevision:"2026-11-21T18:00:00.000Z",
  metadata:{
    siteStoryV61:{
      schemaVersion:1,revision:"2026-11-21T17:00:00.000Z",
      answers:{...emptySiteStoryV61(),foundingStory:"Private founding account"},
      changedByPersonId:"123e4567-e89b-42d3-a456-426614174001",
      updatedAt:"2026-11-21T17:00:00.000Z",status:"private_source",
    },
    launchPreferences:{delivery:"both",interestIds:["adult"],audienceIds:["adults"],
      experienceIds:["financial-literacy"],
      experienceDetails:[{id:"financial-literacy",
        activityIds:["creating-a-budget"],outcomeIds:[],
        audienceIds:["adults"],programIds:["adult"],priority:"featured"}]},
  },
};
describe("shared Site Content Brief V6.1",()=>{
  it("projects structured Experiences with source revisions and consented Story",()=>{
    const brief=projectSiteContentBriefV61({...input,
      websiteContent:{contentReuseConsent:"granted",heroHeadline:"Community welcome"},
      websiteContentRevision:3});
    expect(brief.story?.foundingStory).toBe("Private founding account");
    expect(brief.sourceRevisions.websiteContentRevision).toBe(3);
    expect(brief.experiences[0]).toMatchObject({
      title:"Financial Literacy",priority:"featured",proposed:true,
      audiences:["adults"],programs:["adult"]});
    expect(brief.experiences[0]?.activities).toContain("Creating a budget");
  });
  it("does not expose private text when content reuse is denied or undecided",()=>{
    for(const status of ["denied","unselected"] as const){
      const brief=projectSiteContentBriefV61({...input,
        websiteContent:{contentReuseConsent:status,heroHeadline:"Private copy"}});
      expect(brief.story).toBeNull();
      expect(brief.websiteCopy).toBeNull();
      expect(JSON.stringify(brief)).not.toContain("Private founding account");
      expect(JSON.stringify(brief)).not.toContain("Private copy");
    }
  });
  it("rejects invalid saved Story instead of inventing an empty source",()=>{
    expect(()=>projectSiteContentBriefV61({...input,
      metadata:{...input.metadata,siteStoryV61:{bad:"source"}},
    })).toThrow(/requires review/);
  });
});
