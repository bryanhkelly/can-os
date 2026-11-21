import { describe,expect,it } from "vitest";
import {
  siteExperienceGroups,siteExperienceCatalog,siteExperienceById,
  siteExperienceIds,siteExperienceLimit,siteExperienceOutcomes,
  describeSiteExperience,
} from "./site-experience-interests";
import {
  applySiteProgramsAudiencesV61,readSiteProgramsAudiencesV61,
  siteProgramsAudiencesV61SaveSchema,snapshotSiteExperienceVision,
} from "./site-launch-preferences";
import { defaultSiteContentChannelConfig,resolveSiteContentBlocks,projectSiteExperienceItems } from "./site-content-channels";

const plan={
  interestIds:["adult"] as Array<"adult">,
  timingIds:[] as Array<"weekdays">,
  audienceIds:["adults"] as Array<"adults">,
  startingFocus:null,
  experienceIds:["voting-elections","financial-literacy","robotics"] as Array<
    "voting-elections"|"financial-literacy"|"robotics">,
  experienceDetails:[{
    id:"voting-elections" as const,
    activityIds:["first-time-voting","understanding-the-ballot"],
    outcomeIds:["civic","confidence"] as Array<"civic"|"confidence">,
    audienceIds:["adults"] as Array<"adults">,
    programIds:["adult"] as Array<"adult">,
    priority:"featured" as const,
  }],
};
describe("Site Experience Catalog v2",()=>{
  it("exposes twelve distinct groups, a broad topic catalog and all legacy topic IDs",()=>{
    expect(siteExperienceGroups).toHaveLength(12);
    expect(siteExperienceCatalog.length).toBeGreaterThanOrEqual(70);
    expect(new Set(siteExperienceCatalog.map(item=>item.id)).size).toBe(siteExperienceCatalog.length);
    expect(new Set(siteExperienceGroups.map(item=>item.id)).size).toBe(12);
    const legacy=[
      "digital-confidence","career-skills","arts-creativity","wellness-movement",
      "social-connection","trips-excursions","financial-literacy","community-service",
      "science-makers","study-support","languages-cultures","clubs-leadership",
      "outdoor-discovery","family-learning",
    ];
    for(const id of legacy)expect(siteExperienceById.has(id as typeof siteExperienceIds[number])).toBe(true);
    expect(siteExperienceCatalog.every(item=>item.groupIds.length>0&&item.activities.length>=5)).toBe(true);
    expect(siteExperienceOutcomes.length).toBeGreaterThanOrEqual(10);
  });
  it("saves structured choices alongside Programs and audiences without a new database",()=>{
    const stored=applySiteProgramsAudiencesV61(null,plan,"both");
    const result=readSiteProgramsAudiencesV61(stored);
    expect(result.experienceIds).toEqual(plan.experienceIds);
    expect(result.experienceDetails?.[0]?.outcomeIds).toEqual(["civic","confidence"]);
    expect(result.experienceDetails?.[0]?.priority).toBe("featured");
    expect(stored.delivery).toBe("both");
  });
  it("rejects more than five including legacy custom ideas, too many chips, or invalid chip IDs",()=>{
    const sixth=siteExperienceCatalog.slice(0,siteExperienceLimit+1).map(item=>item.id);
    expect(siteProgramsAudiencesV61SaveSchema.safeParse({
      ...plan,experienceIds:sixth,experienceDetails:[],
    }).success).toBe(false);
    expect(siteProgramsAudiencesV61SaveSchema.safeParse({
      ...plan,experienceIds:siteExperienceCatalog.slice(0,5).map(item=>item.id),
      experienceDetails:[],customExperiences:["Local idea"],
    }).success).toBe(false);
    expect(siteProgramsAudiencesV61SaveSchema.safeParse({
      ...plan,experienceDetails:[{...plan.experienceDetails[0],
        activityIds:["first-time-voting","understanding-the-ballot",
          "voter-registration-education","local-elections","election-volunteering"],
      }],
    }).success).toBe(false);
    expect(siteProgramsAudiencesV61SaveSchema.safeParse({
      ...plan,experienceDetails:[{...plan.experienceDetails[0],
        outcomeIds:["confidence","civic","service","knowledge"],
      }],
    }).success).toBe(false);
    expect(siteProgramsAudiencesV61SaveSchema.safeParse({
      ...plan,experienceDetails:[{...plan.experienceDetails[0],activityIds:["unlisted-activity"]}],
    }).success).toBe(false);
  });
  it("generates wording from real chips instead of a generic category description",()=>{
    const topic=siteExperienceById.get("voting-elections")!;
    const copy=describeSiteExperience(topic,plan.experienceDetails[0]);
    expect(copy).toContain("First-time voting");
    expect(copy).toContain("Understanding the ballot");
    expect(copy).toContain("participate in civic life");
    expect(copy).not.toContain("enroll");
  });
  it("pins public Experience content until the site explicitly republishes",()=>{
    const original=applySiteProgramsAudiencesV61(null,plan,"physical");
    const published=snapshotSiteExperienceVision(original);
    const edited=applySiteProgramsAudiencesV61(original,{
      ...plan,experienceIds:["robotics"],experienceDetails:[],
    },"physical");
    const publicBlocks=resolveSiteContentBlocks(defaultSiteContentChannelConfig,{
      mode:"public",preferences:edited,publishedExperiences:published,
      publishedExperienceCards:projectSiteExperienceItems(published),
    }).filter(block=>block.channel==="learning.experiences");
    const privateBlocks=resolveSiteContentBlocks(defaultSiteContentChannelConfig,{
      mode:"private",preferences:edited,
    }).filter(block=>block.channel==="learning.experiences");
    expect(publicBlocks[0]?.items.map(item=>item.title)).toEqual([
      "Voting & Elections","Financial Literacy","Robotics",
    ]);
    expect(publicBlocks[0]?.items[0]?.description).toContain("First-time voting");
    expect(privateBlocks[0]?.items.map(item=>item.title)).toEqual(["Robotics"]);
    const unpublished=resolveSiteContentBlocks(defaultSiteContentChannelConfig,{
      mode:"public",preferences:edited,
    });
    expect(unpublished.some(block=>block.channel==="learning.experiences")).toBe(false);
  });
});
