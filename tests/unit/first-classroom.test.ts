import { describe, expect, it } from "vitest";
import { buildFirstClassroom, recommendCourseOption } from "@/domain/first-classroom";

const curriculum = { learning: {
  version: 1,
  modules: [{ id: "start", title: "Start here", lessons: [{
    id: "welcome", title: "Welcome and investigate", body: "Read the scenario and record your observations.", resources: [],
  }] }],
} };
const emptyCurriculum = { learning: {
  version: 1,
  modules: [{ id: "start", title: "Start here", lessons: [{ id: "shell", title: "Shell", body: " ", resources: [] }] }],
} };
const assessment = { id: "assessment-1", title: "First investigation", instructions: "Explain your observations in three sentences.", curriculumLessonId: "welcome" };
const readyEvidence = {
  sectionActive: true,
  courseVersionPublished: true,
  curriculumAccess:{available:true,reason:null},
  curriculum,
  qualifiedTeacher: true,
  activeStudentCount: 2,
  publishedAssessments: [assessment],
};

describe("recommended first-class curriculum", () => {
  it("reports availability, license and adoption independently from instructional readiness", () => {
    expect(recommendCourseOption({ origin: "adopted", published: true, licenseActive: false, adoptionActive: false, curriculum }))
      .toMatchObject({ available: true, licensed: false, adopted: false, accessReady: false, instructionReady: false, recommended: false });
    expect(recommendCourseOption({ origin: "adopted", published: true, licenseActive: true, adoptionActive: false, curriculum }))
      .toMatchObject({ licensed: true, adopted: false, accessReady: false, recommended: false });
    expect(recommendCourseOption({ origin: "adopted", published: true, licenseActive: true, adoptionActive: true, curriculum: emptyCurriculum }))
      .toMatchObject({ accessReady: true, instructionReady: false, recommended: false });
  });
  it("recommends only authorized published options with actual introductory instruction", () => {
    expect(recommendCourseOption({ origin: "adopted", published: true, licenseActive: true, adoptionActive: true, curriculum }))
      .toMatchObject({ licensed: true, adopted: true, accessReady: true, instructionReady: true, recommended: true });
    expect(recommendCourseOption({ origin: "institution_owned", published: true, licenseActive: false, adoptionActive: false, curriculum }))
      .toMatchObject({ licensed: null, adopted: null, accessReady: true, instructionReady: true, recommended: true });
    expect(recommendCourseOption({ origin: "institution_owned", published: false, licenseActive: true, adoptionActive: true, curriculum }).recommended).toBe(false);
  });
});

describe("first classroom evidence", () => {
  it("links a real first lesson and submittable assessment only when every blocker is closed", () => {
    expect(buildFirstClassroom("section-1", readyEvidence)).toEqual({
      sectionId: "section-1",
      ready: true,
      blockers: [],
      activeStudentCount: 2,
      firstWeek: {
        lesson: { id: "welcome", title: "Welcome and investigate" },
        assessment: { id: "assessment-1", title: "First investigation" },
      },
    });
  });
  it.each([
    ["missing_lesson", { curriculum: emptyCurriculum }],
    ["missing_assessment", { publishedAssessments: [] }],
    ["missing_assessment", { publishedAssessments: [{ ...assessment, instructions: " " }] }],
    ["missing_qualified_teacher", { qualifiedTeacher: false }],
    ["missing_students", { activeStudentCount: 0 }],
    ["inactive_section", { sectionActive: false }],
  ] as const)("reports %s instead of manufacturing readiness", (key, change) => {
    const result = buildFirstClassroom("section-1", { ...readyEvidence, ...change });
    expect(result.ready).toBe(false);
    expect(result.blockers.map(item => item.key)).toContain(key);
  });
  it("does not mistake an unpublished course version or empty lesson for instruction", () => {
    const result = buildFirstClassroom("section-1", { ...readyEvidence, courseVersionPublished: false });
    expect(result.firstWeek.lesson).toBeNull();
    expect(result.blockers.map(item => item.key)).toContain("missing_lesson");
  });
  it("suggests the assessment authored for the first lesson, not an unrelated earlier one", () => {
    const unrelated = { id: "assessment-0", title: "Later unit quiz", instructions: "Answer every question.", curriculumLessonId: "other-lesson" };
    const result = buildFirstClassroom("section-1", { ...readyEvidence, publishedAssessments: [unrelated, assessment] });
    expect(result.firstWeek.lesson?.id).toBe("welcome");
    expect(result.firstWeek.assessment).toEqual({ id: "assessment-1", title: "First investigation" });
  });
  it("skips a lesson-linked assessment without student instructions and uses submittable work", () => {
    const linkedShell = { id: "assessment-2", title: "Linked shell", instructions: " ", curriculumLessonId: "welcome" };
    const fallback = { id: "assessment-3", title: "Class check-in", instructions: "Introduce yourself.", curriculumLessonId: null };
    const result = buildFirstClassroom("section-1", { ...readyEvidence, publishedAssessments: [linkedShell, fallback] });
    expect(result.firstWeek.assessment).toEqual({ id: "assessment-3", title: "Class check-in" });
  });
  it("keeps unlinked published classwork as the suggestion when no assessment names the lesson", () => {
    const unlinked = { id: "assessment-4", title: "Opening task", instructions: "Complete the opening task.", curriculumLessonId: null };
    const result = buildFirstClassroom("section-1", { ...readyEvidence, publishedAssessments: [unlinked] });
    expect(result.ready).toBe(true);
    expect(result.firstWeek.assessment).toEqual({ id: "assessment-4", title: "Opening task" });
  });
});

describe("first classroom fallback boundaries", () => {
  it("never falls back to work linked to another lesson", () => {
    const result = buildFirstClassroom("section-1", { ...readyEvidence,
      publishedAssessments: [{ ...assessment, curriculumLessonId: "later" }] });
    expect(result.firstWeek.assessment).toBeNull();
    expect(result.blockers).toContainEqual(expect.objectContaining({ key: "missing_assessment" }));
  });
  it("finds genuinely unlinked work after unrelated work", () => {
    const result = buildFirstClassroom("section-1", { ...readyEvidence,
      publishedAssessments: [{ ...assessment, curriculumLessonId: "later" },
        { ...assessment, id: "intro", curriculumLessonId: null }] });
    expect(result.firstWeek.assessment?.id).toBe("intro");
  });
  it("does not recommend work without a real first lesson", () => {
    expect(buildFirstClassroom("section-1", { ...readyEvidence, curriculum: emptyCurriculum,
      publishedAssessments: [{ ...assessment, curriculumLessonId: null }] }).firstWeek.assessment).toBeNull();
  });
});


describe("first classroom curriculum delivery access",()=>{
 it("does not recommend published content or assignments after licensing is revoked",()=>{
  const result=buildFirstClassroom("section-1",{...readyEvidence,
   curriculumAccess:{available:false,reason:"An active institutional license is required."}});
  expect(result.ready).toBe(false);
  expect(result.firstWeek).toEqual({lesson:null,assessment:null});
  expect(result.blockers).toEqual([{key:"curriculum_unavailable",message:"An active institutional license is required."}]);
 });
});
