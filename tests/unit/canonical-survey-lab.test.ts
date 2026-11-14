import { describe, expect, it } from "vitest";
import { inspectIdentifiedNoncreditSurvey, type SurveyPreflightInput } from "@/domain/canonical-survey-lab";

const now = new Date("2026-11-14T16:00:00Z");
const base: SurveyPreflightInput = {
  campaignStatus: "active",
  responseMode: "identified",
  startsAt: new Date("2026-11-01T16:00:00Z"),
  endsAt: null,
  permissionEvidenceId: "verified-evidence",
  deploymentId: "deployment-id",
  definitionStatus: "active",
  audience: "learner",
  versionLifecycle: "published",
  questionCount: 2,
  loadedQuestionCount: 2,
  hasMoreOptions: false,
  branchRuleCount: 0,
  sentInvitationCount: 1,
  questions: [
    { questionType: "single_choice", safetyTriage: false, optionCount: 2, ratingMin: null, ratingMax: null },
    { questionType: "rating", safetyTriage: false, optionCount: 0, ratingMin: 1, ratingMax: 5 },
  ],
};

describe("identified noncredit survey configuration preflight", () => {
  it("returns compatible only for a published, authorized, active and supported campaign", () => {
    expect(inspectIdentifiedNoncreditSurvey(base, now)).toEqual({ compatible: true, blockers: [] });
  });
  it("blocks unsupported modes, safety triage and branching", () => {
    const result = inspectIdentifiedNoncreditSurvey({
      ...base, responseMode: "anonymous", branchRuleCount: 1,
      questions: [{ ...base.questions[0]!, safetyTriage: true }, base.questions[1]!],
    }, now);
    expect(result.compatible).toBe(false);
    expect(result.blockers.join(" ")).toMatch(/identified/);
    expect(result.blockers.join(" ")).toMatch(/Branching/);
    expect(result.blockers.join(" ")).toMatch(/Safeguarding/);
  });
  it("fails closed on truncated question options, unpublished version or missing invitation", () => {
    const result = inspectIdentifiedNoncreditSurvey({
      ...base, versionLifecycle: "draft", loadedQuestionCount: 1,
      hasMoreOptions: true, sentInvitationCount: 0,
    }, now);
    expect(result.compatible).toBe(false);
    expect(result.blockers.join(" ")).toMatch(/published/);
    expect(result.blockers.join(" ")).toMatch(/Complete question/);
    expect(result.blockers.join(" ")).toMatch(/invitations/);
  });
  it("rejects expired, out-of-range, malformed and matrix surveys", () => {
    const result = inspectIdentifiedNoncreditSurvey({
      ...base, endsAt: now, questions: [
        { ...base.questions[0]!, questionType: "matrix" },
        { ...base.questions[1]!, ratingMin: 8, ratingMax: 5 },
      ],
    }, now);
    expect(result.compatible).toBe(false);
    expect(result.blockers.join(" ")).toMatch(/active date/);
    expect(result.blockers.join(" ")).toMatch(/Matrix/);
    expect(result.blockers.join(" ")).toMatch(/numeric range/);
  });
});
