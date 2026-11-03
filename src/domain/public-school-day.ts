import type { PublicSchoolDay } from "./parent-information";
import { unconfiguredClaim, verifiedPublicClaim } from "./parent-information";

type Period = {
  dayOfWeek: number;
  startsAtLocal: string;
  endsAtLocal: string;
  type: string;
};
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
  approval: { status: "approved"; revision: number; reviewedByPersonId: string; reviewedAt: string } | null;
  periods: Period[];
};
export type PublicSchoolDayProjection = PublicSchoolDay & { state: "pending" | "approved"; timezone: string | null };

/** No guessed Monday–Friday template or schedule from an inactive school year. */
export function projectPublicSchoolDay(
  schedules: readonly Schedule[],
  timezone: string,
  now: Date = new Date(),
): PublicSchoolDayProjection {
  const pending = (): PublicSchoolDayProjection => ({
    state: "pending", timezone: null,
    days: unconfiguredClaim("calendar"), startTime: unconfiguredClaim("calendar"),
    endTime: unconfiguredClaim("calendar"), mode: unconfiguredClaim("calendar"),
  });
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
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
  const start = instructional.map(p => p.startsAtLocal).sort()[0]!.slice(0,5);
  const end = instructional.map(p => p.endsAtLocal).sort().at(-1)!.slice(0,5);
  const revision = schedule.approval!.revision;
  return {
    state: "approved", timezone, days: verifiedPublicClaim(days, "calendar", revision),
    startTime: verifiedPublicClaim(start, "calendar", revision),
    endTime: verifiedPublicClaim(end, "calendar", revision),
    // Delivery mode is an institutional Program attribute, not implied by periods.
    mode: unconfiguredClaim("institutional_record"),
  };
}
