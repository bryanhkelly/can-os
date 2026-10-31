import { dateTimeInputValue, isValidTimeZone } from "./timezone";

/** A fall-back local clock time can correspond to two distinct instants. */
export type AmbiguousTimePolicy = "earlier" | "later" | "reject";

/**
 * Resolve a site-local datetime-local input to an ISO instant.
 * Rejects nonexistent spring-forward times; ambiguity must be explicitly resolved.
 */
export function siteLocalTimeToIso(
  value: string,
  timezone: string,
  ambiguity: AmbiguousTimePolicy = "reject",
): string {
  if (!isValidTimeZone(timezone)) throw new Error("Invalid site timezone");
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error("Enter a valid date and time");
  const [year, month, day, hour, minute] = match.slice(1).map(Number);
  const utc = Date.UTC(year!, month! - 1, day!, hour!, minute!);
  const check = new Date(utc);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month! - 1 ||
      check.getUTCDate() !== day || check.getUTCHours() !== hour ||
      check.getUTCMinutes() !== minute) throw new Error("Enter a valid date and time");

  // Search all realistic UTC offsets in 15-minute increments, including
  // half-hour and quarter-hour zones. Never depend on the browser's timezone.
  const matches: number[] = [];
  for (let offset = -14 * 60; offset <= 14 * 60; offset += 15) {
    const candidate = utc - offset * 60_000;
    if (dateTimeInputValue(new Date(candidate).toISOString(), timezone) === value) {
      matches.push(candidate);
    }
  }
  if (!matches.length) throw new Error(`That local time does not exist in ${timezone}`);
  if (matches.length > 1 && ambiguity === "reject") {
    throw new Error(`That local time is ambiguous in ${timezone}; choose earlier or later`);
  }
  return new Date(ambiguity === "later" ? matches[matches.length - 1]! : matches[0]!).toISOString();
}

/** Convert an ISO timestamp into a datetime-local input in the site's timezone. */
export const isoToSiteLocalInput = dateTimeInputValue;
