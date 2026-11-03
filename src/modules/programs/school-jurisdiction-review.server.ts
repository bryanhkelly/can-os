import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "@/db/client";
import {
  jurisdictionProfileVersions, jurisdictionProfileVerificationDecisions,
  actions, jurisdictions, organizations, programs, schoolYears, sites,
} from "@/db/schema";
import type { AccessContext } from "@/domain/access-context";
import { assertCapability, AuthorizationError } from "@/domain/command-context";
import { hasRegistrarAuthority } from "@/domain/school-roles";
import { isExtendedLearningType } from "@/domain/program-offerings";
import { evaluateSiteJurisdictionIdentity } from "@/domain/site-jurisdiction-identity";
import {
  hasCurrentIndependentJurisdictionReview, isSiteLocationChangePending,
} from "@/domain/school-jurisdiction-approval";
import { launchOpeningDate } from "@/domain/launch-opening-date";
import {
  evaluateSchoolJurisdictionRequirements,
  expandKnownSchoolGradeRange,
  isCurrentVerifiedJurisdictionProfileVersion,
  requiresFutureJurisdictionPolicyReview,
  type SchoolJurisdictionContext,
} from "@/domain/jurisdiction-applicability";
import { isJurisdictionProfileVerificationEvidenceCurrent, isOfficialJurisdictionSource, jurisdictionProfileSchema } from "@/domain/jurisdiction-profile";
import {
  jurisdictionReviewScopeFingerprint,
  projectSchoolJurisdictionReadiness,
  unavailableSchoolJurisdictionReadiness,
} from "@/domain/school-jurisdiction-readiness";

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
  const networkReviewer = actor.role === "can_jurisdiction_reviewer";
  if (!actor.actorPersonId || (!hasRegistrarAuthority(actor.role) && !networkReviewer))
    throw new AuthorizationError("verified school registrar or independent CAN legal reviewer");
  assertCapability(actor,networkReviewer?"jurisdiction.profile.verify":"program.read");
  const [school] = await executor.select({
    programId:programs.id, siteId:programs.siteId,
    organizationId:programs.organizationId,
    jurisdictionId:programs.jurisdictionId, type:programs.type,
    programMetadata:programs.metadata, gradeRange:programs.gradeRange,
    academicProviderOrganizationId:programs.academicProviderOrganizationId,
    deliveryModel:programs.deliveryModel, hostOrganizationId:programs.hostOrganizationId,
    siteOrganizationId:sites.organizationId, address:sites.address,
    siteUpdatedAt:sites.updatedAt,
    code:jurisdictions.code,countryCode:jurisdictions.countryCode,
  }).from(programs)
    .innerJoin(sites,eq(sites.id,programs.siteId))
    .innerJoin(jurisdictions,eq(jurisdictions.id,programs.jurisdictionId))
    .where(eq(programs.id,programId)).limit(1);
  if (!school || !school.siteId || school.siteOrganizationId !== school.organizationId)
    throw new AuthorizationError("school-specific jurisdiction review");
  if (networkReviewer) {
    if (actor.sessionAccountId || actor.grantSiteId !== null ||
      !actor.scope.organizationIds?.includes(school.academicProviderOrganizationId))
      throw new AuthorizationError("CAN institutional jurisdiction reviewer scope");
    const [institution]=await executor.select({id:organizations.id}).from(organizations)
      .where(and(eq(organizations.id,school.academicProviderOrganizationId),
        eq(organizations.type,"can_network"))).limit(1);
    if (!institution) throw new AuthorizationError("verified CAN academic institution");
  } else if (!actor.scope.organizationIds?.includes(school.organizationId) ||
    !actor.scope.siteIds?.includes(school.siteId) ||
    !actor.scope.programIds?.includes(programId)) {
    throw new AuthorizationError("school-specific jurisdiction review");
  }
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
  const actionRows=await executor.select({
    type:actions.type,status:actions.status,metadata:actions.metadata,
  }).from(actions).where(and(
    inArray(actions.type,["school_jurisdiction_legal_review","site_location_change_review"]),
    eq(actions.subjectType,"program"),eq(actions.subjectId,programId),
    eq(actions.organizationId,school.organizationId),eq(actions.siteId,school.siteId),
    eq(actions.programId,programId),
  )).orderBy(desc(actions.updatedAt)).limit(30);
  const legalAction=actionRows.find(row=>row.type==="school_jurisdiction_legal_review")??null;
  const locationAction=actionRows.find(row=>row.type==="site_location_change_review")??null;
  const addressChangeRevision=typeof locationAction?.metadata.siteAddressRevision==="string"
    ? locationAction.metadata.siteAddressRevision : null;
  const siteAddressRevision=school.siteUpdatedAt.toISOString();
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
  const location=evaluateSiteJurisdictionIdentity(school.address,{
    code:school.code,countryCode:school.countryCode,
  });
  const assignedState=school.code.toUpperCase().replace(/^US[-_]/,"");
  const locationReviewReason=location.reason;
  if (locationReviewReason) return {
    programId,siteId:school.siteId,revision:version?.revision ?? null,
    reviewRequired:true,locationReviewReason,plannedOpeningReviewReason:null,scopeFingerprint,
    siteAddressRevision,addressChangeRevision,policyReady:false,
    policyVersionId:version?.id ?? null,
    schoolReviewReason:locationReviewReason,reviewSources:[],decisions:[],candidateDisclosures:[],
    readiness:unavailableSchoolJurisdictionReadiness(locationReviewReason,
      version?.id ?? null,version?.revision ?? null),
  };
  if (!version) return {programId,siteId:school.siteId,revision:null,
    reviewRequired:true,locationReviewReason:null,plannedOpeningReviewReason:null,scopeFingerprint,
    siteAddressRevision,addressChangeRevision,policyReady:false,
    schoolReviewReason:"No verified jurisdiction profile for this Program",
    policyVersionId:null,reviewSources:[],decisions:[],candidateDisclosures:[],
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
    gradeLevels:expandKnownSchoolGradeRange(school.gradeRange),
    locality:location.county,
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
  const versionVerified=isCurrentVerifiedJurisdictionProfileVersion(versionGate,now);
  const parsedProfile=jurisdictionProfileSchema.safeParse(rawProfile);
  const reviewSources=networkReviewer && versionVerified && parsedProfile.success
    ? parsedProfile.data.evidence.filter(isOfficialJurisdictionSource) : [];
  const policyReady=!evaluated.reviewRequired && !plannedOpeningReviewReason;
  const stamp={scopeFingerprint,profileVersionId:version.id};
  const independentlyReviewed=hasCurrentIndependentJurisdictionReview(legalAction,stamp,now);
  const locationChangePending=isSiteLocationChangePending(locationAction,stamp,now);
  const schoolReviewReason=!policyReady
    ? plannedOpeningReviewReason??"At least one school-specific requirement needs CAN legal review"
    : locationChangePending
      ? "The revised physical Site location requires independent CAN legal review"
      : !independentlyReviewed
        ? "This school's current location and Program scope have not been independently verified"
        : null;
  const schoolReviewReady=policyReady && !schoolReviewReason;
  const readiness=schoolReviewReady?projectSchoolJurisdictionReadiness({
    profile:rawProfile,decisions:evaluated.decisions,verifiedCurrent:true,
    profileVersionId:version.id,revision:version.revision,
    reviewedAt:version.reviewedAt,nextReviewAt:version.nextReviewAt,
  }):unavailableSchoolJurisdictionReadiness(
    schoolReviewReason??"School legal review is required",version.id,version.revision,
  );
  return {
    programId,siteId:school.siteId,revision:version.revision,
    reviewRequired:!schoolReviewReady,
    policyReady,policyVersionId:version.id,
    schoolReviewReason,siteAddressRevision,addressChangeRevision,
    locationReviewReason:null,plannedOpeningReviewReason,scopeFingerprint,
    reviewSources,decisions:evaluated.decisions,
    readiness,
    // Internal candidate disclosures are not approved for public publication.
    candidateDisclosures:schoolReviewReady?evaluated.publicDisclosures:[],
  };
}
