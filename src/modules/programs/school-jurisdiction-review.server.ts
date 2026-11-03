import { and, desc, eq, isNull, or } from "drizzle-orm";
import { db } from "@/db/client";
import {
  jurisdictionProfileVersions, jurisdictionProfileVerificationDecisions,
  jurisdictions, programs, schoolYears, sites,
} from "@/db/schema";
import type { AccessContext } from "@/domain/access-context";
import { assertCapability, AuthorizationError } from "@/domain/command-context";
import { hasRegistrarAuthority } from "@/domain/school-roles";
import { isExtendedLearningType } from "@/domain/program-offerings";
import { launchOpeningDate } from "@/domain/launch-opening-date";
import {
  evaluateSchoolJurisdictionRequirements,
  isCurrentVerifiedJurisdictionProfileVersion,
  requiresFutureJurisdictionPolicyReview,
  type SchoolJurisdictionContext,
} from "@/domain/jurisdiction-applicability";
import { isJurisdictionProfileVerificationEvidenceCurrent } from "@/domain/jurisdiction-profile";
import {
  jurisdictionReviewScopeFingerprint,
  projectSchoolJurisdictionReadiness,
  unavailableSchoolJurisdictionReadiness,
} from "@/domain/school-jurisdiction-readiness";

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
    academicProviderOrganizationId:programs.academicProviderOrganizationId,
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
  // School-year changes and Site address edits must reopen stale legal-review Actions.
  // This scope fingerprint is a change detector, not itself an approval.
  const years = await executor.select({
    id:schoolYears.id,key:schoolYears.key,status:schoolYears.status,
    startsOn:schoolYears.startsOn,endsOn:schoolYears.endsOn,
  }).from(schoolYears).where(and(
    eq(schoolYears.organizationId,school.organizationId),
    eq(schoolYears.siteId,school.siteId),
    or(eq(schoolYears.programId,programId),isNull(schoolYears.programId)),
  )).orderBy(desc(schoolYears.startsOn)).limit(100);
  const scopeFingerprint = jurisdictionReviewScopeFingerprint({
    siteId:school.siteId,address:school.address,
    jurisdictionId:school.jurisdictionId,
    type:school.type,gradeRange:school.gradeRange,
    deliveryModel:school.deliveryModel,hostOrganizationId:school.hostOrganizationId,
    academicProviderOrganizationId:school.academicProviderOrganizationId,
    operatingModel:school.programMetadata.jurisdictionOperatingModel,
    responsibleEntity:school.programMetadata.jurisdictionResponsibleEntity,
    targetOpeningDate:school.programMetadata.targetOpeningDate,
    schoolYears:years,
  });
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
    reviewRequired:true,locationReviewReason,plannedOpeningReviewReason:null,scopeFingerprint,
    decisions:[],candidateDisclosures:[],
    readiness:unavailableSchoolJurisdictionReadiness(locationReviewReason,
      version?.id ?? null,version?.revision ?? null),
  };
  if (!version) return {programId,siteId:school.siteId,revision:null,
    reviewRequired:true,locationReviewReason:null,plannedOpeningReviewReason:null,scopeFingerprint,
    decisions:[],candidateDisclosures:[],
    readiness:unavailableSchoolJurisdictionReadiness("No published jurisdiction policy is available")};
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
  const rawProfile = {
    ...version.profile,summary:version.summary,evidence:version.evidence,
  };
  const versionGate = {
    status:version.status,
    verificationStatus:currentDecision?version.verificationStatus:"unverified",
    verifiedByPersonId:currentDecision?version.verifiedByPersonId:null,
    publishedAt:version.publishedAt,effectiveAt:version.effectiveAt,
    nextReviewAt:version.nextReviewAt,evidence:version.evidence,
    verificationEvidence:version.verificationEvidence,
  };
  const evaluated = evaluateSchoolJurisdictionRequirements(
    rawProfile,versionGate,context,now,
  );
  const plannedOpeningReviewReason = requiresFutureJurisdictionPolicyReview(
    version.nextReviewAt, [
      ...years.map(year=>year.startsOn),
      ...(launchOpeningDate(school.programMetadata)
        ? [launchOpeningDate(school.programMetadata)!] : []),
    ], now,
  ) ? "Current policy must be re-reviewed before the planned opening or upcoming academic year" : null;
  const readiness = projectSchoolJurisdictionReadiness({
    profile:rawProfile,decisions:evaluated.decisions,
    verifiedCurrent:isCurrentVerifiedJurisdictionProfileVersion(versionGate,now),
    profileVersionId:version.id,revision:version.revision,
    reviewedAt:version.reviewedAt,nextReviewAt:version.nextReviewAt,
  });
  return {
    programId,siteId:school.siteId,revision:version.revision,
    reviewRequired:evaluated.reviewRequired || Boolean(plannedOpeningReviewReason),
    locationReviewReason:null,plannedOpeningReviewReason,scopeFingerprint,
    decisions:evaluated.decisions,
    readiness,
    // Candidates only: requires separate institution-approved public DTO gate.
    candidateDisclosures:evaluated.publicDisclosures,
  };
}
