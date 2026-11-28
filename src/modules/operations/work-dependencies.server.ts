import {EventTypes} from "@/domain/event-types";
import {and,asc,eq,inArray,sql} from "drizzle-orm";
import {alias} from "drizzle-orm/pg-core";
import {db} from "@/db/client";
import {actions,actionDependencies} from "@/db/schema";
import {AuthorizationError,assertCapability} from "@/domain/command-context";
import {DomainError} from "@/domain/errors";
import {parseCommandInput} from "@/domain/command-input";
import {hasRegistrarAuthority} from "@/domain/school-roles";
import {getIdentityContext} from "@/modules/identity/command-context.server";
import {assertCurrentCANGrantForMutation} from "@/modules/identity/current-can-grant-transaction.server";
import {emitEvent,writeAudit} from "@/platform/mutation";
import {assertManualTaskResource} from "./manual-work.server";
import {manualTaskType} from "./manual-work-policy.server";
import {dependencyReadSchema,dependencyChangeSchema} from "./manual-work.inputs";
type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];
type Task=typeof actions.$inferSelect;
const blocker=alias(actions,"dependency_blocker");
const active=(status:string)=>["open","in_progress","waiting"].includes(status);
async function operator(request:Request){
 const actor=await getIdentityContext(request);
 if(!actor.actorPersonId||!hasRegistrarAuthority(actor.role)||actor.scope.organizationIds?.length!==1||!actor.scope.siteIds?.length)
  throw new AuthorizationError("authorized work operator");
 assertCapability(actor,"action.resolve");
 return {actor,org:actor.scope.organizationIds[0]!};
}
function sameScope(task:Task,other:{type:string;organizationId:string|null;siteId:string|null;programId:string|null}){
 return other.type===manualTaskType&&other.organizationId===task.organizationId&&other.siteId===task.siteId&&other.programId===task.programId;
}
async function readDependencies(tx:Tx,task:Task){
 const rows=await tx.select({id:blocker.id,title:blocker.title,status:blocker.status,type:blocker.type,organizationId:blocker.organizationId,siteId:blocker.siteId,programId:blocker.programId})
  .from(actionDependencies).innerJoin(blocker,eq(blocker.id,actionDependencies.blockedByActionId))
  .where(eq(actionDependencies.actionId,task.id)).orderBy(asc(blocker.id)).limit(101);
 if(rows.length>100||rows.some(row=>!sameScope(task,row)))throw new DomainError("CONFLICT","Invalid task dependency graph");
 return rows.map(({id,title,status})=>({id,title,status,satisfied:status==="resolved"}));
}
/** Caller holds the dependent Action row lock. Every edge mutation locks
 * that same row before writing; therefore resolution cannot race a new edge.
 * A cancelled prerequisite never counts as completed. */
export async function assertManualPrerequisitesSatisfied(tx:Tx,task:Task){
 if(task.type!==manualTaskType)return;
 if((await readDependencies(tx,task)).some(row=>!row.satisfied))throw new DomainError("CONFLICT","Complete or remove all outstanding prerequisites first");
}
export async function getOperationalTaskDependenciesService(request:Request,raw:unknown){
 const {id}=parseCommandInput(dependencyReadSchema,raw);
 const {actor,org}=await operator(request);
 return db.transaction(async tx=>{
  const [task]=await tx.select().from(actions).where(and(eq(actions.id,id),eq(actions.organizationId,org),eq(actions.type,manualTaskType),inArray(actions.siteId,actor.scope.siteIds!))).for("share").limit(1);
  if(!task||!task.siteId)throw new AuthorizationError("manual task scope");
  await assertManualTaskResource(tx,actor,org,task.siteId,task.programId);
  const prerequisites=await readDependencies(tx,task);
  return {actionId:task.id,updatedAt:task.updatedAt.toISOString(),blocked:prerequisites.some(row=>!row.satisfied),prerequisites};
 });
}
export async function changeOperationalTaskDependencyService(request:Request,raw:unknown){
 const input=parseCommandInput(dependencyChangeSchema,raw);
 const {actor,org}=await operator(request);
 if(input.id===input.blockedByActionId)throw new DomainError("CONFLICT","Task cannot depend on itself");
 return db.transaction(async tx=>{
  await assertCurrentCANGrantForMutation(tx,request,actor,{roles:["site_admin","registrar"],organizationId:org,siteId:actor.grantSiteId});
  // Serialize graph edits within the organization, then lock both endpoints
  // in stable order. Ordinary status changes lock only their own Action.
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"manual-work-graph:"+org}))`);
  const rows=await tx.select().from(actions).where(and(inArray(actions.id,[input.id,input.blockedByActionId]),eq(actions.organizationId,org),eq(actions.type,manualTaskType),inArray(actions.siteId,actor.scope.siteIds!))).orderBy(asc(actions.id)).for("update");
  const task=rows.find(row=>row.id===input.id),prerequisite=rows.find(row=>row.id===input.blockedByActionId);
  if(!task||!task.siteId||!prerequisite||!sameScope(task,prerequisite))throw new AuthorizationError("same Site and Program manual tasks");
  await assertManualTaskResource(tx,actor,org,task.siteId,task.programId);
  if(!active(task.status))throw new DomainError("CONFLICT","Closed tasks cannot change dependencies");
  const existing=await readDependencies(tx,task);
  const present=existing.some(row=>row.id===prerequisite.id);
  const revision=task.updatedAt.toISOString();
  if(present===(input.operation==="add"))return {changed:false,updatedAt:revision};
  if(revision!==new Date(input.expectedUpdatedAt).toISOString())throw new DomainError("CONFLICT","Task revision changed");
  if(input.operation==="add"){
   if(prerequisite.status==="cancelled"||existing.length>=100)throw new DomainError("CONFLICT","Invalid prerequisite or dependency limit");
   if(task.status==="in_progress"&&prerequisite.status!=="resolved")throw new DomainError("CONFLICT","Move task to waiting before adding unfinished prerequisite");
   // UNION (not UNION ALL) terminates even if preexisting graph data is corrupt.
   const cycle=await tx.execute(sql`with recursive reachable(id) as (
    select ${prerequisite.id}::uuid union
    select d.blocked_by_action_id from public.action_dependencies d join reachable r on d.action_id=r.id
   ) select 1 from reachable where id=${task.id}::uuid limit 1`);
   if(cycle.rows.length)throw new DomainError("CONFLICT","Dependency would create a cycle");
   await tx.insert(actionDependencies).values({actionId:task.id,blockedByActionId:prerequisite.id});
  }else{
   await tx.delete(actionDependencies).where(and(eq(actionDependencies.actionId,task.id),eq(actionDependencies.blockedByActionId,prerequisite.id)));
  }
  const updatedAt=new Date(Math.max(Date.now(),task.updatedAt.getTime()+1));
  await tx.update(actions).set({updatedAt}).where(eq(actions.id,task.id));
  const scope={organizationId:org,siteId:task.siteId,programId:task.programId};
  await writeAudit(tx,actor,{action:"action.dependency."+input.operation,entityType:"action",entityId:task.id,scope,after:{blockedByActionId:prerequisite.id,reason:input.reason}});
  await emitEvent(tx,{eventType:EventTypes.ActionDependencyChanged,aggregateType:"action",aggregateId:task.id,actorPersonId:actor.actorPersonId,...scope,payload:{operation:input.operation,blockedByActionId:prerequisite.id}});
  return {changed:true,updatedAt:updatedAt.toISOString()};
 });
}
