import type { PublicSchoolDay } from "./parent-information";
import { unconfiguredClaim, verifiedPublicClaim } from "./parent-information";

export type PublicSchoolDayPeriod = {
  dayOfWeek: number;
  startsAtLocal: string;
  endsAtLocal: string;
  type: string;
  sequence?: number;
  label?: string;
};
type Period = PublicSchoolDayPeriod;

/** Signed school-year and publisher context. Values come from canonical DB rows. */
export type PublicScheduleApprovalScope = {
  siteId:string;programId:string;schoolYearId:string;scheduleTemplateId:string;
  siteTimezone:string;schoolYearTimezone:string;
  schoolYearStartsOn:string;schoolYearEndsOn:string;
  effectiveFrom:string;effectiveThrough:string|null;
  schoolYearKey:string;schoolYearName:string;
  gradeRange:{min:string;max:string};programType:string;
  siteRevision:string;programRevision:string;yearRevision:string;templateRevision:string;
};
/** Canonical content signature; changes to any displayed period withdraw approval. */
export function publicSchoolDayScheduleSignature(
  periods:readonly Period[],scope?:PublicScheduleApprovalScope,
): string {
  const normalized=periods.map(p=>({
    dayOfWeek:p.dayOfWeek,startsAtLocal:p.startsAtLocal,
    endsAtLocal:p.endsAtLocal,type:p.type,
    ...(scope?{sequence:p.sequence??0,label:p.label??""}:{}),
  })).sort((a,b)=>a.dayOfWeek-b.dayOfWeek ||
    a.startsAtLocal.localeCompare(b.startsAtLocal) ||
    a.endsAtLocal.localeCompare(b.endsAtLocal) ||
    a.type.localeCompare(b.type));
  // Keep the legacy single-argument signature for pure fixtures, but ONLY
  // the scope-bound v2 form may be produced by the production approval service.
  return scope?JSON.stringify({version:2,scope,periods:normalized}):JSON.stringify(normalized);
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
  reviewScope?: PublicScheduleApprovalScope;
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
  approvedPatternSource: {
    scope:PublicScheduleApprovalScope;
    approval:{revision:number;reviewedAt:string};
    instructionalIntervals:PublicWeeklyDayPattern[];
    patternKind:"standard_weekly_template_not_holiday_calendar";
  } | null;
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
    approvedPatternSource:null,
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
    schedule.approval.signature === publicSchoolDayScheduleSignature(
      schedule.periods,schedule.reviewScope) &&
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
  const source=schedule.reviewScope?{
    scope:schedule.reviewScope,
    approval:{revision:schedule.approval!.revision,reviewedAt:schedule.approval!.reviewedAt},
    instructionalIntervals:instructional.map(period=>({
      dayOfWeek:period.dayOfWeek,startsAtLocal:period.startsAtLocal.slice(0,5),
      endsAtLocal:period.endsAtLocal.slice(0,5),timezone,
    })).sort((a,b)=>a.dayOfWeek-b.dayOfWeek ||
      a.startsAtLocal.localeCompare(b.startsAtLocal)),
    patternKind:"standard_weekly_template_not_holiday_calendar" as const,
  }:null;
  // A varied but independently approved weekly pattern is still safe to show
  // at the Program level. Only legacy uniform time claims remain withheld.
  if (dailyRanges.some(range=>range.start !== dailyRanges[0]!.start ||
    range.end !== dailyRanges[0]!.end)) return {
      ...pending(), timezone,
      weeklyPatternState:"approved", weeklyPattern,
    approvedPatternSource:source,
      approvedPatternSource:source,
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
