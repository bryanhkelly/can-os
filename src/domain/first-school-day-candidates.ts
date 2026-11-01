import { siteDate } from "@/domain/expected-attendance";

/**
 * Bound expensive canonical roster+supervision verification without
 * substituting enrollment-window evidence for authoritative eligibility.
 *
 * A missing/misconfigured placement still gets one canonical probe for an
 * actionable blocker. If the budget is exhausted, the caller must return
 * verification_incomplete and NEVER claim a complete search or ready day.
 */
export const FIRST_DAY_CANONICAL_QUERY_BUDGET = 24;
export const FIRST_DAY_PUBLISHED_DAY_HORIZON = 180;

export function planBoundedFirstDayCandidates(
  publishedDays:readonly string[],
  activeSectionWindows:readonly {startedAt:Date|null;endedAt:Date|null}[],
  timeZone:string,
):{candidates:string[];truncated:boolean;eligibleDays:number}{
  const horizon=[...new Set(publishedDays)].sort().slice(0,FIRST_DAY_PUBLISHED_DAY_HORIZON);
  if(!horizon.length)return {candidates:[],truncated:false,eligibleDays:0};
  // A student can be scheduled only during an existing ACTIVE section
  // membership. This prefilter may retain extra dates, never certify a day.
  const eligible=activeSectionWindows.length?horizon.filter(date=>
    activeSectionWindows.some(row=>
      (!row.startedAt||siteDate(row.startedAt,timeZone)<=date)&&
      (!row.endedAt||siteDate(row.endedAt,timeZone)>date)
    )):[];
  const toProbe=eligible.length?eligible:horizon.slice(0,1);
  return {
    candidates:toProbe.slice(0,FIRST_DAY_CANONICAL_QUERY_BUDGET),
    truncated:toProbe.length>FIRST_DAY_CANONICAL_QUERY_BUDGET,
    eligibleDays:eligible.length,
  };
}
