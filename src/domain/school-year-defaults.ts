import { isLaunchOpeningDate } from "./launch-opening-date";

/**
 * Suggest the next school year a launching school would realistically open
 * for, derived from the current date instead of a frozen hardcoded year.
 * Suggestion only: every field stays editable in the School-Year Studio and
 * server validation remains authoritative.
 *
 * A supplied target opening date takes precedence, stays date-only and is
 * used as the suggested first day. All dates remain editable.
 * Without a target: January–June suggests the academic year starting this August;
 * July–December suggests the one starting next August. Dates follow the
 * common mid-August to early-June instructional year.
 */
export function suggestedSchoolYear(now: Date = new Date(), targetOpeningDate?: string): {
  name: string;
  key: string;
  startsOn: string;
  endsOn: string;
} {
  if (targetOpeningDate !== undefined) {
    if (!isLaunchOpeningDate(targetOpeningDate)) throw new Error("Choose a valid target opening date");
    const year = Number(targetOpeningDate.slice(0, 4));
    // Keep the selected opening day. January–early June openings belong to
    // the preceding academic year; summer/fall openings end the next June.
    const startYear = year - (targetOpeningDate.slice(5) < "06-10" ? 1 : 0);
    const endYear = startYear + 1;
    return {
      name: `${startYear}–${endYear} School Year`,
      key: `${startYear}-${String(endYear).slice(2)}`,
      startsOn: targetOpeningDate,
      endsOn: `${endYear}-06-10`,
    };
  }
  const month = now.getMonth(); // 0 = January
  const startYear = now.getFullYear() + (month >= 6 ? 1 : 0);
  const endYear = startYear + 1;
  return {
    name: `${startYear}–${endYear} School Year`,
    key: `${startYear}-${String(endYear).slice(2)}`,
    startsOn: `${startYear}-08-15`,
    endsOn: `${endYear}-06-10`,
  };
}

