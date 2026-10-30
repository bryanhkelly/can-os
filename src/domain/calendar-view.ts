export const calendarSources = ["site", "section", "personal", "assessment", "study_group"] as const;
export type CalendarSource = (typeof calendarSources)[number];

export function filterCalendarItems<T extends { source: CalendarSource; sectionId?: string | null }>(
  items: T[], selection: { source?: CalendarSource; section?: string },
): T[] {
  return items.filter(item => (!selection.source || item.source === selection.source) &&
    (!selection.section || item.sectionId === selection.section));
}
