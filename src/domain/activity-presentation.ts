import type { PublicActivitySummary } from "./parent-information";
import { verifiedPublicClaim } from "./parent-information";

/** Presentation taxonomy over canonical Activity.type; never a second catalog. */
export const activityPresentationCategories = [
  "athletics", "arts", "stem", "faith_service", "clubs_leadership", "outings", "other",
] as const;
export type ActivityPresentationCategory = typeof activityPresentationCategories[number];
export function activityPresentationCategory(type: string): ActivityPresentationCategory {
  switch (type.toLowerCase()) {
    case "athletics": case "sports": case "physical_education": return "athletics";
    case "arts": case "music": case "theater": return "arts";
    case "stem": case "robotics": case "science": case "technology": return "stem";
    case "faith": case "service": case "faith_service": return "faith_service";
    case "club": case "clubs": case "leadership": case "clubs_leadership": return "clubs_leadership";
    case "outing": case "outings": case "field_trip": return "outings";
    default: return "other";
  }
}

/**
 * Only call for offerings returned by readEnrichmentCatalog within a confirmed
 * Site publication gate. This is an approved-summary transform, not a grant of
 * permission to publish a Site or open registration.
 */
export function projectPublishedEnrichmentActivity(input: {
  name: string; seasonName: string; startsOn: string; endsOn: string;
  registrationOpen: boolean; seatsRemaining: number | null;
  packages?: readonly { available: boolean; seatsRemaining: number | null }[];
}): PublicActivitySummary {
  const hasSeats = input.packages?.length
    ? input.packages.some(item => item.available && item.seatsRemaining !== null && item.seatsRemaining > 0)
    : input.seatsRemaining !== null && input.seatsRemaining > 0;
  return {
    title: verifiedPublicClaim(input.name, "enrichment_catalog"),
    season: verifiedPublicClaim(input.seasonName, "enrichment_catalog"),
    dates: verifiedPublicClaim({startsOn: input.startsOn, endsOn: input.endsOn}, "enrichment_catalog"),
    registrationOpen: input.registrationOpen && hasSeats,
  };
}
