import { describe, expect, it } from "vitest";
import {
  projectProgramOfferingJourneys,
  type JourneyCandidate,
  type JourneyRelease,
  type JourneyTemplate,
} from "@/domain/program-offering-journey-v61";

const siteA = "11110000-0000-4000-8000-000000000001";
const siteB = "11110000-0000-4000-8000-000000000002";
const makeRecipe = (overrides: Partial<JourneyTemplate> = {}): JourneyTemplate => ({
  blueprintVersionId: "version-custom",
  title: "Custom Training",
  versionNo: 1,
  programCode: "can.program.custom_training",
  offeringCode: "CLC-CUSTOM-TRAINING-01",
  linkedPublishedOffering: null,
  components: [{ key: "knowledge_check" }, { key: "feedback_survey" }],
  ...overrides,
});
const published = { offeringVersionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" };

describe("reusable Program-to-Offering journey", () => {
  it("preserves both independently chosen pilot Programs and their exact Solution codes", () => {
    const result = projectProgramOfferingJourneys({
      programCodes: ["can.program.custom_training", "can.program.ai_digital_skills"],
      templates: [
        makeRecipe(),
        makeRecipe({
          blueprintVersionId: "version-digital",
          title: "AI & Digital Skills",
          programCode: "can.program.ai_digital_skills",
          offeringCode: "CLC-DIGITAL-01",
          components: [{ key: "four_session_calendar" }],
        }),
      ],
      plans: [],
      siteId: siteA,
    });
    expect(result).toHaveLength(2);
    expect(result.map(item => item.solution?.offeringCode)).toEqual([
      "CLC-CUSTOM-TRAINING-01", "CLC-DIGITAL-01",
    ]);
    expect(result[0]?.facilitatedFourSessions).toBe(false);
    expect(result[1]?.facilitatedFourSessions).toBe(true);
    expect(result.every(item => item.publisherCandidateCount === null)).toBe(true);
    expect(result.every(item => item.offeringPublished === false)).toBe(true);
  });

  it("never interprets a draft Offering or saved Blueprint as published training", () => {
    const result = projectProgramOfferingJourneys({
      programCodes: ["can.program.custom_training", "can.program.custom_training"],
      templates: [makeRecipe()],
      plans: [{ configurationId: "saved-plan", blueprintVersionId: "version-custom", lifecycle: "frozen" }],
      siteId: siteA,
      candidates: [],
      releases: [],
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.savedPlan?.lifecycle).toBe("frozen");
    expect(result[0]?.offeringPublished).toBe(false);
    expect(result[0]?.openRegistrationCount).toBe(0);
  });

  it("keeps the pinned Solution version instead of silently switching to a new one", () => {
    const result = projectProgramOfferingJourneys({
      programCodes: ["can.program.custom_training"],
      templates: [
        makeRecipe({ versionNo: 1, blueprintVersionId: "saved-v1" }),
        makeRecipe({ versionNo: 2, blueprintVersionId: "new-v2" }),
      ],
      plans: [{ configurationId: "saved-plan", blueprintVersionId: "saved-v1", lifecycle: "draft" }],
      siteId: siteA,
    });
    expect(result[0]?.solution?.blueprintVersionId).toBe("saved-v1");
  });

  it("prevents other Site's candidates or releases from looking enrollable", () => {
    const candidates: JourneyCandidate[] = [{
      offeringCode: "CLC-DIGITAL-01",
      siteOptions: [{ id: siteB }],
      digitalSiteOptions: [],
    }];
    const releases: JourneyRelease[] = [
      { offeringCode: "CLC-DIGITAL-01", siteId: siteB, status: "published",
        opensAt: "2026-11-19T00:00:00Z", closesAt: "2026-11-22T00:00:00Z" },
    ];
    const result = projectProgramOfferingJourneys({
      programCodes: ["can.program.ai_digital_skills"],
      templates: [makeRecipe({ programCode: "can.program.ai_digital_skills",
        linkedPublishedOffering: published, offeringCode: "CLC-DIGITAL-01" })],
      plans: [],
      siteId: siteA, candidates, releases, now: new Date("2026-11-20T00:00:00Z"),
    });
    expect(result[0]?.offeringPublished).toBe(true);
    expect(result[0]?.publisherCandidateCount).toBe(0);
    expect(result[0]?.releasedCount).toBe(0);
    expect(result[0]?.openRegistrationCount).toBe(0);
  });

  it("counts only the authorized Site's currently open published registration releases", () => {
    const candidate: JourneyCandidate = {
      offeringCode: "CLC-CUSTOM-TRAINING-01", siteOptions: [],
      digitalSiteOptions: [{ id: siteA }],
    };
    const releases: JourneyRelease[] = [
      { offeringCode: candidate.offeringCode, siteId: siteA, status: "published",
        opensAt: "2026-11-19T00:00:00Z", closesAt: "2026-11-22T00:00:00Z" },
      { offeringCode: candidate.offeringCode, siteId: siteA, status: "closed",
        opensAt: "2026-11-19T00:00:00Z", closesAt: "2026-11-22T00:00:00Z" },
      { offeringCode: candidate.offeringCode, siteId: siteA, status: "published",
        opensAt: "2026-11-01T00:00:00Z", closesAt: "2026-11-10T00:00:00Z" },
      { offeringCode: candidate.offeringCode, siteId: siteB, status: "published",
        opensAt: "2026-11-19T00:00:00Z", closesAt: "2026-11-22T00:00:00Z" },
    ];
    const result = projectProgramOfferingJourneys({
      programCodes: ["can.program.custom_training"],
      templates: [makeRecipe({ linkedPublishedOffering: published })],
      plans: [],siteId:siteA,candidates:[candidate],releases,
      now:new Date("2026-11-20T00:00:00Z"),
    });
    expect(result[0]?.publisherCandidateCount).toBe(1);
    expect(result[0]?.releasedCount).toBe(3);
    expect(result[0]?.openRegistrationCount).toBe(1);
  });
});
