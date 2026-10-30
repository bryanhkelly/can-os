import { and, desc, eq, isNull, or } from "drizzle-orm";
import { db, type Database } from "@/db/client";
import {
  complianceFrameworkVersions, compliancePolicyApplicability, compliancePolicyRules,
  jurisdictions, people, programs, qualificationClaims, qualificationDefinitions,
  qualificationVerificationEvents, roleAssignments, schoolYears, sections, sectionTeachers, terms,
} from "@/db/schema";
import { credentialStatusFromDecision } from "@/domain/credential-workflow";
import { AuthorizationError } from "@/domain/command-context";
import { verifiedTeacherAccountPredicate } from "@/modules/identity/teaching-eligibility.server";
import { activeRoleAssignmentPredicate } from "@/modules/identity/role-assignment-state.server";
import { evaluateQualificationCoverage, instructionalWindow, type CoveragePolicy } from "./qualification-coverage";
import { teachingEvaluationWindow, type TeachingEligibilityHorizon } from "./teaching-evaluation-window";

export type TeachingEligibilityReader=Pick<Database,"select"|"selectDistinctOn">;
export type TeachingEligibilityOptions={
  horizon:TeachingEligibilityHorizon;
  requireAssignment:boolean;
  requireSite?:boolean;
  now?:Date;
};

// Coordinates current identity/role authority and qualification evidence.
// Caller capability, session scope, contracts and delivery coverage stay separate.
/** Provider-owned role and verified account authority shared by the launch
 * picker and assignment evaluation. Qualification coverage is checked separately.
 */
export function teachingRolePredicate(scope: {
  organizationId: string; providerId: string; programId: string; siteId: string | null;
}) {
  return and(
    eq(roleAssignments.roleKey,"teacher"),
    activeRoleAssignmentPredicate(),
    scope.siteId===null ? isNull(roleAssignments.siteId) : or(isNull(roleAssignments.siteId),eq(roleAssignments.siteId,scope.siteId)),
    eq(roleAssignments.organizationId,scope.providerId),
    scope.organizationId===scope.providerId
      ? or(isNull(roleAssignments.programId),eq(roleAssignments.programId,scope.programId))
      : eq(roleAssignments.programId,scope.programId),
    verifiedTeacherAccountPredicate({
      personId:roleAssignments.personId,
      hostOrganizationId:scope.organizationId,
      providerOrganizationId:scope.providerId,
      siteId:scope.siteId,
    }),
  );
}

export async function teachingStaffingContext(sectionId: string, executor: TeachingEligibilityReader = db) {
  const [section] = await executor.select({
    id: sections.id, programId: sections.programId, siteId: sections.siteId, active: sections.active,
    organizationId: programs.organizationId, providerId: programs.academicProviderOrganizationId,
    programSiteId: programs.siteId, yearOrganizationId: schoolYears.organizationId,
    yearSiteId: schoolYears.siteId, yearProgramId: schoolYears.programId,
    jurisdictionId: programs.jurisdictionId, deliveryModel: programs.deliveryModel,
    startsAt: sections.startsAt, endsAt: sections.endsAt,
    startsOn: terms.startsOn, endsOn: terms.endsOn, timezone: schoolYears.timezone,
  }).from(sections).innerJoin(programs, eq(programs.id, sections.programId))
    .innerJoin(terms, eq(terms.id, sections.termId))
    .innerJoin(schoolYears, eq(schoolYears.id, terms.schoolYearId))
    .where(eq(sections.id, sectionId)).limit(1);
  if (!section) throw new Error("Teaching section not found");
  if (section.siteId !== section.programSiteId || section.yearSiteId !== section.siteId ||
    section.yearOrganizationId !== section.organizationId ||
    (section.yearProgramId && section.yearProgramId !== section.programId)) {
    throw new Error("Section, program and school-year scope must match for teaching eligibility");
  }
  return { ...section, siteId: section.siteId, window: instructionalWindow(section) };
}

export async function evaluateTeachingEligibility(sectionId: string, personId: string, executor: TeachingEligibilityReader,
  options: TeachingEligibilityOptions,
) {
  const section = await teachingStaffingContext(sectionId, executor);
  if(options.requireSite && !section.siteId)throw new Error("Launch staffing requires a school site");
  const evaluatedWindow=teachingEvaluationWindow(section.window,options.horizon,options.now??new Date());
  const denied=(reason:string)=>({eligible:false,reasons:[reason],policyRuleIds:[] as string[],
    claimIds:[] as string[],verificationEventIds:[] as string[],roleAssignmentId:null,
    window:section.window,evaluatedWindow});
  if(!section.active)return denied("Section is not active.");
  if(options.requireAssignment){
    const [assignment]=await executor.select({id:sectionTeachers.id}).from(sectionTeachers)
      .where(and(eq(sectionTeachers.sectionId,sectionId),eq(sectionTeachers.personId,personId),
        eq(sectionTeachers.role,"teacher"))).limit(1);
    if(!assignment)return denied("No assigned teacher relationship exists for this Section.");
  }

  const [role] = await executor.select({ id: roleAssignments.id }).from(roleAssignments)
    .innerJoin(people,eq(people.id,roleAssignments.personId)).where(and(
    eq(roleAssignments.personId, personId),eq(people.active,true),
    teachingRolePredicate({
      organizationId:section.organizationId,providerId:section.providerId,
      programId:section.programId,siteId:section.siteId,
    }),
  )).orderBy(roleAssignments.id).limit(1);
  if (!role) return denied("A provider-owned teacher role and active verified account are required for this program and site.");

  const policies = await executor.select({
    id: compliancePolicyRules.id, code: compliancePolicyRules.code,
    expression: compliancePolicyRules.expression, evidencePolicy: compliancePolicyRules.evidencePolicy,
    versionFrom: complianceFrameworkVersions.effectiveFrom, versionThrough: complianceFrameworkVersions.effectiveThrough,
    appliesFrom: compliancePolicyApplicability.effectiveFrom, appliesThrough: compliancePolicyApplicability.effectiveThrough,
  }).from(compliancePolicyApplicability)
    .innerJoin(complianceFrameworkVersions, eq(complianceFrameworkVersions.id, compliancePolicyApplicability.frameworkVersionId))
    .leftJoin(compliancePolicyRules, eq(compliancePolicyRules.frameworkVersionId, complianceFrameworkVersions.id))
    .where(and(eq(complianceFrameworkVersions.status, "published"),
      or(isNull(compliancePolicyApplicability.organizationId), eq(compliancePolicyApplicability.organizationId, section.organizationId)),
      section.siteId===null ? isNull(compliancePolicyApplicability.siteId) :
        or(isNull(compliancePolicyApplicability.siteId), eq(compliancePolicyApplicability.siteId, section.siteId)),
      or(isNull(compliancePolicyApplicability.programId), eq(compliancePolicyApplicability.programId, section.programId)),
      or(isNull(compliancePolicyApplicability.jurisdictionId), eq(compliancePolicyApplicability.jurisdictionId, section.jurisdictionId)),
      or(isNull(compliancePolicyApplicability.roleKey), eq(compliancePolicyApplicability.roleKey, "teacher")),
    ));
  for (const policy of policies) {
    if ((policy.versionFrom && policy.versionThrough && policy.versionFrom >= policy.versionThrough) ||
      (policy.appliesFrom && policy.appliesThrough && policy.appliesFrom >= policy.appliesThrough)) {
      throw new Error(`Qualification policy ${policy.code ?? "empty-framework"} has an invalid effective window`);
    }
  }
  const bounded: CoveragePolicy[] = policies.map(policy => ({
    ...policy,
    id: policy.id ?? "missing-rule", code: policy.code ?? "empty-framework",
    expression: policy.expression ?? {}, evidencePolicy: policy.evidencePolicy ?? {},
    from: new Date(Math.max(evaluatedWindow.from.getTime(), policy.versionFrom?.getTime() ?? -Infinity, policy.appliesFrom?.getTime() ?? -Infinity)),
    through: new Date(Math.min(evaluatedWindow.through.getTime(), policy.versionThrough?.getTime() ?? Infinity, policy.appliesThrough?.getTime() ?? Infinity)),
  })).filter(policy => policy.from < policy.through);
  const claims = await executor.selectDistinctOn([qualificationClaims.id], {
    id: qualificationClaims.id, type: qualificationDefinitions.key, issuer: qualificationClaims.issuerName,
    jurisdiction: jurisdictions.code, issuedAt: qualificationClaims.issuedAt, expiresAt: qualificationClaims.expiresAt,
    decision: qualificationVerificationEvents.decision,
    verificationEventId: qualificationVerificationEvents.id,
  }).from(qualificationClaims)
    .innerJoin(qualificationDefinitions, eq(qualificationDefinitions.id, qualificationClaims.definitionId))
    .leftJoin(jurisdictions, eq(jurisdictions.id, qualificationClaims.jurisdictionId))
    .leftJoin(qualificationVerificationEvents, eq(qualificationVerificationEvents.claimId, qualificationClaims.id))
    .where(eq(qualificationClaims.personId, personId))
    .orderBy(qualificationClaims.id, desc(qualificationVerificationEvents.sequence));
  const evidence = claims.map(claim => ({
    type: claim.type, issuer: claim.issuer ?? undefined, jurisdiction: claim.jurisdiction ?? undefined,
    verified: credentialStatusFromDecision(claim.decision) === "verified",
    validFrom: claim.issuedAt, expiresAt: claim.expiresAt,
  }));
  return { ...evaluateQualificationCoverage(evaluatedWindow, bounded, evidence),
    claimIds: claims.map(claim => claim.id),
    verificationEventIds: claims.map(claim => claim.verificationEventId).filter((id): id is string => id !== null),
    roleAssignmentId: role.id, window: section.window, evaluatedWindow };
}


export async function requireTeachingEligibility(
  sectionId:string,personId:string,executor:TeachingEligibilityReader,options:TeachingEligibilityOptions,
){
  const result=await evaluateTeachingEligibility(sectionId,personId,executor,options);
  if(!result.eligible)throw new AuthorizationError(result.reasons[0]??"Teaching eligibility");
  return result;
}
