import { createServerFn } from "@tanstack/react-start";
import { eq, desc, and, inArray } from "drizzle-orm";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { assertCapability } from "@/domain/command-context";
async function notificationActor(){
 const context=await getCommandContext(getRequest());
 if(!context.actorPersonId)throw new Error("Authenticated person required");
 return context;
}
export const getSyntheticNotifications=createServerFn({method:"GET"}).handler(async()=>{
 const context=await notificationActor();
 setResponseHeader("Cache-Control","no-store");
 const personId=context.actorPersonId!;
 const [{db},s]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
 const rows=await db.select({id:s.notifications.id,type:s.notifications.type,title:s.notifications.title,body:s.notifications.body,
  status:s.notifications.status,resourceType:s.notifications.resourceType,resourceId:s.notifications.resourceId,createdAt:s.notifications.createdAt})
 .from(s.notifications).where(eq(s.notifications.recipientPersonId,personId)).orderBy(desc(s.notifications.createdAt)).limit(50);
 const sessionIds=rows.filter(n=>n.resourceType==="study_group_session"&&n.resourceId).map(n=>n.resourceId as string);
 const sessions=sessionIds.length?await db.select({id:s.studyGroupSessions.id,groupId:s.studyGroupSessions.groupId}).from(s.studyGroupSessions).innerJoin(s.studyGroupMemberships,and(eq(s.studyGroupMemberships.groupId,s.studyGroupSessions.groupId),eq(s.studyGroupMemberships.personId,personId),eq(s.studyGroupMemberships.status,"approved"))).where(inArray(s.studyGroupSessions.id,sessionIds)):[];
 const groupBySession=new Map(sessions.map(s=>[s.id,s.groupId]));
 const groupIds=rows.filter(n=>n.resourceType==="study_group"&&n.resourceId).map(n=>n.resourceId as string);
 const groupRows=groupIds.length?await db.select({id:s.studyGroups.id,facilitator:s.studyGroups.facilitatorPersonId})
  .from(s.studyGroups).where(inArray(s.studyGroups.id,groupIds)):[];
 const memberRows=groupIds.length?await db.select({groupId:s.studyGroupMemberships.groupId})
  .from(s.studyGroupMemberships).where(and(inArray(s.studyGroupMemberships.groupId,groupIds),eq(s.studyGroupMemberships.personId,personId))):[];
 const permittedGroups=new Set(groupRows.filter(g=>g.facilitator===personId).map(g=>g.id));
 for(const row of memberRows)permittedGroups.add(row.groupId);
 const submissionIds=rows.filter(n=>n.resourceType==="submission"&&n.resourceId).map(n=>n.resourceId as string);
 const studentProfiles=await db.select({id:s.studentProfiles.id}).from(s.studentProfiles).where(eq(s.studentProfiles.personId,personId));
 const studentIds=studentProfiles.map(p=>p.id);
 const submissions=submissionIds.length&&studentIds.length?
  await db.select({id:s.submissions.id,assessmentId:s.submissions.assessmentId,studentProfileId:s.submissions.studentProfileId})
   .from(s.submissions).where(and(inArray(s.submissions.id,submissionIds),inArray(s.submissions.studentProfileId,studentIds))):[];
 const referralRows=studentIds.length?await db.select({id:s.actions.id,metadata:s.actions.metadata})
  .from(s.actions).where(and(eq(s.actions.type,"support_referral"),inArray(s.actions.subjectId,studentIds))):[];
 const bySubmission=new Map(submissions.map(x=>[x.id,x.assessmentId]));
 const referralIds=new Set(referralRows.filter(r=>r.metadata.synthetic===true&&r.metadata.fixture==="gf41").map(r=>r.id));
 const missingIds=rows.filter(n=>n.type==="missing_work_follow_up"&&n.resourceType==="action"&&n.resourceId).map(n=>n.resourceId as string);
 const followUps=missingIds.length&&studentIds.length?await db.select({id:s.actions.id,metadata:s.actions.metadata}).from(s.actions).where(and(inArray(s.actions.id,missingIds),eq(s.actions.type,"missing_work_follow_up"),inArray(s.actions.subjectId,studentIds))):[];
 const missingAssessmentByAction=new Map(followUps.filter(a=>a.metadata.synthetic===true&&typeof a.metadata.assessmentId==="string").map(a=>[a.id,a.metadata.assessmentId as string]));

 return rows.map(n=>({id:n.id,title:n.title,body:n.body??"",status:n.status,
  date:n.createdAt.toISOString(),href:n.resourceType==="submission"&&n.resourceId&&bySubmission.has(n.resourceId)?
   `/student/assignments?assessment=${encodeURIComponent(bySubmission.get(n.resourceId)!)}`:
   n.resourceType==="action"&&n.resourceId&&referralIds.has(n.resourceId)?
   `/student/support?referral=${encodeURIComponent(n.resourceId)}`:
   n.type==="missing_work_follow_up"&&n.resourceType==="action"&&n.resourceId&&missingAssessmentByAction.has(n.resourceId)?`/student/assignments?assessment=${encodeURIComponent(missingAssessmentByAction.get(n.resourceId)!)}`:
   n.resourceType==="study_group"&&n.resourceId&&permittedGroups.has(n.resourceId)?(n.type==="study_group_membership_request"?"/teacher/study-groups":`/student/study-groups?group=${encodeURIComponent(n.resourceId)}`):
   n.resourceType==="study_group_session"&&n.resourceId&&groupBySession.has(n.resourceId)?`/student/study-groups?group=${encodeURIComponent(groupBySession.get(n.resourceId)!)}&session=${encodeURIComponent(n.resourceId)}`:null}));
});
export const readSyntheticNotification=createServerFn({method:"POST"})
 .validator((data:{id:string})=>data).handler(async({data})=>{
  const context=await notificationActor();
  assertCapability(context,"notifications:manage");
  const personId=context.actorPersonId!;
  const [{db},s]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
  const changed=await db.update(s.notifications).set({status:"read",readAt:new Date(),updatedAt:new Date()})
   .where(and(eq(s.notifications.id,data.id),eq(s.notifications.recipientPersonId,personId),eq(s.notifications.status,"unread")))
   .returning({id:s.notifications.id});
  if(changed.length)return {saved:true};
  const [existing]=await db.select({status:s.notifications.status}).from(s.notifications)
   .where(and(eq(s.notifications.id,data.id),eq(s.notifications.recipientPersonId,personId))).limit(1);
  if(!existing)throw new Error("Notification not found");
  if(existing.status==="dismissed")throw new Error("Dismissed notifications cannot be marked read");
  return {saved:true};
 });

/** Idempotently acknowledge all unread notifications for the fixed synthetic student. */
export const readAllSyntheticNotifications=createServerFn({method:"POST"}).handler(async()=>{
 const context=await notificationActor();
 assertCapability(context,"notifications:manage");
 const personId=context.actorPersonId!;
 const [{db},s]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
 const changed=await db.update(s.notifications)
  .set({status:"read",readAt:new Date(),updatedAt:new Date()})
  .where(and(eq(s.notifications.recipientPersonId,personId),eq(s.notifications.status,"unread")))
  .returning({id:s.notifications.id});
 return {saved:true,count:changed.length};
});

/** Acknowledgements stay scoped to the fixed synthetic recipient during the dev build. */
export const setSyntheticNotificationStatus=createServerFn({method:"POST"})
 .validator((data:{id:string;status:"unread"|"read"|"dismissed"})=>data)
 .handler(async({data})=>{
  const context=await notificationActor();
  assertCapability(context,"notifications:manage");
  const personId=context.actorPersonId!;
  if(!["unread","read","dismissed"].includes(data.status))throw new Error("Invalid notification status");
  const [{db},s]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
  const changed=await db.update(s.notifications).set({
   status:data.status,readAt:data.status==="unread"?null:new Date(),updatedAt:new Date()
  }).where(and(eq(s.notifications.id,data.id),eq(s.notifications.recipientPersonId,personId)))
  .returning({id:s.notifications.id});
  if(!changed.length)throw new Error("Synthetic notification not found");
  return {saved:true};
 });
