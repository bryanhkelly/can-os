import {eq,isNull,and} from "drizzle-orm";
import type {db} from "@/db/client";
import {canonicalClassEnrollments,learnerCourseAttempts} from "@/db/canonical-v301";
import {AuthorizationError} from "@/domain/command-context";
import {assertNativeClassAttemptForExit} from "@/domain/native-class-lifecycle";

type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];
type ClassSource=Pick<typeof learnerCourseAttempts.$inferInsert,"deploymentId"|"adoptionId"|"offeringVersionId"|"courseVersionId">;

/** Only for a newly created, already authorized native Class Enrollment in
 * the caller's transaction. Course Registration placement links its existing
 * attempt instead, and retakes use their separate governed lifecycle. */
export async function createInitialNativeClassAttempt(tx:Tx,enrollmentId:string,source:ClassSource):Promise<{id:string}>{
  const [attempt]=await tx.insert(learnerCourseAttempts).values({
    classEnrollmentId:enrollmentId,enrollmentId:null,noncreditRegistrationId:null,
    sectionId:null,deploymentId:source.deploymentId,adoptionId:source.adoptionId,
    offeringVersionId:source.offeringVersionId,courseVersionId:source.courseVersionId,
    attemptNo:1,status:"active",
  }).returning({id:learnerCourseAttempts.id});
  if(!attempt)throw new Error("Cannot save initial Class Course Attempt");
  const [linked]=await tx.update(canonicalClassEnrollments).set({courseAttemptId:attempt.id})
    .where(and(eq(canonicalClassEnrollments.id,enrollmentId),
      eq(canonicalClassEnrollments.status,"active"),isNull(canonicalClassEnrollments.courseAttemptId)))
    .returning({id:canonicalClassEnrollments.id});
  if(!linked)throw new AuthorizationError("new active Class Enrollment without an existing Course Attempt");
  return attempt;
}

/** Caller owns the Class and Enrollment locks and has already authorized
 * the exit. Validate every live Attempt before changing any of them. The
 * parent Enrollment must remain active until this function returns. */
export async function withdrawNativeClassAttempts(tx:Tx,enrollment:Pick<typeof canonicalClassEnrollments.$inferSelect,"id"|"courseAttemptId">,classInstance:ClassSource):Promise<string[]>{
  if(!enrollment.courseAttemptId)throw new AuthorizationError("active Course Attempt required");
  const attempts=await tx.select().from(learnerCourseAttempts)
    .where(eq(learnerCourseAttempts.classEnrollmentId,enrollment.id)).for("update");
  if(attempts.some(attempt=>attempt.noncreditRegistrationId!==null))
    throw new AuthorizationError("Withdraw the Course registration to leave this Class");
  const selected=attempts.find(attempt=>attempt.id===enrollment.courseAttemptId);
  if(!selected)throw new AuthorizationError("selected Class Course Attempt");
  assertNativeClassAttemptForExit({attempt:selected,enrollment,classInstance});
  const live=attempts.filter(attempt=>attempt.status==="active");
  for(const attempt of live){
    assertNativeClassAttemptForExit({attempt,enrollment,classInstance,requireSelectedPointer:false});
  }
  for(const attempt of live){
    await tx.update(learnerCourseAttempts).set({status:"withdrawn"})
      .where(eq(learnerCourseAttempts.id,attempt.id));
  }
  return live.map(attempt=>attempt.id);
}
