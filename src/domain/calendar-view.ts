export const calendarSources = ["site", "section", "personal", "assessment", "study_group"] as const;
export type CalendarSource = (typeof calendarSources)[number];
export const calendarViews = ["month", "week", "day", "agenda"] as const;
export type CalendarView = (typeof calendarViews)[number];

export function calendarEventDetailsDestination(
  eventId: string,
  date: string,
  search: { section?: string; source?: CalendarSource; view?: CalendarView; q?: string } = {},
) {
  return { to: "/calendar" as const, search: { ...search, date, event: eventId } };
}

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
      to: "/guardian/students" as const,
      search: { student: student.studentPersonId, section: item.sectionId, assessment },
    };
  }
  return null;
}

/** Detail-page destination for the record behind a calendar item: the class
 * workspace for section events and derived class times, or the field trip
 * record. Only roles the target page authorizes get a link; guardians need
 * one resolved child because the class workspace requires an explicit
 * student context. */
export function calendarRecordDestination(
  item: { type: string; source: CalendarSource; sectionId?: string | null;
    sourceType?: string | null; sourceId?: string | null;
    studyGroup?: { id: string; title: string } | null;
    guardianStudents?: readonly { studentPersonId: string; studentName: string }[] },
  viewerRole?: string,
  studentPersonId?: string,
) {
  // Study-group sessions open the group's record page; the feed only carries
  // the group for events the actor is already permitted to see.
  if (item.source === "study_group" && item.studyGroup &&
    (viewerRole === "student" || viewerRole === "teacher")) return {
    to: "/groups/$groupId" as const, params: { groupId: item.studyGroup.id },
  };
  if (item.source === "section" && item.sectionId) {
    if (viewerRole === "student" || viewerRole === "teacher") return {
      to: "/classes" as const, search: { section: item.sectionId },
    };
    if (viewerRole === "guardian") {
      const students = item.guardianStudents ?? [];
      const student = studentPersonId
        ? students.find(child => child.studentPersonId === studentPersonId)
        : students.length === 1 ? students[0] : undefined;
      if (student) return {
        to: "/classes" as const, search: { section: item.sectionId, student: student.studentPersonId },
      };
    }
    return null;
  }
  if (item.type === "field_trip" && item.sourceType === "field_trip" && item.sourceId) {
    if (viewerRole === "registrar") return {
      to: "/operations/field-trips/$tripId" as const, params: { tripId: item.sourceId },
    };
    if (viewerRole === "guardian") return { to: "/guardian/field-trips" as const };
    if (viewerRole === "student") return {
      to: "/student/field-trips" as const, search: { trip: item.sourceId },
    };
  }
  return null;
}

export function filterCalendarItems<T extends {
  source: CalendarSource; sectionId?: string | null; title?: string; description?: string | null;
}>(
  items: T[], selection: { source?: CalendarSource; section?: string; q?: string },
): T[] {
  const query = selection.q?.trim().toLowerCase();
  return items.filter(item => (!selection.source || item.source === selection.source) &&
    (!selection.section || item.sectionId === selection.section) &&
    (!query || `${item.title ?? ""} ${item.description ?? ""}`.toLowerCase().includes(query)));
}
