import { z } from "zod";
import { AuthorizationError } from "./command-context";

/**
 * WS5 governed rollout approval rules, independent of persistence.
 * This is a proposed contract for WS00's approval/event ledger. The current
 * production flow still uses published Offering versions, live adoptions and
 * canonical Class command authority, not these proposed statuses.
 */
export const publisherRolloutStateSchema = z.enum([
  "draft", "submitted", "approved", "denied", "superseded", "retired",
]);
export const operatorRolloutStateSchema = z.enum([
  "draft", "submitted", "approved", "denied", "withdrawn", "activated", "retired",
]);
export const rolloutDecisionInputSchema = z.object({
  subjectId: z.string().uuid(),
  expectedRevision: z.number().int().min(1),
  decision: z.enum(["approved", "denied"]),
  evidenceVersionId: z.string().uuid(),
  reason: z.string().trim().min(10).max(2000),
}).strict();

export type PublisherRolloutState = z.infer<typeof publisherRolloutStateSchema>;
export type OperatorRolloutState = z.infer<typeof operatorRolloutStateSchema>;

export type RolloutDecisionAuthority = {
  reviewerPersonId: string;
  reviewerOrganizationId: string;
  publisherOrganizationId: string;
  authorPersonId: string;
  role: "publisher_reviewer" | "local_operator";
  evidenceVersionId: string | null;
};

export function assertIndependentPublisherDecision(
  authority: RolloutDecisionAuthority,
): void {
  if (authority.role !== "publisher_reviewer" ||
      authority.reviewerOrganizationId !== authority.publisherOrganizationId ||
      authority.reviewerPersonId === authority.authorPersonId ||
      !authority.evidenceVersionId) {
    throw new AuthorizationError("independent publisher reviewer and current evidence");
  }
}

const publisherTransitions: Record<PublisherRolloutState, readonly PublisherRolloutState[]> = {
  draft: ["submitted"],
  submitted: ["approved", "denied"],
  approved: ["superseded", "retired"],
  denied: [],
  superseded: [],
  retired: [],
};
const operatorTransitions: Record<OperatorRolloutState, readonly OperatorRolloutState[]> = {
  draft: ["submitted", "withdrawn"],
  submitted: ["approved", "denied", "withdrawn"],
  approved: ["activated", "withdrawn"],
  denied: [],
  withdrawn: [],
  activated: ["retired"],
  retired: [],
};

/** An editor submits; an independent reviewer decides. Immutable decisions
 * and revision increments are separately enforced by the proposed ledger.
 */
export function assertPublisherRolloutTransition(
  from: PublisherRolloutState,
  to: PublisherRolloutState,
  actor: "publisher_author" | "publisher_reviewer",
  authority?: RolloutDecisionAuthority,
): void {
  if (!publisherTransitions[from].includes(to))
    throw new AuthorizationError("valid publisher rollout state transition");
  if (to === "approved" || to === "denied") {
    if (actor !== "publisher_reviewer" || !authority)
      throw new AuthorizationError("independent publisher rollout review");
    assertIndependentPublisherDecision(authority);
  } else if (actor !== "publisher_author") {
    throw new AuthorizationError("publisher author owns proposal and retirement transitions");
  }
}

export function assertOperatorRolloutTransition(
  from: OperatorRolloutState,
  to: OperatorRolloutState,
  actor: "local_operator" | "publisher_reviewer",
  authority?: RolloutDecisionAuthority,
): void {
  if (!operatorTransitions[from].includes(to))
    throw new AuthorizationError("valid operator rollout transition");
  if (to === "approved" || to === "denied") {
    if (actor !== "publisher_reviewer" || !authority)
      throw new AuthorizationError("independent local variation review");
    assertIndependentPublisherDecision(authority);
  } else if (actor !== "local_operator") {
    throw new AuthorizationError("current local operator owns deployment transitions");
  }
}

export type AdoptedRolloutIdentity = {
  planOfferingVersionId: string;
  adoptionOfferingVersionId: string;
  deployedOfferingVersionId: string;
  organizationId: string;
  authorizedOrganizationId: string;
  siteId: string;
  authorizedSiteIds: readonly string[];
  operationGrantActive: boolean;
  adoptionApproved: boolean;
  siteGrantActive: boolean;
  planState: PublisherRolloutState;
};

/** These checks only narrow eligibility. They never create grants and are
 * ALWAYS repeated against current database relationships during commands.
 */
export function assertMatchingCurrentRolloutAdoption(identity: AdoptedRolloutIdentity): void {
  if (identity.planState !== "approved" ||
      identity.planOfferingVersionId !== identity.adoptionOfferingVersionId ||
      identity.planOfferingVersionId !== identity.deployedOfferingVersionId ||
      identity.organizationId !== identity.authorizedOrganizationId ||
      !identity.authorizedSiteIds.includes(identity.siteId) ||
      !identity.operationGrantActive || !identity.adoptionApproved ||
      !identity.siteGrantActive)
    throw new AuthorizationError("current exact-version Offering adoption and authorized local Site");
}

/** Plan and adopted Class revisions are intentionally immutable. A new
 * publisher Offering version requires fresh approval and local adoption.
 */
export function rolloutUpgradeRequired(
  adoptedVersionId: string,
  proposedVersionId: string,
): boolean {
  return adoptedVersionId !== proposedVersionId;
}
