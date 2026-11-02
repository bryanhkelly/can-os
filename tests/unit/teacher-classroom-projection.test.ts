import { describe, expect, it } from "vitest";
import { projectTeacherSections } from "@/domain/teacher-classroom-projection";
import type { FirstClassroom } from "@/domain/first-classroom";

const classroom: FirstClassroom = {
  sectionId: "section-a", ready: true, blockers: [],
  activeStudentCount: 8,
  firstWeek: { lesson: { id: "lesson-a", title: "Lesson" },
    assessment: { id: "work-a", title: "Assignment" } },
};

describe("Teacher Today classroom projections", () => {
  it("preserves all authorized sections when a classroom projection is missing", () => {
    const sections = projectTeacherSections([
      { sectionId: "section-a", title: "Algebra" },
      { sectionId: "section-b", title: "Science" },
    ], [classroom]);
    expect(sections.map(section => section.id)).toEqual(["section-a", "section-b"]);
    expect(sections[0]).toMatchObject({ studentCount: 8, classroom });
    expect(sections[1]).toMatchObject({ studentCount: null, classroom: null });
  });
  it("never borrows another section's readiness or reports unknown attendance as zero", () => {
    const [section] = projectTeacherSections([{ sectionId: "section-c", title: "History" }], [classroom]);
    expect(section).toMatchObject({ id: "section-c", studentCount: null, classroom: null });
  });
});
