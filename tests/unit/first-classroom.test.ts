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
const assessment = { id: "assessment-1", title: "First investigation", instructions: "Explain your observations in three sentences." };
const readyEvidence = {
  sectionActive: true,
  courseVersionPublished: true,
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
});
