import {createServerFn} from "@tanstack/react-start";
import {getRequest,setResponseHeader} from "@tanstack/react-start/server";
import {and,desc,eq,gt,inArray,lte} from "drizzle-orm";
import {z} from "zod";
import {db} from "@/db/client";
import {
 auditEvents,domainEvents,canonicalClasses,canonicalClassOfferingVersions,
 canonicalClassEnrollmentApprovalRequests,canonicalClassEnrollments,canonicalPersons,
} from "@/db/canonical-v301";
import {AuthorizationError,assertCapability} from "@/domain/command-context";
import {getCanonicalCommandContext} from "@/modules/identity/canonical-command-context.server";
import {assertCurrentNativeClassLearnerForMutation} from "./native-class-learner-session.server";
import {assertCurrentCanonicalStaffForMutation} from "@/modules/identity/canonical-transaction-authorization.server";
import {currentClassAuthority} from "./native-class-authority.server";
import {assertNativeClassOperatorExitScope} from "@/domain/native-class-lifecycle";
import {verifiedAdultOn} from "@/domain/native-class-enrollment";
import {requireNativeGuardianChild} from "./native-class-guardian-authority.server";

const uuid=z.string().uuid();
const requestInput=z.object({classOfferingVersionId:uuid,requestId:uuid}).strict();
const decisionInput=z.object({approvalRequestId:uuid,decision:z.enum(["approved","rejected"]),
 reason:z.string().trim().min(3).max(1000)}).strict();
function guard(){setResponseHeader("Cache-Control","private, no-store");
 setResponseHeader("Referrer-Policy","no-referrer");}
const maxAgeMs=7*24*60*60*1000;

/** A verified adult's request has no enrollment, learning, or seat rights.
 * Review is independent and learner consent is collected on final acceptance.
 */
export const requestNativeClassApproval=createServerFn({method:"POST"})
 .validator((v:unknown)=>requestInput.parse(v))
 .handler(async({data})=>{
  guard();const request=getRequest();
  const actor=await getCanonicalCommandContext(request);
  if(!actor.actorPersonId||actor.role!=="learner")
   throw new AuthorizationError("verified canonical adult learner");
  assertCapability(actor,"learning.participate");
  return db.transaction(async tx=>{
   const [locator]=await tx.select({classId:canonicalClassOfferingVersions.classId})
    .from(canonicalClassOfferingVersions)
    .where(eq(canonicalClassOfferingVersions.id,data.classOfferingVersionId)).limit(1);
   if(!locator)throw new AuthorizationError("valid Class offering");
   const [cls]=await tx.select().from(canonicalClasses)
    .where(eq(canonicalClasses.id,locator.classId)).for("update").limit(1);
   if(!cls)throw new AuthorizationError("active Class");
   const now=new Date();
   const current=await currentClassAuthority(tx,cls.id,now);
   const [terms]=await tx.select().from(canonicalClassOfferingVersions)
    .where(and(eq(canonicalClassOfferingVersions.id,data.classOfferingVersionId),
     eq(canonicalClassOfferingVersions.classId,cls.id))).for("update").limit(1);
   if(!terms||terms.state!=="published"||terms.visibility!=="public"||
      !terms.enrollmentMethods.includes("approval")||current.classState!=="active"||
      !current.siteId||!terms.consentText||!terms.consentVersion||
      (terms.opensAt&&terms.opensAt>now)||(terms.closesAt&&terms.closesAt<=now))
     throw new AuthorizationError("current public approval-based Class");
   const [person]=await tx.select({birthDate:canonicalPersons.birthDate})
     .from(canonicalPersons).where(eq(canonicalPersons.id,actor.actorPersonId)).limit(1);
   if(!verifiedAdultOn(person?.birthDate,now))
     throw new AuthorizationError("verified adult only; guardian placement uses separate authority");
   await assertCurrentNativeClassLearnerForMutation(tx,request,actor);
   const [existingEnrollment]=await tx.select({id:canonicalClassEnrollments.id})
    .from(canonicalClassEnrollments).where(and(
     eq(canonicalClassEnrollments.classId,cls.id),
     eq(canonicalClassEnrollments.learnerPersonId,actor.actorPersonId),
     inArray(canonicalClassEnrollments.status,["pending","active"]))).limit(1);
   if(existingEnrollment)throw new AuthorizationError("already enrolled in Class");
   const [replay]=await tx.select().from(canonicalClassEnrollmentApprovalRequests).where(and(
     eq(canonicalClassEnrollmentApprovalRequests.classId,cls.id),
     eq(canonicalClassEnrollmentApprovalRequests.applicantPersonId,actor.actorPersonId),
     eq(canonicalClassEnrollmentApprovalRequests.requestId,data.requestId))).limit(1);
   if(replay){
    if(replay.classOfferingVersionId!==terms.id||replay.learnerPersonId!==actor.actorPersonId)
     throw new AuthorizationError("conflicting approval request replay");
    return {approvalRequestId:replay.id,state:replay.state,duplicate:true};
   }
   // Lazily expire old pending requests before checking the unique pending
   // learner constraint. A stale request must never permanently lock enrollment.
   const expired=await tx.update(canonicalClassEnrollmentApprovalRequests)
    .set({state:"expired",reviewedAt:now,
      decisionReason:"Approval request expired before independent review"})
    .where(and(
      eq(canonicalClassEnrollmentApprovalRequests.classId,cls.id),
      eq(canonicalClassEnrollmentApprovalRequests.learnerPersonId,actor.actorPersonId),
      eq(canonicalClassEnrollmentApprovalRequests.state,"pending"),
      lte(canonicalClassEnrollmentApprovalRequests.expiresAt,now),
    )).returning({id:canonicalClassEnrollmentApprovalRequests.id});
   for(const item of expired){
    await tx.insert(auditEvents).values({actorPersonId:actor.actorPersonId,
     owningOrganizationId:current.operatingOrganizationId,
     eventCode:"class.approval.expired",entityKind:"class_approval_request",entityId:item.id,
     payload:{classId:cls.id,siteId:current.siteId,reason:"expired_before_reapply"}});
    await tx.insert(domainEvents).values({eventType:"ClassApprovalExpired",
     aggregateType:"class_approval_request",aggregateId:item.id,
     actorPersonId:actor.actorPersonId,payload:{classId:cls.id,siteId:current.siteId}});
   }
   const [pending]=await tx.select({id:canonicalClassEnrollmentApprovalRequests.id})
    .from(canonicalClassEnrollmentApprovalRequests).where(and(
     eq(canonicalClassEnrollmentApprovalRequests.classId,cls.id),
     eq(canonicalClassEnrollmentApprovalRequests.learnerPersonId,actor.actorPersonId),
     eq(canonicalClassEnrollmentApprovalRequests.state,"pending"))).limit(1);
   if(pending)throw new AuthorizationError("an approval request is already pending");
   const [saved]=await tx.insert(canonicalClassEnrollmentApprovalRequests).values({
    classId:cls.id,classOfferingVersionId:terms.id,
    operatingOrganizationId:current.operatingOrganizationId,siteId:current.siteId,
    learnerPersonId:actor.actorPersonId,applicantPersonId:actor.actorPersonId,
    requestId:data.requestId,expiresAt:new Date(now.getTime()+maxAgeMs),
   }).returning({id:canonicalClassEnrollmentApprovalRequests.id});
   if(!saved)throw new Error("Class approval request not saved");
   await tx.insert(auditEvents).values({actorPersonId:actor.actorPersonId,
    owningOrganizationId:current.operatingOrganizationId,
    eventCode:"class.approval.requested",entityKind:"class_approval_request",entityId:saved.id,
    payload:{classId:cls.id,siteId:current.siteId,seatReserved:false}});
   await tx.insert(domainEvents).values({eventType:"ClassApprovalRequested",
    aggregateType:"class_approval_request",aggregateId:saved.id,
    actorPersonId:actor.actorPersonId,payload:{classId:cls.id,siteId:current.siteId}});
   return {approvalRequestId:saved.id,state:"pending" as const,duplicate:false};
  });
 });

/** Exact-Site registrar decides eligibility, without enrolling the learner.
 * Reviewer must not be the applicant; a decision never substitutes for consent.
 */
export const decideNativeClassApproval=createServerFn({method:"POST"})
 .validator((v:unknown)=>decisionInput.parse(v))
 .handler(async({data})=>{
  guard();const request=getRequest();
  const actor=await getCanonicalCommandContext(request);
  if(!actor.actorPersonId||!["site_admin","registrar"].includes(actor.role??""))
   throw new AuthorizationError("current exact-Site Class reviewer");
  assertCapability(actor,"class.manage");
  return db.transaction(async tx=>{
   const [locator]=await tx.select({classId:canonicalClassEnrollmentApprovalRequests.classId})
    .from(canonicalClassEnrollmentApprovalRequests)
    .where(eq(canonicalClassEnrollmentApprovalRequests.id,data.approvalRequestId)).limit(1);
   if(!locator)throw new AuthorizationError("existing approval request");
   const [cls]=await tx.select().from(canonicalClasses)
    .where(eq(canonicalClasses.id,locator.classId)).for("update").limit(1);
   if(!cls)throw new AuthorizationError("existing Class");
   assertNativeClassOperatorExitScope(actor,cls);
   await assertCurrentCanonicalStaffForMutation(tx,request,actor);
   const [approval]=await tx.select().from(canonicalClassEnrollmentApprovalRequests)
    .where(eq(canonicalClassEnrollmentApprovalRequests.id,data.approvalRequestId))
    .for("update").limit(1);
   if(!approval||approval.classId!==cls.id||
      approval.operatingOrganizationId!==cls.operatingOrganizationId||
      approval.siteId!==cls.siteId)
    throw new AuthorizationError("scoped Class approval");
   if(approval.applicantPersonId===actor.actorPersonId)
    throw new AuthorizationError("independent approval reviewer required");
   const now=new Date();
   if(approval.state===data.decision&&approval.reviewedByPersonId===actor.actorPersonId)
    return {approvalRequestId:approval.id,state:approval.state,duplicate:true};
   if(approval.state!=="pending"||approval.expiresAt<=now)
    throw new AuthorizationError("current pending approval request");
   if(approval.guardianPersonId){
     if(approval.applicantPersonId!==approval.guardianPersonId)
       throw new AuthorizationError("guardian must be original applicant");
     await requireNativeGuardianChild(tx,approval.guardianPersonId,
       approval.learnerPersonId,now);
   }else if(approval.applicantPersonId!==approval.learnerPersonId){
     throw new AuthorizationError("verified adult applicant only");
   }
   const current=await currentClassAuthority(tx,cls.id,now);
   if(current.classState!=="active"||current.siteId!==approval.siteId)
    throw new AuthorizationError("active authorized Class and Site");
   await tx.update(canonicalClassEnrollmentApprovalRequests).set({
    state:data.decision,reviewedByPersonId:actor.actorPersonId,
    reviewedAt:now,decisionReason:data.reason,
   }).where(eq(canonicalClassEnrollmentApprovalRequests.id,approval.id));
   await tx.insert(auditEvents).values({actorPersonId:actor.actorPersonId,
    owningOrganizationId:cls.operatingOrganizationId,
    eventCode:"class.approval."+data.decision,
    entityKind:"class_approval_request",entityId:approval.id,
    payload:{classId:cls.id,siteId:approval.siteId,reason:data.reason}});
   await tx.insert(domainEvents).values({eventType:"ClassApprovalDecided",
    aggregateType:"class_approval_request",aggregateId:approval.id,
    actorPersonId:actor.actorPersonId,
    payload:{classId:cls.id,siteId:approval.siteId,decision:data.decision}});
   return {approvalRequestId:approval.id,state:data.decision,duplicate:false};
  });
 });

export const getMyNativeClassApprovals=createServerFn({method:"GET"}).handler(async()=>{
 guard();const actor=await getCanonicalCommandContext(getRequest());
 if(!actor.actorPersonId||actor.role!=="learner")
  throw new AuthorizationError("verified Class learner");
 assertCapability(actor,"learning.participate");
 const items=await db.select({
  approvalRequestId:canonicalClassEnrollmentApprovalRequests.id,
  classId:canonicalClassEnrollmentApprovalRequests.classId,
  classOfferingVersionId:canonicalClassEnrollmentApprovalRequests.classOfferingVersionId,
  title:canonicalClasses.title,
  state:canonicalClassEnrollmentApprovalRequests.state,
  expiresAt:canonicalClassEnrollmentApprovalRequests.expiresAt,
  acceptedEnrollmentId:canonicalClassEnrollmentApprovalRequests.acceptedEnrollmentId,
  consentText:canonicalClassOfferingVersions.consentText,
  allowedCreditModes:canonicalClassOfferingVersions.allowedCreditModes,
 }).from(canonicalClassEnrollmentApprovalRequests)
  .innerJoin(canonicalClasses,eq(canonicalClasses.id,canonicalClassEnrollmentApprovalRequests.classId))
  .innerJoin(canonicalClassOfferingVersions,eq(canonicalClassOfferingVersions.id,canonicalClassEnrollmentApprovalRequests.classOfferingVersionId))
  .where(eq(canonicalClassEnrollmentApprovalRequests.applicantPersonId,actor.actorPersonId))
  .orderBy(desc(canonicalClassEnrollmentApprovalRequests.requestedAt)).limit(100);
 const now=new Date();
 return items.map(item=>({...item,state:
  ["pending","approved"].includes(item.state)&&item.expiresAt<=now?"expired" as const:item.state}));
});

export const getNativeClassApprovalQueue=createServerFn({method:"GET"})
 .validator((v:unknown)=>z.object({classId:uuid}).strict().parse(v))
 .handler(async({data})=>{
  guard();const request=getRequest();
  const actor=await getCanonicalCommandContext(request);
  if(!actor.actorPersonId||!["site_admin","registrar"].includes(actor.role??""))
   throw new AuthorizationError("current exact-Site Class reviewer");
  assertCapability(actor,"class.manage");
  return db.transaction(async tx=>{
   const [cls]=await tx.select().from(canonicalClasses).where(eq(canonicalClasses.id,data.classId)).limit(1);
   if(!cls)throw new AuthorizationError("existing Class");
   assertNativeClassOperatorExitScope(actor,cls);
   await assertCurrentCanonicalStaffForMutation(tx,request,actor);
   return tx.select({
    approvalRequestId:canonicalClassEnrollmentApprovalRequests.id,
    learnerPersonId:canonicalClassEnrollmentApprovalRequests.learnerPersonId,
    applicantPersonId:canonicalClassEnrollmentApprovalRequests.applicantPersonId,
    state:canonicalClassEnrollmentApprovalRequests.state,
    requestedAt:canonicalClassEnrollmentApprovalRequests.requestedAt,
    expiresAt:canonicalClassEnrollmentApprovalRequests.expiresAt,
   }).from(canonicalClassEnrollmentApprovalRequests)
    .where(and(eq(canonicalClassEnrollmentApprovalRequests.classId,cls.id),
     eq(canonicalClassEnrollmentApprovalRequests.state,"pending"),
     gt(canonicalClassEnrollmentApprovalRequests.expiresAt,new Date())))
    .orderBy(desc(canonicalClassEnrollmentApprovalRequests.requestedAt)).limit(100);
  });
 });
