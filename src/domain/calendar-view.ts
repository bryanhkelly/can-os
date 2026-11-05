export const calendarSources = ["site", "section", "personal", "assessment", "study_group"] as const;
export type CalendarSource = (typeof calendarSources)[number];

export function calendarItemDestination(
  item: { id: string; source: CalendarSource; sectionId?: string | null;
    guardianStudents?: readonly { studentPersonId: string; studentName: string }[] },
  viewerRole?: string,
  studentPersonId?: string,
) {
  if (item.source !== "assessment" || !item.id.startsWith("assessment:")) return null;
  const assessment = item.id.slice("assessment:".length);
  if (!assessment) return null;
  if (viewerRole === "student") return {
    to: "/student/assignments" as const, search: { section: item.sectionId ?? undefined, assessment },
  };
  if (viewerRole === "teacher" && item.sectionId) return {
    to: "/teacher/gradebook" as const, search: { section: item.sectionId, assessment },
  };
  if (viewerRole === "guardian" && item.sectionId) {
    const students = item.guardianStudents ?? [];
    const student = studentPersonId
      ? students.find(child => child.studentPersonId === studentPersonId)
      : students.length === 1 ? students[0] : undefined;
    if (student) return {
      to: "/guardian/academics" as const,
      search: { student: student.studentPersonId, section: item.sectionId, assessment },
    };
  }
  return null;
}

export function filterCalendarItems<T extends { source: CalendarSource; sectionId?: string | null }>(
  items: T[], selection: { source?: CalendarSource; section?: string },
): T[] {
  return items.filter(item => (!selection.source || item.source === selection.source) &&
    (!selection.section || item.sectionId === selection.section));
}
