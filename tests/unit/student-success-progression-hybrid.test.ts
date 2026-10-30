import { describe, expect, it } from "vitest";
import { deriveClassNextSteps, deriveStudentSuccessPriorities, type StudentSuccessAssignment } from "@/domain/student-success";
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


describe("cross-class Student Success assignment priorities", () => {
  const now = new Date("2026-10-22T12:00:00.000Z");
  const assignment = (overrides: Partial<StudentSuccessAssignment>): StudentSuccessAssignment => ({
    assessmentId: "assessment-1", sectionId: "section-a",
    title: "Practice problems", course: "Mathematics",
    dueAt: "2026-10-24T12:00:00.000Z",
    status: null, timeliness: null, assessmentStatus: "published",canEdit:true,
    ...overrides,
  });

  it("includes an enrolled student's published assignment before any submission exists", () => {
    const plan = deriveStudentSuccessPriorities([
      assignment({ assessmentId: "math", course: "Math" }),
      assignment({ assessmentId: "english", sectionId: "section-b", course: "English" }),
    ], now);
    expect(plan.steps).toHaveLength(2);
    expect(plan.dueSoon).toBe(2);
    expect(plan.requiresAction).toBe(2);
    expect(plan.steps.map(step => step.course).sort()).toEqual(["English","Math"]);
  });

  it("prioritizes revisions, overdue work and due-soon assignments ahead of waiting", () => {
    const plan = deriveStudentSuccessPriorities([
      assignment({assessmentId:"submitted",status:"submitted",timeliness:"late"}),
      assignment({assessmentId:"graded",status:"graded",assessmentStatus:"closed"}),
      assignment({assessmentId:"soon"}),
      assignment({assessmentId:"late",dueAt:"2026-10-01T10:00:00Z"}),
      assignment({assessmentId:"returned",status:"returned",dueAt:null}),
      assignment({assessmentId:"ungraded",dueAt:null}),
    ], now);
    expect(plan.steps.map(step=>step.kind)).toEqual([
      "revision","overdue","due_soon","to_do","review_feedback","awaiting_feedback",
    ]);
    expect(plan.overdue).toBe(1);
    expect(plan.revise).toBe(1);
    expect(plan.awaitingFeedback).toBe(1);
    expect(plan.requiresAction).toBe(4);
    expect(plan.notice).toMatch(/not a risk score/i);
    expect(plan.notice).toMatch(/not a .*credit decision/i);
  });

  it("never calls late-submitted work missing and never suggests submitting closed assessments", () => {
    const plan = deriveStudentSuccessPriorities([
      assignment({assessmentId:"late-submitted",status:"submitted",timeliness:"missing"}),
      assignment({assessmentId:"closed-no-submission",assessmentStatus:"closed"}),
      assignment({assessmentId:"draft",assessmentStatus:"draft",status:"returned"}),
    ], now);
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0]?.kind).toBe("awaiting_feedback");
    expect(plan.overdue).toBe(0);
    expect(plan.revise).toBe(0);
  });

  it("never offers submission work when canonical availability or attempt policy disallows edits",()=>{
    const plan=deriveStudentSuccessPriorities([
      assignment({assessmentId:"scheduled",canEdit:false}),
      assignment({assessmentId:"closed-by-date",status:"assigned",canEdit:false,timeliness:"missing"}),
      assignment({assessmentId:"limit-reached",status:"returned",canEdit:false}),
      assignment({assessmentId:"open-revision",status:"returned",canEdit:true}),
    ],now);
    expect(plan.steps.map(step=>[step.assessmentId,step.kind])).toEqual([
      ["open-revision","revision"],["limit-reached","review_feedback"],
    ]);
    expect(plan.requiresAction).toBe(1);
    expect(plan.overdue).toBe(0);
  });

  it("does not duplicate latest-attempt projections and uses deterministic bounded results", () => {
    const plan = deriveStudentSuccessPriorities([
      assignment({assessmentId:"A",dueAt:"2026-10-25T12:00:00Z"}),
      assignment({assessmentId:"A",status:"submitted"}),
      assignment({assessmentId:"B",dueAt:"2026-10-25T12:00:00Z"}),
    ], now, 1);
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0]?.assessmentId).toBe("A");
    expect(plan.total).toBe(2);
    expect(plan.truncated).toBe(true);
  });

  it("rejects invalid caller-provided review windows", () => {
    expect(() => deriveStudentSuccessPriorities([], now, 0)).toThrow();
    expect(() => deriveStudentSuccessPriorities([], new Date("invalid"))).toThrow();
    expect(deriveStudentSuccessPriorities([], now).steps).toEqual([]);
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
