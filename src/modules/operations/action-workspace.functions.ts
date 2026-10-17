import {createServerFn} from "@tanstack/react-start";
import {getRequest} from "@tanstack/react-start/server";
import {and,desc,eq,inArray} from "drizzle-orm";
import {db} from "@/db/client";
import {actions,auditEvents,domainEvents,notifications,accountPersonGrants,people} from "@/db/schema";
import {getCommandContext} from "@/modules/identity/command-context.server";
import {AuthorizationError} from "@/domain/command-context";
import {notificationSummary,dedupeQueue} from "@/domain/notification-triage";
import {EventTypes} from "@/domain/event-types";

async function operator() {
 const actor=await getCommandContext(getRequest());
 if(!actor.actorPersonId||actor.role!=="registrar"||!actor.scope.siteIds?.length)
  throw new AuthorizationError("authorized school operator");
 return actor;
}

/** Operational work is sourced from canonical Actions, irrespective of data origin. */
export const getOperationsActions=createServerFn({method:"GET"}).handler(async()=>{
 const actor=await operator();
 const records=await db.select({
  id:actions.id,title:actions.title,description:actions.description,type:actions.type,
  siteId:actions.siteId,ownerPersonId:actions.ownerPersonId,
  status:actions.status,priority:actions.priority,createdAt:actions.createdAt
 }).from(actions).where(and(inArray(actions.siteId,actor.scope.siteIds!),inArray(actions.status,["open","in_progress","waiting"]))).orderBy(desc(actions.createdAt)).limit(100);
 const items=dedupeQueue(records.map(record=>({
  id:record.id,kind:"action" as const,title:record.title,siteId:record.siteId,ownerPersonId:record.ownerPersonId,
  detail:record.description??record.type.replaceAll("_"," "),
  priority:record.priority==="urgent"?"critical" as const:record.priority==="high"?"high" as const:"normal" as const,
  createdAt:record.createdAt.toISOString(),
  href:record.type==="support_referral"?"/student/support?referral="+encodeURIComponent(record.id):"/operations",
  needsResponse:record.status==="open",
 })));
 const scopedItems=items.map(item=>({...item,siteId:records.find(record=>record.id===item.id)?.siteId??null,ownerPersonId:records.find(record=>record.id===item.id)?.ownerPersonId??null}));
 const assignees=await db.select({id:accountPersonGrants.personId,siteId:accountPersonGrants.siteId,role:accountPersonGrants.role,firstName:people.legalFirstName,lastName:people.legalLastName}).from(accountPersonGrants).innerJoin(people,eq(people.id,accountPersonGrants.personId)).where(and(inArray(accountPersonGrants.siteId,actor.scope.siteIds!),eq(accountPersonGrants.active,true),inArray(accountPersonGrants.role,["registrar","teacher","specialist"])));
 return {items:scopedItems,assignees,summary:notificationSummary(items)};
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
   if(record.type==="support_referral")throw new Error("Use the referral lifecycle");
   if(record.status==="cancelled"||record.status==="resolved")throw new Error("Action is closed");
   if(record.status===data.status)return {saved:true};
   const now=new Date();
   await tx.update(actions).set({status:data.status,resolvedAt:data.status==="resolved"?now:null,resolutionNote:data.status==="resolved"?data.resolutionNote?.trim():record.resolutionNote,updatedAt:now}).where(eq(actions.id,record.id));
   await tx.insert(auditEvents).values({actorPersonId:actor.actorPersonId,action:"action.status.change",resourceType:"action",resourceId:record.id,scope:{siteId:record.siteId,programId:record.programId},before:{status:record.status},after:{status:data.status},context:{requestId:actor.requestId??null}});
   if(data.status==="resolved")await tx.insert(domainEvents).values({eventType:EventTypes.ActionResolved,aggregateType:"action",aggregateId:record.id,actorPersonId:actor.actorPersonId,payload:{subjectType:record.subjectType,subjectId:record.subjectId}});
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
   if(record.type==="support_referral")throw new Error("Use the referral lifecycle");
   if(data.ownerPersonId){
    if(!record.siteId)throw new AuthorizationError("site-scoped action required for assignment");
    const [grant]=await tx.select({id:accountPersonGrants.id}).from(accountPersonGrants).where(and(eq(accountPersonGrants.personId,data.ownerPersonId),eq(accountPersonGrants.siteId,record.siteId!),eq(accountPersonGrants.active,true),inArray(accountPersonGrants.role,["registrar","teacher","specialist"]))).limit(1);
    if(!grant)throw new AuthorizationError("assignee must have active site membership");
   }
   if(record.ownerPersonId===data.ownerPersonId&&record.priority===data.priority)return {saved:true};
   await tx.update(actions).set({ownerPersonId:data.ownerPersonId,priority:data.priority,updatedAt:new Date()}).where(eq(actions.id,record.id));
   if(data.ownerPersonId&&data.ownerPersonId!==record.ownerPersonId)await tx.insert(notifications).values({recipientPersonId:data.ownerPersonId,type:"operations_action_assigned",title:"Assigned action: "+record.title,body:"An action requires your attention.",resourceType:"action",resourceId:record.id});
   await tx.insert(auditEvents).values({actorPersonId:actor.actorPersonId,action:"action.assignment.change",resourceType:"action",resourceId:record.id,scope:{siteId:record.siteId,programId:record.programId},before:{ownerPersonId:record.ownerPersonId,priority:record.priority},after:{ownerPersonId:data.ownerPersonId,priority:data.priority},context:{requestId:actor.requestId??null}});
   return {saved:true};
  });
 });
