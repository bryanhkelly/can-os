/**
 * Suggest the next school year a launching school would realistically open
 * for, derived from the current date instead of a frozen hardcoded year.
 * Suggestion only: every field stays editable in the School-Year Studio and
 * server validation remains authoritative.
 *
 * Rule: January–June suggests the academic year starting this August;
 * July–December suggests the one starting next August. Dates follow the
 * common mid-August to early-June instructional year.
 */
export function suggestedSchoolYear(now: Date = new Date()): {
  name: string;
  key: string;
  startsOn: string;
  endsOn: string;
} {
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
