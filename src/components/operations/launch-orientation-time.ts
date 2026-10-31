import { siteLocalTimeToIso } from "@/modules/calendar/site-local-time";

/** Reject nonexistent and ambiguous site-local times before scheduling orientation. */
export function unambiguousInstant(local: string, timezone: string): string {
  return siteLocalTimeToIso(local, timezone, "reject");
}
