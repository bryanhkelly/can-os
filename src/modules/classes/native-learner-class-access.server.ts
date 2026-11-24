import {and,eq} from "drizzle-orm";
import type {db} from "@/db/client";
import {canonicalClassEnrollments,canonicalClasses} from "@/db/canonical-v301";
import {AuthorizationError,type CommandContext} from "@/domain/command-context";
import {authorizeCanonicalCourseAttempt} from "@/modules/learning/canonical-course-participation.server";

type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];
type AccessMode="active_read"|"active_write"|"history_read";

/** The exact enrollment, Course Attempt and current Class authority are shared
 * by all native learner features. Only writes lock the enrollment row;
 * history must be explicitly requested and never authorizes mutation. */
export async function authorizeNativeLearnerClass(tx:Tx,actor:CommandContext,classEnrollmentId:string,mode:AccessMode){
  if(!actor.actorPersonId ||
     !(actor.role==="student"&&actor.capabilities.has("student:read") ||
       actor.role==="learner"&&actor.capabilities.has("learning.participate")))
    throw new AuthorizationError("own authenticated Course learner");
  const query=tx.select().from(canonicalClassEnrollments).where(and(
    eq(canonicalClassEnrollments.id,classEnrollmentId),
    eq(canonicalClassEnrollments.learnerPersonId,actor.actorPersonId),
    mode==="history_read"?undefined:eq(canonicalClassEnrollments.status,"active"),
  ));
  const [enrollment]=await (mode==="active_write"?query.for("update"):query).limit(1);
  if(!enrollment?.courseAttemptId)throw new AuthorizationError("own Class Enrollment and Course Attempt");
  const [cls]=await tx.select().from(canonicalClasses).where(eq(canonicalClasses.id,enrollment.classId)).limit(1);
  if(!cls || (mode!=="history_read"&&cls.state!=="active"))
    throw new AuthorizationError("current Class");
  if(actor.role==="student"&&(!cls.siteId || actor.scope.siteIds?.[0]!==cls.siteId ||
     !actor.scope.organizationIds?.includes(cls.operatingOrganizationId)))
    throw new AuthorizationError("own CAN student Site");
  const access=await authorizeCanonicalCourseAttempt(tx,actor,enrollment.courseAttemptId,mode==="history_read",enrollment.id);
  if(access.source!=="class"||access.sectionId!==null||access.courseVersionId!==cls.courseVersionId)
    throw new AuthorizationError("own canonical Class Course Attempt");
  return {enrollment,cls,access,courseAttemptId:access.courseAttemptId};
}
