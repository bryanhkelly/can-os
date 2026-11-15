import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { and, eq, gt, inArray, isNotNull, isNull, lte, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { accessAccountNoncreditPrincipals } from "@/db/schema";
import {
  auditEvents as canonicalAuditEvents, canonicalAccountGrants,canonicalAccounts,
  canonicalEnrollmentOrganizations,courseVersions,deploymentOfferingAdoptions,
  educationOperations,learnerCourseAttempts,noncreditRegistrations,
  noncreditSelfEnrollmentClaims,noncreditTrainingVersions,offeringVersions,programDeployments,
} from "@/db/canonical-v301";
import { AuthorizationError } from "@/domain/command-context";
import { probeCanonicalAuthReader } from "@/modules/identity/canonical-command-context.server";

/** Native session renewal is only for this verified Person's existing live
 * noncredit Course attempt. A registration reference from another account or
 * another Site cannot mint a learning session. */
export const openMyNoncreditCourse = createServerFn({method:"POST"})
  .validator((value:unknown)=>z.object({
    courseAttemptId:z.string().uuid(),
  }).strict().parse(value))
  .handler(async({data})=>{
    setResponseHeader("Cache-Control","private, no-store");
    const { requireVerifiedAdultAccount, issueNativeLearnerSession } = await import("./noncredit-self-enrollment-identity.server");
    const owner=await requireVerifiedAdultAccount();
    if(!await probeCanonicalAuthReader())
      throw new Error("Secure learning access is temporarily unavailable");
    const result=await db.transaction(async tx=>{
      const [bridge]=await tx.select().from(accessAccountNoncreditPrincipals)
        .where(eq(accessAccountNoncreditPrincipals.accessAccountId,owner.accountId)).limit(1);
      if(!bridge||bridge.accessPersonId!==owner.personId)
        throw new AuthorizationError("linked noncredit learner account");
      const now=new Date();
      const [record]=await tx.select({
        accountId:noncreditSelfEnrollmentClaims.canonicalAccountId,
        personId:noncreditRegistrations.participantPersonId,
        registrationId:noncreditRegistrations.id,
        registrationStatus:noncreditRegistrations.status,
        attemptStatus:learnerCourseAttempts.status,
        organizationId:noncreditRegistrations.registeringOrganizationId,
        grantId:canonicalAccountGrants.id,
      }).from(learnerCourseAttempts)
        .innerJoin(noncreditRegistrations,and(
          eq(noncreditRegistrations.id,learnerCourseAttempts.noncreditRegistrationId),
          eq(noncreditRegistrations.deploymentId,learnerCourseAttempts.deploymentId),
          eq(noncreditRegistrations.adoptionId,learnerCourseAttempts.adoptionId),
          eq(noncreditRegistrations.offeringVersionId,learnerCourseAttempts.offeringVersionId),
        ))
        .innerJoin(noncreditSelfEnrollmentClaims,and(
          eq(noncreditSelfEnrollmentClaims.registrationId,noncreditRegistrations.id),
          eq(noncreditSelfEnrollmentClaims.canonicalAccountId,bridge.canonicalAccountId),
        ))
        .innerJoin(programDeployments,eq(programDeployments.id,learnerCourseAttempts.deploymentId))
        .innerJoin(educationOperations,eq(educationOperations.id,programDeployments.operationId))
        .innerJoin(deploymentOfferingAdoptions,and(
          eq(deploymentOfferingAdoptions.id,learnerCourseAttempts.adoptionId),
          eq(deploymentOfferingAdoptions.offeringVersionId,learnerCourseAttempts.offeringVersionId),
        ))
        .innerJoin(offeringVersions,eq(offeringVersions.id,learnerCourseAttempts.offeringVersionId))
        .innerJoin(noncreditTrainingVersions,eq(noncreditTrainingVersions.id,noncreditRegistrations.trainingVersionId))
        .innerJoin(courseVersions,eq(courseVersions.id,learnerCourseAttempts.courseVersionId))
        .innerJoin(canonicalAccountGrants,and(
          eq(canonicalAccountGrants.accountId,bridge.canonicalAccountId),
          eq(canonicalAccountGrants.personId,bridge.canonicalPersonId),
          eq(canonicalAccountGrants.organizationId,noncreditRegistrations.registeringOrganizationId),
          eq(canonicalAccountGrants.roleCode,"learner"),
          eq(canonicalAccountGrants.active,true),
          isNull(canonicalAccountGrants.revokedAt),
          isNull(canonicalAccountGrants.siteId),
        ))
        .innerJoin(canonicalAccounts,and(
          eq(canonicalAccounts.id,bridge.canonicalAccountId),
          eq(canonicalAccounts.emailNormalized,owner.email),
          isNull(canonicalAccounts.disabledAt),
          // The legacy verified account cannot activate a native identity
          // whose mailbox verification has since been revoked.
          gt(canonicalAccounts.emailVerifiedAt,new Date(0)),
        ))
        .innerJoin(canonicalEnrollmentOrganizations,and(
          eq(canonicalEnrollmentOrganizations.id,noncreditRegistrations.registeringOrganizationId),
          eq(canonicalEnrollmentOrganizations.status,"active"),
        ))
        .where(and(
          eq(learnerCourseAttempts.id,data.courseAttemptId),
          eq(learnerCourseAttempts.status,"active"),
          eq(noncreditRegistrations.participantPersonId,bridge.canonicalPersonId),
          inArray(noncreditRegistrations.status,["registered","active"]),
          eq(noncreditTrainingVersions.state,"published"),
          isNotNull(noncreditTrainingVersions.approvedByPersonId),
          eq(programDeployments.status,"active"),
          eq(educationOperations.status,"active"),
          eq(deploymentOfferingAdoptions.approvalStatus,"approved"),
          lte(deploymentOfferingAdoptions.validFrom,now),
          or(isNull(deploymentOfferingAdoptions.validThrough),
            gt(deploymentOfferingAdoptions.validThrough,now)),
          eq(offeringVersions.lifecycle,"published"),
          eq(courseVersions.lifecycle,"published"),
        )).limit(1);
      if(!record||record.accountId!==bridge.canonicalAccountId||
         record.personId!==bridge.canonicalPersonId)
        throw new AuthorizationError("current active course participation");
      const cookie=await issueNativeLearnerSession(tx,record.accountId,record.grantId,now);
      await tx.insert(canonicalAuditEvents).values({
        actorPersonId:record.personId,
        owningOrganizationId:record.organizationId,
        eventCode:"noncredit.self_enrollment.session_resumed",
        entityKind:"noncredit_registration",entityId:record.registrationId,
        payload:{courseAttemptId:data.courseAttemptId},
      });
      return {cookie};
    });
    setResponseHeader("Set-Cookie",result.cookie);
    return {ready:true,courseAttemptId:data.courseAttemptId};
  });
