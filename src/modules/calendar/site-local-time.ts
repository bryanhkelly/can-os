import { dateTimeInputValue, isValidTimeZone } from "./timezone";

export type AmbiguousTimePolicy = "earlier" | "later" | "reject";

function parseLocalClock(value: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error("Enter a valid date and time");
  const [, year, month, day, hour, minute] = match.map(Number);
  const date = new Date(0);
  date.setUTCFullYear(year!, month! - 1, day!);
  date.setUTCHours(hour!, minute!, 0, 0);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month! - 1 ||
      date.getUTCDate() !== day || date.getUTCHours() !== hour ||
      date.getUTCMinutes() !== minute) throw new Error("Enter a valid date and time");
  return date.getTime();
}

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
  if (!isValidTimeZone(timezone)) throw new Error("Invalid site timezone");
  if (ambiguity !== "reject" && ambiguity !== "earlier" && ambiguity !== "later") {
    throw new Error("Invalid ambiguous time policy");
  }
  const localAsUtc = parseLocalClock(value);
  const offsets = new Set<number>();
  // Sampling both sides of a transition captures standard and daylight offsets,
  // including half-hour transitions and quarter-hour timezone offsets.
  for (const delta of [-48, -24, -12, 0, 12, 24, 48]) {
    const instant = localAsUtc + delta * 3_600_000;
    const represented = parseLocalClock(dateTimeInputValue(new Date(instant).toISOString(), timezone));
    offsets.add(represented - instant);
  }
  const matches = [...offsets].map(offset => localAsUtc - offset)
    .filter(candidate => dateTimeInputValue(new Date(candidate).toISOString(), timezone) === value)
    .sort((a, b) => a - b);
  if (!matches.length) throw new Error(`That local time does not exist in ${timezone}`);
  if (matches.length > 1 && ambiguity === "reject")
    throw new Error(`That local time is ambiguous in ${timezone}; choose earlier or later`);
  return new Date(ambiguity === "later" ? matches[matches.length - 1]! : matches[0]!).toISOString();
}

export const isoToSiteLocalInput = dateTimeInputValue;
