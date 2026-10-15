import { createServerFn } from "@tanstack/react-start";
import { eq, desc, and } from "drizzle-orm";
import { assertSyntheticMutation } from "./demo-write-gate";
const STUDENT_PERSON="f1000000-0000-4000-8000-000000000005";
export const getSyntheticNotifications=createServerFn({method:"GET"}).handler(async()=>{
 if(!process.env.DATABASE_URL)return [];
 const [{db},s]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
 const rows=await db.select({id:s.notifications.id,type:s.notifications.type,title:s.notifications.title,body:s.notifications.body,
  status:s.notifications.status,resourceType:s.notifications.resourceType,resourceId:s.notifications.resourceId,createdAt:s.notifications.createdAt})
 .from(s.notifications).where(eq(s.notifications.recipientPersonId,STUDENT_PERSON)).orderBy(desc(s.notifications.createdAt)).limit(50);
 const submissionIds=rows.filter(n=>n.resourceType==="submission"&&n.resourceId).map(n=>n.resourceId as string);
 const [submissions,referrals]=await Promise.all([
  submissionIds.length?db.select({id:s.submissions.id,assessmentId:s.submissions.assessmentId}).from(s.submissions):Promise.resolve([]),
  db.select({id:s.actions.id}).from(s.actions).where(eq(s.actions.type,"support_referral"))
 ]);
 const bySubmission=new Map(submissions.filter(x=>submissionIds.includes(x.id)).map(x=>[x.id,x.assessmentId]));
 const referralIds=new Set(referrals.map(r=>r.id));
 return rows.map(n=>({id:n.id,title:n.title,body:n.body??"",status:n.status,
  date:n.createdAt.toISOString(),href:n.resourceType==="submission"&&n.resourceId&&bySubmission.has(n.resourceId)?
   `/student/assignments?assessment=${encodeURIComponent(bySubmission.get(n.resourceId)!)}`:
   n.resourceType==="action"&&n.resourceId&&referralIds.has(n.resourceId)?
   `/student/support?referral=${encodeURIComponent(n.resourceId)}`:"/student/experiences"}));
});
export const readSyntheticNotification=createServerFn({method:"POST"})
 .validator((data:{id:string})=>data).handler(async({data})=>{
  assertSyntheticMutation("student");
  const [{db},s]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
  await db.update(s.notifications).set({status:"read",readAt:new Date(),updatedAt:new Date()}).where(and(eq(s.notifications.id,data.id),eq(s.notifications.recipientPersonId,STUDENT_PERSON)));
  return {saved:true};
 });
