import type { AccessContext } from "./access-context";
import { AuthorizationError, assertCapability } from "./command-context";

/**
 * Credential issuer approval is not a network stewardship or Site identity
 * review permission. The dedicated reviewer is assigned independently to
 * the CAN institutional network and uses their existing CAN login.
 */
export function assertCANCredentialIssuerReviewer(
  actor: AccessContext,
  organization: {id:string;type:string}|undefined,
): void {
  if (!actor.actorPersonId || actor.sessionAccountId ||
      actor.role !== "can_credential_reviewer" ||
      actor.grantSiteId !== null ||
      actor.scope.organizationIds?.length !== 1 ||
      !organization || organization.type !== "can_network" ||
      organization.id !== actor.scope.organizationIds[0]) {
    throw new AuthorizationError("independent CAN credential issuer reviewer");
  }
  assertCapability(actor, "credential.issuer.review");
}
