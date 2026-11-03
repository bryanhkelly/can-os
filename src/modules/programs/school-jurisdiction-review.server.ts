import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  jurisdictionProfileVersions, jurisdictionProfileVerificationDecisions,
  jurisdictions, programs, sites,
} from "@/db/schema";
import type { AccessContext } from "@/domain/access-context";
import { assertCapability, AuthorizationError } from "@/domain/command-context";
import { hasRegistrarAuthority } from "@/domain/school-roles";
import { isExtendedLearningType } from "@/domain/program-offerings";
import {
  evaluateSchoolJurisdictionRequirements,
  type SchoolJurisdictionContext,
} from "@/domain/jurisdiction-applicability";
import { isJurisdictionProfileVerificationEvidenceCurrent } from "@/domain/jurisdiction-profile";

/** Physical Site state is independently confirmed; timezone is never a legal locator. */
function siteStateCode(address: Record<string, unknown> | null): string | null {
  if (!address) return null;
  const raw = address.stateCode ?? address.state ?? address.regionCode;
  if (typeof raw !== "string") return null;
  const code = raw.trim().toUpperCase().replace(/^US[-_]/, "");
  return /^[A-Z]{2}$/.test(code) ? code : null;
}

/**
 * Authenticated internal review. The result is NOT itself permission to
 * publish legal disclosures. Agent A must apply its separate institutional
 * public-claim approval and live agreement/revocation gates.
 */
export async function readSchoolJurisdictionReview(
  actor: AccessContext, programId: string,
  executor: Pick<typeof db,"select"> = db,
  now = new Date(),
) {
  if (!actor.actorPersonId || !hasRegistrarAuthority(actor.role))
    throw new AuthorizationError("verified registrar");
  assertCapability(actor,"program.read");
  const [school] = await executor.select({
    programId:programs.id, siteId:programs.siteId,
    organizationId:programs.organizationId,
    jurisdictionId:programs.jurisdictionId, type:programs.type,
    programMetadata:programs.metadata, gradeRange:programs.gradeRange,
    deliveryModel:programs.deliveryModel, hostOrganizationId:programs.hostOrganizationId,
    siteOrganizationId:sites.organizationId, address:sites.address,
    code:jurisdictions.code,
  }).from(programs)
    .innerJoin(sites,eq(sites.id,programs.siteId))
    .innerJoin(jurisdictions,eq(jurisdictions.id,programs.jurisdictionId))
    .where(eq(programs.id,programId)).limit(1);
  if (!school || !school.siteId ||
    school.siteOrganizationId !== school.organizationId ||
    !actor.scope.organizationIds?.includes(school.organizationId) ||
    !actor.scope.siteIds?.includes(school.siteId) ||
    !actor.scope.programIds?.includes(programId))
    throw new AuthorizationError("school-specific jurisdiction review");
  const [version] = await executor.select({
    id:jurisdictionProfileVersions.id, revision:jurisdictionProfileVersions.revision,
    status:jurisdictionProfileVersions.status,
    verificationStatus:jurisdictionProfileVersions.verificationStatus,
    verifiedByPersonId:jurisdictionProfileVersions.verifiedByPersonId,
    lastEditedByPersonId:jurisdictionProfileVersions.lastEditedByPersonId,
    verificationEvidence:jurisdictionProfileVersions.verificationEvidence,
    evidence:jurisdictionProfileVersions.evidence,
    profile:jurisdictionProfileVersions.profile,
    summary:jurisdictionProfileVersions.summary,
    effectiveAt:jurisdictionProfileVersions.effectiveAt,
    nextReviewAt:jurisdictionProfileVersions.nextReviewAt,
    reviewedAt:jurisdictionProfileVersions.reviewedAt,
    sourceUpdatedAt:jurisdictionProfileVersions.sourceUpdatedAt,
    publishedAt:jurisdictionProfileVersions.publishedAt,
  }).from(jurisdictionProfileVersions).where(and(
    eq(jurisdictionProfileVersions.jurisdictionId,school.jurisdictionId),
    eq(jurisdictionProfileVersions.status,"published"),
  )).orderBy(desc(jurisdictionProfileVersions.publishedAt)).limit(1);
  // A jurisdiction assignment alone does not prove the school's physical state.
  // Missing/unrecognized address or disagreement requires an explicit review,
  // not a not-applicable decision or a publishable legal disclosure.
  const assignedState = school.code.toUpperCase().replace(/^US[-_]/, "");
  const physicalState = siteStateCode(school.address);
  const locationReviewReason = !physicalState
    ? "Site physical state is missing or unconfirmed"
    : physicalState !== assignedState
      ? "Site physical state disagrees with Program jurisdiction"
      : null;
  if (locationReviewReason) return {
    programId,siteId:school.siteId,revision:version?.revision ?? null,
    reviewRequired:true,locationReviewReason,
    decisions:[],candidateDisclosures:[],
  };
  if (!version) return {programId,siteId:school.siteId,revision:null,
    reviewRequired:true,decisions:[],candidateDisclosures:[]};
  const [decision] = await executor.select({
    reviewerPersonId:jurisdictionProfileVerificationDecisions.reviewerPersonId,
    evidence:jurisdictionProfileVerificationDecisions.evidence,
  }).from(jurisdictionProfileVerificationDecisions)
    .where(eq(jurisdictionProfileVerificationDecisions.profileVersionId,version.id))
    .orderBy(desc(jurisdictionProfileVerificationDecisions.createdAt)).limit(1);
  const currentDecision = Boolean(decision &&
    decision.reviewerPersonId === version.verifiedByPersonId &&
    version.verifiedByPersonId !== version.lastEditedByPersonId &&
    isJurisdictionProfileVerificationEvidenceCurrent(decision.evidence,version.evidence) &&
    isJurisdictionProfileVerificationEvidenceCurrent(
      version.verificationEvidence,version.evidence) &&
    (decision.evidence as {note?:unknown}).note ===
      (version.verificationEvidence as {note?:unknown}).note &&
    version.reviewedAt &&
    (!version.sourceUpdatedAt || version.sourceUpdatedAt <= version.reviewedAt));
  const metadata = school.programMetadata;
  const model = typeof metadata.jurisdictionOperatingModel === "string"
    ? metadata.jurisdictionOperatingModel : null;
  const entity = metadata.jurisdictionResponsibleEntity;
  const responsibleEntity = entity === "school_of_record" || entity === "host_church"
    ? entity : null;
  const state = assignedState;
  const delivery = school.deliveryModel;
  const online = Boolean(delivery.liveOnline || delivery.asynchronous);
  const onsite = Boolean(delivery.onsite);
  const context:SchoolJurisdictionContext = {
    state,operatingModel:model,responsibleEntity,
    programType:school.type,
    serviceType:isExtendedLearningType(school.type)?"enrichment":"academic",
    deliveryModel: onsite && online ? "hybrid" :
      onsite ? "onsite" : online ? "online" : null,
    // Grade range endpoints cannot safely prove every intervening grade.
    gradeLevels:school.gradeRange.min === school.gradeRange.max
      ? [school.gradeRange.min] : [],
    locality:typeof school.address?.county === "string"
      ? school.address.county : null,
  };
  const evaluated = evaluateSchoolJurisdictionRequirements({
    ...version.profile,summary:version.summary,evidence:version.evidence,
  },{
    status:version.status,
    verificationStatus:currentDecision?version.verificationStatus:"unverified",
    verifiedByPersonId:currentDecision?version.verifiedByPersonId:null,
    publishedAt:version.publishedAt,effectiveAt:version.effectiveAt,
    nextReviewAt:version.nextReviewAt,evidence:version.evidence,
    verificationEvidence:version.verificationEvidence,
  },context,now);
  return {
    programId,siteId:school.siteId,revision:version.revision,
    reviewRequired:evaluated.reviewRequired,
    decisions:evaluated.decisions,
    // Candidates only: requires separate institution-approved public DTO gate.
    candidateDisclosures:evaluated.publicDisclosures,
  };
}
