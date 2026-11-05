import { z } from "zod";

export const DEFAULT_SITE_TIMEZONE = "America/Los_Angeles";

const commonTimezones = [
  DEFAULT_SITE_TIMEZONE,
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Phoenix",
  "America/Anchorage",
  "Pacific/Honolulu",
  "UTC",
] as const;

export const siteTimezoneSchema = z.string().trim().min(3).max(80).refine(zone => {
  try { new Intl.DateTimeFormat("en-US", { timeZone: zone }); return true; }
  catch { return false; }
}, "Choose a valid school time zone");

export function siteTimezoneOptions(current?: string): string[] {
  return [...new Set([
    ...(current ? [current] : []),
    ...commonTimezones,
    ...Intl.supportedValuesOf("timeZone"),
  ])].filter(Boolean);
}