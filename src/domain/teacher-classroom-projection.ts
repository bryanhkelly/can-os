import type { FirstClassroom } from "./first-classroom";

/** Keep all authorized teaching Sections visible even when a classroom
 * readiness projection is missing. Missing is unknown, not zero students.
 */
export function projectTeacherSections(
  assigned: readonly { sectionId: string; title: string }[],
  classrooms: readonly FirstClassroom[],
) {
  const byId = new Map(classrooms.map(classroom => [classroom.sectionId, classroom]));
  return assigned.map(section => {
    const classroom = byId.get(section.sectionId) ?? null;
    return {
      id: section.sectionId,
      title: section.title,
      studentCount: classroom?.activeStudentCount ?? null,
      classroom,
    };
  });
}
