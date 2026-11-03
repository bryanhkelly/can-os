import type { PublicSchoolDay } from "./parent-information";
import { unconfiguredClaim, verifiedPublicClaim } from "./parent-information";

type Period = {
  dayOfWeek: number;
  startsAtLocal: string;
  endsAtLocal: string;
  type: string;
};
/** Canonical content signature; changes to any displayed period withdraw approval. */
export function publicSchoolDayScheduleSignature(periods: readonly Period[]): string {
  return JSON.stringify(periods.map(p=>({
    dayOfWeek:p.dayOfWeek, startsAtLocal:p.startsAtLocal,
    endsAtLocal:p.endsAtLocal, type:p.type,
  })).sort((a,b)=>a.dayOfWeek-b.dayOfWeek ||
    a.startsAtLocal.localeCompare(b.startsAtLocal) ||
    a.endsAtLocal.localeCompare(b.endsAtLocal) ||
    a.type.localeCompare(b.type)));
}

type Schedule = {
  schoolYearStatus: string;
  templateActive: boolean;
  programMatches: boolean;
  siteMatches: boolean;
  timezoneMatches: boolean;
  startsOn: string;
  endsOn: string;
  effectiveFrom: string;
  effectiveThrough: string | null;
  /** Institution's explicit review, not a website editor checkbox. */
  approval: { status: "approved"; revision: number; reviewedByPersonId: string; reviewedAt: string; signature: string } | null;
  periods: Period[];
};
export type PublicWeeklyDayPattern = {
  dayOfWeek: number;
  startsAtLocal: string;
  endsAtLocal: string;
  timezone: string;
};
/**
 * The legacy parent DTO only represents one uniform time range. Approved weekly
 * patterns preserve real per-day hours without making up a school-wide schedule.
 */
export type PublicSchoolDayProjection = PublicSchoolDay & {
  state: "pending" | "approved";
  timezone: string | null;
  weeklyPatternState: "pending" | "approved";
  weeklyPattern: PublicWeeklyDayPattern[];
};

/** No guessed Monday–Friday template or schedule from an inactive school year. */
export function projectPublicSchoolDay(
  schedules: readonly Schedule[],
  timezone: string,
  now: Date = new Date(),
): PublicSchoolDayProjection {
  const pending = (): PublicSchoolDayProjection => ({
    state: "pending", timezone: null,
    weeklyPatternState: "pending", weeklyPattern: [],
    days: unconfiguredClaim("calendar"), startTime: unconfiguredClaim("calendar"),
    endTime: unconfiguredClaim("calendar"), mode: unconfiguredClaim("calendar"),
  });
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now).map(part => [part.type, part.value]));
  const day = `${parts.year}-${parts.month}-${parts.day}`;
  const eligible = schedules.filter(schedule =>
    schedule.schoolYearStatus === "active" && schedule.templateActive &&
    schedule.programMatches && schedule.siteMatches && schedule.timezoneMatches &&
    schedule.startsOn <= day && schedule.endsOn >= day &&
    schedule.effectiveFrom <= day &&
    (!schedule.effectiveThrough || schedule.effectiveThrough >= day) &&
    schedule.approval?.status === "approved" &&
    Boolean(schedule.approval.reviewedByPersonId) &&
    Number.isSafeInteger(schedule.approval.revision) &&
    schedule.approval.revision > 0 &&
    schedule.approval.signature === publicSchoolDayScheduleSignature(schedule.periods) &&
    Number.isFinite(Date.parse(schedule.approval.reviewedAt)) &&
    Date.parse(schedule.approval.reviewedAt) <= now.getTime(),
  );
  // Conflicting/grade-specific bell patterns cannot be flattened into a
  // purported single all-school daily schedule.
  if (eligible.length !== 1) return pending();
  const schedule = eligible[0]!;
  const periods = schedule.periods.filter(p =>
    Number.isInteger(p.dayOfWeek) && p.dayOfWeek >= 0 && p.dayOfWeek <= 6 &&
    /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(p.startsAtLocal) &&
    /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(p.endsAtLocal) &&
    p.startsAtLocal < p.endsAtLocal &&
    ["instruction", "chapel", "advisory", "break", "lunch"].includes(p.type));
  // Only instruction establishes an instructional day. Sunday is valid.
  const instructional = periods.filter(p => p.type === "instruction");
  if (!instructional.length || instructional.length !==
    schedule.periods.filter(p => p.type === "instruction").length) return pending();
  const days = [...new Set(instructional.map(p => p.dayOfWeek))].sort((a,b) => a-b);
  const dailyRanges = days.map(dayOfWeek => {
    const daily = instructional.filter(p => p.dayOfWeek === dayOfWeek);
    return {
      start:daily.map(p => p.startsAtLocal).sort()[0]!.slice(0,5),
      end:daily.map(p => p.endsAtLocal).sort().at(-1)!.slice(0,5),
    };
  });
  const weeklyPattern: PublicWeeklyDayPattern[] = days.map((dayOfWeek,index)=>({
    dayOfWeek,
    startsAtLocal:dailyRanges[index]!.start,
    endsAtLocal:dailyRanges[index]!.end,
    timezone,
  }));
  // A varied but independently approved weekly pattern is still safe to show
  // at the Program level. Only legacy uniform time claims remain withheld.
  if (dailyRanges.some(range=>range.start !== dailyRanges[0]!.start ||
    range.end !== dailyRanges[0]!.end)) return {
      ...pending(), timezone,
      weeklyPatternState:"approved", weeklyPattern,
    };
  const start = dailyRanges[0]!.start;
  const end = dailyRanges[0]!.end;
  const revision = schedule.approval!.revision;
  return {
    state: "approved", timezone,
    weeklyPatternState:"approved", weeklyPattern,
    days: verifiedPublicClaim(days, "calendar", revision),
    startTime: verifiedPublicClaim(start, "calendar", revision),
    endTime: verifiedPublicClaim(end, "calendar", revision),
    // Delivery mode is an institutional Program attribute, not implied by periods.
    mode: unconfiguredClaim("institutional_record"),
  };
}
