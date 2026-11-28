import {and,asc,eq,gt,inArray,isNull,or,sql} from "drizzle-orm";
import {db} from "@/db/client";
import {actions,sites,programs,organizations,people,accountPersonGrants,accessAccounts} from "@/db/schema";
import {AuthorizationError,assertCapability} from "@/domain/command-context";
import {DomainError} from "@/domain/errors";
import {parseCommandInput} from "@/domain/command-input";
import {hasRegistrarAuthority} from "@/domain/school-roles";
import {EventTypes} from "@/domain/event-types";
import {getIdentityContext} from "@/modules/identity/command-context.server";
import {assertCurrentCANGrantForMutation} from "@/modules/identity/current-can-grant-transaction.server";
import {verifiedStaffIdentityPredicate} from "@/modules/identity/verified-staff-identity.server";
import {emitEvent,notify,writeAudit} from "@/platform/mutation";
import {resolveOperationsSelection} from "./operations-scope.server";
import {createOperationalTaskSchema,escalateOperationalTaskSchema,manualTaskPageSchema} from "./manual-work.inputs";
import {manualTaskType,manualTaskId,taskFingerprint,escalationDisposition} from "./manual-work-policy.server";
type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];
async function operator(request:Request){
 const actor=await getIdentityContext(request);
 if(!actor.actorPersonId||!hasRegistrarAuthority(actor.role)||actor.scope.organizationIds?.length!==1||!actor.scope.siteIds?.length)
  throw new AuthorizationError("authorized operations staff");
 assertCapability(actor,"action.resolve");
 return {actor,org:actor.scope.organizationIds[0]};
}
async function assertResource(tx:Tx,actor:Awaited<ReturnType<typeof operator>>["actor"],org:string,siteId:string,programId:string|null){
 if(!actor.scope.siteIds?.includes(siteId)||programId&&!actor.scope.programIds?.includes(programId))throw new AuthorizationError("operational task scope");
 const [site]=await tx.select({id:sites.id}).from(sites).innerJoin(organizations,eq(organizations.id,sites.organizationId))
  .where(and(eq(sites.id,siteId),eq(sites.organizationId,org),eq(organizations.lifecycleStatus,"active"),inArray(sites.lifecycleStatus,["planning","active"]))).for("share").limit(1);
 if(!site)throw new AuthorizationError("current operating Site");
 if(programId){
  const [program]=await tx.select({id:programs.id}).from(programs).where(and(eq(programs.id,programId),eq(programs.siteId,siteId),eq(programs.organizationId,org))).for("share").limit(1);
  if(!program)throw new AuthorizationError("exact Program at Site");
 }
}
/** Manual tasks remain in the operator workspace: no assignment to a role that cannot open them. */
export async function assertManualTaskOwner(tx:Tx,org:string,siteId:string,personId:string){
 const [grant]=await tx.select({id:accountPersonGrants.id}).from(accountPersonGrants)
  .innerJoin(people,eq(people.id,accountPersonGrants.personId))
  .innerJoin(accessAccounts,eq(accessAccounts.id,accountPersonGrants.accountId))
  .where(and(eq(accountPersonGrants.personId,personId),eq(accountPersonGrants.organizationId,org),
   eq(accountPersonGrants.siteId,siteId),eq(accountPersonGrants.active,true),
   inArray(accountPersonGrants.role,["site_admin","registrar"]),eq(people.active,true),
   eq(accessAccounts.disabled,false),eq(accessAccounts.personId,people.id),verifiedStaffIdentityPredicate())).for("share").limit(1);
 if(!grant)throw new AuthorizationError("current Site operator assignee");
}
export async function createOperationalTaskService(request:Request,raw:unknown){
 const input=parseCommandInput(createOperationalTaskSchema,raw);
 const {actor,org}=await operator(request);
 const data={siteId:input.siteId,programId:input.programId??null,title:input.title,description:input.description??null,ownerPersonId:input.ownerPersonId,priority:input.priority,dueAt:input.dueAt?new Date(input.dueAt).toISOString():null};
 const fingerprint=taskFingerprint(data);
 const id=manualTaskId(actor.accountId,input.requestId);
 return db.transaction(async tx=>{
  await assertCurrentCANGrantForMutation(tx,request,actor,{roles:["site_admin","registrar"],organizationId:org,siteId:actor.grantSiteId});
  await assertResource(tx,actor,org,data.siteId,data.programId);
  if(data.ownerPersonId)await assertManualTaskOwner(tx,org,data.siteId,data.ownerPersonId);
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"manual-task:"+id}))`);
  const [existing]=await tx.select().from(actions).where(eq(actions.id,id)).for("update").limit(1);
  if(existing){
   if(existing.type!==manualTaskType||existing.organizationId!==org||existing.siteId!==data.siteId||existing.programId!==data.programId||existing.metadata.creationFingerprint!==fingerprint)
    throw new DomainError("CONFLICT","Task request ID already used");
   return {actionId:id,replayed:true};
  }
  await tx.insert(actions).values({id,type:manualTaskType,organizationId:org,siteId:data.siteId,programId:data.programId,
   subjectType:data.programId?"program":"site",subjectId:data.programId??data.siteId,title:data.title,description:data.description,
   ownerPersonId:data.ownerPersonId,priority:data.priority,dueAt:data.dueAt?new Date(data.dueAt):null,
   metadata:{creationFingerprint:fingerprint,createdByAccountId:actor.accountId,creationRequestId:input.requestId}});
  const scope={organizationId:org,siteId:data.siteId,programId:data.programId};
  await writeAudit(tx,actor,{action:"action.operational.create",entityType:"action",entityId:id,scope,after:{status:"open",ownerPersonId:data.ownerPersonId,priority:data.priority,dueAt:data.dueAt}});
  await emitEvent(tx,{eventType:EventTypes.ActionCreated,aggregateType:"action",aggregateId:id,actorPersonId:actor.actorPersonId,...scope,payload:{type:manualTaskType}});
  if(data.ownerPersonId)await notify(tx,{recipientPersonId:data.ownerPersonId,type:"operations_action_assigned",title:"Operational task assigned",body:"Open your authorized operations workspace.",resourceType:"action",resourceId:id});
  return {actionId:id,replayed:false};
 });
}
export async function escalateOperationalTaskService(request:Request,raw:unknown){
 const input=parseCommandInput(escalateOperationalTaskSchema,raw);
 const {actor,org}=await operator(request);
 const fingerprint=taskFingerprint([actor.accountId,input.requestId,input.expectedUpdatedAt,input.reason]);
 return db.transaction(async tx=>{
  await assertCurrentCANGrantForMutation(tx,request,actor,{roles:["site_admin","registrar"],organizationId:org,siteId:actor.grantSiteId});
  const [record]=await tx.select().from(actions).where(and(eq(actions.id,input.id),eq(actions.organizationId,org),eq(actions.type,manualTaskType),inArray(actions.siteId,actor.scope.siteIds!))).for("update").limit(1);
  if(!record||!record.siteId)throw new AuthorizationError("manual operational task");
  await assertResource(tx,actor,org,record.siteId,record.programId);
  const disposition=escalationDisposition({status:record.status,priority:record.priority,updatedAt:record.updatedAt.toISOString(),expectedUpdatedAt:new Date(input.expectedUpdatedAt).toISOString(),priorFingerprint:record.metadata.escalationFingerprint,fingerprint});
  if(disposition==="replay")return {changed:false,replayed:true};
  if(disposition==="conflict"||record.metadata.escalationRequestId===input.requestId)throw new DomainError("CONFLICT","Task changed or already urgent");
  if(record.ownerPersonId)await assertManualTaskOwner(tx,org,record.siteId,record.ownerPersonId);
  const now=new Date(Math.max(Date.now(),record.updatedAt.getTime()+1));
  await tx.update(actions).set({priority:"urgent",updatedAt:now,metadata:{...record.metadata,escalationFingerprint:fingerprint,escalationRequestId:input.requestId}}).where(eq(actions.id,record.id));
  const scope={organizationId:org,siteId:record.siteId,programId:record.programId};
  await writeAudit(tx,actor,{action:"action.operational.escalate",entityType:"action",entityId:record.id,scope,before:{priority:record.priority},after:{priority:"urgent",reason:input.reason}});
  await emitEvent(tx,{eventType:"ActionEscalated",aggregateType:"action",aggregateId:record.id,actorPersonId:actor.actorPersonId,...scope,payload:{priority:"urgent"}});
  if(record.ownerPersonId)await notify(tx,{recipientPersonId:record.ownerPersonId,type:"operations_action_escalated",title:"Operational task escalated",body:"Review the urgent task in your operations workspace.",resourceType:"action",resourceId:record.id});
  return {changed:true,replayed:false};
 });
}
/** Stable UUID keyset; scope and authorization are reevaluated on each page. */
export async function listOperationalTasksService(request:Request,raw:unknown){
 const data=parseCommandInput(manualTaskPageSchema,raw);
 const {actor,org}=await operator(request);
 const scope=await resolveOperationsSelection(actor,{siteId:data.siteId,programId:data.programId});
 const rows=await db.select({id:actions.id,title:actions.title,status:actions.status,priority:actions.priority,siteId:actions.siteId,programId:actions.programId,ownerPersonId:actions.ownerPersonId,dueAt:actions.dueAt,updatedAt:actions.updatedAt})
  .from(actions).where(and(eq(actions.organizationId,org),eq(actions.type,manualTaskType),inArray(actions.siteId,scope.siteIds),inArray(actions.status,["open","in_progress","waiting"]),
   scope.programIds.length?or(isNull(actions.programId),inArray(actions.programId,scope.programIds)):isNull(actions.programId),
   data.programId?eq(actions.programId,data.programId):undefined,data.afterId?gt(actions.id,data.afterId):undefined)).orderBy(asc(actions.id)).limit(51);
 const page=rows.slice(0,50);
 return {items:page.map(row=>({...row,dueAt:row.dueAt?.toISOString()??null,updatedAt:row.updatedAt.toISOString()})),nextAfterId:rows.length>50?page[49]!.id:null};
}
