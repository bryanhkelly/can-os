import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  noncreditSelfEnrollmentClaims, participationAttributions,
} from "@/db/canonical-v301";
import { AuthorizationError, type CommandContext } from "@/domain/command-context";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * A provider role is NOT permission to adjudicate every Site in the network.
 * An immutable canonical delivery-Site attribution (not affiliate/reporting
 * Site membership) is required for completion and correction commands.
 *
 * Provider-wide or cross-Site reviewer roles need separate explicit approved
 * authorization and contract; do not infer it from organization membership.
 */
export async function assertNoncreditCompletionSiteScope(
  tx: Tx,
  actor: CommandContext,
  registration: { id: string; participantPersonId: string },
): Promise<void> {
  const exactSite = actor.scope.siteIds?.[0];
  if (!exactSite || actor.scope.siteIds?.length !== 1 ||
      actor.scope.organizationIds?.length !== 1)
    throw new AuthorizationError("one current provider Organization and delivery Site");

  const attributions = await tx.select({
    deliverySiteId: participationAttributions.deliverySiteId,
    classEnrollmentId: participationAttributions.classEnrollmentId,
  }).from(participationAttributions)
    .where(eq(participationAttributions.noncreditRegistrationId,registration.id))
    .limit(2);
  if (attributions.length !== 1 ||
      attributions[0]!.classEnrollmentId !== null ||
      attributions[0]!.deliverySiteId !== exactSite)
    throw new AuthorizationError("immutable same-Site noncredit completion attribution");

  const claims = await tx.select({
    siteId: noncreditSelfEnrollmentClaims.siteId,
    participantPersonId: noncreditSelfEnrollmentClaims.participantPersonId,
  }).from(noncreditSelfEnrollmentClaims)
    .where(eq(noncreditSelfEnrollmentClaims.registrationId,registration.id))
    .limit(2);
  // Existing direct assignments may lack a self-enrollment claim. Those must
  // still possess a verified immutable delivery-Site attribution.
  if (claims.length > 1 || (claims.length === 1 && (
    claims[0]!.siteId !== exactSite ||
    claims[0]!.participantPersonId !== registration.participantPersonId)))
    throw new AuthorizationError("registration Site and Person source mismatch");
}
