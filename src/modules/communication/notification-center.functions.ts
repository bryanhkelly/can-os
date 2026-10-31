import { createServerFn } from "@tanstack/react-start";
import { eq, desc, and, inArray, isNull, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { assertCapability } from "@/domain/command-context";
import {z} from "zod";
import { guardianRelationshipPredicate } from "@/domain/guardian-relationship";
const pickupNotificationTypes=new Set([
 "child_release_verified","child_pickup_denied","child_uncollected_follow_up",
 "pickup_custody_hold_created","pickup_custody_hold_resolved",
]);
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
 .from(s.notifications).where(eq(s.notifications.recipientPersonId,personId)).orderBy(sql`CASE WHEN ${s.notifications.type} = 'school_family_alert' AND ${s.notifications.status} = 'unread' THEN 0 ELSE 1 END`,desc(s.notifications.createdAt)).limit(50);
 const tripNoticeTypes=new Set([
  "field_trip_permission_requested","field_trip_permission_signed","field_trip_permission_declined",
 ]);
 const tripNoticeIds=rows.filter(n=>tripNoticeTypes.has(n.type)&&
  n.resourceType==="field_trip"&&n.resourceId).map(n=>n.resourceId!);
 const guardianTripRows=tripNoticeIds.length&&context.role==="guardian"?
  await db.selectDistinct({id:s.fieldTrips.id}).from(s.fieldTrips)
   .innerJoin(s.fieldTripParticipants,eq(s.fieldTripParticipants.fieldTripId,s.fieldTrips.id))
   .innerJoin(s.studentProfiles,eq(s.studentProfiles.id,s.fieldTripParticipants.studentProfileId))
   .innerJoin(s.guardianRelationships,guardianRelationshipPredicate({
     guardianPersonId:personId,studentPersonId:s.studentProfiles.personId,access:"enrollment",
   }))
   .innerJoin(s.enrollments,and(
     eq(s.enrollments.studentProfileId,s.studentProfiles.id),
     eq(s.enrollments.kind,"program"),eq(s.enrollments.status,"active"),
   ))
   .innerJoin(s.programs,and(
     eq(s.programs.id,s.enrollments.programId),
     eq(s.programs.siteId,s.fieldTrips.siteId),
   ))
   .where(and(inArray(s.fieldTrips.id,tripNoticeIds),
     inArray(s.fieldTrips.siteId,context.scope.siteIds??[]),
     inArray(s.enrollments.programId,context.scope.programIds??[]),
     or(isNull(s.fieldTrips.programId),
       eq(s.fieldTrips.programId,s.enrollments.programId)),
   )):[];
 const guardianTripIds=new Set(guardianTripRows.map(row=>row.id));
 const staffTripRows=tripNoticeIds.length&&context.role==="registrar"?
  await db.select({id:s.fieldTrips.id}).from(s.fieldTrips)
   .where(and(inArray(s.fieldTrips.id,tripNoticeIds),
     eq(s.fieldTrips.proposedByPersonId,personId),
     inArray(s.fieldTrips.siteId,context.scope.siteIds??[]),
     or(isNull(s.fieldTrips.programId),
       inArray(s.fieldTrips.programId,context.scope.programIds??[])),
   )):[];
 const staffTripIds=new Set(staffTripRows.map(row=>row.id));
 const schoolAlertIds=rows.filter(n=>n.type==="school_family_alert"&&
   n.resourceType==="action"&&n.resourceId).map(n=>n.resourceId!);
 const accessibleSchoolAlerts=schoolAlertIds.length&&context.role==="guardian"?
  await db.selectDistinct({id:s.actions.id}).from(s.actions)
   .innerJoin(s.enrollments,and(
     eq(s.enrollments.programId,s.actions.programId),
     eq(s.enrollments.kind,"program"),eq(s.enrollments.status,"active"),
   ))
   .innerJoin(s.studentProfiles,eq(s.studentProfiles.id,s.enrollments.studentProfileId))
   .innerJoin(s.guardianRelationships,guardianRelationshipPredicate({
      guardianPersonId:personId,studentPersonId:s.studentProfiles.personId,
      access:"enrollment",
   }))
   .where(and(
     inArray(s.actions.id,schoolAlertIds),eq(s.actions.type,"school_family_bulletin"),
     eq(s.actions.subjectType,"program"),
     inArray(s.actions.siteId,context.scope.siteIds??[]),
     inArray(s.actions.programId,context.scope.programIds??[]),
     inArray(s.actions.organizationId,context.scope.organizationIds??[]),
   )):[];
 const permittedSchoolAlerts=new Set(accessibleSchoolAlerts.map(row=>row.id));
 const handoffIds=rows.filter(n=>n.type==="program_opening_handoff"&&n.resourceType==="action"&&n.resourceId)
  .map(n=>n.resourceId!);
 const handoffs=handoffIds.length&&context.role==="registrar"?await db.select({id:s.actions.id,siteId:s.actions.siteId})
  .from(s.actions).where(and(inArray(s.actions.id,handoffIds),eq(s.actions.type,"program_opening_handoff"),
   eq(s.actions.ownerPersonId,personId),inArray(s.actions.siteId,context.scope.siteIds??[]),
   inArray(s.actions.programId,context.scope.programIds??[]),
   inArray(s.actions.organizationId,context.scope.organizationIds??[]))):[];
 const handoffSites=new Map(handoffs.map(handoff=>[handoff.id,handoff.siteId]));
 const safeguardingIds=rows.filter(n=>n.resourceType==="safeguarding_concern"&&n.resourceId).map(n=>n.resourceId!);
 const permittedSafeguarding=safeguardingIds.length&&["safeguarding_responder","safeguarding_lead"].includes(context.role)&&context.scope.siteIds?.length&&context.scope.organizationIds?.length?
  await db.select({incidentId:s.safeguardingCaseAssignments.incidentId}).from(s.safeguardingCaseAssignments)
   .innerJoin(s.incidents,eq(s.incidents.id,s.safeguardingCaseAssignments.incidentId))
   .where(and(inArray(s.safeguardingCaseAssignments.incidentId,safeguardingIds),
    eq(s.safeguardingCaseAssignments.personId,personId),isNull(s.safeguardingCaseAssignments.revokedAt),
    inArray(s.incidents.siteId,context.scope.siteIds),inArray(s.incidents.organizationId,context.scope.organizationIds),
    eq(s.incidents.type,"safeguarding_concern"),eq(s.incidents.classification,"safeguarding_restricted"))):[];
 const permittedSafeguardingIds=new Set(permittedSafeguarding.map(row=>row.incidentId));
 const attendanceIds=rows.filter(row=>row.resourceType==="attendance_event"&&row.resourceId).map(row=>row.resourceId!);
 const familyAttendance=attendanceIds.length&&context.role==="guardian"?await db.select({
  id:s.attendanceEvents.id,studentPersonId:s.studentProfiles.personId,
 }).from(s.attendanceEvents)
  .innerJoin(s.studentProfiles,eq(s.studentProfiles.id,s.attendanceEvents.studentProfileId))
  .innerJoin(s.guardianRelationships,guardianRelationshipPredicate({
    guardianPersonId:personId,studentPersonId:s.studentProfiles.personId,access:"academic",
  }))
  .where(and(inArray(s.attendanceEvents.id,attendanceIds),
   inArray(s.attendanceEvents.siteId,context.scope.siteIds??[]),
   inArray(s.attendanceEvents.programId,context.scope.programIds??[]))):[];
 const attendanceStudent=new Map(familyAttendance.map(row=>[row.id,row.studentPersonId]));
 // Health-office notices can outlive enrollment or guardian authorization.
 // Recheck both at read time before revealing even the notification title.
 const medicalIds=rows.filter(row=>row.resourceType==="health_office_visit"&&row.resourceId)
   .map(row=>row.resourceId!);
 const permittedMedical=medicalIds.length&&context.role==="guardian"?await db.select({id:s.healthOfficeVisits.id,studentPersonId:s.studentProfiles.personId})
  .from(s.healthOfficeVisits)
  .innerJoin(s.studentProfiles,eq(s.studentProfiles.id,s.healthOfficeVisits.studentProfileId))
  .innerJoin(s.guardianRelationships,guardianRelationshipPredicate({
    guardianPersonId:personId,studentPersonId:s.studentProfiles.personId,access:"enrollment",
  }))
  .innerJoin(s.enrollments,and(
    eq(s.enrollments.studentProfileId,s.studentProfiles.id),
    eq(s.enrollments.kind,"program"),eq(s.enrollments.status,"active"),
  ))
  .innerJoin(s.programs,and(
    eq(s.programs.id,s.enrollments.programId),
    eq(s.programs.siteId,s.healthOfficeVisits.siteId),eq(s.programs.status,"active"),
  ))
  .where(and(inArray(s.healthOfficeVisits.id,medicalIds),
    inArray(s.healthOfficeVisits.siteId,context.scope.siteIds??[]),
    inArray(s.enrollments.programId,context.scope.programIds??[])
  )):[];
 const medicalChildByVisit=new Map(permittedMedical.map(row=>[row.id,row.studentPersonId]));
 const permittedMedicalIds=new Set(medicalChildByVisit.keys());
 // Family enrollment-change decisions stay accessible only to the verified
 // requesting guardian, even if the original notification was delivered long ago.
 const familyChangeNoticeIds=rows.filter(n=>n.type==="guardian_enrollment_change_updated"&&
   n.resourceType==="action"&&n.resourceId).map(n=>n.resourceId!);
 const familyChangeActions=familyChangeNoticeIds.length&&context.role==="guardian"?
  await db.select({id:s.actions.id,studentPersonId:s.studentProfiles.personId})
   .from(s.actions)
   .innerJoin(s.studentProfiles,eq(s.studentProfiles.id,s.actions.subjectId))
   .innerJoin(s.guardianRelationships,guardianRelationshipPredicate({
    guardianPersonId:personId,studentPersonId:s.studentProfiles.personId,access:"enrollment",
   }))
   .where(and(inArray(s.actions.id,familyChangeNoticeIds),
     eq(s.actions.type,"guardian_enrollment_change_request"),
     eq(s.actions.subjectType,"student_profile"),
     // This parent owns the completed request, even after losing the
     // originating school's enrollment Program scope.
     sql`${s.actions.metadata}->>'requestedByGuardianPersonId' = ${personId}`,
   )):[];
 const familyChangeChildByAction=new Map(familyChangeActions.map(row=>[row.id,row.studentPersonId]));
 const operatorChangeNoticeIds=rows.filter(n=>n.type==="guardian_enrollment_change_requested"&&
  n.resourceType==="action"&&n.resourceId).map(n=>n.resourceId!);
 const operatorChangeActions=operatorChangeNoticeIds.length&&context.role==="registrar"?
  await db.select({id:s.actions.id}).from(s.actions).where(and(
   inArray(s.actions.id,operatorChangeNoticeIds),
   eq(s.actions.type,"guardian_enrollment_change_request"),
   inArray(s.actions.siteId,context.scope.siteIds??[]),
   inArray(s.actions.programId,context.scope.programIds??[]),
   inArray(s.actions.organizationId,context.scope.organizationIds??[]),
  )):[];
 const permittedOperatorChangeIds=new Set(operatorChangeActions.map(row=>row.id));
 const recordsHandoffNoticeIds=rows.filter(n=>
   n.type==="transfer_academic_records_handoff_requested"&&n.resourceType==="action"&&n.resourceId
 ).map(n=>n.resourceId!);
 const scopedHandoffNotices=recordsHandoffNoticeIds.length&&context.role==="registrar"?
   await db.select({id:s.actions.id}).from(s.actions).where(and(
     inArray(s.actions.id,recordsHandoffNoticeIds),
     eq(s.actions.type,"transfer_academic_records_handoff"),
     eq(s.actions.ownerPersonId,personId),
     inArray(s.actions.siteId,context.scope.siteIds??[]),
     inArray(s.actions.programId,context.scope.programIds??[]),
     inArray(s.actions.organizationId,context.scope.organizationIds??[]),
   )):[];
 const permittedRecordsHandoffs=new Set(scopedHandoffNotices.map(row=>row.id));
 const healthNoticeIds=rows.filter(n=>["guardian_health_review_requested","guardian_health_review_completed"].includes(n.type)&&n.resourceType==="action"&&n.resourceId).map(n=>n.resourceId!);
 const healthReviewActions=healthNoticeIds.length?await db.select({
  id:s.actions.id,studentPersonId:s.studentProfiles.personId,
  requestedBy:s.actions.metadata,
 }).from(s.actions)
  .innerJoin(s.studentProfiles,eq(s.studentProfiles.id,s.actions.subjectId))
  .where(and(inArray(s.actions.id,healthNoticeIds),
   eq(s.actions.type,"guardian_health_information_review"),
   eq(s.actions.subjectType,"student_profile"),
   inArray(s.actions.siteId,context.scope.siteIds??[]),
   inArray(s.actions.programId,context.scope.programIds??[]),
   inArray(s.actions.organizationId,context.scope.organizationIds??[]),
  )):[];
 const healthStaffActionIds=new Set(context.role==="registrar"?healthReviewActions.map(row=>row.id):[]);
 const requestedHealthChildren=healthReviewActions.filter(row=>
  context.role==="guardian"&&row.requestedBy.requestedByGuardianPersonId===personId);
 const verifiedHealthChildren=requestedHealthChildren.length?await db.select({studentPersonId:s.guardianRelationships.studentPersonId})
  .from(s.guardianRelationships).where(and(
   guardianRelationshipPredicate({guardianPersonId:personId,access:"enrollment"}),
   inArray(s.guardianRelationships.studentPersonId,requestedHealthChildren.map(row=>row.studentPersonId)),
  )):[];
 const permittedHealthPersons=new Set(verifiedHealthChildren.map(row=>row.studentPersonId));
 const healthGuardianChildByAction=new Map(requestedHealthChildren.filter(row=>
  permittedHealthPersons.has(row.studentPersonId)).map(row=>[row.id,row.studentPersonId]));
 const registrarCourseDecisionIds=rows.filter(n=>n.type==="course_registration_guardian_decision_for_registrar"&&
  n.resourceType==="action"&&n.resourceId).map(n=>n.resourceId!);
 const registrarCourseActions=registrarCourseDecisionIds.length&&context.role==="registrar"?
  await db.select({id:s.actions.id}).from(s.actions).where(and(
   inArray(s.actions.id,registrarCourseDecisionIds),
   eq(s.actions.type,"course_registration_request"),
   inArray(s.actions.siteId,context.scope.siteIds??[]),
   inArray(s.actions.programId,context.scope.programIds??[]),
   inArray(s.actions.organizationId,context.scope.organizationIds??[]),
  )):[];
 const permittedRegistrarCourseActions=new Set(registrarCourseActions.map(row=>row.id));
 const pickupRows=rows.filter(row=>pickupNotificationTypes.has(row.type)&&row.resourceId);
 const pickupReleaseIds=pickupRows.filter(row=>row.resourceType==="pickup_release_event").map(row=>row.resourceId!);
 const pickupHoldIds=pickupRows.filter(row=>row.resourceType==="pickup_custody_hold").map(row=>row.resourceId!);
 const pickupActionIds=pickupRows.filter(row=>row.resourceType==="action").map(row=>row.resourceId!);
 const guardianPickup=pickupRows.length&&context.role==="guardian";
 const [pickupReleases,pickupHolds,pickupActions]=await Promise.all([
  guardianPickup&&pickupReleaseIds.length?db.select({id:s.pickupReleaseEvents.id,studentPersonId:s.studentProfiles.personId})
   .from(s.pickupReleaseEvents).innerJoin(s.studentProfiles,eq(s.studentProfiles.id,s.pickupReleaseEvents.studentProfileId))
   .innerJoin(s.guardianRelationships,guardianRelationshipPredicate({guardianPersonId:personId,studentPersonId:s.studentProfiles.personId,access:"pickup"}))
   .where(and(inArray(s.pickupReleaseEvents.id,pickupReleaseIds),inArray(s.pickupReleaseEvents.siteId,context.scope.siteIds??[]),inArray(s.pickupReleaseEvents.programId,context.scope.programIds??[]))):[],
  guardianPickup&&pickupHoldIds.length?db.select({id:s.pickupCustodyHolds.id,studentPersonId:s.studentProfiles.personId})
   .from(s.pickupCustodyHolds).innerJoin(s.studentProfiles,eq(s.studentProfiles.id,s.pickupCustodyHolds.studentProfileId))
   .innerJoin(s.guardianRelationships,guardianRelationshipPredicate({guardianPersonId:personId,studentPersonId:s.studentProfiles.personId,access:"pickup"}))
   .where(and(inArray(s.pickupCustodyHolds.id,pickupHoldIds),inArray(s.pickupCustodyHolds.siteId,context.scope.siteIds??[]),inArray(s.pickupCustodyHolds.programId,context.scope.programIds??[]))):[],
  guardianPickup&&pickupActionIds.length?db.select({id:s.actions.id,studentPersonId:s.studentProfiles.personId})
   .from(s.actions).innerJoin(s.studentProfiles,eq(s.studentProfiles.id,s.actions.subjectId))
   .innerJoin(s.guardianRelationships,guardianRelationshipPredicate({guardianPersonId:personId,studentPersonId:s.studentProfiles.personId,access:"pickup"}))
   .where(and(inArray(s.actions.id,pickupActionIds),eq(s.actions.type,"onsite_pickup_uncollected_child"),inArray(s.actions.siteId,context.scope.siteIds??[]),inArray(s.actions.programId,context.scope.programIds??[]))):[],
 ]);
 const pickupStudents=new Map<string,string>();
 for(const row of pickupReleases)pickupStudents.set("pickup_release_event:"+row.id,row.studentPersonId);
 for(const row of pickupHolds)pickupStudents.set("pickup_custody_hold:"+row.id,row.studentPersonId);
 for(const row of pickupActions)pickupStudents.set("action:"+row.id,row.studentPersonId);
 // A CAN-to-CAN transcript release is an Admissions notification, never a
 // general family notification. Recheck the receiving Program, Site and
 // Organization against the active registrar grant on every notification read.
 const transcriptNoticeIds=rows.filter(n=>
   n.type==="transfer_destination_transcript_ready"&&
   n.resourceType==="application"&&n.resourceId
 ).map(n=>n.resourceId!);
 const receivingTranscriptApplications=transcriptNoticeIds.length&&context.role==="registrar"?
   await db.select({id:s.applications.id})
     .from(s.applications)
     .innerJoin(s.programs,eq(s.programs.id,s.applications.programId))
     .where(and(
       inArray(s.applications.id,transcriptNoticeIds),
       inArray(s.applications.programId,context.scope.programIds??[]),
       inArray(s.programs.siteId,context.scope.siteIds??[]),
       inArray(s.programs.organizationId,context.scope.organizationIds??[]),
     )):[];
 const permittedReceivingTranscriptIds=new Set(receivingTranscriptApplications.map(row=>row.id));
 // An enrollment-confirmed notice must lead to the newly active school,
 // not expose a child's school details to a revoked parent or former login.
 const activatedNoticeIds=rows.filter(n=>n.type==="enrollment_activated"&&
   n.resourceType==="enrollment"&&n.resourceId).map(n=>n.resourceId!);
 const activatedRows=activatedNoticeIds.length&&["guardian","student"].includes(context.role)?
   await db.select({
     id:s.enrollments.id,studentPersonId:s.studentProfiles.personId,
   }).from(s.enrollments)
     .innerJoin(s.studentProfiles,eq(s.studentProfiles.id,s.enrollments.studentProfileId))
     .innerJoin(s.programs,eq(s.programs.id,s.enrollments.programId))
     .where(and(
       inArray(s.enrollments.id,activatedNoticeIds),
       eq(s.enrollments.kind,"program"),eq(s.enrollments.status,"active"),
       inArray(s.enrollments.programId,context.scope.programIds??[]),
       inArray(s.programs.siteId,context.scope.siteIds??[]),
       inArray(s.programs.organizationId,context.scope.organizationIds??[]),
     )):[];
 const activationGuardianLinks=activatedRows.length&&context.role==="guardian"?
   await db.select({studentPersonId:s.guardianRelationships.studentPersonId})
     .from(s.guardianRelationships)
     .where(and(
       guardianRelationshipPredicate({guardianPersonId:personId,access:"enrollment"}),
       inArray(s.guardianRelationships.studentPersonId,
         [...new Set(activatedRows.map(row=>row.studentPersonId))]),
     )):[];
 const activationGuardianStudents=new Set(activationGuardianLinks.map(link=>link.studentPersonId));
 const activatedEnrollmentById=new Map(activatedRows.filter(row=>
   context.role==="student"?row.studentPersonId===personId:
   activationGuardianStudents.has(row.studentPersonId))
   .map(row=>[row.id,row.studentPersonId]));
 const enrollmentApplicationIds=rows.filter(row=>row.resourceType==="application"&&
  ["enrollment_document_requested","enrollment_document_rejected","enrollment_form_rejected","admissions_stage_changed","student_access_approved"].includes(row.type)&&row.resourceId).map(row=>row.resourceId!);
 const enrollmentApplications=enrollmentApplicationIds.length&&context.role==="guardian"?
  await db.select({id:s.applications.id,studentPersonId:s.studentProfiles.personId,stage:s.applications.stage,metadata:s.applications.metadata}).from(s.applications)
   .innerJoin(s.programs,eq(s.programs.id,s.applications.programId))
   .innerJoin(s.studentProfiles,eq(s.studentProfiles.id,s.applications.studentProfileId))
   .innerJoin(s.guardianRelationships,guardianRelationshipPredicate({
     guardianPersonId:personId,studentPersonId:s.studentProfiles.personId,access:"enrollment",
   }))
   .where(and(inArray(s.applications.id,enrollmentApplicationIds),
    inArray(s.applications.programId,context.scope.programIds??[]),
    inArray(s.programs.siteId,context.scope.siteIds??[]),
    inArray(s.programs.organizationId,context.scope.organizationIds??[]))):[];
 const enrollmentStudent=new Map(enrollmentApplications.map(row=>[row.id,row.studentPersonId]));
 // Stage decisions deep-link to the offer surface only once an offer is
 // imminent; every other application notification stays on the apply workspace.
 const enrollmentApplicationOfferReady=new Map(enrollmentApplications.map(row=>[row.id,
  row.stage==="accepted"||row.metadata?.admissionsDisposition==="offer_ready"]));
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
 const invitationIds=rows.filter(n=>n.type==="study_group_invitation"&&
  n.resourceType==="study_group"&&n.resourceId).map(n=>n.resourceId!);
 const invitedSectionEnrollment=alias(s.enrollments,"study_group_invitation_section_enrollment");
 const invitedGroups=invitationIds.length&&context.role==="student"?await db.select({id:s.studyGroups.id})
  .from(s.studyGroups)
  .innerJoin(s.studentProfiles,eq(s.studentProfiles.personId,personId))
  .innerJoin(s.enrollments,and(eq(s.enrollments.studentProfileId,s.studentProfiles.id),
   eq(s.enrollments.kind,"program"),eq(s.enrollments.status,"active"),
   eq(s.enrollments.programId,s.studyGroups.programId)))
  .innerJoin(s.programs,eq(s.programs.id,s.enrollments.programId))
  .innerJoin(invitedSectionEnrollment,and(
   eq(invitedSectionEnrollment.studentProfileId,s.studentProfiles.id),
   eq(invitedSectionEnrollment.kind,"section"),eq(invitedSectionEnrollment.status,"active"),
   eq(invitedSectionEnrollment.sectionId,s.studyGroups.sectionId)))
  .innerJoin(s.sections,and(eq(s.sections.id,s.studyGroups.sectionId),
   eq(s.sections.active,true),eq(s.sections.siteId,s.studyGroups.siteId),
   eq(s.sections.programId,s.studyGroups.programId)))
  .where(and(inArray(s.studyGroups.id,invitationIds),eq(s.studyGroups.status,"active"),
   eq(s.programs.siteId,s.studyGroups.siteId),
   inArray(s.studyGroups.siteId,context.scope.siteIds??[]),
   inArray(s.studyGroups.programId,context.scope.programIds??[]))):[];
 const memberRows=groupIds.length?await db.select({groupId:s.studyGroupMemberships.groupId})
  .from(s.studyGroupMemberships).where(and(inArray(s.studyGroupMemberships.groupId,groupIds),eq(s.studyGroupMemberships.personId,personId),eq(s.studyGroupMemberships.status,"approved"))):[];
 const permittedGroups=new Set(groupRows.filter(g=>g.facilitator===personId).map(g=>g.id));
 for(const row of memberRows)if(groupRows.some(group=>group.id===row.groupId))permittedGroups.add(row.groupId);
 for(const group of invitedGroups)permittedGroups.add(group.id);
 const admissionOfferIds=rows.filter(n=>n.resourceType==="admission_offer"&&n.resourceId).map(n=>n.resourceId as string);
 const admissionOffers=admissionOfferIds.length?await db.select({id:s.admissionOffers.id,applicationId:s.admissionOffers.applicationId,issuedByPersonId:s.admissionOffers.issuedByPersonId,programId:s.admissionOffers.programId,studentProfileId:s.applications.studentProfileId})
  .from(s.admissionOffers).innerJoin(s.applications,eq(s.applications.id,s.admissionOffers.applicationId))
  .where(inArray(s.admissionOffers.id,admissionOfferIds)):[];
 const relatedStudentPeople=admissionOffers.length?await db.select({id:s.studentProfiles.id,personId:s.studentProfiles.personId})
  .from(s.studentProfiles).where(inArray(s.studentProfiles.id,admissionOffers.map(o=>o.studentProfileId))):[];
 const guardianLinks=relatedStudentPeople.length?await db.select({guardianPersonId:s.guardianRelationships.guardianPersonId,studentPersonId:s.guardianRelationships.studentPersonId})
  .from(s.guardianRelationships).where(guardianRelationshipPredicate({
    guardianPersonId:personId,access:"enrollment",
  })):[];
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
 const relatedGuardianSubmissions=submissionIds.length&&context.role==="guardian"?
  await db.select({
    id:s.submissions.id, assessmentId:s.assessments.id,
    sectionId:s.sections.id, studentPersonId:s.studentProfiles.personId,
  }).from(s.submissions)
   .innerJoin(s.assessments,eq(s.assessments.id,s.submissions.assessmentId))
   .innerJoin(s.sections,eq(s.sections.id,s.assessments.sectionId))
   .innerJoin(s.studentProfiles,eq(s.studentProfiles.id,s.submissions.studentProfileId))
   .innerJoin(s.guardianRelationships,guardianRelationshipPredicate({
     guardianPersonId:personId,studentPersonId:s.studentProfiles.personId,access:"academic",
   }))
   .innerJoin(s.enrollments,and(
     eq(s.enrollments.studentProfileId,s.studentProfiles.id),
     eq(s.enrollments.sectionId,s.sections.id),
     eq(s.enrollments.kind,"section"),eq(s.enrollments.status,"active")))
   .where(and(inArray(s.submissions.id,submissionIds),
     inArray(s.sections.siteId,context.scope.siteIds??[]),
     inArray(s.sections.programId,context.scope.programIds??[]))) : [];
 const guardianSubmissionById=new Map(relatedGuardianSubmissions.map(x=>[x.id,x]));
 const gradeActionIds=rows.filter(n=>n.resourceType==="action"&&
  n.resourceId&&["guardian_grade_follow_up_requested","guardian_grade_follow_up_resolved"].includes(n.type))
  .map(n=>n.resourceId as string);
 const teacherGradeSections=context.role==="teacher"&&gradeActionIds.length
  ?(await (await import("@/modules/learning/class-access.server")).accessibleClasses(
    context as import("@/modules/identity/actors.server").Actor)).map(row=>row.id):[];
 const gradeActions=gradeActionIds.length?await db.select({
   id:s.actions.id,sectionId:s.actions.sectionId,siteId:s.actions.siteId,
   programId:s.actions.programId,organizationId:s.actions.organizationId,
   subjectId:s.actions.subjectId,metadata:s.actions.metadata,
   studentPersonId:s.studentProfiles.personId,assessmentId:s.submissions.assessmentId,
    submissionId:s.submissions.id,
 }).from(s.actions).innerJoin(s.studentProfiles,eq(s.studentProfiles.id,s.actions.subjectId))
 .innerJoin(s.submissions,and(eq(sql<string>`${s.submissions.id}::text`,sql<string>`${s.actions.metadata}->>'submissionId'`),
   eq(s.submissions.studentProfileId,s.actions.subjectId),inArray(s.submissions.status,["graded","returned"])))
 .innerJoin(s.assessments,and(eq(s.assessments.id,s.submissions.assessmentId),eq(s.assessments.sectionId,s.actions.sectionId)))
 .where(and(inArray(s.actions.id,gradeActionIds),
   eq(s.actions.type,"guardian_grade_follow_up"),
   eq(s.actions.subjectType,"student_profile"),
   ...(context.role==="teacher" ? [inArray(s.actions.sectionId,teacherGradeSections)] : [
     inArray(s.actions.siteId,context.scope.siteIds??[]),
     inArray(s.actions.programId,context.scope.programIds??[]),
     inArray(s.actions.organizationId,context.scope.organizationIds??[])]))) : [];
 const gradeActionsById=new Map(gradeActions.map(a=>[a.id,a]));
 const verifiedGradeActions = new Map<string,string>();
 if(gradeActions.length){
   if(context.role==="guardian"){
     const relations=await db.select({studentPersonId:s.guardianRelationships.studentPersonId})
       .from(s.guardianRelationships).where(and(
         guardianRelationshipPredicate({guardianPersonId:personId,access:"academic"}),
         inArray(s.guardianRelationships.studentPersonId,gradeActions.map(x=>x.studentPersonId))));
     const permitted=new Set(relations.map(x=>x.studentPersonId));
     for(const action of gradeActions)if(permitted.has(action.studentPersonId)&&
       action.metadata.requestedByGuardianPersonId===personId)
       verifiedGradeActions.set(action.id,
         `/guardian/academics?student=${encodeURIComponent(action.studentPersonId)}&section=${encodeURIComponent(action.sectionId??"")}&assessment=${encodeURIComponent(action.assessmentId)}&submission=${encodeURIComponent(action.submissionId)}`);
   }else if(context.role==="registrar"){
     for(const action of gradeActions)if((context.scope.organizationIds??[]).length)
       verifiedGradeActions.set(action.id,`/operations?action=${encodeURIComponent(action.id)}`);
   }else if(context.role==="teacher"){
     for(const action of gradeActions)if(action.sectionId&&teacherGradeSections.includes(action.sectionId))
       verifiedGradeActions.set(action.id,`/teacher?gradeAction=${encodeURIComponent(action.id)}`);
   }
 }
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
 const assignedActionIds=rows.filter(n=>n.resourceType==="action"&&n.resourceId&&["operations_action_assigned","operations_action_deadline_changed"].includes(n.type)).map(n=>n.resourceId as string);
 const ownedActions=assignedActionIds.length?await db.select({id:s.actions.id,siteId:s.actions.siteId,programId:s.actions.programId})
   .from(s.actions).where(and(inArray(s.actions.id,assignedActionIds),eq(s.actions.ownerPersonId,personId),
     inArray(s.actions.siteId,context.scope.siteIds??[]))):[];
 const permittedAssignedActions=new Set(ownedActions.filter(action=>
   !action.programId||(context.scope.programIds??[]).includes(action.programId)).map(action=>action.id));
 const custodyActionIds=rows.filter(n=>n.type==="pickup_custody_hold_staff_review"&&
  n.resourceType==="action"&&n.resourceId).map(n=>n.resourceId!);
 const custodyActions=custodyActionIds.length&&context.role==="site_leader"
  ?await db.select({id:s.actions.id,programId:s.actions.programId}).from(s.actions)
    .where(and(inArray(s.actions.id,custodyActionIds),
      eq(s.actions.type,"onsite_pickup_custody_hold"),
      eq(s.actions.ownerPersonId,personId),
      inArray(s.actions.siteId,context.scope.siteIds??[]))):[];
 const permittedCustodyActions=new Set(custodyActions.filter(action=>
  !action.programId||(context.scope.programIds??[]).includes(action.programId)
 ).map(action=>action.id));
 const missingAssessmentByAction=new Map(followUps.filter(a=>typeof a.metadata.assessmentId==="string").map(a=>[a.id,a.metadata.assessmentId as string]));

 // Thread notifications deep-link only when the recipient currently holds
 // access: thread participants for messages, and the live class roster
 // (student enrollment, verified guardian relationship or section teaching
 // assignment) for class announcements, which have no participant rows.
 const threadNotificationIds=rows.filter(n=>n.resourceType==="communication_thread"&&n.resourceId).map(n=>n.resourceId!);
 const threadRows=threadNotificationIds.length?await db.select({id:s.communicationThreads.id,contextType:s.communicationThreads.contextType,contextId:s.communicationThreads.contextId,metadata:s.communicationThreads.metadata}).from(s.communicationThreads).where(inArray(s.communicationThreads.id,threadNotificationIds)):[];
 const threadById=new Map(threadRows.map(thread=>[thread.id,thread]));
 const memberThreadRows=threadRows.length?await db.select({threadId:s.communicationParticipants.threadId}).from(s.communicationParticipants)
  .where(and(inArray(s.communicationParticipants.threadId,threadRows.map(thread=>thread.id)),
   eq(s.communicationParticipants.participantType,"person"),
   eq(s.communicationParticipants.participantId,personId))):[];
 const memberThreadIds=new Set(memberThreadRows.map(row=>row.threadId));
 const announcementSectionIds=[...new Set(threadRows.filter(thread=>thread.metadata?.kind==="class_announcement"&&thread.contextType==="section"&&thread.contextId).map(thread=>thread.contextId!))];
 const accessibleAnnouncementSections=new Set<string>();
 if(announcementSectionIds.length){
  const scopedSections=await db.select({id:s.sections.id}).from(s.sections)
   .where(and(inArray(s.sections.id,announcementSectionIds),
    inArray(s.sections.siteId,context.scope.siteIds??[]),
    inArray(s.sections.programId,context.scope.programIds??[])));
  const scopedIds=scopedSections.map(section=>section.id);
  if(scopedIds.length&&context.role==="student"){
   const enrolled=await db.select({sectionId:s.enrollments.sectionId}).from(s.enrollments)
    .innerJoin(s.studentProfiles,eq(s.studentProfiles.id,s.enrollments.studentProfileId))
    .where(and(eq(s.studentProfiles.personId,personId),eq(s.enrollments.kind,"section"),
     eq(s.enrollments.status,"active"),inArray(s.enrollments.sectionId,scopedIds)));
   for(const row of enrolled)if(row.sectionId)accessibleAnnouncementSections.add(row.sectionId);
  }
  if(scopedIds.length&&context.role==="guardian"){
   const enrolled=await db.select({sectionId:s.enrollments.sectionId}).from(s.enrollments)
    .innerJoin(s.studentProfiles,eq(s.studentProfiles.id,s.enrollments.studentProfileId))
    .innerJoin(s.guardianRelationships,guardianRelationshipPredicate({
      guardianPersonId:personId,studentPersonId:s.studentProfiles.personId,access:"academic",
     }))
    .where(and(eq(s.enrollments.kind,"section"),eq(s.enrollments.status,"active"),
     inArray(s.enrollments.sectionId,scopedIds)));
   for(const row of enrolled)if(row.sectionId)accessibleAnnouncementSections.add(row.sectionId);
  }
  if(scopedIds.length&&context.role==="teacher"){
   const teaching=await db.select({sectionId:s.sectionTeachers.sectionId}).from(s.sectionTeachers)
    .where(and(eq(s.sectionTeachers.personId,personId),inArray(s.sectionTeachers.sectionId,scopedIds)));
   for(const row of teaching)accessibleAnnouncementSections.add(row.sectionId);
  }
 }
 // A notification addressed to an adult is not continuing authority to
 // reveal child-specific content after guardianship is unverified or revoked.
 // Filter the whole sensitive notification (including title/body), not only
 // its deep link. Staff and student notifications retain their own ownership
 // checks and projection paths.
 const visible=rows.filter(n=>
   n.type!=="enrollment_activated"||
   (!!n.resourceId&&activatedEnrollmentById.has(n.resourceId)))
  .filter(n=>
   n.type!=="transfer_destination_transcript_ready"||
   (!!n.resourceId&&permittedReceivingTranscriptIds.has(n.resourceId)))
  .filter(n=>n.resourceType!=="safeguarding_concern"||
   !!n.resourceId&&permittedSafeguardingIds.has(n.resourceId))
  .filter(n=>context.role!=="guardian"||!n.resourceId||
   (pickupNotificationTypes.has(n.type)?pickupStudents.has(n.resourceType+":"+n.resourceId):
    n.resourceType==="attendance_event"?attendanceStudent.has(n.resourceId):
    n.resourceType==="health_office_visit"?permittedMedicalIds.has(n.resourceId):
    n.resourceType==="field_trip"&&tripNoticeTypes.has(n.type)?guardianTripIds.has(n.resourceId):
    n.resourceType==="action"&&n.type==="school_family_alert"?permittedSchoolAlerts.has(n.resourceId):
    n.resourceType==="action"&&n.type==="guardian_health_review_completed"?healthGuardianChildByAction.has(n.resourceId):
    n.resourceType==="action"&&n.type==="guardian_enrollment_change_updated"?familyChangeChildByAction.has(n.resourceId):
    n.resourceType==="application"?enrollmentStudent.has(n.resourceId):
    n.resourceType==="admission_offer"?permittedGuardianOffers.has(n.resourceId):
    n.resourceType==="submission"?guardianSubmissionById.has(n.resourceId):
    n.resourceType==="action"&&["guardian_grade_follow_up_requested","guardian_grade_follow_up_resolved"].includes(n.type)
      ?verifiedGradeActions.has(n.resourceId):true));
 return visible.map(n=>({id:n.id,title:n.title,body:n.body??"",status:n.status,
  date:n.createdAt.toISOString(),href:n.resourceType==="safeguarding_concern"&&n.resourceId&&permittedSafeguardingIds.has(n.resourceId)?
   `/safeguarding?case=${encodeURIComponent(n.resourceId)}`:
   pickupNotificationTypes.has(n.type)&&n.resourceId&&pickupStudents.has(n.resourceType+":"+n.resourceId)?
   `/guardian/attendance?student=${encodeURIComponent(pickupStudents.get(n.resourceType+":"+n.resourceId)!)}#pickup`:
   n.resourceType==="health_office_visit"&&n.resourceId&&permittedMedicalIds.has(n.resourceId)&&context.role==="guardian"?`/guardian/health?student=${encodeURIComponent(medicalChildByVisit.get(n.resourceId)!)}`:
   n.resourceType==="field_trip"&&n.resourceId&&tripNoticeTypes.has(n.type)&&context.role==="guardian"&&guardianTripIds.has(n.resourceId)?"/guardian/field-trips":
   n.resourceType==="field_trip"&&n.resourceId&&tripNoticeTypes.has(n.type)&&context.role==="registrar"&&staffTripIds.has(n.resourceId)?"/operations/field-trips":
   n.type==="school_family_alert"&&n.resourceType==="action"&&n.resourceId&&permittedSchoolAlerts.has(n.resourceId)?"/guardian/experiences":
   n.type==="transfer_destination_transcript_ready"&&n.resourceType==="application"&&n.resourceId&&permittedReceivingTranscriptIds.has(n.resourceId)?
   `/admissions/intake?application=${encodeURIComponent(n.resourceId)}`:
   n.type==="enrollment_activated"&&n.resourceType==="enrollment"&&
   n.resourceId&&activatedEnrollmentById.has(n.resourceId)?
   (context.role==="guardian"?`/guardian/admission-offers?student=${encodeURIComponent(activatedEnrollmentById.get(n.resourceId)!)}`:
     context.role==="student"?"/student":null):
   n.type==="guardian_enrollment_change_updated"&&n.resourceType==="action"&&n.resourceId&&familyChangeChildByAction.has(n.resourceId)?`/guardian/enrollment-changes?student=${encodeURIComponent(familyChangeChildByAction.get(n.resourceId)!)}`:
   n.type==="guardian_enrollment_change_requested"&&n.resourceType==="action"&&n.resourceId&&permittedOperatorChangeIds.has(n.resourceId)?`/operations?action=${encodeURIComponent(n.resourceId)}`:
   n.type==="transfer_academic_records_handoff_requested"&&n.resourceType==="action"&&n.resourceId&&permittedRecordsHandoffs.has(n.resourceId)?"/operations/transfer-records":
   n.type==="guardian_health_review_requested"&&n.resourceType==="action"&&n.resourceId&&healthStaffActionIds.has(n.resourceId)?`/operations/health-review?action=${encodeURIComponent(n.resourceId)}`:
   n.type==="guardian_health_review_completed"&&n.resourceType==="action"&&n.resourceId&&healthGuardianChildByAction.has(n.resourceId)?`/guardian/health?student=${encodeURIComponent(healthGuardianChildByAction.get(n.resourceId)!)}`:
   n.type==="course_registration_guardian_decision_for_registrar"&&n.resourceType==="action"&&n.resourceId&&permittedRegistrarCourseActions.has(n.resourceId)?`/operations?action=${encodeURIComponent(n.resourceId)}`:
   n.resourceType==="attendance_event"&&n.resourceId&&attendanceStudent.has(n.resourceId)?
   `/guardian/attendance?student=${encodeURIComponent(attendanceStudent.get(n.resourceId)!)}&attendance=${encodeURIComponent(n.resourceId)}`:
   n.resourceType==="submission"&&n.resourceId&&
    (bySubmission.has(n.resourceId)||guardianSubmissionById.has(n.resourceId))?
   (context.role==="student"&&bySubmission.has(n.resourceId)?
     `/student/assignments?assessment=${encodeURIComponent(bySubmission.get(n.resourceId)!)}`:
     context.role==="guardian"&&guardianSubmissionById.has(n.resourceId)?
     (()=>{const row=guardianSubmissionById.get(n.resourceId)!;
       return `/guardian/academics?student=${encodeURIComponent(row.studentPersonId)}&section=${encodeURIComponent(row.sectionId)}&assessment=${encodeURIComponent(row.assessmentId)}`;})():null):
   n.resourceType==="action"&&n.resourceId&&gradeActionsById.has(n.resourceId)&&
    verifiedGradeActions.has(n.resourceId)?verifiedGradeActions.get(n.resourceId)!:
   n.resourceType==="action"&&n.resourceId&&referralIds.has(n.resourceId)?
   (context.role==="student"?`/student/support?referral=${encodeURIComponent(n.resourceId)}`:null):
   n.type==="missing_work_follow_up"&&n.resourceType==="action"&&n.resourceId&&missingAssessmentByAction.has(n.resourceId)?(context.role==="student"?`/student/assignments?assessment=${encodeURIComponent(missingAssessmentByAction.get(n.resourceId)!)}`:null):
   n.resourceType==="application"&&n.resourceId&&enrollmentStudent.has(n.resourceId)?
   (n.type==="admissions_stage_changed"&&!enrollmentApplicationOfferReady.get(n.resourceId)?"/guardian/apply":
    `/guardian/admission-offers?student=${encodeURIComponent(enrollmentStudent.get(n.resourceId)!)}&application=${encodeURIComponent(n.resourceId)}`):
   n.resourceType==="communication_thread"&&n.resourceId&&threadById.has(n.resourceId)?
   (()=>{const thread=threadById.get(n.resourceId!)!;
    if(thread.metadata?.kind==="class_announcement")
     return thread.contextId&&accessibleAnnouncementSections.has(thread.contextId)?
      `/classes?section=${encodeURIComponent(thread.contextId)}&tab=announcements`:null;
    return memberThreadIds.has(thread.id)?`/messages?thread=${encodeURIComponent(thread.id)}`:null;})():
   n.resourceType==="admission_offer"&&n.resourceId&&permittedGuardianOffers.has(n.resourceId)&&context.role==="guardian"?`/guardian/admission-offers?student=${encodeURIComponent(personByProfile.get(admissionOffers.find(offer=>offer.id===n.resourceId)!.studentProfileId)!)}&offer=${encodeURIComponent(n.resourceId)}`:
   n.resourceType==="admission_offer"&&n.resourceId&&permittedRegistrarOffers.has(n.resourceId)&&context.role==="registrar"?`/admissions?application=${encodeURIComponent(admissionOffers.find(offer=>offer.id===n.resourceId)!.applicationId)}`:
   n.type==="course_registration_guardian_review"&&context.role==="guardian"?"/guardian/course-approvals":
   n.type==="field_trip_permission_requested"&&context.role==="guardian"?"/guardian/field-trips":
   n.type==="study_group_consent_requested"&&context.role==="guardian"&&(
    n.resourceType==="action"&&n.resourceId&&permittedConsents.has(n.resourceId)||
    n.resourceType==="study_group"&&n.resourceId&&groupRows.some(group=>group.id===n.resourceId))?(n.resourceType==="action"?`/guardian/group-permissions?action=${encodeURIComponent(n.resourceId!)}`:"/guardian/group-permissions"):
   n.type==="program_opening_handoff"&&n.resourceId&&handoffSites.get(n.resourceId)?`/sites/${encodeURIComponent(handoffSites.get(n.resourceId)!)}`:
   n.type==="pickup_custody_hold_staff_review"&&n.resourceType==="action"&&n.resourceId&&permittedCustodyActions.has(n.resourceId)?"/site/day#pickup":
   ["operations_action_assigned","operations_action_deadline_changed"].includes(n.type)&&n.resourceType==="action"&&n.resourceId&&permittedAssignedActions.has(n.resourceId)&&context.role==="registrar"?`/operations?action=${encodeURIComponent(n.resourceId)}`:
   n.resourceType==="study_group"&&n.resourceId&&permittedGroups.has(n.resourceId)?(context.role==="teacher"?`/groups?group=${encodeURIComponent(n.resourceId)}`:context.role==="student"?`/student/study-groups?group=${encodeURIComponent(n.resourceId)}`:null):
   context.role==="student"&&n.resourceType==="study_group_session"&&n.resourceId&&groupBySession.has(n.resourceId)?`/student/study-groups?group=${encodeURIComponent(groupBySession.get(n.resourceId)!)}&session=${encodeURIComponent(n.resourceId)}`:null}));
});
export const readNotification=createServerFn({method:"POST"})
 .validator((data:unknown)=>z.object({id:z.string().uuid()}).parse(data)).handler(async({data})=>{
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
 .validator((data:unknown)=>z.object({id:z.string().uuid(),status:z.enum(["unread","read","dismissed"])}).parse(data))
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
