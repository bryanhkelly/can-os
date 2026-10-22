import { describe, expect, it } from "vitest";
import { deriveClassNextSteps } from "@/domain/student-success";
import { assessAcademicProgression } from "@/domain/academic-progression";
import { summarizeHybridSiteDay } from "@/domain/hybrid-site-evidence";

describe("student success follows course evidence without inferred mastery", () => {
  it("suggests the first published lesson not self-reported complete", () => {
    expect(deriveClassNextSteps({
      lessonIds: ["intro", "practice", "review"],
      completedLessonIds: ["intro"],
      assessments: [{ status: "submitted" }, { status: "returned" }],
    })).toMatchObject({
      nextLessonId: "practice", selfReportedCompleted: 1,
      totalPublishedLessons: 3, awaitingFeedback: 1, revisionRequested: 1,
    });
  });
  it("does not imply credit or competence when all lessons were marked complete", () => {
    const result = deriveClassNextSteps({
      lessonIds: ["one"], completedLessonIds: ["one"],
      assessments: [],
    });
    expect(result.nextLessonId).toBeNull();
    expect(result.message).toMatch(/not a mastery or credit decision/i);
  });
});

describe("academic progression is a provisional review, never a diploma award", () => {
  const requirements = [
    { category: "math", minimumUnits: 3 },
    { category: "english", minimumUnits: 4 },
  ];
  it("reports category shortfalls without awarding an unearned unit", () => {
    const result = assessAcademicProgression({ requirements, courses: [
      { category: "math", units: 2, finalized: true, approved: true, source: "institution" },
      { category: "english", units: 4, finalized: true, approved: true, source: "institution" },
    ] });
    expect(result.categories.find(x => x.category === "math")?.shortfallUnits).toBe(1);
    expect(result.reviewStatus).toBe("requirements_incomplete");
    expect(result.diplomaAuthorized).toBe(false);
  });
  it("does not count draft, unapproved transfer or unknown credits as earned", () => {
    const result = assessAcademicProgression({ requirements: [{category:"math",minimumUnits:1}], courses: [
      {category:"math",units:1,finalized:false,approved:true,source:"institution"},
      {category:"math",units:1,finalized:true,approved:false,source:"transfer"},
      {category:"math",units:null,finalized:true,approved:true,source:"institution"},
    ]});
    expect(result.pendingEvidenceCount).toBe(3);
    expect(result.categories[0]?.recordedUnits).toBe(0);
    expect(result.reviewStatus).toBe("review_required");
  });
  it("never equates provisional completion with official diploma approval", () => {
    const result = assessAcademicProgression({requirements:[{category:"math",minimumUnits:1}],courses:[
      {category:"math",units:1,finalized:true,approved:true,source:"transfer"},
    ]});
    expect(result.reviewStatus).toBe("provisionally_met");
    expect(result.diplomaAuthorized).toBe(false);
  });
});

describe("hybrid site evidence does not manufacture attendance", () => {
  it("keeps online interactions and onsite attendance separate", () => {
    const result = summarizeHybridSiteDay([
      {studentProfileId:"a",expectedOnsite:true,onsiteAttendance:"present",onlineInteractionsObserved:0},
      {studentProfileId:"b",expectedOnsite:true,onsiteAttendance:"unrecorded",onlineInteractionsObserved:6},
      {studentProfileId:"c",expectedOnsite:false,onsiteAttendance:"unrecorded",onlineInteractionsObserved:2},
    ]);
    expect(result).toMatchObject({
      expectedOnsite:2,verifiedOnsiteObservations:1,onlineEvidenceStudents:2,
      onsiteRecordsToReview:["b"],distinctStudents:3,
    });
  });
  it("rejects duplicate students before producing misleading summary counts", () => {
    expect(() => summarizeHybridSiteDay([
      {studentProfileId:"a",expectedOnsite:true,onsiteAttendance:"present",onlineInteractionsObserved:2},
      {studentProfileId:"a",expectedOnsite:true,onsiteAttendance:"present",onlineInteractionsObserved:2},
    ])).toThrow();
  });
});
