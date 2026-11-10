/**
 * Canonical schedule-template period vocabulary. The database column
 * (schedule_template_periods.type) is free text; this list is the single
 * product-wide set of recognized values. The studio validator, schedule
 * editor, public school-day projection and every meeting-time filter must
 * use these exported constants rather than local string literals.
 */
export const SCHEDULE_PERIOD_TYPES = [
  "instruction",
  "homeroom",
  "chapel",
  "advisory",
  "break",
  "lunch",
] as const;
export type SchedulePeriodType = (typeof SCHEDULE_PERIOD_TYPES)[number];

/**
 * Period types during which a Section bound to the template meets with its
 * roster and teacher. Homeroom is a daily roster gathering, so it projects
 * onto calendars, participates in schedule-conflict and instructor-capacity
 * checks, counts toward expected onsite attendance days, and occupies rooms
 * exactly like instruction. Chapel is a site-wide gathering and is never
 * section-bound; it is projected site-wide, not per Section.
 */
export const SECTION_MEETING_PERIOD_TYPES = [
  "instruction",
  "homeroom",
] as const satisfies readonly SchedulePeriodType[];

export function isSectionMeetingPeriodType(type: string): boolean {
  return (SECTION_MEETING_PERIOD_TYPES as readonly string[]).includes(type);
}

/** Default daily homeroom length in minutes; sites may configure per period. */
export const HOMEROOM_DEFAULT_MINUTES = 25;
