import {and,eq,gt,isNull} from "drizzle-orm";
import type {db} from "@/db/client";
import {canonicalClassEnrollmentRepeatAuthorizations} from "@/db/canonical-v301";
import {AuthorizationError} from "@/domain/command-context";
import {emitCanonicalDomainEvent} from "@/platform/canonical-mutation.server";

type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Only after an authorized repeat creates its new enrollment and attempt,
 * while the Class and authorization locks remain held. The conditional
 * update and event belong to the same admission transaction. */
export async function consumeNativeClassRepeatAuthorization(tx:Tx,input:{
  authorizationId:string;classId:string;learnerPersonId:string;priorEnrollmentId:string;
  classEnrollmentId:string;courseAttemptId:string;actorPersonId:string;
}):Promise<void>{
  const [consumed]=await tx.update(canonicalClassEnrollmentRepeatAuthorizations)
    .set({consumedByEnrollmentId:input.classEnrollmentId})
    .where(and(
      eq(canonicalClassEnrollmentRepeatAuthorizations.id,input.authorizationId),
      eq(canonicalClassEnrollmentRepeatAuthorizations.classId,input.classId),
      eq(canonicalClassEnrollmentRepeatAuthorizations.learnerPersonId,input.learnerPersonId),
      eq(canonicalClassEnrollmentRepeatAuthorizations.priorEnrollmentId,input.priorEnrollmentId),
      isNull(canonicalClassEnrollmentRepeatAuthorizations.consumedByEnrollmentId),
      gt(canonicalClassEnrollmentRepeatAuthorizations.expiresAt,new Date()),
    )).returning({id:canonicalClassEnrollmentRepeatAuthorizations.id});
  if(!consumed)throw new AuthorizationError("current unconsumed exact Class repeat authorization");
  await emitCanonicalDomainEvent(tx,{
    eventType:"ClassRepeatAuthorizationConsumed",
    aggregateType:"class_repeat_authorization",aggregateId:consumed.id,
    actorPersonId:input.actorPersonId,
    payload:{classId:input.classId,priorEnrollmentId:input.priorEnrollmentId,
      classEnrollmentId:input.classEnrollmentId,courseAttemptId:input.courseAttemptId},
  });
}
