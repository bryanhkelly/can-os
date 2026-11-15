import { z } from "zod";
import type { AccessContext } from "@/domain/access-context";
import { AuthorizationError, assertCapability } from "@/domain/command-context";

export const siteIdentityRequestSchema=z.object({
  publicSiteId:z.string().uuid(),
  canonicalSiteId:z.string().uuid(),
  evidenceReference:z.string().trim().min(12).max(700),
}).strict();

export const siteIdentityReviewSchema=z.object({
  publicSiteId:z.string().uuid(),
  decision:z.enum(["approve","reject","revoke"]),
  reason:z.string().trim().min(15).max(1200),
}).strict();

export const siteIdentityConfirmationSchema=z.object({
  publicSiteId:z.string().uuid(),
}).strict();

export function assertCANIdentityReviewer(
  actor:AccessContext, organization:{id:string;type:string}|undefined,
):void {
  if(!actor.actorPersonId || actor.sessionAccountId || actor.grantSiteId!==null ||
     actor.role!=="can_network_steward" || !organization ||
     organization.type!=="can_network" ||
     !actor.scope.organizationIds?.includes(organization.id))
    throw new AuthorizationError("independent CAN institutional Site identity reviewer");
  assertCapability(actor,"site.identity.review");
}

/** A Site link needs a verified native Site operator and a separate reviewer.
 * This is a correspondence, never an ownership or enrollment grant. */
export function canApproveSiteIdentity(input:{
  requesterPersonId:string;
  reviewerPersonId:string;
  canonicalConfirmedAt:Date|null;
  canonicalOperatorStillAuthorized:boolean;
}) {
  return input.requesterPersonId!==input.reviewerPersonId &&
    input.canonicalConfirmedAt!==null &&
    input.canonicalOperatorStillAuthorized;
}
