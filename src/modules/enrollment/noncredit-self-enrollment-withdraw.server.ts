import {parseCommandInput} from "@/domain/command-input";
import {resolveVerifiedAdultAccount} from "./noncredit-participant-identity.server";
import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { accessAccountNoncreditPrincipals } from "@/db/schema";
import {
  canonicalAccounts,canonicalClasses,canonicalClassEnrollments,
  facilitatedLearningParticipants, learnerCourseAttempts, noncreditRegistrations,
  noncreditCompletionDecisions,
  noncreditSelfEnrollmentClaims,
} from "@/db/canonical-v301";
import { AuthorizationError } from "@/domain/command-context";
import { writeCanonicalAudit, emitCanonicalDomainEvent } from "@/platform/canonical-mutation.server";
import { noncreditSelfWithdrawalDecision } from "@/domain/noncredit-self-enrollment";

/**
 * Adult self-service withdrawal is intentionally NOT an erasure or refund.
 * Keep the immutable consent claim, assessment and learning history, and count
 * the original seat until the provider adopts an audited reallocation policy.
 * No school/guardian enrollment can be withdrawn through this command.
 */
export const withdrawInput=z.object({registrationId:z.string().uuid(),confirm:z.literal(true)}).strict();
export async function withdrawMyNoncreditRegistrationService(request:Request,raw:unknown){
    const data=parseCommandInput(withdrawInput,raw);
    const owner=await resolveVerifiedAdultAccount(request);
    return db.transaction(async tx=>{
      const [bridge]=await tx.select().from(accessAccountNoncreditPrincipals)
        .where(eq(accessAccountNoncreditPrincipals.accessAccountId,owner.accountId)).limit(1);
      if(!bridge || bridge.accessPersonId!==owner.personId)
        throw new AuthorizationError("your linked adult learner identity");
      const [native]=await tx.select({id:canonicalAccounts.id})
        .from(canonicalAccounts).where(and(
          eq(canonicalAccounts.id,bridge.canonicalAccountId),
          eq(canonicalAccounts.emailNormalized,owner.email),
          isNull(canonicalAccounts.disabledAt),
          isNotNull(canonicalAccounts.emailVerifiedAt),
        )).limit(1);
      if(!native)throw new AuthorizationError("verified native CAN account");
      const [registration]=await tx.select({
        id:noncreditRegistrations.id,
        status:noncreditRegistrations.status,
        organizationId:noncreditRegistrations.registeringOrganizationId,
      }).from(noncreditRegistrations)
        .innerJoin(noncreditSelfEnrollmentClaims,and(
          eq(noncreditSelfEnrollmentClaims.registrationId,noncreditRegistrations.id),
          eq(noncreditSelfEnrollmentClaims.canonicalAccountId,bridge.canonicalAccountId),
          eq(noncreditSelfEnrollmentClaims.participantPersonId,bridge.canonicalPersonId),
        ))
        .where(and(
          eq(noncreditRegistrations.id,data.registrationId),
          eq(noncreditRegistrations.participantPersonId,bridge.canonicalPersonId),
        )).for("update").limit(1);
      if(!registration)throw new AuthorizationError("owned noncredit registration");
      if(registration.status==="withdrawn")return {withdrawn:true,alreadyWithdrawn:true};
      const [finishedCourse]=await tx.select({id:learnerCourseAttempts.id})
        .from(learnerCourseAttempts).where(and(
          eq(learnerCourseAttempts.noncreditRegistrationId,registration.id),
          eq(learnerCourseAttempts.status,"completed"),
        )).limit(1);
      const [completedDecision]=await tx.select({id:noncreditCompletionDecisions.id})
        .from(noncreditCompletionDecisions).where(and(
          eq(noncreditCompletionDecisions.registrationId,registration.id),
          eq(noncreditCompletionDecisions.outcome,"completed"),
        )).limit(1);
      if(noncreditSelfWithdrawalDecision({
        registrationStatus:registration.status,
        hasCompletedAttempt:Boolean(finishedCourse),
        hasCompletedDecision:Boolean(completedDecision),
      })!=="withdraw")
        throw new AuthorizationError("only unfinished active training can be withdrawn");
      const now=new Date();
      const attempts=await tx.select({id:learnerCourseAttempts.id,classEnrollmentId:learnerCourseAttempts.classEnrollmentId})
        .from(learnerCourseAttempts)
        .where(and(
          eq(learnerCourseAttempts.noncreditRegistrationId,registration.id),
          isNull(learnerCourseAttempts.enrollmentId),
          inArray(learnerCourseAttempts.status,["planned","active"]),
        ));
      const ids=attempts.map(row=>row.id);
      const linkedClassIds=[...new Set(attempts.flatMap(item=>
        item.classEnrollmentId?[item.classEnrollmentId]:[]))];
      if(linkedClassIds.length>1)
        throw new AuthorizationError("multiple Class placements need manual reconciliation");
      const linkedClasses=[];
      for(const classEnrollmentId of linkedClassIds){
        const [source]=await tx.select({
          classId:canonicalClassEnrollments.classId,
        }).from(canonicalClassEnrollments)
          .where(eq(canonicalClassEnrollments.id,classEnrollmentId)).limit(1);
        if(!source)throw new AuthorizationError("linked Class enrollment");
        const [cls]=await tx.select().from(canonicalClasses)
          .where(eq(canonicalClasses.id,source.classId)).for("update").limit(1);
        const [enrollment]=await tx.select().from(canonicalClassEnrollments)
          .where(and(eq(canonicalClassEnrollments.id,classEnrollmentId),
            eq(canonicalClassEnrollments.learnerPersonId,bridge.canonicalPersonId),
            eq(canonicalClassEnrollments.status,"active")))
          .for("update").limit(1);
        if(!cls||!enrollment||!ids.includes(enrollment.courseAttemptId??""))
          throw new AuthorizationError("exact active Course Class placement");
        linkedClasses.push({cls,enrollment});
      }
      if(ids.length){
        await tx.update(learnerCourseAttempts).set({status:"withdrawn"})
          .where(inArray(learnerCourseAttempts.id,ids));
        // A room paired before withdrawal must stop showing this learner as
        // joined. Retain participant history and previous observations.
        await tx.update(facilitatedLearningParticipants).set({leftAt:now})
          .where(and(
            inArray(facilitatedLearningParticipants.courseAttemptId,ids),
            eq(facilitatedLearningParticipants.participantPersonId,bridge.canonicalPersonId),
            isNull(facilitatedLearningParticipants.leftAt),
          ));
      }
      // Update the same Class placement, not a separate record of progress.
      // All Course Attempts have been withdrawn before the Class status flips.
      for(const {cls,enrollment} of linkedClasses){
        await tx.update(canonicalClassEnrollments).set({status:"withdrawn"})
          .where(eq(canonicalClassEnrollments.id,enrollment.id));
        const payload={contractVersion:1,classId:cls.id,
          classEnrollmentId:enrollment.id,courseAttemptId:enrollment.courseAttemptId,
          participantPersonId:bridge.canonicalPersonId,
          operatingOrganizationId:cls.operatingOrganizationId,
          siteId:cls.siteId,deliverySiteId:cls.siteId,
          deploymentId:cls.deploymentId,adoptionId:cls.adoptionId,
          offeringVersionId:cls.offeringVersionId,courseVersionId:cls.courseVersionId,
          classOfferingVersionId:enrollment.classOfferingVersionId,
          previousStatus:"active",status:"withdrawn",reason:"Course registration withdrawn",
          capacityReleased:true,courseAttemptIdsWithdrawn:ids,
          occurredAt:now.toISOString()};
        await writeCanonicalAudit(tx,{
          actorPersonId:bridge.canonicalPersonId,
          owningOrganizationId:cls.operatingOrganizationId,
          eventCode:"class.enrollment.withdrawn",entityKind:"class_enrollment",
          entityId:enrollment.id,payload,
        });
        await emitCanonicalDomainEvent(tx,{
          eventType:"ClassEnrollmentWithdrawn",aggregateType:"class_enrollment",
          aggregateId:enrollment.id,actorPersonId:bridge.canonicalPersonId,payload,
        });
      }
      await tx.update(noncreditRegistrations).set({status:"withdrawn"})
        .where(eq(noncreditRegistrations.id,registration.id));
      await writeCanonicalAudit(tx,{
        actorPersonId:bridge.canonicalPersonId,
        owningOrganizationId:registration.organizationId,
        eventCode:"noncredit.self_enrollment.withdrawn",
        entityKind:"noncredit_registration",entityId:registration.id,
        payload:{source:"self_service",attemptsWithdrawn:ids.length,
          seatReleased:false,historyErased:false},
      });
      await emitCanonicalDomainEvent(tx,{
        eventType:"NoncreditSelfEnrollmentWithdrawn",
        aggregateType:"noncredit_registration",aggregateId:registration.id,
        actorPersonId:bridge.canonicalPersonId,
        payload:{organizationId:registration.organizationId,attemptIds:ids,
          capacityReleased:false},
      });
      return {withdrawn:true,alreadyWithdrawn:false};
    });
}
