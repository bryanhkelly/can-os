import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { and, eq, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
   canonicalClasses, canonicalClassEnrollments,
  canonicalPersons, learnerCourseAttempts,canonicalClassEnrollmentApprovalRequests,
} from "@/db/canonical-v301";
import { writeCanonicalAudit, emitCanonicalDomainEvent } from "@/platform/canonical-mutation.server";
import { AuthorizationError, assertCapability } from "@/domain/command-context";
import {
  planNativeClassExit, assertNativeClassOperatorExitScope,
  assertNativeClassAttemptForExit,
  assertVerifiedAdultNativeClassExit, assertNativeClassExitReason,
} from "@/domain/native-class-lifecycle";
import { getCanonicalCommandContext } from "@/modules/identity/canonical-command-context.server";
import {verifiedAdultOn} from "@/domain/native-class-enrollment";
import { assertCurrentNativeClassLearnerForMutation } from
  "./native-class-learner-session.server";
import { assertCurrentCanonicalStaffForMutation } from
  "@/modules/identity/canonical-transaction-authorization.server";

const uuid = z.string().uuid();
const withdrawInput = z.object({classEnrollmentId:uuid}).strict();
const cancelInput = z.object({
  classEnrollmentId:uuid,
  reason:z.enum(["not_eligible","operator_decision"]),
}).strict();

function requireEnabled():void {
  setResponseHeader("Cache-Control","private, no-store");
  setResponseHeader("Referrer-Policy","no-referrer");
}

type ExitRequest = {
  classEnrollmentId:string;
  action:"withdraw"|"cancel";
  reason:"requested"|"not_eligible"|"operator_decision";
};

/**
 * One Class-row lock serializes all seat changes against self-enrollment and
 * adult assignment. The enrollment and its exact Course Attempt are then
 * changed in that same transaction. No Session, assessment, outcome or award
 * history is removed. Events are emitted only for a real transition.
 */
async function exitNativeClass(command:ExitRequest){
  requireEnabled();
  const request=getRequest();
  const actor=await getCanonicalCommandContext(request);
  if(!actor.actorPersonId)throw new AuthorizationError("current verified Person");
  if(command.action==="withdraw"){
    if(actor.role!=="learner")throw new AuthorizationError("learner withdrawal");
    assertCapability(actor,"learning.participate");
  }else{
    if(!["site_admin","registrar"].includes(actor.role??""))
      throw new AuthorizationError("Class manager");
    assertCapability(actor,"class.manage");
  }

  return db.transaction(async tx=>{
    // Do not lock the Enrollment before the Class: registration uses Class
    // first, and a reverse order risks deadlocks under last-seat contention.
    const [source]=await tx.select({classId:canonicalClassEnrollments.classId})
      .from(canonicalClassEnrollments)
      .where(eq(canonicalClassEnrollments.id,command.classEnrollmentId))
      .limit(1);
    if(!source)throw new AuthorizationError("existing Class enrollment");
    const [cls]=await tx.select().from(canonicalClasses)
      .where(eq(canonicalClasses.id,source.classId)).for("update").limit(1);
    if(!cls)throw new AuthorizationError("Class participation source");

    if(command.action==="cancel"){
      assertNativeClassOperatorExitScope(actor,cls);
      // Session and current exact Site grant are revalidated inside the same
      // transaction, including when the underlying Class was closed.
      await assertCurrentCanonicalStaffForMutation(tx,request,actor);
    }else{
      // The same current verified home-Organization session works when a
      // public Class is provided by another Organization.
      await assertCurrentNativeClassLearnerForMutation(tx,request,actor);
    }
    const [enrollment]=await tx.select().from(canonicalClassEnrollments)
      .where(and(eq(canonicalClassEnrollments.id,command.classEnrollmentId),
        eq(canonicalClassEnrollments.classId,cls.id)))
      .for("update").limit(1);
    if(!enrollment)throw new AuthorizationError("current exact Class enrollment");
    if(command.action==="withdraw" &&
       enrollment.learnerPersonId!==actor.actorPersonId)
      throw new AuthorizationError("own Class participation");
    // Native Class enrollment commands are adult-only today. A guardian or
    // school-supervised learner must not be cancelled through an adult
    // Class lifecycle shortcut, even by an otherwise authorized registrar.
    const [person]=await tx.select({birthDate:canonicalPersons.birthDate})
      .from(canonicalPersons)
      .where(eq(canonicalPersons.id,enrollment.learnerPersonId))
      .limit(1);
    // Verified minors must not use an adult learner exit. A legitimate
    // exact-Site operator may cancel a minor only when the native Class
    // enrollment is provably the result of independently approved guardian
    // placement. Historical guardian approval is retained.
    if(verifiedAdultOn(person?.birthDate,new Date())){
      assertVerifiedAdultNativeClassExit(person?.birthDate,new Date());
    }else{
      if(command.action!=="cancel"||enrollment.enrollmentMethod!=="approval")
        throw new AuthorizationError("guardian-authorized minor Class exit required");
      const [placement]=await tx.select({id:canonicalClassEnrollmentApprovalRequests.id})
        .from(canonicalClassEnrollmentApprovalRequests).where(and(
          eq(canonicalClassEnrollmentApprovalRequests.acceptedEnrollmentId,enrollment.id),
          eq(canonicalClassEnrollmentApprovalRequests.classId,cls.id),
          eq(canonicalClassEnrollmentApprovalRequests.learnerPersonId,enrollment.learnerPersonId),
          eq(canonicalClassEnrollmentApprovalRequests.state,"approved"),
          isNotNull(canonicalClassEnrollmentApprovalRequests.guardianPersonId),
        )).limit(1);
      if(!placement)throw new AuthorizationError("verified minor guardian placement");
    }

    const decision=planNativeClassExit(enrollment.status,command.action);
    if(decision.alreadyClosed)return {
      classEnrollmentId:enrollment.id,status:decision.enrollmentStatus,
      releasedSeat:false,alreadyClosed:true,
    };
    // A pending rejection is not an active Class cancellation; the reason
    // is checked against the authoritative status under the Class lock.
    assertNativeClassExitReason(enrollment.status,command.action,command.reason);

    let closedAttemptIds:string[]=[];
    if(enrollment.status==="active"){
      if(!enrollment.courseAttemptId)
        throw new AuthorizationError("active Course Attempt required");
      // Retakes may share the native Class Enrollment source. Updating only
      // its selected attempt could strand other ACTIVE retakes after exit.
      // Lock and validate every linked active Course Attempt before changing
      // any row; keep completed/withdrawn attempts as historical evidence.
      const attempts=await tx.select().from(learnerCourseAttempts)
        .where(eq(learnerCourseAttempts.classEnrollmentId,enrollment.id))
        .for("update");
      // A Class placement linked to a Course Registration must be withdrawn
      // through the owning Course command so both participation records and
      // the single Course Attempt change together.
      if(attempts.some(attempt=>attempt.noncreditRegistrationId!==null))
        throw new AuthorizationError("Withdraw the Course registration to leave this Class");
      const selected=attempts.find(attempt=>attempt.id===enrollment.courseAttemptId);
      if(!selected)throw new AuthorizationError("selected Class Course Attempt");
      assertNativeClassAttemptForExit({
        attempt:selected,enrollment,classInstance:cls,
      });
      const live=attempts.filter(attempt=>attempt.status==="active");
      for(const attempt of live){
        assertNativeClassAttemptForExit({
          attempt,enrollment,classInstance:cls,requireSelectedPointer:false,
        });
      }
      // The canonical Course Attempt source trigger requires its parent
      // Class Enrollment to remain ACTIVE until every live attempt closes.
      for(const attempt of live){
        await tx.update(learnerCourseAttempts)
          .set({status:"withdrawn"})
          .where(eq(learnerCourseAttempts.id,attempt.id));
      }
      closedAttemptIds=live.map(attempt=>attempt.id);
    }else if(enrollment.courseAttemptId){
      throw new AuthorizationError("pending enrollment cannot own Course Attempt");
    }
    await tx.update(canonicalClassEnrollments)
      .set({status:decision.enrollmentStatus})
      .where(eq(canonicalClassEnrollments.id,enrollment.id));

    const now=new Date();
    const eventType=decision.enrollmentStatus==="withdrawn"
      ?"ClassEnrollmentWithdrawn":"ClassEnrollmentCancelled";
    const payload={
      contractVersion:1,classId:cls.id,classEnrollmentId:enrollment.id,
      courseAttemptId:enrollment.courseAttemptId,
      participantPersonId:enrollment.learnerPersonId,
      operatingOrganizationId:cls.operatingOrganizationId,
      siteId:cls.siteId,deliverySiteId:cls.siteId,
      deploymentId:cls.deploymentId,adoptionId:cls.adoptionId,
      offeringVersionId:cls.offeringVersionId,courseVersionId:cls.courseVersionId,
      classOfferingVersionId:enrollment.classOfferingVersionId,
      previousStatus:enrollment.status,status:decision.enrollmentStatus,
      reason:command.reason,capacityReleased:true,
      courseAttemptIdsWithdrawn:closedAttemptIds,
      occurredAt:now.toISOString(),
    };
    await writeCanonicalAudit(tx,{
      actorPersonId:actor.actorPersonId,occurredAt:now,
      owningOrganizationId:cls.operatingOrganizationId,
      eventCode:"class.enrollment."+decision.enrollmentStatus,
      entityKind:"class_enrollment",entityId:enrollment.id,payload,
    });
    await emitCanonicalDomainEvent(tx,{
      actorPersonId:actor.actorPersonId,occurredAt:now,eventType,
      aggregateType:"class_enrollment",aggregateId:enrollment.id,payload,
    });
    return {classEnrollmentId:enrollment.id,status:decision.enrollmentStatus,
      releasedSeat:decision.releasedSeat,alreadyClosed:false};
  });
}

/** A learner can leave only their own pending/active native Class enrollment.
 * Adult self-enrollment is never inferred as guardian authority for a minor. */
export const withdrawMyNativeClassEnrollment=createServerFn({method:"POST"})
  .validator((raw:unknown)=>withdrawInput.parse(raw))
  .handler(({data})=>exitNativeClass({
    classEnrollmentId:data.classEnrollmentId,action:"withdraw",reason:"requested",
  }));

/** A current exact-Site registrar may reject a pending Class enrollment or
 * cancel an active one. No completion, grading or issuance decisions here. */
export const cancelNativeClassEnrollment=createServerFn({method:"POST"})
  .validator((raw:unknown)=>cancelInput.parse(raw))
  .handler(({data})=>exitNativeClass({
    classEnrollmentId:data.classEnrollmentId,action:"cancel",reason:data.reason,
  }));
