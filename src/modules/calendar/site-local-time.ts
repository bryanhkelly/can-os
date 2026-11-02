import { dateTimeInputInTimezone, dateTimeInputValue, type AmbiguousTimePolicy } from "./timezone";
export type { AmbiguousTimePolicy } from "./timezone";

/**
 * Convert site-local datetime-local input into a UTC ISO timestamp.
 * Probe offsets before and after the local date so DST transitions yield both
 * possible instants. A nonexistent time has no valid matching instant.
 */
export function siteLocalTimeToIso(
  value: string,
  timezone: string,
  ambiguity: AmbiguousTimePolicy = "reject",
): string {
  return dateTimeInputInTimezone(value, timezone, ambiguity);
}

export const isoToSiteLocalInput = dateTimeInputValue;
