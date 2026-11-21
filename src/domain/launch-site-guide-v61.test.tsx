import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { emptySiteProgramsAudiencesV61 } from "./site-launch-preferences";
import { siteInformationGuideV61, programsAudiencesGuideV61 } from "./launch-site-guide-v61";
import { SiteGuideV61 } from "@/components/launch-studio/SiteGuideV61";

describe("V6.1 contextual Site Guide", () => {
  it("reflects selected Site type and hosting without inventing affiliation", () => {
    const result = siteInformationGuideV61(0, {
      siteType: "church_community", hostingMode: "different", delivery: "",
      values: [], networkChoice: "independent",
    });
    expect(result.highlights).toContain("Church or faith community");
    expect(result.highlights).toContain("Different host planned");
    expect(result.connection).toContain("does not establish");
  });

  it("gives mission-specific inspiration without reusing raw private story text", () => {
    const result = siteInformationGuideV61(3, {
      siteType: "training_workforce", hostingMode: "same", delivery: "digital",
      values: ["service", "opportunity"], networkChoice: "independent",
    });
    expect(result.highlights).toEqual(["Service", "Opportunity"]);
    expect(result.insight).toContain("skills or opportunities");
    expect(result.connection).toContain("With your permission");
  });

  it("tailors a private Purpose & Story example to the Site's saved plans and values", () => {
    const planning = {
      ...emptySiteProgramsAudiencesV61(),
      interestIds: ["senior"] as Array<"senior">,
      audienceIds: ["older_adults"] as Array<"older_adults">,
    };
    const result = siteInformationGuideV61(3, {
      siteType: "community_nonprofit", hostingMode: "same", delivery: "physical",
      values: ["service", "belonging"], networkChoice: "independent", planning,
    });
    expect(result.highlights).toEqual(["Service", "Belonging", "Older adults"]);
    expect(result.insight).toContain("older adults");
    expect(result.insight).toContain("service");
    expect(result.insight).toContain("Make this your own");
    expect(result.insight).not.toContain("approved");
  });

  it("adapts audience and Experience guidance to current planning selections", () => {
    const plan = {
      ...emptySiteProgramsAudiencesV61(), interestIds: ["senior"] as Array<"senior">,
      audienceIds: ["older_adults"] as Array<"older_adults">,
      experienceIds: ["financial-literacy"] as Array<"financial-literacy">,
    };
    const audience = programsAudiencesGuideV61(1, plan);
    const experience = programsAudiencesGuideV61(2, plan, [], "personalize");
    expect(audience.highlights).toContain("Older adults");
    expect(audience.insight).toContain("caregivers");
    expect(experience.highlights).toContain("Financial Literacy");
    expect(experience.insight).toContain("hoped-for outcomes");
  });

  it("does not expose unknown Program codes or imply that planning authorizes enrollment", () => {
    const plan = {
      ...emptySiteProgramsAudiencesV61(), interestIds: ["adult"] as Array<"adult">,
      programCodes: ["retired.unpublished_program"],
    };
    const guide = programsAudiencesGuideV61(0, plan, []);
    expect(JSON.stringify(guide)).not.toContain("retired.unpublished_program");
    expect(guide.summary).toContain("not offerings currently open");
  });

  it("renders a single accessible companion with context, insight and connection", () => {
    const html = renderToStaticMarkup(<SiteGuideV61 guide={{
      summary: "You're exploring financial skills.",
      highlights: ["Older adults", "Financial literacy"],
      insight: "Consider trusted community partners.",
      connection: "This can inform your outreach.",
    }}/>);
    expect(html).toContain("Site Guide");
    expect(html).toContain('aria-label="Worth considering"');
    expect(html).toContain('aria-label="How this connects"');
    expect(html).toContain("Older adults");
    expect(html).not.toContain("What comes next");
  });

  it("escapes draft-provided labels rather than injecting markup", () => {
    const html = renderToStaticMarkup(<SiteGuideV61 guide={{
      highlights: ["<img src=x onerror=alert(1)>"],
    }}/>);
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(html).not.toContain("<img");
  });
});
