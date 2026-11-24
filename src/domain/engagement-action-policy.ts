import type { EngagementDefinition } from "./engagement-definition";
import type { GoDestination } from "./site-go-links";

/**
 * A visual CTA is not a mutation. An interaction may be advertised only if the
 * downstream destination is an appropriate, separately governed capability.
 */
export function engagementActionAvailable(
  interaction:EngagementDefinition["interaction"],
  destination:GoDestination,
):boolean {
  if(interaction==="discover")return true;
  if(interaction==="respond"){
    return destination.kind==="information" ||
      (destination.kind==="site-page" && destination.page==="contact");
  }
  if(interaction==="register"){
    // A published Class can still be assignment- or approval-only; /class is
    // discovery rather than a guaranteed registration transaction.
    return destination.kind==="adult-training"||destination.kind==="enrichment";
  }
  // No universal hiring application, booking, payment, agreement acceptance or
  // verified resume adapters are installed yet. Never fabricate those actions.
  return false;
}

export function engagementDestination(definition:EngagementDefinition):GoDestination{
  return definition.execution.mode==="page"
    ? definition.execution.action:definition.execution.destination;
}
