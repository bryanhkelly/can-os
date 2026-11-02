import { AuthorizationError, assertCapability } from "./command-context";
import type { AccessContext } from "./access-context";

export function assertCANSteward(actor: AccessContext, organization: { id: string; type: string },
  capability: "network.agreements.verify" | "network.admins.provision") {
  if (actor.role !== "can_network_steward" || !actor.actorPersonId || actor.grantSiteId !== null ||
      !actor.scope.organizationIds?.includes(organization.id) || organization.type !== "can_network")
    throw new AuthorizationError("verified CAN network steward");
  assertCapability(actor, capability);
}

export type NetworkAgreementWindow = {
  validFrom: Date;
  validThrough: Date;
  revokedAt: Date | null;
};

/** Dates are inclusive-start/exclusive-end; a revoked or expired contract never authorizes new actions. */
export function isNetworkAgreementActive(agreement: NetworkAgreementWindow, at = new Date()) {
  return !agreement.revokedAt && agreement.validFrom <= at && agreement.validThrough > at;
}

export function assertNetworkAgreementActive(agreements: readonly NetworkAgreementWindow[], at = new Date()) {
  if (!agreements.some(agreement => isNetworkAgreementActive(agreement, at)))
    throw new AuthorizationError("current independently verified denomination agreement");
}

export type AgreementEvidence = {
  subjectType: string;
  subjectId: string;
  category: string;
  verifiedAt: Date | null;
  verifiedByPersonId: string | null;
  expiresAt: Date | null;
  metadata: Record<string, unknown>;
};

export function assertVerifiedAgreementDocument(document: AgreementEvidence | undefined,
  organizationId: string, at = new Date()) {
  if (!document || document.subjectType !== "organization" || document.subjectId !== organizationId ||
      document.category !== "network_agreement" || !document.verifiedAt ||
      !document.verifiedByPersonId || document.verifiedAt > at ||
      (document.expiresAt && document.expiresAt <= at))
    throw new AuthorizationError("independently verified signed network agreement document");
}

export function assertVerifiedHQAuthorityDocument(document: AgreementEvidence | undefined,
  organizationId: string, email: string, at = new Date()) {
  if (!document || document.subjectType !== "organization" || document.subjectId !== organizationId ||
      document.category !== "network_hq_authority" || !document.verifiedAt ||
      !document.verifiedByPersonId || document.verifiedAt > at ||
      (document.expiresAt && document.expiresAt <= at) ||
      document.metadata.authorizedEmailNormalized !== email)
    throw new AuthorizationError("independently verified HQ officer authority document");
}
