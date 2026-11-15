import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { accessAccountNoncreditPrincipals } from "@/db/schema";
import {
  auditEvents as canonicalAuditEvents, canonicalAccounts, domainEvents as canonicalDomainEvents,
  facilitatedLearningParticipants, learnerCourseAttempts, noncreditRegistrations,
  noncreditCompletionDecisions,
  noncreditSelfEnrollmentClaims,
} from "@/db/canonical-v301";
import { AuthorizationError } from "@/domain/command-context";
import { noncreditSelfWithdrawalDecision } from "@/domain/noncredit-self-enrollment";
import { requireVerifiedAdultAccount } from "./noncredit-self-enrollment.functions";

/**
 * Adult self-service withdrawal is intentionally NOT an erasure or refund.
 * Keep the immutable consent claim, assessment and learning history, and count
 * the original seat until the provider adopts an audited reallocation policy.
 * No school/guardian enrollment can be withdrawn through this command.
 */
export const withdrawMyNoncreditRegistration = createServerFn({method:"POST"})
  .validator((value:unknown)=>z.object({
    registrationId:z.string().uuid(),
    confirm:z.literal(true),
  }).strict().parse(value))
  .handler(async({data})=>{
    setResponseHeader("Cache-Control","private, no-store");
    const owner=await requireVerifiedAdultAccount();
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
      const attempts=await tx.select({id:learnerCourseAttempts.id})
        .from(learnerCourseAttempts)
        .where(and(
          eq(learnerCourseAttempts.noncreditRegistrationId,registration.id),
          isNull(learnerCourseAttempts.enrollmentId),
          inArray(learnerCourseAttempts.status,["planned","active"]),
        ));
      const ids=attempts.map(row=>row.id);
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
      await tx.update(noncreditRegistrations).set({status:"withdrawn"})
        .where(eq(noncreditRegistrations.id,registration.id));
      await tx.insert(canonicalAuditEvents).values({
        actorPersonId:bridge.canonicalPersonId,
        owningOrganizationId:registration.organizationId,
        eventCode:"noncredit.self_enrollment.withdrawn",
        entityKind:"noncredit_registration",entityId:registration.id,
        payload:{source:"self_service",attemptsWithdrawn:ids.length,
          seatReleased:false,historyErased:false},
      });
      await tx.insert(canonicalDomainEvents).values({
        eventType:"NoncreditSelfEnrollmentWithdrawn",
        aggregateType:"noncredit_registration",aggregateId:registration.id,
        actorPersonId:bridge.canonicalPersonId,
        payload:{organizationId:registration.organizationId,attemptIds:ids,
          capacityReleased:false},
      });
      return {withdrawn:true,alreadyWithdrawn:false};
    });
  });
