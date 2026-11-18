import { localClassTimeToInstant } from "./class-session-local-time";

/** Interpret optional registration windows at the hosting Site, not in the
 * operator's browser timezone. Reuse the Class Session DST rejection policy. */
export function classOfferingLocalTimeToUtc(
  local: string,
  siteTimeZone: string | null | undefined,
): string | null {
  if (!local) return null;
  if (!siteTimeZone)
    throw new Error("The hosting Site needs a configured time zone before registration dates can be saved.");
  return localClassTimeToInstant(local, siteTimeZone).toISOString();
}
