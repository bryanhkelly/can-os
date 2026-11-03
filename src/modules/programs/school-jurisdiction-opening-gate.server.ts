import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "@/db/client";
import { actions,documents,jurisdictionProfileVerificationDecisions,jurisdictionProfileVersions,
  jurisdictions,programs,schoolYears,sites } from "@/db/schema";
import { AuthorizationError } from "@/domain/command-context";
import { evaluateSiteJurisdictionIdentity } from "@/domain/site-jurisdiction-identity";
import { jurisdictionReviewScopeFingerprint } from "@/domain/school-jurisdiction-readiness";
import {
  hasCurrentIndependentJurisdictionReview,hasCurrentJurisdictionRequirementEvidence,
  isSiteLocationChangePending,
  openingApprovalPredatesLocationChange,
} from "@/domain/school-jurisdiction-approval";
import {
  evaluateSchoolJurisdictionRequirements,
  expandKnownSchoolGradeRange,requiresFutureJurisdictionPolicyReview,
} from "@/domain/jurisdiction-applicability";
import { isExtendedLearningType } from "@/domain/program-offerings";
import { launchOpeningDate } from "@/domain/launch-opening-date";
import { isJurisdictionProfileVerificationEvidenceCurrent,jurisdictionProfileSchema } from "@/domain/jurisdiction-profile";

/**
 * C-owned fail-closed guard for Integration I to insert into the canonical
 * opening approval, activation and onsite-day services. This performs NO
 * side effects and cannot authorize a school to open by itself.
 *
 * Never call before the existing owner has authorized the Program/actor.
 * I must wire this under its existing Program/School lock and transaction.
 */
export async function requireCurrentSchoolJurisdictionForOpening(
  executor: Pick<typeof db,"select">,
  programId: string,
  options: {
    now?: Date;
    openingApprovedAt?: Date | null;
    configurationCreatedAt: Date | null;
  },
) {
  const now=options.now??new Date();
  const [school]=await executor.select({
    organizationId:programs.organizationId,siteId:programs.siteId,
    jurisdictionId:programs.jurisdictionId,type:programs.type,
    metadata:programs.metadata,gradeRange:programs.gradeRange,
    deliveryModel:programs.deliveryModel,
    hostOrganizationId:programs.hostOrganizationId,
    academicProviderOrganizationId:programs.academicProviderOrganizationId,
    address:sites.address,siteOrganizationId:sites.organizationId,
    code:jurisdictions.code,countryCode:jurisdictions.countryCode,
  }).from(programs).innerJoin(sites,eq(sites.id,programs.siteId))
    .innerJoin(jurisdictions,eq(jurisdictions.id,programs.jurisdictionId))
    .where(eq(programs.id,programId)).limit(1);
  if(!school?.siteId || school.siteOrganizationId!==school.organizationId)
    throw new AuthorizationError("canonical school Site and Program ownership");
  const location=evaluateSiteJurisdictionIdentity(school.address,{
    code:school.code,countryCode:school.countryCode,
  });
  if(location.status!=="matched_location_facts")
    throw new AuthorizationError("confirmed physical school address and jurisdiction");
  const years=await executor.select({
    id:schoolYears.id,key:schoolYears.key,status:schoolYears.status,
    startsOn:schoolYears.startsOn,endsOn:schoolYears.endsOn,
  }).from(schoolYears).where(and(
    eq(schoolYears.organizationId,school.organizationId),
    eq(schoolYears.siteId,school.siteId),
    or(eq(schoolYears.programId,programId),isNull(schoolYears.programId)),
  )).orderBy(desc(schoolYears.startsOn)).limit(100);
  const fingerprint=jurisdictionReviewScopeFingerprint({
    siteId:school.siteId,address:school.address,
    jurisdictionId:school.jurisdictionId,type:school.type,
    gradeRange:school.gradeRange,deliveryModel:school.deliveryModel,
    hostOrganizationId:school.hostOrganizationId,
    academicProviderOrganizationId:school.academicProviderOrganizationId,
    operatingModel:school.metadata.jurisdictionOperatingModel,
    responsibleEntity:school.metadata.jurisdictionResponsibleEntity,
    targetOpeningDate:school.metadata.targetOpeningDate,
    schoolYears:years,
  });
  const [policy]=await executor.select().from(jurisdictionProfileVersions)
    .where(and(eq(jurisdictionProfileVersions.jurisdictionId,school.jurisdictionId),
      eq(jurisdictionProfileVersions.status,"published")))
    .orderBy(desc(jurisdictionProfileVersions.publishedAt)).limit(1);
  if(!policy)
    throw new AuthorizationError("current independently published jurisdiction policy");
  const [decision]=await executor.select({
    reviewerPersonId:jurisdictionProfileVerificationDecisions.reviewerPersonId,
    evidence:jurisdictionProfileVerificationDecisions.evidence,
  }).from(jurisdictionProfileVerificationDecisions)
    .where(eq(jurisdictionProfileVerificationDecisions.profileVersionId,policy.id))
    .orderBy(desc(jurisdictionProfileVerificationDecisions.createdAt)).limit(1);
  const current=Boolean(decision && policy.verifiedByPersonId &&
    decision.reviewerPersonId===policy.verifiedByPersonId &&
    policy.verifiedByPersonId!==policy.lastEditedByPersonId &&
    isJurisdictionProfileVerificationEvidenceCurrent(decision.evidence,policy.evidence) &&
    isJurisdictionProfileVerificationEvidenceCurrent(policy.verificationEvidence,policy.evidence) &&
    (decision.evidence as {note?:unknown}).note ===
      (policy.verificationEvidence as {note?:unknown}).note &&
    policy.reviewedAt && (!policy.sourceUpdatedAt || policy.sourceUpdatedAt<=policy.reviewedAt));
  const responsible=school.metadata.jurisdictionResponsibleEntity;
  const delivery=school.deliveryModel;
  const onsite=Boolean(delivery.onsite), online=Boolean(delivery.liveOnline||delivery.asynchronous);
  const evaluation=evaluateSchoolJurisdictionRequirements({
    ...policy.profile,summary:policy.summary,evidence:policy.evidence,
  },{
    status:policy.status,
    verificationStatus:current?policy.verificationStatus:"unverified",
    verifiedByPersonId:current?policy.verifiedByPersonId:null,
    publishedAt:policy.publishedAt,effectiveAt:policy.effectiveAt,
    nextReviewAt:policy.nextReviewAt,evidence:policy.evidence,
    verificationEvidence:policy.verificationEvidence,
  },{
    state:location.state!,
    locality:location.county,
    operatingModel:typeof school.metadata.jurisdictionOperatingModel==="string"
      ? school.metadata.jurisdictionOperatingModel : null,
    responsibleEntity:responsible==="school_of_record" || responsible==="host_church"
      ? responsible : null,
    programType:school.type,
    serviceType:isExtendedLearningType(school.type)?"enrichment":"academic",
    deliveryModel:onsite&&online?"hybrid":onsite?"onsite":online?"online":null,
    gradeLevels:expandKnownSchoolGradeRange(school.gradeRange),
  },now);
  if(evaluation.reviewRequired ||
    requiresFutureJurisdictionPolicyReview(policy.nextReviewAt,[
      ...years.map(year=>year.startsOn),
      ...(launchOpeningDate(school.metadata)?[launchOpeningDate(school.metadata)!]:[]),
    ],now))
    throw new AuthorizationError("current school-specific legal applicability and policy horizon");
  const rows=await executor.select({
    type:actions.type,status:actions.status,metadata:actions.metadata,
  }).from(actions).where(and(
    inArray(actions.type,["school_jurisdiction_legal_review","site_location_change_review"]),
    eq(actions.subjectType,"program"),eq(actions.subjectId,programId),
    eq(actions.organizationId,school.organizationId),eq(actions.siteId,school.siteId),
    eq(actions.programId,programId),
  )).orderBy(desc(actions.updatedAt)).limit(30);
  const stamp={scopeFingerprint:fingerprint,profileVersionId:policy.id};
  const legal=rows.find(row=>row.type==="school_jurisdiction_legal_review")??null;
  const locationChange=rows.find(row=>row.type==="site_location_change_review")??null;
  if(!hasCurrentIndependentJurisdictionReview(legal,stamp,now) ||
    isSiteLocationChangePending(locationChange,stamp,now))
    throw new AuthorizationError("current independent CAN school and location legal review");
  const parsedPolicy=jurisdictionProfileSchema.safeParse({
    ...policy.profile,summary:policy.summary,evidence:policy.evidence,
  });
  if(!parsedPolicy.success)
    throw new AuthorizationError("valid current jurisdiction requirements");
  const physicalRevision=typeof locationChange?.metadata.siteAddressRevision==="string"
    ? locationChange.metadata.siteAddressRevision : null;
  const requirementActions=await executor.select({
    status:actions.status,metadata:actions.metadata,
  }).from(actions).where(and(
    eq(actions.type,"school_jurisdiction_requirement"),
    eq(actions.subjectType,"program"),eq(actions.subjectId,programId),
    eq(actions.organizationId,school.organizationId),eq(actions.siteId,school.siteId),
    eq(actions.programId,programId),
  ));
  const openingDuties=parsedPolicy.data.requirements.filter(requirement=>
    requirement.phase==="before_opening" &&
    evaluation.decisions.some(decision=>
      decision.id===requirement.id && decision.status==="applicable"));
  for(const duty of openingDuties){
    const action=requirementActions.find(row=>
      row.metadata.requirementId===duty.id)??null;
    if(!hasCurrentJurisdictionRequirementEvidence(action,{
      ...stamp,requirementId:duty.id,
    },now))
      throw new AuthorizationError("independently reviewed opening requirement: "+duty.id);
    const documentId=action?.metadata.evidenceDocumentId;
    const [evidence]=typeof documentId==="string"
      ? await executor.select().from(documents).where(eq(documents.id,documentId)).limit(1)
      : [];
    if(!evidence || evidence.subjectType!=="program" ||
      evidence.subjectId!==programId ||
      evidence.metadata.siteId!==school.siteId ||
      evidence.metadata.organizationId!==school.organizationId ||
      evidence.metadata.storageVerified!==true ||
      evidence.storageProvider!=="cloudflare_r2" ||
      !evidence.verifiedAt || evidence.verifiedAt>now ||
      !evidence.verifiedByPersonId ||
      evidence.uploadedByPersonId===evidence.verifiedByPersonId ||
      (evidence.expiresAt && evidence.expiresAt<=now) ||
      (physicalRevision && evidence.createdAt<new Date(physicalRevision)))
      throw new AuthorizationError("current independently verified opening document: "+duty.id);
  }
  // Fresh opening/safety approval must follow the address change; a legal review
  // alone cannot reauthorize an old school configuration or old facilities proof.
  if(physicalRevision && (
    openingApprovalPredatesLocationChange(options.configurationCreatedAt,physicalRevision) ||
    (options.openingApprovedAt!==undefined && openingApprovalPredatesLocationChange(
      options.openingApprovedAt,physicalRevision))))
    throw new AuthorizationError("new opening configuration and evidence after Site relocation");
  return {siteId:school.siteId,programId,
    jurisdictionProfileVersionId:policy.id,scopeFingerprint:fingerprint,
    addressChangeRevision:physicalRevision};
}
