import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { scheduleTemplatePeriods, sections } from "@/db/schema";

export type MeetingPeriod = {
  dayOfWeek: number;
  startsAtLocal: string;
  endsAtLocal: string;
  label: string;
};

export async function getSectionMeetingPattern(
  sectionId: string,
  executor: any = db,
): Promise<MeetingPeriod[]> {
  const [section] = await executor
    .select({ scheduleTemplateId: sections.scheduleTemplateId })
    .from(sections)
    .where(eq(sections.id, sectionId))
    .limit(1);
  if (!section?.scheduleTemplateId) return [];

  return executor
    .select({
      dayOfWeek: scheduleTemplatePeriods.dayOfWeek,
      startsAtLocal: scheduleTemplatePeriods.startsAtLocal,
      endsAtLocal: scheduleTemplatePeriods.endsAtLocal,
      label: scheduleTemplatePeriods.label,
    })
    .from(scheduleTemplatePeriods)
    .where(and(
      eq(scheduleTemplatePeriods.scheduleTemplateId, section.scheduleTemplateId),
      eq(scheduleTemplatePeriods.type, "instruction"),
    ));
}

export function meetingPeriodsConflict(a: MeetingPeriod[], b: MeetingPeriod[]): boolean {
  return a.some(left =>
    b.some(right =>
      left.dayOfWeek === right.dayOfWeek &&
      left.startsAtLocal < right.endsAtLocal &&
      right.startsAtLocal < left.endsAtLocal,
    ),
  );
}

export async function findSectionScheduleConflicts(
  sectionId: string,
  otherSectionIds: string[],
  executor: any = db,
): Promise<string[]> {
  if (!otherSectionIds.length) return [];
  const target = await getSectionMeetingPattern(sectionId, executor);
  if (!target.length) return [];

  const rows = await executor
    .select({ id: sections.id, scheduleTemplateId: sections.scheduleTemplateId })
    .from(sections)
    .where(inArray(sections.id, otherSectionIds));

  const conflicting: string[] = [];
  for (const row of rows) {
    if (!row.scheduleTemplateId) continue;
    const pattern = await getSectionMeetingPattern(row.id, executor);
    if (meetingPeriodsConflict(target, pattern)) conflicting.push(row.id);
  }
  return conflicting;
}
