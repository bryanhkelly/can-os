import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { accessAccounts, accountPersonGrants, people } from "@/db/schema";
import { isDemoAccountEmail, isApprovedDemoGrant, LOCAL_DEMO_RILEY_FACILITATOR } from "@/domain/local-demo-access";
import {
  canonicalClasses, canonicalClassStaffAssignments,
} from "@/db/canonical-v301";
import { writeCanonicalAudit, emitCanonicalDomainEvent } from "@/platform/canonical-mutation.server";
import { AuthorizationError, assertCapability } from "@/domain/command-context";
import { getCanonicalCommandContext } from "@/modules/identity/canonical-command-context.server";
import { validateClassAuthority } from "./unified-class-authority.server";
import { assertCurrentCanonicalStaffForMutation } from "@/modules/identity/canonical-transaction-authorization.server";

const uuid=z.string().uuid();
const assignInput=z.object({
  classId:uuid,
  personId:uuid,
  roleCode:z.enum(["teacher","facilitator"]),
  canVerifyAttendance:z.boolean().default(false),
}).strict();
const endInput=z.object({classId:uuid,assignmentId:uuid}).strict();

function guarded(){
  setResponseHeader("Cache-Control","private, no-store");
}
async function requireClassManager(){
  const actor=await getCanonicalCommandContext(getRequest());
  if(!actor.actorPersonId || !["site_admin","registrar"].includes(actor.role??""))
    throw new AuthorizationError("Class operating manager");
  assertCapability(actor,"class.manage");
  const [organizationId]=actor.scope.organizationIds??[];
  if(!organizationId || actor.scope.organizationIds?.length!==1)
    throw new AuthorizationError("one current operating organization");
  return {actor,organizationId,siteIds:actor.scope.siteIds??[]};
}
type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];
async function lockedManagedClass(tx:Tx,manager:Awaited<ReturnType<typeof requireClassManager>>,classId:string){
  const [instance]=await tx.select().from(canonicalClasses)
    .where(eq(canonicalClasses.id,classId)).for("update").limit(1);
  if(!instance || instance.operatingOrganizationId!==manager.organizationId ||
     !instance.siteId || !manager.siteIds.includes(instance.siteId) ||
     !["draft","approved","active"].includes(instance.state))
    throw new AuthorizationError("current managed Site Class");
  await validateClassAuthority(tx,manager,{
    deploymentId:instance.deploymentId,adoptionId:instance.adoptionId,
    offeringVersionId:instance.offeringVersionId,courseVersionId:instance.courseVersionId,
    operatingOrganizationId:instance.operatingOrganizationId,
    siteId:instance.siteId,title:instance.title,deliveryMode:instance.deliveryMode,
  });
  return instance;
}
/** Staff delegation is not a publication or academic credential. A Person
 * must independently hold a current verified room-facilitator grant at the
 * exact hosting Site before becoming a Class teacher/facilitator.
 */
export const assignNativeClassStaff=createServerFn({method:"POST"})
  .validator((raw:unknown)=>assignInput.parse(raw))
  .handler(async({data})=>{
    guarded();
    const manager=await requireClassManager();
    return db.transaction(async tx=>{
      const instance=await lockedManagedClass(tx,manager,data.classId);
      // A Class assignment uses the already verified, immutable CAN Person
      // and the EXACT current room-facilitator grant at this Class Site.
      // Native canonical Persons/accounts/grants and email-only identity
      // matching cannot create a second Person or silently grant staff power.
      const staffGrants=await tx.select({
        personId:people.id,
        grantId:accountPersonGrants.id,
        accountId:accessAccounts.id,
        personId:accountPersonGrants.personId,
        role:accountPersonGrants.role,
        organizationId:accountPersonGrants.organizationId,
        siteId:accountPersonGrants.siteId,
        email:accessAccounts.emailNormalized,
      }).from(accountPersonGrants)
        .innerJoin(accessAccounts,and(
          eq(accessAccounts.id,accountPersonGrants.accountId),
          eq(accessAccounts.personId,accountPersonGrants.personId),
        ))
        .innerJoin(people,eq(people.id,accountPersonGrants.personId))
        .where(and(
          eq(people.id,data.personId),
          eq(people.active,true),
          eq(accountPersonGrants.organizationId,instance.operatingOrganizationId),
          eq(accountPersonGrants.siteId,instance.siteId!),
          eq(accountPersonGrants.role,"room_facilitator"),
          eq(accountPersonGrants.active,true),
          eq(accessAccounts.disabled,false),
          isNotNull(accessAccounts.emailVerifiedAt),
        )).for("share").limit(2);
      if(staffGrants.length!==1 || (isDemoAccountEmail(staffGrants[0]!.email) &&
         (staffGrants[0]!.grantId!==LOCAL_DEMO_RILEY_FACILITATOR.grantId ||
          !isApprovedDemoGrant({...staffGrants[0]!,id:staffGrants[0]!.grantId},staffGrants[0]!.email))))
        throw new AuthorizationError("current verified CAN room-facilitator grant at exact Site");
      const [prior]=await tx.select({
        id:canonicalClassStaffAssignments.id,
        attendanceAuthorized:canonicalClassStaffAssignments.attendanceAuthorized,
      })
        .from(canonicalClassStaffAssignments).where(and(
          eq(canonicalClassStaffAssignments.classId,instance.id),
          eq(canonicalClassStaffAssignments.personId,data.personId),
          eq(canonicalClassStaffAssignments.roleCode,data.roleCode),
          eq(canonicalClassStaffAssignments.state,"approved"),
          isNull(canonicalClassStaffAssignments.endsAt),
        )).limit(1);
      if(prior){
        if(prior.attendanceAuthorized!==data.canVerifyAttendance)
          throw new AuthorizationError("end and reassign to change attendance permissions");
        return {assignmentId:prior.id,alreadyAssigned:true};
      }
      await assertCurrentCanonicalStaffForMutation(tx,getRequest(),manager.actor);
      const [assignment]=await tx.insert(canonicalClassStaffAssignments).values({
        classId:instance.id,personId:data.personId,roleCode:data.roleCode,
        attendanceAuthorized:data.canVerifyAttendance,
        state:"approved",beginsAt:new Date(),assignedByPersonId:manager.actor.actorPersonId!,
      }).returning({id:canonicalClassStaffAssignments.id});
      if(!assignment)throw new Error("Staff assignment was not saved");
      await writeCanonicalAudit(tx,{
        actorPersonId:manager.actor.actorPersonId!,
        owningOrganizationId:manager.organizationId,
        eventCode:"class.staff_assigned",
        entityKind:"class_staff_assignment",entityId:assignment.id,
        payload:{classId:instance.id,personId:data.personId,roleCode:data.roleCode,
          attendanceAuthorized:data.canVerifyAttendance},
      });
      await emitCanonicalDomainEvent(tx,{
        eventType:"ClassStaffAssigned",aggregateType:"class",aggregateId:instance.id,
        actorPersonId:manager.actor.actorPersonId!,
        payload:{assignmentId:assignment.id,personId:data.personId,roleCode:data.roleCode,
          attendanceAuthorized:data.canVerifyAttendance},
      });
      return {assignmentId:assignment.id,alreadyAssigned:false};
    });
  });

export const endNativeClassStaffAssignment=createServerFn({method:"POST"})
  .validator((raw:unknown)=>endInput.parse(raw))
  .handler(async({data})=>{
    guarded();
    const manager=await requireClassManager();
    return db.transaction(async tx=>{
      const instance=await lockedManagedClass(tx,manager,data.classId);
      const [assignment]=await tx.select().from(canonicalClassStaffAssignments)
        .where(and(eq(canonicalClassStaffAssignments.id,data.assignmentId),
          eq(canonicalClassStaffAssignments.classId,instance.id)))
        .for("update").limit(1);
      if(!assignment)throw new AuthorizationError("Class staff assignment");
      if(assignment.state==="ended"||assignment.state==="suspended")
        return {ended:true};
      const endedAt=new Date();
      await assertCurrentCanonicalStaffForMutation(tx,getRequest(),manager.actor);
      await tx.update(canonicalClassStaffAssignments)
        .set({state:"ended",endsAt:endedAt})
        .where(eq(canonicalClassStaffAssignments.id,assignment.id));
      await writeCanonicalAudit(tx,{
        actorPersonId:manager.actor.actorPersonId!,
        owningOrganizationId:manager.organizationId,
        eventCode:"class.staff_ended",
        entityKind:"class_staff_assignment",entityId:assignment.id,
        payload:{classId:instance.id,personId:assignment.personId,endedAt:endedAt.toISOString()},
      });
      return {ended:true};
    });
  });
