import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  auditEvents, domainEvents, canonicalClasses, canonicalClassEnrollments,
  learnerCourseAttempts,
} from "@/db/canonical-v301";
import { AuthorizationError, assertCapability } from "@/domain/command-context";
import {
  planNativeClassExit, assertNativeClassOperatorExitScope,
  assertNativeClassLearnerSessionForExit,
} from "@/domain/native-class-lifecycle";
import {
  canonicalSessionDigestFromRequest, getCanonicalCommandContext,
} from "@/modules/identity/canonical-command-context.server";
import { assertCurrentCanonicalStaffForMutation } from
  "@/modules/identity/canonical-transaction-authorization.server";

const uuid = z.string().uuid();
const withdrawInput = z.object({classEnrollmentId:uuid}).strict();
const cancelInput = z.object({
  classEnrollmentId:uuid,
  reason:z.enum(["not_eligible","session_cancelled","operator_decision"]),
}).strict();

function requireEnabled():void {
  if(process.env.CAN_UNIFIED_CLASS_COMMANDS_ENABLED!=="true")
    throw new AuthorizationError("native Class lifecycle not activated");
  setResponseHeader("Cache-Control","private, no-store");
  setResponseHeader("Referrer-Policy","no-referrer");
}

type ExitRequest = {
  classEnrollmentId:string;
  action:"withdraw"|"cancel";
  reason:"requested"|"not_eligible"|"session_cancelled"|"operator_decision";
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
      // A stale or revoked learner cookie cannot withdraw a participant after
      // its canonical grant has changed. No Site-wide learner role is inferred.
      const digest=canonicalSessionDigestFromRequest(request);
      const session=await tx.execute(sql`
        SELECT person_id,role_code,organization_id,site_id
        FROM education_v30.v301_canonical_session_context(${digest}::text)
      `);
      if(session.rows.length!==1){
        throw new AuthorizationError("current canonical learner session");
      }
      const grant=session.rows[0] as Record<string,unknown>;
      assertNativeClassLearnerSessionForExit(
        grant,actor.actorPersonId,cls.operatingOrganizationId,
      );
    }
    const [enrollment]=await tx.select().from(canonicalClassEnrollments)
      .where(and(eq(canonicalClassEnrollments.id,command.classEnrollmentId),
        eq(canonicalClassEnrollments.classId,cls.id)))
      .for("update").limit(1);
    if(!enrollment)throw new AuthorizationError("current exact Class enrollment");
    if(command.action==="withdraw" && enrollment.learnerPersonId!==actor.actorPersonId)
      throw new AuthorizationError("own Class participation");

    const decision=planNativeClassExit(enrollment.status,command.action);
    if(decision.alreadyClosed)return {
      classEnrollmentId:enrollment.id,status:decision.enrollmentStatus,
      releasedSeat:false,alreadyClosed:true,
    };

    if(enrollment.status==="active"){
      if(!enrollment.courseAttemptId)
        throw new AuthorizationError("active Course Attempt required");
      const [attempt]=await tx.select().from(learnerCourseAttempts)
        .where(and(eq(learnerCourseAttempts.id,enrollment.courseAttemptId),
          eq(learnerCourseAttempts.classEnrollmentId,enrollment.id)))
        .for("update").limit(1);
      if(!attempt || attempt.status!=="active" ||
         attempt.enrollmentId!==null || attempt.noncreditRegistrationId!==null ||
         attempt.sectionId!==null ||
         attempt.deploymentId!==cls.deploymentId ||
         attempt.adoptionId!==cls.adoptionId ||
         attempt.offeringVersionId!==cls.offeringVersionId ||
         attempt.courseVersionId!==cls.courseVersionId)
        throw new AuthorizationError("exact active native Class Course Attempt");
      // The canonical Course Attempt source trigger requires its Class
      // Enrollment to still be ACTIVE at this moment.
      await tx.update(learnerCourseAttempts)
        .set({status:"withdrawn"})
        .where(eq(learnerCourseAttempts.id,attempt.id));
    }else if(enrollment.courseAttemptId){
      throw new AuthorizationError("pending enrollment cannot own active Course Attempt");
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
      reason:command.reason,capacityReleased:true,occurredAt:now.toISOString(),
    };
    await tx.insert(auditEvents).values({
      actorPersonId:actor.actorPersonId,
      owningOrganizationId:cls.operatingOrganizationId,
      eventCode:"class.enrollment."+decision.enrollmentStatus,
      entityKind:"class_enrollment",entityId:enrollment.id,payload,
    });
    await tx.insert(domainEvents).values({
      actorPersonId:actor.actorPersonId,eventType,
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
