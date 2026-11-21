import { describe,expect,it } from "vitest";
import { suggestMarketingStarterV61 } from "../src/domain/site-marketing-suggestions-v61";
import { emptySiteStoryV61 } from "../src/domain/site-information-v61";
import { emptySiteProgramsAudiencesV61 } from "../src/domain/site-launch-preferences";

describe("Share V6.1 uses consented Shape information",()=>{
  const empty={story:null,intent:null,websiteCopy:null};
  it("does not reuse Site information when consent has not been given",()=>{
    const draft=suggestMarketingStarterV61("Riverbend","site-announcement",empty);
    expect(draft.content.message).toBe("");
    expect(draft.sources).toEqual([]);
    expect(draft.websiteAlternative).toBeNull();
  });
  it("uses selected Story values and Program intent as proposed plans, without private narratives",()=>{
    const story={...emptySiteStoryV61(),motivations:["belonging","access"] as Array<"belonging"|"access">,
      values:["belonging","service"] as Array<"belonging"|"service">,
      foundingStory:"PERSONAL PRIVATE STORY",communityNeed:"CONFIDENTIAL COMMUNITY NEED",
      experiences:["confidence","purpose"] as Array<"confidence"|"purpose">};
    const intent={...emptySiteProgramsAudiencesV61(),
      interestIds:["grades-9-12","summer"] as Array<"grades-9-12"|"summer">,
      startingFocus:"grades-9-12" as const};
    const result=suggestMarketingStarterV61("Riverbend","site-announcement",{reuseAllowed:true,story,intent,websiteCopy:null});
    expect(result.content.message).toMatch(/high school learning/i);
    expect(result.content.message).toMatch(/belonging and educational access/i);
    expect(result.content.message).not.toContain("PERSONAL PRIVATE STORY");
    expect(result.content.message).not.toContain("CONFIDENTIAL COMMUNITY NEED");
    expect(result.content.message.toLowerCase()).not.toContain("enrollment is open");
    expect(result.sources).toEqual([
      "Site Information · Purpose & Story",
      "Shape · Programs & Audiences",
    ]);
  });
  it("reuses intended learner audiences without importing contacts",()=>{
    const intent={...emptySiteProgramsAudiencesV61(),interestIds:["summer"] as ["summer"],
      audienceIds:["children","adults","older_adults"] as ["children","adults","older_adults"]};
    const result=suggestMarketingStarterV61("Riverbend","interest-invitation",{
      reuseAllowed:true,story:null,intent,websiteCopy:null,
    });
    expect(result.content.audiences).toEqual(["families","adult-learners","older-adults"]);
    expect(result.content).not.toHaveProperty("recipients");
  });
  it("prioritizes selected published CAN Programs over broad learning interests",()=>{
    const intent={...emptySiteProgramsAudiencesV61(),
      interestIds:["summer"] as ["summer"],startingFocus:"summer" as const,
      programCodes:["can.program.custom_training","can.program.ai_digital_skills"],
      startingProgramCode:"can.program.ai_digital_skills"};
    const result=suggestMarketingStarterV61("Riverbend","program-interest",{
      reuseAllowed:true,story:null,intent,websiteCopy:null,
      publishedPrograms:[
        {code:"can.program.custom_training",title:"Custom Training"},
        {code:"can.program.ai_digital_skills",title:"AI & Digital Skills"},
      ],
    });
    expect(result.content.headline).toContain("AI & Digital Skills");
    expect(result.content.message).toContain("exploring AI & Digital Skills");
    expect(result.content.message).not.toContain("authorized");
  });
  it("does not expose retired or unknown Program codes in marketing copy",()=>{
    const intent={...emptySiteProgramsAudiencesV61(),
      interestIds:["afterschool"] as ["afterschool"],
      programCodes:["retired.program"],startingProgramCode:"retired.program"};
    const result=suggestMarketingStarterV61("Riverbend","program-interest",{
      reuseAllowed:true,story:null,intent,websiteCopy:null,publishedPrograms:[],
    });
    expect(result.content.message).toContain("after-school activities");
    expect(result.content.message).not.toContain("retired.program");
  });
  it("provides saved Website copy as an explicit alternative, not an automatic override",()=>{
    const websiteCopy={heroHeadline:"A new kind of community",schoolVision:"An editable, saved Site vision"};
    const result=suggestMarketingStarterV61("Riverbend","interest-invitation",{
      reuseAllowed:true,story:null,intent:null,websiteCopy,
    });
    expect(result.content.message).not.toContain("An editable");
    expect(result.websiteAlternative?.message).toBe("An editable, saved Site vision");
    expect(result.websiteAlternative?.headline).toBe("A new kind of community");
  });
  it("never proposes protected website claims or raw markup for alternative copy",()=>{
    const result=suggestMarketingStarterV61("Riverbend","site-announcement",{
      reuseAllowed:true,story:null,intent:null,
      websiteCopy:{heroHeadline:"Now enrolling in our accredited school",
        welcomeMessage:"<em>Accredited</em> and accepting enrollment"},
    });
    expect(result.websiteAlternative).toBeNull();
  });
  it("keeps suggested content within package bounds for large or unexpected Site names",()=>{
    const result=suggestMarketingStarterV61("A".repeat(900),"program-interest",{
      reuseAllowed:true,story:null,
      intent:{...emptySiteProgramsAudiencesV61(),interestIds:["afterschool"],startingFocus:"afterschool"},
      websiteCopy:null,
    });
    expect(result.content.headline.length).toBeLessThanOrEqual(160);
    expect(result.content.message.length).toBeLessThanOrEqual(1600);
  });
});
