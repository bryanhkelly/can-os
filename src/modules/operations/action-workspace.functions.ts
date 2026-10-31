import { db } from "@/db/client";
import { accountPersonGrants,actions,guardianRelationships,people,programs,sites,studentProfiles } from "@/db/schema";
import { AuthorizationError } from "@/domain/command-context";
import { EventTypes } from "@/domain/event-types";
import { guardianRelationshipPredicate } from "@/domain/guardian-relationship";
import { dedupeQueue,notificationSummary } from "@/domain/notification-triage";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { emitEvent,notify,writeAudit } from "@/platform/mutation";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getRequest } from "@tanstack/react-start/server";
import { and,asc,desc,eq,inArray,isNotNull,isNull,or,sql } from "drizzle-orm";
import { operationsSelectionSchema,resolveOperationsSelection } from "./operations-scope.server";
import { resolveActionInTransaction } from "@/modules/actions/resolve-action";
import { assertAcademicActionAuthority,assertAcademicActionStaff } from "@/modules/actions/academic-action-policy.server";
import { openingHandoffType } from "@/modules/programs/opening-handoff.server";
import { gradeResponseActionType } from "@/domain/grade-response-policy";
import { prioritizeSchoolActions,schoolActionBacklog } from "@/domain/operations-action-triage";
import { currentSiteDirectorPersonId } from "./site-local-delegation.server";
import { assertLocalDelegationIssuer } from "@/domain/site-local-delegation-policy";

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
  siteId:actions.siteId,programId:actions.programId,ownerPersonId:actions.ownerPersonId,
  ownerFirstName:people.legalFirstName,ownerLastName:people.legalLastName,
  status:actions.status,priority:actions.priority,dueAt:actions.dueAt,createdAt:actions.createdAt,
  metadata:actions.metadata
 }).from(actions).leftJoin(people,eq(people.id,actions.ownerPersonId)).where(and(inArray(actions.siteId,scoped.siteIds),inArray(actions.status,["open","in_progress","waiting"]),allowedPrograms,...(data.programId?[eq(actions.programId,data.programId)]:[]))).orderBy(sql`CASE ${actions.priority} WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 ELSE 2 END`,
   asc(actions.dueAt),desc(actions.createdAt)).limit(250);
 const coverageGapOwners=new Map<string,string|null>();
 for(const record of records){
  if(record.type==="onsite_coverage_gap"&&record.programId&&!coverageGapOwners.has(record.programId))
   coverageGapOwners.set(record.programId,await currentSiteDirectorPersonId(db,record.programId));
 }
 const items=dedupeQueue(records.map(record=>({
  id:record.id,kind:"action" as const,
  title:record.type==="support_referral"?"Restricted student support referral":record.title,
  siteId:record.siteId,ownerPersonId:record.ownerPersonId,
  detail:record.type==="support_referral"
   ?"Open the authorized support workspace for private details and the domain-owned next step."
   :record.type==="guardian_enrollment_change_request"&&record.metadata.kind==="transfer"?
     [record.description??"Guardian requests transfer",
      "Destination: "+(typeof record.metadata.destinationSchoolName==="string"?record.metadata.destinationSchoolName:"Not specified"),
      ...(typeof record.metadata.intendedLastDay==="string"?["Requested last day: "+record.metadata.intendedLastDay]:[]),
      ...(actor.role==="registrar"&&typeof record.metadata.destinationSchoolContactEmail==="string"?
        ["Destination records contact: "+record.metadata.destinationSchoolContactEmail]:[]),
     ].join(" · ")
   :record.description??record.type.replaceAll("_"," "),
  priority:record.priority==="urgent"?"critical" as const:record.priority==="high"?"high" as const:"normal" as const,
  createdAt:record.createdAt.toISOString(),
  dueAt:record.dueAt?.toISOString()??null, status:record.status,
  href:"/operations",
  needsResponse:record.status==="open",
 })));
 const scopedItems=prioritizeSchoolActions(items.map(item=>{
  const record=records.find(record=>record.id===item.id);
  return {...item,type:record?.type??"operations",programId:record?.programId??null,
   siteId:record?.siteId??null,ownerPersonId:record?.ownerPersonId??null,
   eligibleOwnerPersonId:record?.type==="onsite_coverage_gap"&&record.programId
     ?coverageGapOwners.get(record.programId)??null:null,
   ownerName:record?.ownerFirstName&&record.ownerLastName?`${record.ownerFirstName} ${record.ownerLastName}`:null,
   dueAt:record?.dueAt?.toISOString()??null,status:record?.status??"open",
   priority:item.priority==="critical"?"critical" as const:
     item.priority==="high"?"high" as const:"normal" as const,
   managedBySupport:record?.type==="support_referral",openingHandoff:record?.type===openingHandoffType,
   enrollmentChangeKind:record?.type==="guardian_enrollment_change_request"&&
     (record.metadata.kind==="withdrawal"||record.metadata.kind==="transfer")?record.metadata.kind:null};
 }));
 const assignees=await db.select({id:accountPersonGrants.personId,siteId:accountPersonGrants.siteId,role:accountPersonGrants.role,firstName:people.legalFirstName,lastName:people.legalLastName}).from(accountPersonGrants).innerJoin(people,eq(people.id,accountPersonGrants.personId)).where(and(inArray(accountPersonGrants.siteId,scoped.siteIds),eq(accountPersonGrants.active,true),inArray(accountPersonGrants.role,["registrar","teacher","specialist","counselor","site_leader"])));
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
   if(record.type==="onsite_pickup_custody_hold")throw new Error("A site leader must resolve this pickup restriction in the onsite pickup workflow");
   if(record.type==="guardian_health_information_review" && data.status==="resolved")throw new Error("Use the restricted health review decision workflow");
   if(record.type==="transfer_academic_records_handoff"&&data.status==="resolved")throw new Error("Complete the verified records handoff through the institutional transfer workspace");
   if(record.type==="guardian_enrollment_change_request"&&data.status==="resolved"&&
      (record.metadata.kind==="withdrawal"||record.metadata.kind==="transfer"))
     throw new Error("Complete the official withdrawal or transfer through the registrar enrollment-exit workflow");
   if(record.type===openingHandoffType)throw new Error("Use the named-recipient opening handoff in Site Today");
   if(record.type==="onsite_coverage_gap"&&data.status==="resolved")
     throw new Error("The current assigned site director resolves coverage gaps in Site Today");
   const academic=(record.type==="academic_intervention"||record.type===gradeResponseActionType)&&record.subjectType==="student_profile"&&record.sectionId!==null;
   if(record.type===gradeResponseActionType&&!academic)throw new AuthorizationError("academic grade follow-up scope");
   if(academic&&data.status==="resolved"){
    await resolveActionInTransaction(tx,actor,{actionId:record.id,resolutionNote:data.resolutionNote??""});
    return {saved:true};
   }
   if(academic)await assertAcademicActionAuthority(tx,actor,record);
   // An identical resolution retry is a no-op after current scope/domain
   // authorization. Never rewrite a closed answer or repeat its evidence.
   if(record.status==="resolved"&&data.status==="resolved"&&
      record.resolutionNote===data.resolutionNote?.trim())return {saved:true};
   if(record.status==="cancelled"||record.status==="resolved")throw new Error("Action is closed");
   if(record.status===data.status)return {saved:true};
   const now=new Date();
   await tx.update(actions).set({status:data.status,resolvedAt:data.status==="resolved"?now:null,resolutionNote:data.status==="resolved"?data.resolutionNote?.trim():record.resolutionNote,updatedAt:now}).where(eq(actions.id,record.id));
   await writeAudit(tx,actor,{action:"action.status.change",entityType:"action",entityId:record.id,scope:{siteId:record.siteId,programId:record.programId},before:{status:record.status},after:{status:data.status}});
   if(data.status==="resolved")await emitEvent(tx,{eventType:EventTypes.ActionResolved,aggregateType:"action",aggregateId:record.id,actorPersonId:actor.actorPersonId,payload:{subjectType:record.subjectType,subjectId:record.subjectId}});
   if(record.type==="guardian_enrollment_change_request"&&record.subjectType==="student_profile"&&
      typeof record.metadata.requestedByGuardianPersonId==="string"){
    const requestedBy=record.metadata.requestedByGuardianPersonId;
    const [verified]=await tx.select({personId:guardianRelationships.guardianPersonId})
     .from(studentProfiles)
     .innerJoin(guardianRelationships,guardianRelationshipPredicate({
      guardianPersonId:requestedBy,studentPersonId:studentProfiles.personId,access:"enrollment",
     }))
     .where(eq(studentProfiles.id,record.subjectId)).limit(1);
    if(verified)await notify(tx,{
      recipientPersonId:verified.personId,
      type:"guardian_enrollment_change_updated",
      title:data.status==="resolved"?"School responded to your enrollment request":"School enrollment request updated",
      body:"Review the school response in your family enrollment-change workspace. An update does not by itself change enrollment.",
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
   if(record.type==="onsite_pickup_custody_hold")throw new Error("A site leader must resolve this pickup restriction in the onsite pickup workflow");
   if(record.type===openingHandoffType)throw new Error("Use the named-recipient opening handoff in Site Today");
   const academic=(record.type==="academic_intervention"||record.type===gradeResponseActionType)&&record.subjectType==="student_profile"&&record.sectionId!==null;
   if(record.type===gradeResponseActionType&&!academic)throw new AuthorizationError("academic grade follow-up scope");
   if(academic)await assertAcademicActionAuthority(tx,actor,record);
   const coverageGap=record.type==="onsite_coverage_gap";
   if(coverageGap){
    if(!record.programId||!record.siteId||!record.organizationId)
      throw new AuthorizationError("coverage gap requires a named school and program");
    assertLocalDelegationIssuer(actor,{organizationId:record.organizationId,siteId:record.siteId,programId:record.programId});
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"local-site-delegation:"+record.programId}))`);
    const eligibleOwner=await currentSiteDirectorPersonId(tx,record.programId);
    if(data.ownerPersonId!==eligibleOwner)
      throw new AuthorizationError("coverage gap owner must be the current eligible site director");
   }
   if(data.ownerPersonId&&!coverageGap){
    if(!record.siteId)throw new AuthorizationError("site-scoped action required for assignment");
    const [grant]=await tx.select({id:accountPersonGrants.id}).from(accountPersonGrants).where(and(eq(accountPersonGrants.personId,data.ownerPersonId),eq(accountPersonGrants.siteId,record.siteId!),eq(accountPersonGrants.active,true),inArray(accountPersonGrants.role,["registrar","teacher","specialist","counselor"]))).limit(1);
    if(!grant)throw new AuthorizationError("assignee must have active site membership");
    if(academic)await assertAcademicActionStaff(tx,data.ownerPersonId,record);
   }
   const priority=coverageGap&&!data.ownerPersonId?"urgent":data.priority;
   if(record.ownerPersonId===data.ownerPersonId&&record.priority===priority&&
      (!coverageGap||record.metadata.ownerEscalation===(data.ownerPersonId===null)))return {saved:true};
   await tx.update(actions).set({ownerPersonId:data.ownerPersonId,priority,updatedAt:new Date(),
     ...(coverageGap?{metadata:{...record.metadata,ownerEscalation:data.ownerPersonId===null}}:{})}).where(eq(actions.id,record.id));
   if(data.ownerPersonId&&data.ownerPersonId!==record.ownerPersonId)await notify(tx,{recipientPersonId:data.ownerPersonId,type:"operations_action_assigned",title:"Assigned action: "+record.title,body:"An action requires your attention.",resourceType:"action",resourceId:record.id});
   await writeAudit(tx,actor,{action:"action.assignment.change",entityType:"action",entityId:record.id,scope:{siteId:record.siteId,programId:record.programId},before:{ownerPersonId:record.ownerPersonId,priority:record.priority},after:{ownerPersonId:data.ownerPersonId,priority}});
   return {saved:true};
  });
 });

/** Give a verified school Action a real due date. Domain-owned referrals and
 * opening handoffs retain their own lifecycle. Changes are audited/events. */
export const setOperationsActionDeadline=createServerFn({method:"POST"})
 .validator((value:unknown)=>z.object({
   id:z.string().uuid(),dueAt:z.string().datetime({offset:true}).nullable(),
   reason:z.string().trim().min(5).max(500),
 }).strict().parse(value))
 .handler(async({data})=>{
   const actor=await operator();
   return db.transaction(async tx=>{
     const [record]=await tx.select().from(actions)
       .where(and(eq(actions.id,data.id),inArray(actions.siteId,actor.scope.siteIds??[])))
       .for("update").limit(1);
     if(!record||record.status==="resolved"||record.status==="cancelled")
       throw new AuthorizationError("open action in authorized school");
     if(record.organizationId&&!actor.scope.organizationIds?.includes(record.organizationId))
       throw new AuthorizationError("action school ownership");
     if(record.programId&&!actor.scope.programIds?.includes(record.programId))
       throw new AuthorizationError("action program");
     if(record.type==="support_referral"||record.type===openingHandoffType||record.type==="onsite_pickup_custody_hold")
       throw new Error("Use the Action's owning domain workflow");
     if(record.type==="academic_intervention"&&record.subjectType==="student_profile"&&record.sectionId)
       await assertAcademicActionAuthority(tx,actor,record);
     const newDate=data.dueAt?new Date(data.dueAt):null;
     if((record.dueAt?.getTime()??null)===(newDate?.getTime()??null))
       return {changed:false as const};
     await tx.update(actions).set({dueAt:newDate,updatedAt:new Date()})
       .where(eq(actions.id,record.id));
     await writeAudit(tx,actor,{
       action:"action.deadline.change",entityType:"action",entityId:record.id,
       scope:{organizationId:record.organizationId,siteId:record.siteId,programId:record.programId},
       before:{dueAt:record.dueAt?.toISOString()??null},
       after:{dueAt:newDate?.toISOString()??null,reason:data.reason},
     });
     await emitEvent(tx,{
       eventType:EventTypes.ActionDeadlineChanged,aggregateType:"action",
       aggregateId:record.id,actorPersonId:actor.actorPersonId,
       organizationId:record.organizationId,siteId:record.siteId,programId:record.programId,
       payload:{dueAt:newDate?.toISOString()??null},
     });
     if(record.ownerPersonId&&record.ownerPersonId!==actor.actorPersonId)
       await notify(tx,{recipientPersonId:record.ownerPersonId,
         type:"operations_action_deadline_changed",title:"Action deadline updated",
         body:"Review the updated deadline in the school operations queue.",
         resourceType:"action",resourceId:record.id});
     return {changed:true as const};
   });
 });

/** Onsite exceptions the named local owner (usually the church Site director)
 * closes personally. Everything else stays in the registrar operations
 * workspace or its owning domain workflow. */
const onsiteOwnerResolvableTypes=new Set([
  "onsite_coverage_gap",
  "onsite_pickup_denied_follow_up",
  "onsite_pickup_uncollected_child",
]);

/** The assigned owner resolves their own onsite coverage-gap and custody
 * follow-up Actions with a factual note. Owner-only, type-allowlisted and
 * scope-checked; resolution never edits the underlying attendance, pickup or
 * duty history, and an identical retry is a no-op. */
export const resolveOwnedSiteOperationalAction=createServerFn({method:"POST"})
 .validator((value:unknown)=>z.object({
   id:z.string().uuid(),resolutionNote:z.string().trim().min(10).max(2000),
 }).strict().parse(value))
 .handler(async({data})=>{
   const actor=await getCommandContext(getRequest());
   if(!actor.actorPersonId||actor.role!=="site_leader"||!actor.scope.siteIds?.length)
     throw new AuthorizationError("verified site leadership grant");
   return db.transaction(async tx=>{
     const [record]=await tx.select().from(actions)
       .where(and(eq(actions.id,data.id),inArray(actions.siteId,actor.scope.siteIds!)))
       .for("update").limit(1);
     if(!record||!record.siteId)
       throw new AuthorizationError("site action scope");
     if(record.organizationId&&!actor.scope.organizationIds?.includes(record.organizationId))
       throw new AuthorizationError("action school ownership");
     if(record.programId&&!(actor.scope.programIds??[]).includes(record.programId))
       throw new AuthorizationError("action program scope");
     if(!onsiteOwnerResolvableTypes.has(record.type))
       throw new AuthorizationError("this Action is resolved in its owning workflow");
     if(record.ownerPersonId!==actor.actorPersonId)
       throw new AuthorizationError("only the assigned owner resolves this follow-up");
     if(record.type==="onsite_coverage_gap"){
       if(!record.programId)throw new AuthorizationError("coverage gap program required");
       await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"local-site-delegation:"+record.programId}))`);
       if(await currentSiteDirectorPersonId(tx,record.programId)!==actor.actorPersonId)
         throw new AuthorizationError("only the current eligible site director resolves this coverage gap");
     }
     if(record.status==="resolved"&&record.resolutionNote===data.resolutionNote)
       return {saved:true};
     if(record.status==="cancelled"||record.status==="resolved")
       throw new Error("Action is closed");
     const now=new Date();
     await tx.update(actions).set({status:"resolved",resolvedAt:now,
       resolutionNote:data.resolutionNote,updatedAt:now}).where(eq(actions.id,record.id));
     await writeAudit(tx,actor,{action:"action.status.change",entityType:"action",
       entityId:record.id,
       scope:{organizationId:record.organizationId,siteId:record.siteId,programId:record.programId},
       before:{status:record.status},
       after:{status:"resolved",resolutionNote:data.resolutionNote,ownerResolved:true}});
     await emitEvent(tx,{
       eventType:EventTypes.ActionResolved,aggregateType:"action",
       aggregateId:record.id,actorPersonId:actor.actorPersonId,
       organizationId:record.organizationId,siteId:record.siteId,programId:record.programId,
       payload:{subjectType:record.subjectType,subjectId:record.subjectId,type:record.type},
     });
     return {saved:true};
   });
 });
