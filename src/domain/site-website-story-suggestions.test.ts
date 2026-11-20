import { describe, expect, it } from "vitest";
import { emptySiteStoryV61 } from "./site-information-v61";
import {
  prepareWebsiteCopyFromSiteInformation, suggestWebsiteCopyFromStory,
} from "./site-website-story-suggestions";
import {
  createSchoolWebsiteStarterContent, siteLocalContentLimits,
} from "./site-local-content";

describe("Purpose & Story as reviewable website draft source", () => {
  const story={
    ...emptySiteStoryV61(),
    values:["service","family"] as Array<"service"|"family">,
    motivations:["belonging","access"] as Array<"belonging"|"access">,
    distinctives:["community"] as Array<"community">,
    experiences:["known","confidence"] as Array<"known"|"confidence">,
    foundingStory:"Our neighbors began meeting to imagine a learning community where families could work together.",
    communityNeed:"Families in the neighborhood have asked for accessible learning options.",
    futureVision:"We envision a community rooted in learning, service, and connection.",
  };
  it("does not fabricate source content when Site Information is empty", () => {
    expect(suggestWebsiteCopyFromStory(emptySiteStoryV61(),"Example")).toEqual([]);
  });
  it("uses written origin, community need, and future vision alongside selected values", () => {
    const options=suggestWebsiteCopyFromStory(story,"Example Site");
    const candidate=(field:string)=>options.find(item=>item.field===field);
    expect(options).toHaveLength(5);
    expect(candidate("heroHeadline")?.sourceFields).toContain("motivations");
    expect(candidate("welcomeMessage")?.sourceFields).toContain("experiences");
    expect(candidate("localDescription")?.text).toContain("Our neighbors began meeting");
    expect(candidate("localDescription")?.sourceFields).toEqual(["foundingStory"]);
    expect(candidate("schoolVision")?.text).toBe(story.futureVision);
    expect(candidate("communityOutreach")?.text).toBe(story.communityNeed);
    for(const draft of options)
      expect(draft.text.length).toBeLessThanOrEqual(siteLocalContentLimits[draft.field]);
  });
  it("prefills only starter fields and never overwrites an already authored field", () => {
    const starter=createSchoolWebsiteStarterContent("Example Site");
    const candidates=suggestWebsiteCopyFromStory(story,"Example Site");
    const draft=prepareWebsiteCopyFromSiteInformation(starter,candidates);
    expect(draft.localDescription).toContain("Our neighbors");
    expect(draft.schoolVision).toBe(story.futureVision);
    expect(starter.localDescription).not.toContain("Our neighbors");
    expect(draft.editorialBaseline).toEqual(starter.editorialBaseline);
    const edited={...draft,localDescription:"A carefully edited description of our actual Site."};
    const refreshed=prepareWebsiteCopyFromSiteInformation(edited,candidates);
    expect(refreshed.localDescription).toBe(edited.localDescription);
  });
  it("bounds long text, strips markup and does not autofill protected institutional claims",()=>{
    const input={...story,
      foundingStory:"We are accredited and authorized by our state to offer grades 6-12.",
      futureVision:"Everyone deserves an opportunity to learn. "+"Learning and community. ".repeat(150),
      communityNeed:"Help families <script>alert('x')</script> find support.",
    };
    const options=suggestWebsiteCopyFromStory(input,"Example Site");
    const mapped=Object.fromEntries(options.map(item=>[item.field,item]));
    expect(mapped.localDescription).toBeDefined();
    expect(mapped.localDescription?.text).not.toContain("<script>");
    expect(mapped.schoolVision).toBeDefined();
    expect(mapped.schoolVision?.text.length).toBeLessThanOrEqual(siteLocalContentLimits.schoolVision);
    const draft=prepareWebsiteCopyFromSiteInformation(createSchoolWebsiteStarterContent("Example Site"),options);
    expect(draft.localDescription).not.toContain("accredited");
    expect(draft.schoolVision).toBeDefined();
    expect(draft.schoolVision?.length).toBeLessThanOrEqual(siteLocalContentLimits.schoolVision);
  });
});
