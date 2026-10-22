import { db } from "@/db/client";
import { accountPersonGrants,actions,guardianRelationships,people,programs,sites,studentProfiles } from "@/db/schema";
import { AuthorizationError } from "@/domain/command-context";
import { EventTypes } from "@/domain/event-types";
import { dedupeQueue,notificationSummary } from "@/domain/notification-triage";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { emitEvent,notify,writeAudit } from "@/platform/mutation";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { and,asc,desc,eq,inArray,isNotNull,isNull,or,sql } from "drizzle-orm";
import { operationsSelectionSchema,resolveOperationsSelection } from "./operations-scope.server";
import { resolveActionInTransaction } from "@/modules/actions/resolve-action";
import { assertAcademicActionAuthority,assertAcademicActionStaff } from "@/modules/actions/academic-action-policy.server";
import { openingHandoffType } from "@/modules/programs/opening-handoff.server";
import { gradeResponseActionType } from "@/domain/grade-response-policy";
import { prioritizeSchoolActions,schoolActionBacklog } from "@/domain/operations-action-triage";
import { guardianRelationshipPredicate } from "@/domain/guardian-relationship";

async function operator() {
 const actor=await getCommandContext(getRequest());
 if(!actor.actorPersonId||actor.role!=="registrar"||!actor.scope.siteIds?.length)
  throw new AuthorizationError("authorized school operator");
 return actor;
}

/** Operational work is sourced from canonical Actions, irrespective of data origin. */
export const getOperationsActions=createServerFn({method:"GET"})
 .validator((value:unknown)=>operationsSelectionSchema.parse(value))
 .handler(async({data})=>{
 const actor=await operator();
 const scoped=await resolveOperationsSelection(actor,data);
 const allowedPrograms=scoped.programIds.length ? or(isNull(actions.programId),inArray(actions.programId,scoped.programIds)) : isNull(actions.programId);
 const records=await db.select({
  id:actions.id,title:actions.title,description:actions.description,type:actions.type,
  siteId:actions.siteId,ownerPersonId:actions.ownerPersonId,
  status:actions.status,priority:actions.priority,dueAt:actions.dueAt,createdAt:actions.createdAt
 }).from(actions).where(and(inArray(actions.siteId,scoped.siteIds),inArray(actions.status,["open","in_progress","waiting"]),allowedPrograms,...(data.programId?[eq(actions.programId,data.programId)]:[]))).orderBy(sql`CASE ${actions.priority} WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 ELSE 2 END`,
   asc(actions.dueAt),desc(actions.createdAt)).limit(250);
 const items=dedupeQueue(records.map(record=>({
  id:record.id,kind:"action" as const,title:record.title,siteId:record.siteId,ownerPersonId:record.ownerPersonId,
  detail:record.description??record.type.replaceAll("_"," "),
  priority:record.priority==="urgent"?"critical" as const:record.priority==="high"?"high" as const:"normal" as const,
  createdAt:record.createdAt.toISOString(),
  dueAt:record.dueAt?.toISOString()??null, status:record.status,
  href:"/operations",
  needsResponse:record.status==="open",
 })));
 const scopedItems=prioritizeSchoolActions(items.map(item=>{
  const record=records.find(record=>record.id===item.id);
  return {...item,siteId:record?.siteId??null,ownerPersonId:record?.ownerPersonId??null,
   dueAt:record?.dueAt?.toISOString()??null,status:record?.status??"open",
   priority:item.priority==="critical"?"critical" as const:
     item.priority==="high"?"high" as const:"normal" as const,
   managedBySupport:record?.type==="support_referral",openingHandoff:record?.type===openingHandoffType};
 }));
 const assignees=await db.select({id:accountPersonGrants.personId,siteId:accountPersonGrants.siteId,role:accountPersonGrants.role,firstName:people.legalFirstName,lastName:people.legalLastName}).from(accountPersonGrants).innerJoin(people,eq(people.id,accountPersonGrants.personId)).where(and(inArray(accountPersonGrants.siteId,scoped.siteIds),eq(accountPersonGrants.active,true),inArray(accountPersonGrants.role,["registrar","teacher","specialist","counselor"])));
 const [siteChoices,programChoices]=await Promise.all([
  db.select({id:sites.id,name:sites.name}).from(sites).where(inArray(sites.id,actor.scope.siteIds!)),
  actor.scope.programIds?.length ? db.select({id:programs.id,name:programs.name,siteId:programs.siteId}).from(programs).where(and(inArray(programs.id,actor.scope.programIds),isNotNull(programs.siteId),...(data.siteId?[eq(programs.siteId,data.siteId)]:[]))) : Promise.resolve([]),
 ]);
 return {items:scopedItems,assignees,sites:siteChoices,programs:programChoices,selected:data,summary:{...notificationSummary(items),...schoolActionBacklog(scopedItems)}};
});

/** Generic Actions only: domain-owned referrals must use their own state machine. */
export const updateOperationsAction=createServerFn({method:"POST"})
 .validator((data:{id:string;status:"in_progress"|"waiting"|"resolved";resolutionNote?:string})=>data)
 .handler(async({data})=>{
  const actor=await operator();
  if(!["in_progress","waiting","resolved"].includes(data.status))throw new Error("Invalid action status");
  if(data.status==="resolved"&&!data.resolutionNote?.trim())throw new Error("Resolution note required");
  return db.transaction(async tx=>{
   const [record]=await tx.select().from(actions).where(and(eq(actions.id,data.id),inArray(actions.siteId,actor.scope.siteIds!))).for("update").limit(1);
   if(!record)throw new AuthorizationError("action scope");
   if(record.programId&&!(actor.scope.programIds??[]).includes(record.programId))throw new AuthorizationError("action program scope");
   if(record.type==="support_referral")throw new Error("Use the referral lifecycle");
   if(record.type===openingHandoffType)throw new Error("Use the named-recipient opening handoff in Site Today");
   const academic=record.type==="academic_intervention"&&record.subjectType==="student_profile"&&record.sectionId!==null;
   if(academic&&data.status==="resolved"){
    await resolveActionInTransaction(tx,actor,{actionId:record.id,resolutionNote:data.resolutionNote??""});
    return {saved:true};
   }
   if(academic)await assertAcademicActionAuthority(tx,actor,record);
   if(record.status==="cancelled"||record.status==="resolved")throw new Error("Action is closed");
   if(record.status===data.status)return {saved:true};
   const now=new Date();
   await tx.update(actions).set({status:data.status,resolvedAt:data.status==="resolved"?now:null,resolutionNote:data.status==="resolved"?data.resolutionNote?.trim():record.resolutionNote,updatedAt:now}).where(eq(actions.id,record.id));
   await writeAudit(tx,actor,{action:"action.status.change",entityType:"action",entityId:record.id,scope:{siteId:record.siteId,programId:record.programId},before:{status:record.status},after:{status:data.status}});
   if(data.status==="resolved")await emitEvent(tx,{eventType:EventTypes.ActionResolved,aggregateType:"action",aggregateId:record.id,actorPersonId:actor.actorPersonId,payload:{subjectType:record.subjectType,subjectId:record.subjectId}});
   // A resolved school-owned guardian question closes the response loop.
   // Re-check the current academic relationship before notifying: a revoked
   // guardian must not receive information about this student's progress.
   if(data.status==="resolved" && record.type===gradeResponseActionType &&
      record.subjectType==="student_profile" &&
      typeof record.metadata.requestedByGuardianPersonId==="string"){
    const guardianPersonId=record.metadata.requestedByGuardianPersonId;
    const [related]=await tx.select({id:guardianRelationships.id})
      .from(guardianRelationships).innerJoin(studentProfiles,
        eq(studentProfiles.personId,guardianRelationships.studentPersonId))
      .where(and(eq(studentProfiles.id,record.subjectId),
        guardianRelationshipPredicate({
          guardianPersonId,studentPersonId:studentProfiles.personId,access:"academic",
        }))).limit(1);
    if(related)await notify(tx,{
      recipientPersonId:guardianPersonId,
      type:"guardian_grade_follow_up_resolved",
      title:"Your school responded to your academic question",
      body:"Review the school's resolution in your child's academic progress.",
      resourceType:"action",resourceId:record.id,
    });
   }
   return {saved:true};
  });
 });

export const assignOperationsAction=createServerFn({method:"POST"})
 .validator((data:{id:string;ownerPersonId:string|null;priority:"normal"|"high"|"urgent"})=>data)
 .handler(async({data})=>{
  const actor=await operator();
  if(!["normal","high","urgent"].includes(data.priority))throw new Error("Invalid priority");
  return db.transaction(async tx=>{
   const [record]=await tx.select().from(actions).where(and(eq(actions.id,data.id),inArray(actions.siteId,actor.scope.siteIds!))).for("update").limit(1);
   if(!record||["resolved","cancelled"].includes(record.status))throw new AuthorizationError("active action scope");
   if(record.programId&&!(actor.scope.programIds??[]).includes(record.programId))throw new AuthorizationError("action program scope");
   if(record.type==="support_referral")throw new Error("Use the referral lifecycle");
   if(record.type===openingHandoffType)throw new Error("Use the named-recipient opening handoff in Site Today");
   const academic=record.type==="academic_intervention"&&record.subjectType==="student_profile"&&record.sectionId!==null;
   if(academic)await assertAcademicActionAuthority(tx,actor,record);
   if(data.ownerPersonId){
    if(!record.siteId)throw new AuthorizationError("site-scoped action required for assignment");
    const [grant]=await tx.select({id:accountPersonGrants.id}).from(accountPersonGrants).where(and(eq(accountPersonGrants.personId,data.ownerPersonId),eq(accountPersonGrants.siteId,record.siteId!),eq(accountPersonGrants.active,true),inArray(accountPersonGrants.role,["registrar","teacher","specialist","counselor"]))).limit(1);
    if(!grant)throw new AuthorizationError("assignee must have active site membership");
    if(academic)await assertAcademicActionStaff(tx,data.ownerPersonId,record);
   }
   if(record.ownerPersonId===data.ownerPersonId&&record.priority===data.priority)return {saved:true};
   await tx.update(actions).set({ownerPersonId:data.ownerPersonId,priority:data.priority,updatedAt:new Date()}).where(eq(actions.id,record.id));
   if(data.ownerPersonId&&data.ownerPersonId!==record.ownerPersonId)await notify(tx,{recipientPersonId:data.ownerPersonId,type:"operations_action_assigned",title:"Assigned action: "+record.title,body:"An action requires your attention.",resourceType:"action",resourceId:record.id});
   await writeAudit(tx,actor,{action:"action.assignment.change",entityType:"action",entityId:record.id,scope:{siteId:record.siteId,programId:record.programId},before:{ownerPersonId:record.ownerPersonId,priority:record.priority},after:{ownerPersonId:data.ownerPersonId,priority:data.priority}});
   return {saved:true};
  });
 });
