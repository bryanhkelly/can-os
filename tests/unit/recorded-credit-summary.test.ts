import { describe, expect, it } from "vitest";
import {
  summarizeRecordedTranscriptCredits,
  type RecordedCreditRow,
} from "@/domain/recorded-credit-summary";

const row = (overrides: Partial<RecordedCreditRow> = {}): RecordedCreditRow => ({
  sectionGradeId: "grade-a",
  sectionId: "math-section",
  termId: "fall",
  creditIssuingOrganizationId: "can-issuer",
  creditIssuingOrganization: "CAN",
  subject: "Mathematics",
  letterGrade: "A",
  terminalPeriod: true,
  creditConfigured: true,
  creditsAttempted: 1,
  creditsEarned: 1,
  ...overrides,
});

describe("institution-specific recorded academic credits", () => {
  it("counts only term-final credit once, even with earlier grading periods", () => {
    const result = summarizeRecordedTranscriptCredits([
      row({sectionGradeId:"q1",terminalPeriod:false,creditsAttempted:0,creditsEarned:0}),
      row({sectionGradeId:"q2"}),
      row({sectionGradeId:"q2"}), // identical projection should not add credits
      row({sectionGradeId:"science",sectionId:"science",subject:"Science",
        creditsAttempted:0.5,creditsEarned:0.5}),
    ]);
    expect(result.byIssuer).toHaveLength(1);
    expect(result.byIssuer[0]).toMatchObject({
      attemptedUnits:1.5,earnedUnits:1.5,incompleteEntries:0,conflictingEntries:0,
    });
    expect(result.byIssuer[0]?.subjects.map(s=>s.subject))
      .toEqual(["Mathematics","Science"]);
    expect(result.diplomaAuthorized).toBe(false);
    expect(result.graduationStatus).toBe("not_evaluated");
  });

  it("never mixes issuers or invents transfer-credit approval", () => {
    const result = summarizeRecordedTranscriptCredits([
      row(),
      row({sectionGradeId:"different",sectionId:"math-transfer",termId:"spring",
        creditIssuingOrganizationId:"outside",creditIssuingOrganization:"Outside School",
        creditsAttempted:0.5,creditsEarned:0.5}),
    ]);
    expect(result.byIssuer.map(x=>x.earnedUnits)).toEqual([1,0.5]);
    expect(result.note).toMatch(/Transfer approval/);
  });

  it("keeps unknown, failed and withdrawn entries visible without awarding credit", () => {
    const result = summarizeRecordedTranscriptCredits([
      row({sectionGradeId:"unknown",sectionId:"unknown",
        creditConfigured:false,creditsAttempted:null,creditsEarned:null}),
      row({sectionGradeId:"fail",sectionId:"fail",letterGrade:"F",creditsAttempted:1,creditsEarned:0}),
      row({sectionGradeId:"withdrawn",sectionId:"withdrawn",letterGrade:"W",creditsAttempted:1,creditsEarned:0}),
    ]);
    expect(result.byIssuer[0]).toMatchObject({
      earnedUnits:0,attemptedUnits:2,incompleteEntries:1,withdrawals:1,
    });
    expect(result.incompleteEntries).toBe(1);
  });

  it("excludes conflicting section/term credit entries rather than double counting", () => {
    const result = summarizeRecordedTranscriptCredits([
      row({sectionGradeId:"term-review-1"}),
      row({sectionGradeId:"term-review-2",creditsEarned:0.5}),
    ]);
    expect(result.byIssuer[0]).toMatchObject({
      earnedUnits:0,attemptedUnits:0,incompleteEntries:1,conflictingEntries:1,
    });
  });

  it("flags impossible numeric credit evidence without guessing units", () => {
    const result = summarizeRecordedTranscriptCredits([
      row({sectionGradeId:"bad",creditsAttempted:0.3,creditsEarned:0.4}),
      row({sectionGradeId:"bad-w",sectionId:"bad-w",letterGrade:"W",
        creditsAttempted:1,creditsEarned:1}),
      row({sectionGradeId:"unknown-subject",sectionId:"uncategorized",
        subject:null,creditsAttempted:0.29,creditsEarned:0.29}),
    ]);
    expect(result.byIssuer[0]).toMatchObject({earnedUnits:0.29,incompleteEntries:2});
    expect(result.byIssuer[0]?.subjects.some(x=>x.subject.includes("review needed"))).toBe(true);
  });
});
