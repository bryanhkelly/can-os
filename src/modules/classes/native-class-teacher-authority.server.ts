import {and,eq,gt,isNull,lte,or} from "drizzle-orm";
import type {db} from "@/db/client";
import {canonicalClasses,canonicalClassStaffAssignments} from "@/db/canonical-v301";
import {AuthorizationError,assertCapability,type CommandContext} from "@/domain/command-context";
import {currentClassAuthority} from "./native-class-authority.server";

type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];

/** The caller resolves a verified command context from the request.
 * Class authority never implies room control, official grading or management. */
export async function assertNativeClassTeacher(tx:Tx,actor:CommandContext,classId:string,now=new Date()){
  if(actor.role!=="teacher"||!actor.actorPersonId||actor.sessionAccountId||
     actor.scope.siteIds?.length!==1||actor.scope.organizationIds?.length!==1)
    throw new AuthorizationError("exact CAN academic teacher membership");
  assertCapability(actor,"teacher:read");
  const [cls]=await tx.select().from(canonicalClasses).where(eq(canonicalClasses.id,classId)).limit(1);
  if(!cls||cls.state!=="active"||!cls.siteId||cls.siteId!==actor.scope.siteIds[0]||
     cls.operatingOrganizationId!==actor.scope.organizationIds[0])
    throw new AuthorizationError("own active teaching Site and Class");
  const [assignment]=await tx.select({id:canonicalClassStaffAssignments.id})
    .from(canonicalClassStaffAssignments).where(and(
      eq(canonicalClassStaffAssignments.classId,cls.id),
      eq(canonicalClassStaffAssignments.personId,actor.actorPersonId),
      eq(canonicalClassStaffAssignments.roleCode,"teacher"),
      eq(canonicalClassStaffAssignments.state,"approved"),
      lte(canonicalClassStaffAssignments.beginsAt,now),
      or(isNull(canonicalClassStaffAssignments.endsAt),gt(canonicalClassStaffAssignments.endsAt,now)),
    )).limit(1);
  if(!assignment)throw new AuthorizationError("current specific Class teacher appointment");
  await currentClassAuthority(tx,cls.id,now);
  return cls;
}
