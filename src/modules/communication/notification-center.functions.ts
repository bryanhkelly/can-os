import { createServerFn } from "@tanstack/react-start";
import { eq, desc, and, inArray, isNull, or } from "drizzle-orm";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { assertCapability } from "@/domain/command-context";
async function notificationActor(){
 const context=await getCommandContext(getRequest());
 if(!context.actorPersonId)throw new Error("Authenticated person required");
 return context;
}
export const getNotifications=createServerFn({method:"GET"}).handler(async()=>{
 const context=await notificationActor();
 setResponseHeader("Cache-Control","no-store");
 const personId=context.actorPersonId!;
 const [{db},s]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
 const rows=await db.select({id:s.notifications.id,type:s.notifications.type,title:s.notifications.title,body:s.notifications.body,
  status:s.notifications.status,resourceType:s.notifications.resourceType,resourceId:s.notifications.resourceId,createdAt:s.notifications.createdAt})
 .from(s.notifications).where(eq(s.notifications.recipientPersonId,personId)).orderBy(desc(s.notifications.createdAt)).limit(50);
 const sessionIds=rows.filter(n=>n.resourceType==="study_group_session"&&n.resourceId).map(n=>n.resourceId as string);
 const sessions=sessionIds.length&&context.role==="student"?await db.selectDistinct({
  id:s.studyGroupSessions.id,groupId:s.studyGroupSessions.groupId
 }).from(s.studyGroupSessions)
 .innerJoin(s.studyGroups,eq(s.studyGroups.id,s.studyGroupSessions.groupId))
 .innerJoin(s.studyGroupMemberships,and(
  eq(s.studyGroupMemberships.groupId,s.studyGroups.id),
  eq(s.studyGroupMemberships.personId,personId),
  eq(s.studyGroupMemberships.status,"approved")))
 .innerJoin(s.studentProfiles,eq(s.studentProfiles.personId,personId))
 .innerJoin(s.enrollments,and(eq(s.enrollments.studentProfileId,s.studentProfiles.id),
  eq(s.enrollments.status,"active")))
 .innerJoin(s.programs,eq(s.programs.id,s.enrollments.programId))
 .where(and(inArray(s.studyGroupSessions.id,sessionIds),
  eq(s.studyGroups.status,"active"),
  eq(s.programs.siteId,s.studyGroups.siteId),
  inArray(s.studyGroups.siteId,context.scope.siteIds??[]),
  inArray(s.enrollments.programId,context.scope.programIds??[]),
  or(isNull(s.studyGroups.programId),
    eq(s.studyGroups.programId,s.enrollments.programId)))):[];
 const groupBySession=new Map(sessions.map(s=>[s.id,s.groupId]));
 const groupIds=rows.filter(n=>n.resourceType==="study_group"&&n.resourceId).map(n=>n.resourceId as string);
 const groupRows=groupIds.length?await db.select({id:s.studyGroups.id,facilitator:s.studyGroups.facilitatorPersonId})
  .from(s.studyGroups).where(and(inArray(s.studyGroups.id,groupIds),
   inArray(s.studyGroups.siteId,context.scope.siteIds??[]),
   or(isNull(s.studyGroups.programId),inArray(s.studyGroups.programId,context.scope.programIds??[])))):[];
 const memberRows=groupIds.length?await db.select({groupId:s.studyGroupMemberships.groupId})
  .from(s.studyGroupMemberships).where(and(inArray(s.studyGroupMemberships.groupId,groupIds),eq(s.studyGroupMemberships.personId,personId),eq(s.studyGroupMemberships.status,"approved"))):[];
 const permittedGroups=new Set(groupRows.filter(g=>g.facilitator===personId).map(g=>g.id));
 for(const row of memberRows)if(groupRows.some(group=>group.id===row.groupId))permittedGroups.add(row.groupId);
 const admissionOfferIds=rows.filter(n=>n.resourceType==="admission_offer"&&n.resourceId).map(n=>n.resourceId as string);
 const admissionOffers=admissionOfferIds.length?await db.select({id:s.admissionOffers.id,applicationId:s.admissionOffers.applicationId,issuedByPersonId:s.admissionOffers.issuedByPersonId,programId:s.admissionOffers.programId,studentProfileId:s.applications.studentProfileId})
  .from(s.admissionOffers).innerJoin(s.applications,eq(s.applications.id,s.admissionOffers.applicationId))
  .where(inArray(s.admissionOffers.id,admissionOfferIds)):[];
 const relatedStudentPeople=admissionOffers.length?await db.select({id:s.studentProfiles.id,personId:s.studentProfiles.personId})
  .from(s.studentProfiles).where(inArray(s.studentProfiles.id,admissionOffers.map(o=>o.studentProfileId))):[];
 const guardianLinks=relatedStudentPeople.length?await db.select({guardianPersonId:s.guardianRelationships.guardianPersonId,studentPersonId:s.guardianRelationships.studentPersonId})
  .from(s.guardianRelationships).where(and(eq(s.guardianRelationships.guardianPersonId,personId),eq(s.guardianRelationships.canManageEnrollment,true))):[];
 const manageableStudents=new Set(guardianLinks.map(g=>g.studentPersonId));
 const personByProfile=new Map(relatedStudentPeople.map(p=>[p.id,p.personId]));
 const permittedGuardianOffers=new Set(admissionOffers.filter(o=>manageableStudents.has(personByProfile.get(o.studentProfileId)??"")&&(context.scope.programIds??[]).includes(o.programId)).map(o=>o.id));
 const permittedRegistrarOffers=new Set(admissionOffers.filter(o=>o.issuedByPersonId===personId&&(context.scope.programIds??[]).includes(o.programId)).map(o=>o.id));
 const submissionIds=rows.filter(n=>n.resourceType==="submission"&&n.resourceId).map(n=>n.resourceId as string);
 const studentProfiles=await db.select({id:s.studentProfiles.id}).from(s.studentProfiles).where(eq(s.studentProfiles.personId,personId));
 const studentIds=studentProfiles.map(p=>p.id);
 const submissions=submissionIds.length&&studentIds.length?
  await db.select({id:s.submissions.id,assessmentId:s.submissions.assessmentId,studentProfileId:s.submissions.studentProfileId})
   .from(s.submissions)
   .innerJoin(s.assessments,eq(s.assessments.id,s.submissions.assessmentId))
   .innerJoin(s.sections,eq(s.sections.id,s.assessments.sectionId))
   .innerJoin(s.enrollments,and(eq(s.enrollments.sectionId,s.sections.id),
    eq(s.enrollments.studentProfileId,s.submissions.studentProfileId),
    eq(s.enrollments.status,"active")))
   .where(and(inArray(s.submissions.id,submissionIds),
    inArray(s.submissions.studentProfileId,studentIds),
    inArray(s.sections.siteId,context.scope.siteIds??[]),
    inArray(s.sections.programId,context.scope.programIds??[]))):[];
 const referralRows=studentIds.length?await db.select({id:s.actions.id,metadata:s.actions.metadata})
  .from(s.actions).where(and(eq(s.actions.type,"support_referral"),eq(s.actions.subjectType,"student_profile"),inArray(s.actions.subjectId,studentIds),inArray(s.actions.siteId,context.scope.siteIds??[]),inArray(s.actions.programId,context.scope.programIds??[]))):[];
 const bySubmission=new Map(submissions.map(x=>[x.id,x.assessmentId]));
 const referralIds=new Set(referralRows.map(r=>r.id));
 const missingIds=rows.filter(n=>n.type==="missing_work_follow_up"&&n.resourceType==="action"&&n.resourceId).map(n=>n.resourceId as string);
 const followUps=missingIds.length&&studentIds.length?await db.select({id:s.actions.id,metadata:s.actions.metadata}).from(s.actions).where(and(inArray(s.actions.id,missingIds),eq(s.actions.type,"missing_work_follow_up"),inArray(s.actions.subjectId,studentIds),inArray(s.actions.siteId,context.scope.siteIds??[]),inArray(s.actions.programId,context.scope.programIds??[]))):[];
 const consentActionIds=rows.filter(n=>n.resourceType==="action"&&
  n.resourceId&&n.type==="study_group_consent_requested").map(n=>n.resourceId as string);
 const consentActions=consentActionIds.length?await db.select({
  id:s.actions.id,programId:s.actions.programId
 }).from(s.actions).where(and(inArray(s.actions.id,consentActionIds),
  eq(s.actions.type,"study_group_consent"),eq(s.actions.status,"open"),
  eq(s.actions.ownerPersonId,personId),
  inArray(s.actions.siteId,context.scope.siteIds??[]))):[];
 const permittedConsents=new Set(consentActions.filter(action=>
  !action.programId||(context.scope.programIds??[]).includes(action.programId)
 ).map(action=>action.id));
 const assignedActionIds=rows.filter(n=>n.resourceType==="action"&&n.resourceId&&n.type==="operations_action_assigned").map(n=>n.resourceId as string);
 const ownedActions=assignedActionIds.length?await db.select({id:s.actions.id,siteId:s.actions.siteId,programId:s.actions.programId})
   .from(s.actions).where(and(inArray(s.actions.id,assignedActionIds),eq(s.actions.ownerPersonId,personId),
     inArray(s.actions.siteId,context.scope.siteIds??[]))):[];
 const permittedAssignedActions=new Set(ownedActions.filter(action=>
   !action.programId||(context.scope.programIds??[]).includes(action.programId)).map(action=>action.id));
 const missingAssessmentByAction=new Map(followUps.filter(a=>typeof a.metadata.assessmentId==="string").map(a=>[a.id,a.metadata.assessmentId as string]));

 return rows.map(n=>({id:n.id,title:n.title,body:n.body??"",status:n.status,
  date:n.createdAt.toISOString(),href:n.resourceType==="submission"&&n.resourceId&&bySubmission.has(n.resourceId)?
   (context.role==="student"?`/student/assignments?assessment=${encodeURIComponent(bySubmission.get(n.resourceId)!)}`:null):
   n.resourceType==="action"&&n.resourceId&&referralIds.has(n.resourceId)?
   (context.role==="student"?`/student/support?referral=${encodeURIComponent(n.resourceId)}`:null):
   n.type==="missing_work_follow_up"&&n.resourceType==="action"&&n.resourceId&&missingAssessmentByAction.has(n.resourceId)?(context.role==="student"?`/student/assignments?assessment=${encodeURIComponent(missingAssessmentByAction.get(n.resourceId)!)}`:null):
   n.resourceType==="admission_offer"&&n.resourceId&&permittedGuardianOffers.has(n.resourceId)&&context.role==="guardian"?"/guardian/admission-offers":
   n.resourceType==="admission_offer"&&n.resourceId&&permittedRegistrarOffers.has(n.resourceId)&&context.role==="registrar"?"/admissions/":
   n.type==="study_group_consent_requested"&&n.resourceType==="action"&&n.resourceId&&permittedConsents.has(n.resourceId)&&context.role==="guardian"?"/guardian/study-group-consent":
   n.type==="operations_action_assigned"&&n.resourceType==="action"&&n.resourceId&&permittedAssignedActions.has(n.resourceId)&&context.role==="registrar"?"/operations":
   n.resourceType==="study_group"&&n.resourceId&&permittedGroups.has(n.resourceId)?(context.role==="teacher"?"/teacher/study-groups":context.role==="student"?`/student/study-groups?group=${encodeURIComponent(n.resourceId)}`:null):
   context.role==="student"&&n.resourceType==="study_group_session"&&n.resourceId&&groupBySession.has(n.resourceId)?`/student/study-groups?group=${encodeURIComponent(groupBySession.get(n.resourceId)!)}&session=${encodeURIComponent(n.resourceId)}`:null}));
});
export const readNotification=createServerFn({method:"POST"})
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

/** Idempotently acknowledge unread notifications for the authenticated person. */
export const readAllNotifications=createServerFn({method:"POST"}).handler(async()=>{
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

/** Status updates remain scoped to the authenticated notification recipient. */
export const setNotificationStatus=createServerFn({method:"POST"})
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
  if(!changed.length)throw new Error("Notification not found");
  return {saved:true};
 });
