import { describe,expect,it } from "vitest";
import { suggestMarketingStarterV61 } from "../src/domain/site-marketing-suggestions-v61";
import { emptySiteStoryV61 } from "../src/domain/site-information-v61";
import { emptySiteProgramsAudiencesV61 } from "../src/domain/site-launch-preferences";

describe("Introduce V6.1 reuses established Site information",()=>{
  const empty={story:null,intent:null,websiteCopy:null};
  it("keeps the existing factual-claim-safe fallback for Sites without saved details",()=>{
    const draft=suggestMarketingStarterV61("Riverbend","site-announcement",empty);
    expect(draft.content.message).toContain("exploring");
    expect(draft.sources).toEqual([]);
    expect(draft.websiteAlternative).toBeNull();
  });
  it("uses selected Story values and Program intent as proposed plans, without private narratives",()=>{
    const story={...emptySiteStoryV61(),values:["belonging","service"] as Array<"belonging"|"service">,
      foundingStory:"PERSONAL PRIVATE STORY",communityNeed:"CONFIDENTIAL COMMUNITY NEED",
      experiences:["confidence","purpose"] as Array<"confidence"|"purpose">};
    const intent={...emptySiteProgramsAudiencesV61(),
      interestIds:["grades-9-12","summer"] as Array<"grades-9-12"|"summer">,
      startingFocus:"grades-9-12" as const};
    const result=suggestMarketingStarterV61("Riverbend","site-announcement",{story,intent,websiteCopy:null});
    expect(result.content.message).toMatch(/high school learning/i);
    expect(result.content.message).toMatch(/belonging and service/i);
    expect(result.content.message).not.toContain("PERSONAL PRIVATE STORY");
    expect(result.content.message).not.toContain("CONFIDENTIAL COMMUNITY NEED");
    expect(result.content.message.toLowerCase()).not.toContain("enrollment is open");
    expect(result.sources).toEqual([
      "Site Information · Purpose & Story",
      "Establish · Programs & Audiences",
    ]);
  });
  it("reuses intended learner audiences without importing contacts",()=>{
    const intent={...emptySiteProgramsAudiencesV61(),interestIds:["summer"] as ["summer"],
      audienceIds:["children","adults","older_adults"] as ["children","adults","older_adults"]};
    const result=suggestMarketingStarterV61("Riverbend","interest-invitation",{
      story:null,intent,websiteCopy:null,
    });
    expect(result.content.audiences).toEqual(["families","adult-learners","older-adults"]);
    expect(result.content).not.toHaveProperty("recipients");
  });
  it("provides saved Website copy as an explicit alternative, not an automatic override",()=>{
    const websiteCopy={heroHeadline:"A new kind of community",schoolVision:"An editable, saved Site vision"};
    const result=suggestMarketingStarterV61("Riverbend","interest-invitation",{
      story:null,intent:null,websiteCopy,
    });
    expect(result.content.message).not.toContain("An editable");
    expect(result.websiteAlternative?.message).toBe("An editable, saved Site vision");
    expect(result.websiteAlternative?.headline).toBe("A new kind of community");
  });
  it("never proposes protected website claims or raw markup for alternative copy",()=>{
    const result=suggestMarketingStarterV61("Riverbend","site-announcement",{
      story:null,intent:null,
      websiteCopy:{heroHeadline:"Now enrolling in our accredited school",
        welcomeMessage:"<em>Accredited</em> and accepting enrollment"},
    });
    expect(result.websiteAlternative).toBeNull();
  });
  it("keeps suggested content within package bounds for large or unexpected Site names",()=>{
    const result=suggestMarketingStarterV61("A".repeat(900),"program-interest",{
      story:null,
      intent:{...emptySiteProgramsAudiencesV61(),interestIds:["afterschool"],startingFocus:"afterschool"},
      websiteCopy:null,
    });
    expect(result.content.headline.length).toBeLessThanOrEqual(160);
    expect(result.content.message.length).toBeLessThanOrEqual(1600);
  });
});
