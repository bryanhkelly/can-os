import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { and, eq, gt, isNull, lte } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  canonicalClasses, canonicalClassStaffAssignments,
  canonicalAccountGrants, canonicalAccounts, canonicalPersons,
  auditEvents, domainEvents,
} from "@/db/canonical-v301";
import { AuthorizationError, assertCapability } from "@/domain/command-context";
import { getCanonicalCommandContext } from "@/modules/identity/canonical-command-context.server";
import { validateClassAuthority } from "./unified-class.functions";

const uuid=z.string().uuid();
const assignInput=z.object({
  classId:uuid,
  personId:uuid,
  roleCode:z.enum(["teacher","facilitator"]),
}).strict();
const endInput=z.object({classId:uuid,assignmentId:uuid}).strict();

function guarded(){
  if(process.env.CAN_UNIFIED_CLASS_COMMANDS_ENABLED!=="true")
    throw new AuthorizationError("native Class release not activated");
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
      const [person]=await tx.select({id:canonicalPersons.id}).from(canonicalPersons)
        .where(eq(canonicalPersons.id,data.personId)).limit(1);
      if(!person)throw new AuthorizationError("verified Class staff Person");
      const [grant]=await tx.select({id:canonicalAccountGrants.id})
        .from(canonicalAccountGrants)
        .innerJoin(canonicalAccounts,eq(canonicalAccounts.id,canonicalAccountGrants.accountId))
        .where(and(
          eq(canonicalAccountGrants.personId,data.personId),
          eq(canonicalAccountGrants.organizationId,instance.operatingOrganizationId),
          eq(canonicalAccountGrants.siteId,instance.siteId!),
          eq(canonicalAccountGrants.roleCode,"room_facilitator"),
          eq(canonicalAccountGrants.active,true),
          isNull(canonicalAccountGrants.revokedAt),
          isNull(canonicalAccounts.disabledAt),
          lte(canonicalAccountGrants.grantedAt,new Date()),
        )).limit(1);
      if(!grant)throw new AuthorizationError("current verified room-facilitator grant at this Site");
      const [prior]=await tx.select({id:canonicalClassStaffAssignments.id})
        .from(canonicalClassStaffAssignments).where(and(
          eq(canonicalClassStaffAssignments.classId,instance.id),
          eq(canonicalClassStaffAssignments.personId,data.personId),
          eq(canonicalClassStaffAssignments.roleCode,data.roleCode),
          eq(canonicalClassStaffAssignments.state,"approved"),
          isNull(canonicalClassStaffAssignments.endsAt),
        )).limit(1);
      if(prior)return {assignmentId:prior.id,alreadyAssigned:true};
      const [assignment]=await tx.insert(canonicalClassStaffAssignments).values({
        classId:instance.id,personId:data.personId,roleCode:data.roleCode,
        state:"approved",beginsAt:new Date(),assignedByPersonId:manager.actor.actorPersonId!,
      }).returning({id:canonicalClassStaffAssignments.id});
      if(!assignment)throw new Error("Staff assignment was not saved");
      await tx.insert(auditEvents).values({
        actorPersonId:manager.actor.actorPersonId!,
        owningOrganizationId:manager.organizationId,
        eventCode:"class.staff_assigned",
        entityKind:"class_staff_assignment",entityId:assignment.id,
        payload:{classId:instance.id,personId:data.personId,roleCode:data.roleCode},
      });
      await tx.insert(domainEvents).values({
        eventType:"ClassStaffAssigned",aggregateType:"class",aggregateId:instance.id,
        actorPersonId:manager.actor.actorPersonId!,
        payload:{assignmentId:assignment.id,personId:data.personId,roleCode:data.roleCode},
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
      await tx.update(canonicalClassStaffAssignments)
        .set({state:"ended",endsAt:endedAt})
        .where(eq(canonicalClassStaffAssignments.id,assignment.id));
      await tx.insert(auditEvents).values({
        actorPersonId:manager.actor.actorPersonId!,
        owningOrganizationId:manager.organizationId,
        eventCode:"class.staff_ended",
        entityKind:"class_staff_assignment",entityId:assignment.id,
        payload:{classId:instance.id,personId:assignment.personId,endedAt:endedAt.toISOString()},
      });
      return {ended:true};
    });
  });
