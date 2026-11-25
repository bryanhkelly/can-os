import {and,eq} from "drizzle-orm";
import type {db} from "@/db/client";
import {canonicalClasses,canonicalClassEnrollments,canonicalClassSessions,canonicalClassEnrollmentTransferRequests,noncreditRegistrations,noncreditSelfEnrollmentClaims,noncreditSelfEnrollmentReleases} from "@/db/canonical-v301";
import {EventTypes} from "@/domain/event-types";
import {emitReportableChange} from "@/platform/reportable-event";
type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];
type Event={eventType:string;aggregateType:string;aggregateId:string;payload?:Record<string,unknown>|null;occurredAt?:Date|null};
const enrollmentStages={
 ClassEnrollmentCreated:"created",ClassEnrollmentAssigned:"created",ClassGuardianEnrollmentCreated:"created",
 ClassEnrollmentWithdrawn:"withdrawn",ClassEnrollmentCancelled:"cancelled",
} as const;
const sessionStages={
 ClassSessionScheduled:"scheduled",ClassSessionScheduleChanged:"schedule_changed",ClassSessionStarted:"started",ClassSessionRevoked:"revoked",
} as const;
type EnrollmentStage=typeof enrollmentStages[keyof typeof enrollmentStages]|"transferred_in"|"transferred_out";
/** Companion evidence is separate from notification events. Source identity
 * and scope are loaded within the same authoritative transaction; no native
 * Person IDs, consent, free-text reason or Course Attempt payload is copied.
 * Standalone Site-less Classes are not assigned a fabricated Site. */
export async function recordNativeLearningReporting(tx:Tx,event:Event){
 const occurredAt=event.occurredAt??new Date();
 const payload=event.payload??{};
 async function enrollment(id:string,stage:EnrollmentStage,expectedClass?:unknown){
  const [row]=await tx.select({classId:canonicalClasses.id,siteId:canonicalClasses.siteId,organizationId:canonicalClasses.operatingOrganizationId,courseVersionId:canonicalClasses.courseVersionId,method:canonicalClassEnrollments.enrollmentMethod,status:canonicalClassEnrollments.status}).from(canonicalClassEnrollments)
   .innerJoin(canonicalClasses,eq(canonicalClasses.id,canonicalClassEnrollments.classId)).where(eq(canonicalClassEnrollments.id,id)).limit(1);
  if(!row||(expectedClass!==undefined&&row.classId!==expectedClass))throw new Error("Class enrollment reporting source mismatch");
  if(!row.siteId)return;
  const expected=stage==="created"||stage==="transferred_in"?"active":stage==="cancelled"?"cancelled":"withdrawn";
  if(row.status!==expected)throw new Error("Class enrollment reporting state mismatch");
  await emitReportableChange(tx,{eventType:EventTypes.NativeClassEnrollmentLifecycleRecorded,sourceId:id,sourceVersion:stage,occurredAt,dimensions:{organizationId:row.organizationId,siteId:row.siteId,classId:row.classId,courseVersionId:row.courseVersionId},payload:{stage,method:row.method}});
 }
 if(Object.hasOwn(enrollmentStages,event.eventType)){
  if(event.aggregateType!=="class_enrollment")throw new Error("Unexpected Class enrollment aggregate");
  await enrollment(event.aggregateId,enrollmentStages[event.eventType as keyof typeof enrollmentStages],payload.classId);
 }else if(event.eventType==="ClassEnrollmentTransferred"){
  if(event.aggregateType!=="class_enrollment_transfer")throw new Error("Unexpected Class transfer aggregate");
  const [row]=await tx.select({source:canonicalClassEnrollmentTransferRequests.sourceEnrollmentId,destination:canonicalClassEnrollmentTransferRequests.destinationEnrollmentId,state:canonicalClassEnrollmentTransferRequests.state}).from(canonicalClassEnrollmentTransferRequests).where(eq(canonicalClassEnrollmentTransferRequests.id,event.aggregateId)).limit(1);
  if(!row?.destination||row.state!=="approved"||row.source!==payload.sourceEnrollmentId||row.destination!==payload.destinationEnrollmentId)throw new Error("Class transfer reporting source mismatch");
  await enrollment(row.source,"transferred_out",payload.sourceClassId);
  await enrollment(row.destination,"transferred_in",payload.destinationClassId);
 }else if(Object.hasOwn(sessionStages,event.eventType)){
  const stage=sessionStages[event.eventType as keyof typeof sessionStages];
  const sessionId=stage==="schedule_changed"?event.aggregateId:payload.classSessionId;
  if(typeof sessionId!=="string")throw new Error("Missing Class session reporting source");
  const [row]=await tx.select({classId:canonicalClasses.id,siteId:canonicalClasses.siteId,organizationId:canonicalClasses.operatingOrganizationId,courseVersionId:canonicalClasses.courseVersionId}).from(canonicalClassSessions)
   .innerJoin(canonicalClasses,eq(canonicalClasses.id,canonicalClassSessions.classId)).where(eq(canonicalClassSessions.id,sessionId)).limit(1);
  if(!row||(stage==="schedule_changed"?(event.aggregateType!=="class_session"||payload.classId!==row.classId):(event.aggregateType!=="class"||event.aggregateId!==row.classId)))throw new Error("Class session reporting source mismatch");
  if(!row.siteId)return;
  await emitReportableChange(tx,{eventType:EventTypes.NativeClassSessionLifecycleRecorded,sourceId:sessionId,sourceVersion:stage,occurredAt,dimensions:{organizationId:row.organizationId,siteId:row.siteId,classId:row.classId,sessionId,courseVersionId:row.courseVersionId},payload:{stage}});
 }else if(event.eventType==="NoncreditSelfEnrollmentCompleted"||event.eventType==="NoncreditSelfEnrollmentWithdrawn"){
  if(event.aggregateType!=="noncredit_registration")throw new Error("Unexpected noncredit registration aggregate");
  const [row]=await tx.select({siteId:noncreditSelfEnrollmentClaims.siteId,organizationId:noncreditRegistrations.registeringOrganizationId,releaseId:noncreditSelfEnrollmentReleases.id,courseVersionId:noncreditSelfEnrollmentReleases.courseVersionId,status:noncreditRegistrations.status}).from(noncreditRegistrations)
   .innerJoin(noncreditSelfEnrollmentClaims,eq(noncreditSelfEnrollmentClaims.registrationId,noncreditRegistrations.id))
   .innerJoin(noncreditSelfEnrollmentReleases,and(eq(noncreditSelfEnrollmentReleases.id,noncreditSelfEnrollmentClaims.releaseId),eq(noncreditSelfEnrollmentReleases.siteId,noncreditSelfEnrollmentClaims.siteId),eq(noncreditSelfEnrollmentReleases.registeringOrganizationId,noncreditRegistrations.registeringOrganizationId),eq(noncreditSelfEnrollmentClaims.participantPersonId,noncreditRegistrations.participantPersonId),eq(noncreditSelfEnrollmentReleases.deploymentId,noncreditRegistrations.deploymentId),eq(noncreditSelfEnrollmentReleases.adoptionId,noncreditRegistrations.adoptionId),eq(noncreditSelfEnrollmentReleases.offeringVersionId,noncreditRegistrations.offeringVersionId),eq(noncreditSelfEnrollmentReleases.trainingVersionId,noncreditRegistrations.trainingVersionId)))
   .where(eq(noncreditRegistrations.id,event.aggregateId)).limit(1);
  const stage=event.eventType==="NoncreditSelfEnrollmentCompleted"?"registered":"withdrawn";
  if(!row||row.organizationId!==payload.organizationId||(stage==="registered"&&(row.releaseId!==payload.releaseId||row.siteId!==payload.siteId||!["registered","active"].includes(row.status)))||(stage==="withdrawn"&&row.status!=="withdrawn"))throw new Error("Noncredit registration reporting source mismatch");
  await emitReportableChange(tx,{eventType:EventTypes.NoncreditRegistrationLifecycleRecorded,sourceId:event.aggregateId,sourceVersion:stage,occurredAt,dimensions:{organizationId:row.organizationId,siteId:row.siteId,courseVersionId:row.courseVersionId},payload:{stage,releaseId:row.releaseId}});
 }
}
