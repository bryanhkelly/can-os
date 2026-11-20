import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  canonicalClasses,canonicalClassEnrollments,canonicalClassStaffAssignments,
  learnerCourseAttempts,
} from "@/db/canonical-v301";
import { AuthorizationError } from "@/domain/command-context";
import type { getCommandContext } from "@/modules/identity/command-context.server";

type Actor=Awaited<ReturnType<typeof getCommandContext>>;
type Thread={
  contextType:string|null;
  contextId:string|null;
  metadata:Record<string,unknown>|null;
};

/** Revalidate each private Class discussion, even from generic /messages.
 * A historical participant row is not a permanent right to read minors'
 * academic conversations after transfer, withdrawal, or staff removal. */
export async function assertCurrentCanonicalClassThread(
  actor:Actor,thread:Thread,
):Promise<void>{
  if(thread.contextType!=="class")return;
  const metadata=thread.metadata;
  if(!thread.contextId||!metadata||metadata.kind!=="class_discussion"||
      metadata.notPublic!==true)
    throw new AuthorizationError("supported private Class discussion");
  if(!actor.actorPersonId||actor.sessionAccountId)
    throw new AuthorizationError("direct verified Class Person");
  const [cls]=await db.select().from(canonicalClasses)
    .where(eq(canonicalClasses.id,thread.contextId)).limit(1);
  if(!cls||cls.state!=="active"||!cls.siteId||
     !actor.scope.siteIds?.includes(cls.siteId)||
     !actor.scope.organizationIds?.includes(cls.operatingOrganizationId))
    throw new AuthorizationError("current Class Site and organization");
  if(actor.role==="student"){
    const [member]=await db.select({id:canonicalClassEnrollments.id})
      .from(canonicalClassEnrollments)
      .innerJoin(learnerCourseAttempts,
        eq(learnerCourseAttempts.id,canonicalClassEnrollments.courseAttemptId))
      .where(and(eq(canonicalClassEnrollments.classId,cls.id),
        eq(canonicalClassEnrollments.learnerPersonId,actor.actorPersonId),
        eq(canonicalClassEnrollments.status,"active"),
        eq(learnerCourseAttempts.status,"active")))
      .limit(1);
    if(!member)throw new AuthorizationError("current Class learner");
    return;
  }
  if(actor.role==="teacher"){
    const [staff]=await db.select({id:canonicalClassStaffAssignments.id})
      .from(canonicalClassStaffAssignments)
      .where(and(eq(canonicalClassStaffAssignments.classId,cls.id),
        eq(canonicalClassStaffAssignments.personId,actor.actorPersonId),
        eq(canonicalClassStaffAssignments.roleCode,"teacher"),
        eq(canonicalClassStaffAssignments.state,"approved")))
      .limit(1);
    if(!staff)throw new AuthorizationError("current assigned Class teacher");
    return;
  }
  throw new AuthorizationError("Class discussion learner or teacher");
}
