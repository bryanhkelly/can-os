import { createServerFn } from "@tanstack/react-start";
import { eq, desc, and, inArray } from "drizzle-orm";
import { assertSyntheticMutation } from "./demo-write-gate";
const STUDENT_PERSON="f1000000-0000-4000-8000-000000000005";
export const getSyntheticNotifications=createServerFn({method:"GET"}).handler(async()=>{
 if(!process.env.DATABASE_URL)return [];
 const [{db},s]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
 const rows=await db.select({id:s.notifications.id,type:s.notifications.type,title:s.notifications.title,body:s.notifications.body,
  status:s.notifications.status,resourceType:s.notifications.resourceType,resourceId:s.notifications.resourceId,createdAt:s.notifications.createdAt})
 .from(s.notifications).where(eq(s.notifications.recipientPersonId,STUDENT_PERSON)).orderBy(desc(s.notifications.createdAt)).limit(50);
 const sessionIds=rows.filter(n=>n.resourceType==="study_group_session"&&n.resourceId).map(n=>n.resourceId as string);
 const sessions=sessionIds.length?await db.select({id:s.studyGroupSessions.id,groupId:s.studyGroupSessions.groupId}).from(s.studyGroupSessions).innerJoin(s.studyGroupMemberships,and(eq(s.studyGroupMemberships.groupId,s.studyGroupSessions.groupId),eq(s.studyGroupMemberships.personId,STUDENT_PERSON),eq(s.studyGroupMemberships.status,"approved"))).where(inArray(s.studyGroupSessions.id,sessionIds)):[];
 const groupBySession=new Map(sessions.map(s=>[s.id,s.groupId]));
 const submissionIds=rows.filter(n=>n.resourceType==="submission"&&n.resourceId).map(n=>n.resourceId as string);
 const [submissions,referrals]=await Promise.all([
  submissionIds.length?db.select({id:s.submissions.id,assessmentId:s.submissions.assessmentId,studentProfileId:s.submissions.studentProfileId}).from(s.submissions).where(inArray(s.submissions.id,submissionIds)):Promise.resolve([]),
  db.select({id:s.actions.id,metadata:s.actions.metadata}).from(s.actions).where(and(eq(s.actions.type,"support_referral"),eq(s.actions.subjectId,"f1000000-0000-4000-8000-000000000007")))
 ]);
 const bySubmission=new Map(submissions.filter(x=>submissionIds.includes(x.id)&&x.studentProfileId==="f1000000-0000-4000-8000-000000000007").map(x=>[x.id,x.assessmentId]));
 const referralIds=new Set(referrals.filter(r=>r.metadata.synthetic===true&&r.metadata.fixture==="gf41").map(r=>r.id));
 return rows.map(n=>({id:n.id,title:n.title,body:n.body??"",status:n.status,
  date:n.createdAt.toISOString(),href:n.resourceType==="submission"&&n.resourceId&&bySubmission.has(n.resourceId)?
   `/student/assignments?assessment=${encodeURIComponent(bySubmission.get(n.resourceId)!)}`:
   n.resourceType==="action"&&n.resourceId&&referralIds.has(n.resourceId)?
   `/student/support?referral=${encodeURIComponent(n.resourceId)}`:
   n.resourceType==="study_group_session"&&n.resourceId&&groupBySession.has(n.resourceId)?`/student/study-groups?group=${encodeURIComponent(groupBySession.get(n.resourceId)!)}`:null}));
});
export const readSyntheticNotification=createServerFn({method:"POST"})
 .validator((data:{id:string})=>data).handler(async({data})=>{
  assertSyntheticMutation("student");
  const [{db},s]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
  await db.update(s.notifications).set({status:"read",readAt:new Date(),updatedAt:new Date()}).where(and(eq(s.notifications.id,data.id),eq(s.notifications.recipientPersonId,STUDENT_PERSON)));
  return {saved:true};
 });

/** Idempotently acknowledge all unread notifications for the fixed synthetic student. */
export const readAllSyntheticNotifications=createServerFn({method:"POST"}).handler(async()=>{
 assertSyntheticMutation("student");
 const [{db},s]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
 const changed=await db.update(s.notifications)
  .set({status:"read",readAt:new Date(),updatedAt:new Date()})
  .where(and(eq(s.notifications.recipientPersonId,STUDENT_PERSON),eq(s.notifications.status,"unread")))
  .returning({id:s.notifications.id});
 return {saved:true,count:changed.length};
});

/** Acknowledgements stay scoped to the fixed synthetic recipient during the dev build. */
export const setSyntheticNotificationStatus=createServerFn({method:"POST"})
 .validator((data:{id:string;status:"unread"|"read"|"dismissed"})=>data)
 .handler(async({data})=>{
  assertSyntheticMutation("student");
  if(!["unread","read","dismissed"].includes(data.status))throw new Error("Invalid notification status");
  const [{db},s]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
  const changed=await db.update(s.notifications).set({
   status:data.status,readAt:data.status==="unread"?null:new Date(),updatedAt:new Date()
  }).where(and(eq(s.notifications.id,data.id),eq(s.notifications.recipientPersonId,STUDENT_PERSON)))
  .returning({id:s.notifications.id});
  if(!changed.length)throw new Error("Synthetic notification not found");
  return {saved:true};
 });
