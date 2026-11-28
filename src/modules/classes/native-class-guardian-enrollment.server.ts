import {parseCommandInput} from "@/domain/command-input";
import { nativeClassConsentDigest } from "./native-class-consent.server";
import {and,asc,desc,eq,gt,isNull,lte,or} from "drizzle-orm";
import {z} from "zod";
import {db} from "@/db/client";
import {people} from "@/db/schema";
import {
 canonicalClasses,canonicalClassOfferings,
 canonicalClassOfferingVersions,canonicalClassEnrollments,
 canonicalClassEnrollmentApprovalRequests,
 guardianAuthorities,learnerProfiles,} from "@/db/canonical-v301";
import { writeCanonicalAudit, emitCanonicalDomainEvent } from "@/platform/canonical-mutation.server";
import {AuthorizationError} from "@/domain/command-context";
import {currentClassAuthority} from "./native-class-authority.server";
import {readOpenNativeClassEnrollment,readLatestCompletedNativeClassEnrollment} from "./native-class-enrollment-history.server";
import { readNativeClassOccupancy } from "./native-class-capacity.server";
import { createInitialNativeClassAttempt, withdrawNativeClassAttempts } from "./native-class-attempt.server";
import {writeNativeClassAttribution} from "./native-class-attribution.server";
import {requireNativeRepeatAuthorization} from "./native-class-repeats.server";
import {consumeNativeClassRepeatAuthorization} from "./native-class-repeat-consumption.server";
import {requireNativeGuardian,requireNativeGuardianChild,currentNativeGuardianAuthorityPredicate,assertCurrentNativeGuardianSession} from
 "./native-class-guardian-authority.server";
import {assertOperationalClassOfferingTerms,assertNativeClassSeatAvailable} from "@/domain/native-class-lifecycle";

const uuid=z.string().uuid();
const requestSchema=z.object({
 classOfferingVersionId:uuid,learnerPersonId:uuid,requestId:uuid,
}).strict();
const acceptanceSchema=z.object({
 approvalRequestId:uuid,creditMode:z.enum(["audit","not_applicable"]),
 consentAccepted:z.literal(true),
}).strict();
const withdrawSchema=z.object({classEnrollmentId:uuid}).strict();
const expiryMs=7*24*60*60*1000;


/** Child choices come from current verified guardian Authorities only.
 * A student need not possess their own login to be registered by a guardian.
 */
export async function getMyNativeGuardianLearnersService(request:Request,raw:unknown=undefined){


  const now=new Date();
  const guardian=await requireNativeGuardian(request,now);
  return db.transaction(async tx=>{
   await assertCurrentNativeGuardianSession(tx,request,guardian.personId,new Date());
   const rows=await tx.select({
    learnerPersonId:learnerProfiles.personId,
    firstName:people.legalFirstName,
    lastName:people.legalLastName,
   }).from(guardianAuthorities)
    .innerJoin(learnerProfiles,eq(learnerProfiles.id,guardianAuthorities.learnerId))
    .innerJoin(people,eq(people.id,learnerProfiles.personId))
    .where(and(
      currentNativeGuardianAuthorityPredicate(guardian.personId,now),
    )).orderBy(asc(people.legalFirstName)).limit(100);
   const learners: Array<{learnerPersonId:string;name:string}>=[];
   for(const row of rows){
    try{
     await requireNativeGuardianChild(tx,guardian.personId,row.learnerPersonId,now);
     if(!learners.some(item=>item.learnerPersonId===row.learnerPersonId))
      learners.push({learnerPersonId:row.learnerPersonId,
       name:[row.firstName,row.lastName].filter(Boolean).join(" ")||"Learner"});
    }catch(e){if(!(e instanceof AuthorizationError))throw e;}
   }
   return learners;
}
 });

/** Guardian requests review for a verified minor through a CAN login. */
export const requestNativeGuardianClassApprovalInput=requestSchema;
export async function requestNativeGuardianClassApprovalService(request:Request,raw:unknown=undefined){
 const data=parseCommandInput(requestNativeGuardianClassApprovalInput,raw);

  const now=new Date();
  const guardian=await requireNativeGuardian(request,now);
  return db.transaction(async tx=>{
   await assertCurrentNativeGuardianSession(tx,request,guardian.personId,new Date());
   const [locator]=await tx.select({classId:canonicalClassOfferingVersions.classId})
    .from(canonicalClassOfferingVersions)
    .where(eq(canonicalClassOfferingVersions.id,data.classOfferingVersionId)).limit(1);
   if(!locator)throw new AuthorizationError("valid Class Offering");
   const [cls]=await tx.select().from(canonicalClasses)
    .where(eq(canonicalClasses.id,locator.classId)).for("update").limit(1);
   if(!cls)throw new AuthorizationError("existing Class");
   const current=await currentClassAuthority(tx,cls.id,new Date());
   const [terms]=await tx.select().from(canonicalClassOfferingVersions)
    .where(and(eq(canonicalClassOfferingVersions.id,data.classOfferingVersionId),
      eq(canonicalClassOfferingVersions.classId,cls.id)))
    .for("update").limit(1);
   if(!terms||terms.state!=="published"||
      !["public","unlisted"].includes(terms.visibility)||
      !terms.enrollmentMethods.includes("approval")||
      !current.siteId||current.classState!=="active"||
      (terms.opensAt&&terms.opensAt>now)||(terms.closesAt&&terms.closesAt<=now))
    throw new AuthorizationError("current Class guardian approval application");
   await requireNativeGuardianChild(tx,guardian.personId,data.learnerPersonId,new Date());
   const open=await readOpenNativeClassEnrollment(tx,cls.id,data.learnerPersonId);
   if(open)throw new AuthorizationError("learner already participates");
   const [replay]=await tx.select().from(canonicalClassEnrollmentApprovalRequests)
    .where(and(
      eq(canonicalClassEnrollmentApprovalRequests.classId,cls.id),
      eq(canonicalClassEnrollmentApprovalRequests.applicantPersonId,guardian.personId),
      eq(canonicalClassEnrollmentApprovalRequests.requestId,data.requestId),
    )).limit(1);
   if(replay){
    if(replay.learnerPersonId!==data.learnerPersonId||
       replay.guardianPersonId!==guardian.personId||
       replay.classOfferingVersionId!==terms.id)
     throw new AuthorizationError("conflicting guardian approval replay");
    return {approvalRequestId:replay.id,state:replay.state,duplicate:true};
   }
   const expired=await tx.update(canonicalClassEnrollmentApprovalRequests)
    .set({state:"expired",reviewedAt:new Date(),
      decisionReason:"Guardian application expired before review"})
    .where(and(
      eq(canonicalClassEnrollmentApprovalRequests.classId,cls.id),
      eq(canonicalClassEnrollmentApprovalRequests.learnerPersonId,data.learnerPersonId),
      eq(canonicalClassEnrollmentApprovalRequests.state,"pending"),
      lte(canonicalClassEnrollmentApprovalRequests.expiresAt,new Date()),
    )).returning({id:canonicalClassEnrollmentApprovalRequests.id});
   for(const item of expired){
    await emitCanonicalDomainEvent(tx,{eventType:"ClassApprovalExpired",
      aggregateType:"class_approval_request",aggregateId:item.id,
      actorPersonId:guardian.personId,payload:{classId:cls.id,reason:"expired"}});
   }
   const [pending]=await tx.select({id:canonicalClassEnrollmentApprovalRequests.id})
    .from(canonicalClassEnrollmentApprovalRequests).where(and(
      eq(canonicalClassEnrollmentApprovalRequests.classId,cls.id),
      eq(canonicalClassEnrollmentApprovalRequests.learnerPersonId,data.learnerPersonId),
      eq(canonicalClassEnrollmentApprovalRequests.state,"pending"),
    )).limit(1);
   if(pending)throw new AuthorizationError("Class review already pending for learner");
   const createdAt=new Date();
   const [saved]=await tx.insert(canonicalClassEnrollmentApprovalRequests).values({
    classId:cls.id,classOfferingVersionId:terms.id,
    operatingOrganizationId:current.operatingOrganizationId,siteId:current.siteId,
    learnerPersonId:data.learnerPersonId,applicantPersonId:guardian.personId,
    guardianPersonId:guardian.personId,requestId:data.requestId,
    requestedAt:createdAt,expiresAt:new Date(createdAt.getTime()+expiryMs),
   }).returning({id:canonicalClassEnrollmentApprovalRequests.id});
   if(!saved)throw new Error("guardian Class application not saved");
   await writeCanonicalAudit(tx,{actorPersonId:guardian.personId,
    owningOrganizationId:current.operatingOrganizationId,
    eventCode:"class.guardian_approval.requested",
    entityKind:"class_approval_request",entityId:saved.id,
    payload:{classId:cls.id,learnerPersonId:data.learnerPersonId,guardianPersonId:guardian.personId,
      siteId:current.siteId,seatReserved:false}});
   await emitCanonicalDomainEvent(tx,{eventType:"ClassGuardianApprovalRequested",
    aggregateType:"class_approval_request",aggregateId:saved.id,
    actorPersonId:guardian.personId,
    payload:{classId:cls.id,learnerPersonId:data.learnerPersonId,siteId:current.siteId}});
   return {approvalRequestId:saved.id,state:"pending" as const,duplicate:false};
}
 });

export async function getMyNativeGuardianClassApprovalsService(request:Request,raw:unknown=undefined){


  const now=new Date(),guardian=await requireNativeGuardian(request,now);
  return db.transaction(async tx=>{
   await assertCurrentNativeGuardianSession(tx,request,guardian.personId,new Date());
   const rows=await tx.select({
    approvalRequestId:canonicalClassEnrollmentApprovalRequests.id,
    classId:canonicalClassEnrollmentApprovalRequests.classId,
    classOfferingVersionId:canonicalClassEnrollmentApprovalRequests.classOfferingVersionId,
    learnerPersonId:canonicalClassEnrollmentApprovalRequests.learnerPersonId,
    state:canonicalClassEnrollmentApprovalRequests.state,
    expiresAt:canonicalClassEnrollmentApprovalRequests.expiresAt,
    acceptedEnrollmentId:canonicalClassEnrollmentApprovalRequests.acceptedEnrollmentId,
    classTitle:canonicalClasses.title,
    consentText:canonicalClassOfferingVersions.consentText,
    allowedCreditModes:canonicalClassOfferingVersions.allowedCreditModes,
   }).from(canonicalClassEnrollmentApprovalRequests)
    .innerJoin(canonicalClasses,eq(canonicalClasses.id,canonicalClassEnrollmentApprovalRequests.classId))
    .innerJoin(canonicalClassOfferingVersions,
      eq(canonicalClassOfferingVersions.id,canonicalClassEnrollmentApprovalRequests.classOfferingVersionId))
    .where(and(
      eq(canonicalClassEnrollmentApprovalRequests.guardianPersonId,guardian.personId),
      eq(canonicalClassEnrollmentApprovalRequests.applicantPersonId,guardian.personId),
    )).orderBy(desc(canonicalClassEnrollmentApprovalRequests.requestedAt)).limit(100);
   const result=[];
   for(const row of rows){
    try{
     await requireNativeGuardianChild(tx,guardian.personId,row.learnerPersonId,now);
     result.push({...row,state:row.expiresAt<=now&&
       ["pending","approved"].includes(row.state)?"expired" as const:row.state});
    }catch(e){if(!(e instanceof AuthorizationError))throw e;}
   }
   return result;
}
 });

/** Independent staff approval is necessary but not sufficient: the guardian
 * separately accepts current terms, at which point the only Enrollment and
 * Course Attempt are created under the Class seat lock.
 */
export const acceptNativeGuardianClassApprovalInput=acceptanceSchema;
export async function acceptNativeGuardianClassApprovalService(request:Request,raw:unknown=undefined){
 const data=parseCommandInput(acceptNativeGuardianClassApprovalInput,raw);

  const now=new Date();
  const guardian=await requireNativeGuardian(request,now);
  return db.transaction(async tx=>{
   await assertCurrentNativeGuardianSession(tx,request,guardian.personId,new Date());
   const [locator]=await tx.select({classId:canonicalClassEnrollmentApprovalRequests.classId})
    .from(canonicalClassEnrollmentApprovalRequests)
    .where(eq(canonicalClassEnrollmentApprovalRequests.id,data.approvalRequestId)).limit(1);
   if(!locator)throw new AuthorizationError("existing approved guardian request");
   const [cls]=await tx.select().from(canonicalClasses)
    .where(eq(canonicalClasses.id,locator.classId)).for("update").limit(1);
   if(!cls)throw new AuthorizationError("current Class");
   const current=await currentClassAuthority(tx,cls.id,new Date());
   const [approval]=await tx.select().from(canonicalClassEnrollmentApprovalRequests)
    .where(eq(canonicalClassEnrollmentApprovalRequests.id,data.approvalRequestId))
    .for("update").limit(1);
   if(!approval||approval.state!=="approved"||
      (!approval.acceptedEnrollmentId&&approval.expiresAt<=new Date())||
      approval.classId!==cls.id||
      approval.applicantPersonId!==guardian.personId||
      approval.guardianPersonId!==guardian.personId||
      !approval.reviewedByPersonId||
      approval.reviewedByPersonId===guardian.personId||
      approval.reviewedByPersonId===approval.learnerPersonId||
      approval.operatingOrganizationId!==current.operatingOrganizationId||
      approval.siteId!==current.siteId||
      current.classState!=="active")
    throw new AuthorizationError("independently reviewed current guardian request");
   await requireNativeGuardianChild(tx,guardian.personId,approval.learnerPersonId,new Date());
   // A lost response must not create another enrollment or consent record.
   if(approval.acceptedEnrollmentId){
    const [prior]=await tx.select().from(canonicalClassEnrollments).where(and(
     eq(canonicalClassEnrollments.id,approval.acceptedEnrollmentId),
     eq(canonicalClassEnrollments.classId,cls.id),
     eq(canonicalClassEnrollments.learnerPersonId,approval.learnerPersonId),
     eq(canonicalClassEnrollments.enrolledByPersonId,guardian.personId),
     eq(canonicalClassEnrollments.classOfferingVersionId,approval.classOfferingVersionId),
     eq(canonicalClassEnrollments.enrollmentMethod,"approval"),
    )).limit(1);
    if(!prior||!prior.courseAttemptId||prior.creditMode!==data.creditMode||!prior.consentedAt||
       !prior.consentVersion||!prior.consentSha256)
     throw new AuthorizationError("exact original guardian consent replay");
    return {classEnrollmentId:prior.id,courseAttemptId:prior.courseAttemptId};
   }
   const [terms]=await tx.select().from(canonicalClassOfferingVersions)
    .where(and(eq(canonicalClassOfferingVersions.id,approval.classOfferingVersionId),
      eq(canonicalClassOfferingVersions.classId,cls.id))).for("update").limit(1);
   if(!terms||terms.state!=="published"||
      !terms.enrollmentMethods.includes("approval")||
      !["public","unlisted"].includes(terms.visibility)||
      !terms.allowedCreditModes.includes(data.creditMode)||
      !terms.consentVersion||!terms.consentText||
      (terms.opensAt&&terms.opensAt>new Date())||
      (terms.closesAt&&terms.closesAt<=new Date()))
    throw new AuthorizationError("current published guardian participation terms");
   assertOperationalClassOfferingTerms(terms);
   if(!data.consentAccepted)throw new AuthorizationError("guardian consent");
   const [offering]=await tx.select({id:canonicalClassOfferings.id})
    .from(canonicalClassOfferings).where(and(
      eq(canonicalClassOfferings.id,terms.classOfferingId),
      eq(canonicalClassOfferings.classId,cls.id),
    )).limit(1);
   if(!offering)throw new AuthorizationError("Class Offering identity");
   const already=await readOpenNativeClassEnrollment(tx,cls.id,approval.learnerPersonId);
   if(already)throw new AuthorizationError("minor already enrolled");
   const completed=await readLatestCompletedNativeClassEnrollment(tx,cls.id,approval.learnerPersonId);
   const repeatAuthorization=completed
     ?await requireNativeRepeatAuthorization(tx,cls.id,approval.learnerPersonId,
       completed.id,new Date())
     :null;
   const seats=await readNativeClassOccupancy(tx,cls.id);
   assertNativeClassSeatAvailable({method:"approval",activeOrPending:seats,
    classCapacity:current.classCapacity,offeringCapacity:terms.capacity});
   const admissionAt=new Date();
   const consentSha256=nativeClassConsentDigest(terms.consentVersion,terms.consentText);
   const [enrollment]=await tx.insert(canonicalClassEnrollments).values({
    classId:cls.id,classOfferingVersionId:terms.id,
    learnerPersonId:approval.learnerPersonId,enrolledByPersonId:guardian.personId,
    enrollmentMethod:"approval",creditMode:data.creditMode,status:"active",
    consentVersion:terms.consentVersion,consentSha256,consentedAt:admissionAt,
   }).returning({id:canonicalClassEnrollments.id});
   if(!enrollment)throw new Error("guardian Class Enrollment not saved");
   await writeNativeClassAttribution(tx,{enrollmentId:enrollment.id,source:current,now:admissionAt});
   const attempt=await createInitialNativeClassAttempt(tx,enrollment.id,current);
   if(repeatAuthorization){
        await consumeNativeClassRepeatAuthorization(tx,{
          authorizationId:repeatAuthorization.id,classId:cls.id,learnerPersonId:approval.learnerPersonId,
          priorEnrollmentId:completed!.id,classEnrollmentId:enrollment.id,
          courseAttemptId:attempt.id,actorPersonId:guardian.personId,
        });
      }
   await tx.update(canonicalClassEnrollmentApprovalRequests)
    .set({acceptedEnrollmentId:enrollment.id})
    .where(and(eq(canonicalClassEnrollmentApprovalRequests.id,approval.id),
      eq(canonicalClassEnrollmentApprovalRequests.state,"approved")));
   const payload={classId:cls.id,siteId:current.siteId,
    learnerPersonId:approval.learnerPersonId,guardianPersonId:guardian.personId,
    classEnrollmentId:enrollment.id,courseAttemptId:attempt.id,
    approvalRequestId:approval.id,consentVersion:terms.consentVersion,consentSha256};
   await writeCanonicalAudit(tx,{actorPersonId:guardian.personId,
    owningOrganizationId:current.operatingOrganizationId,
    eventCode:"class.guardian_approval.accepted",entityKind:"class_enrollment",
    entityId:enrollment.id,payload});
   await emitCanonicalDomainEvent(tx,{actorPersonId:guardian.personId,
    eventType:"ClassGuardianEnrollmentCreated",aggregateType:"class_enrollment",
    aggregateId:enrollment.id,payload});
   return {classEnrollmentId:enrollment.id,courseAttemptId:attempt.id};
}
 });

/** Guardian withdrawal requires current consent authority and preserves
 * all historic Course work, attendance, evidence, and reporting attribution.
 */
export const withdrawMyGuardianNativeClassEnrollmentInput=withdrawSchema;
export async function withdrawMyGuardianNativeClassEnrollmentService(request:Request,raw:unknown=undefined){
 const data=parseCommandInput(withdrawMyGuardianNativeClassEnrollmentInput,raw);

  const now=new Date(),guardian=await requireNativeGuardian(request,now);
  return db.transaction(async tx=>{
   await assertCurrentNativeGuardianSession(tx,request,guardian.personId,new Date());
   const [locator]=await tx.select({classId:canonicalClassEnrollments.classId})
    .from(canonicalClassEnrollments)
    .where(eq(canonicalClassEnrollments.id,data.classEnrollmentId)).limit(1);
   if(!locator)throw new AuthorizationError("existing minor Class Enrollment");
   const [cls]=await tx.select().from(canonicalClasses)
    .where(eq(canonicalClasses.id,locator.classId)).for("update").limit(1);
   if(!cls)throw new AuthorizationError("existing Class");
   const [enrollment]=await tx.select().from(canonicalClassEnrollments)
    .where(and(eq(canonicalClassEnrollments.id,data.classEnrollmentId),
      eq(canonicalClassEnrollments.classId,cls.id))).for("update").limit(1);
   if(!enrollment)throw new AuthorizationError("minor participation");
   await requireNativeGuardianChild(tx,guardian.personId,enrollment.learnerPersonId,new Date());
   if(enrollment.enrollmentMethod!=="approval"||
      enrollment.enrolledByPersonId!==guardian.personId)
    throw new AuthorizationError("guardian-managed canonical Class participation");
   if(enrollment.status==="withdrawn")return {alreadyWithdrawn:true};
   if(enrollment.status!=="active"||!enrollment.courseAttemptId||
      cls.state!=="active")
    throw new AuthorizationError("currently active Class participation");
   await withdrawNativeClassAttempts(tx,enrollment,cls);
   await tx.update(canonicalClassEnrollments).set({status:"withdrawn"})
    .where(eq(canonicalClassEnrollments.id,enrollment.id));
   const payload={classId:cls.id,classEnrollmentId:enrollment.id,
    learnerPersonId:enrollment.learnerPersonId,guardianPersonId:guardian.personId,
    reason:"guardian_requested"};
   await writeCanonicalAudit(tx,{actorPersonId:guardian.personId,
    owningOrganizationId:cls.operatingOrganizationId,
    eventCode:"class.guardian_enrollment.withdrawn",entityKind:"class_enrollment",
    entityId:enrollment.id,payload});
   await emitCanonicalDomainEvent(tx,{actorPersonId:guardian.personId,
    eventType:"ClassEnrollmentWithdrawn",aggregateType:"class_enrollment",
    aggregateId:enrollment.id,payload});
   return {alreadyWithdrawn:false};
}
 });

/** Guardian-visible Class history is always scoped to their originally
 * approved minor enrollment AND a still-current verified relationship.
 */
export async function getMyNativeGuardianClassEnrollmentsService(request:Request,raw:unknown=undefined){


  const now=new Date();
  const guardian=await requireNativeGuardian(request,now);
  return db.transaction(async tx=>{
   await assertCurrentNativeGuardianSession(tx,request,guardian.personId,new Date());
   const rows=await tx.select({
    classEnrollmentId:canonicalClassEnrollments.id,
    classId:canonicalClassEnrollments.classId,
    learnerPersonId:canonicalClassEnrollments.learnerPersonId,
    status:canonicalClassEnrollments.status,
    title:canonicalClasses.title,
   }).from(canonicalClassEnrollments)
    .innerJoin(canonicalClasses,eq(canonicalClasses.id,canonicalClassEnrollments.classId))
    .where(and(
      eq(canonicalClassEnrollments.enrolledByPersonId,guardian.personId),
      eq(canonicalClassEnrollments.enrollmentMethod,"approval"),
    )).orderBy(desc(canonicalClassEnrollments.enrolledAt)).limit(100);
   const results=[];
   for(const row of rows){
    try{
     await requireNativeGuardianChild(tx,guardian.personId,row.learnerPersonId,now);
     results.push(row);
    }catch(e){if(!(e instanceof AuthorizationError))throw e;}
   }
   return results;
}
 });

/** Family Home reuses the same independently authorized community read model.
 * No academic, health, or school attendance permission is inferred from
 * enrollment consent. A failed source is not an empty family. */
export async function getGuardianCommunitySummaryService(request:Request,raw:unknown=undefined){


  
  const [learners,requests,enrollments]=await Promise.all([
   getMyNativeGuardianLearnersService(request),getMyNativeGuardianClassApprovalsService(request),
   getMyNativeGuardianClassEnrollmentsService(request),
  ]);
  const authorized=new Set(learners.map(row=>row.learnerPersonId));
  return {
   learners,
   approvals:requests.filter(row=>authorized.has(row.learnerPersonId)).map(row=>({
    approvalRequestId:row.approvalRequestId,learnerPersonId:row.learnerPersonId,
    classTitle:row.classTitle,state:row.state,acceptedEnrollmentId:row.acceptedEnrollmentId,
   })),
   enrollments:enrollments.filter(row=>authorized.has(row.learnerPersonId)),
  };
}
