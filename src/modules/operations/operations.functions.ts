import {createServerFn} from "@tanstack/react-start";
import {assertSyntheticMutation} from "@/modules/student-experience/demo-write-gate";
import {timelineFromReferralHistory} from "@/domain/workflow-timeline";
import {dedupeQueue,notificationSummary,type QueueItem} from "@/domain/notification-triage";
/** Deliberately restricted to known synthetic GF41 actions; no arbitrary people or organization browsing. */
export const getOperationsPreview=createServerFn({method:"GET"}).handler(async()=>{
 if(!process.env.DATABASE_URL)return {items:[] as QueueItem[],summary:{total:0,urgent:0,needsResponse:0},timeline:[] as ReturnType<typeof timelineFromReferralHistory>};
 const [{db},s,{and,eq,desc}]=await Promise.all([import("@/db/client"),import("@/db/schema"),import("drizzle-orm")]);
 const rows=await db.select({id:s.actions.id,title:s.actions.title,type:s.actions.type,status:s.actions.status,description:s.actions.description,priority:s.actions.priority,metadata:s.actions.metadata,createdAt:s.actions.createdAt}).from(s.actions).where(eq(s.actions.siteId,"f1000000-0000-4000-8000-000000000003")).orderBy(desc(s.actions.createdAt)).limit(50);
 const items=dedupeQueue(rows.filter(r=>r.metadata.synthetic===true&&r.status!=="resolved"&&r.status!=="cancelled"&&!(r.type==="support_referral"&&r.metadata.stage==="closed")).map(r=>({id:r.id,kind:"action" as const,title:r.title,detail:r.description??("Synthetic "+r.type.replaceAll("_"," ")+" requiring review"),priority:r.priority==="urgent"?"critical" as const:r.priority==="high"?"high" as const:"normal" as const,createdAt:r.createdAt.toISOString(),href:r.type==="support_referral"?"/student/support?referral="+encodeURIComponent(r.id):"/operations",needsResponse:r.type==="support_referral"?r.metadata.stage==="submitted":r.status==="open"})));
 const timeline=rows.filter(r=>r.metadata.synthetic===true&&r.metadata.fixture==="gf41").flatMap(r=>timelineFromReferralHistory(r.id,r.metadata.history)).slice(0,10);
 return {items,summary:notificationSummary(items),timeline};
});

/** Manage ordinary synthetic actions; domain-specific referrals retain their own state machine. */
export const updateSyntheticOperationsAction=createServerFn({method:"POST"})
 .validator((data:{id:string;status:"open"|"in_progress"|"waiting"|"resolved"})=>data)
 .handler(async({data})=>{
  assertSyntheticMutation("registrar");
  if(!["open","in_progress","waiting","resolved"].includes(data.status))throw new Error("Invalid action status");
  const [{db},s,{and,eq}]=await Promise.all([import("@/db/client"),import("@/db/schema"),import("drizzle-orm")]);
  return db.transaction(async tx=>{
   const [record]=await tx.select({id:s.actions.id,status:s.actions.status,metadata:s.actions.metadata,type:s.actions.type})
    .from(s.actions).where(and(eq(s.actions.id,data.id),eq(s.actions.siteId,"f1000000-0000-4000-8000-000000000003"))).for("update").limit(1);
   if(!record||record.metadata.synthetic!==true)throw new Error("Synthetic action not found");
   if(record.type==="support_referral")throw new Error("Use the student support workflow for referrals");
   if(record.status===data.status)return {saved:true};
   await tx.update(s.actions).set({status:data.status,resolvedAt:data.status==="resolved"?new Date():null,updatedAt:new Date()}).where(eq(s.actions.id,data.id));
   await tx.insert(s.auditEvents).values({action:"synthetic.action.status",resourceType:"action",resourceId:data.id,before:{status:record.status},after:{status:data.status},context:{synthetic:true}});
   return {saved:true};
  });
 });

/** Assign or escalate ordinary synthetic actions; support referrals use their own workflow. */
export const triageSyntheticOperationsAction=createServerFn({method:"POST"})
 .validator((data:{id:string;owner:"registrar"|"teacher";priority:"normal"|"high"|"urgent"})=>data)
 .handler(async({data})=>{
  assertSyntheticMutation("registrar");
  if(!["registrar","teacher"].includes(data.owner)||!["normal","high","urgent"].includes(data.priority))throw new Error("Invalid assignment or priority");
  const ownerPersonId=data.owner==="teacher"?"f1000000-0000-4000-8000-000000000006":"f3000000-0000-4000-8000-000000000007";
  const [{db},s,{and,eq}]=await Promise.all([import("@/db/client"),import("@/db/schema"),import("drizzle-orm")]);
  return db.transaction(async tx=>{
   const [record]=await tx.select({id:s.actions.id,type:s.actions.type,status:s.actions.status,metadata:s.actions.metadata,ownerPersonId:s.actions.ownerPersonId,priority:s.actions.priority})
    .from(s.actions).where(and(eq(s.actions.id,data.id),eq(s.actions.siteId,"f1000000-0000-4000-8000-000000000003"))).for("update").limit(1);
   if(!record||record.metadata.synthetic!==true||record.type==="support_referral"||["resolved","cancelled"].includes(record.status))throw new Error("Open synthetic action not found");
   if(record.ownerPersonId===ownerPersonId&&record.priority===data.priority)return {saved:true};
   await tx.update(s.actions).set({ownerPersonId,priority:data.priority,updatedAt:new Date()}).where(eq(s.actions.id,record.id));
   await tx.insert(s.auditEvents).values({action:"synthetic.action.triage",resourceType:"action",resourceId:record.id,before:{ownerPersonId:record.ownerPersonId,priority:record.priority},after:{ownerPersonId,priority:data.priority},context:{synthetic:true}});
   return {saved:true};
  });
 });
