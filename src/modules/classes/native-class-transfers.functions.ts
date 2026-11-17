import {createHash} from "node:crypto";
import {createServerFn} from "@tanstack/react-start";
import {getRequest,setResponseHeader} from "@tanstack/react-start/server";
import {and,asc,count,eq,inArray} from "drizzle-orm";
import {z} from "zod";
import {db} from "@/db/client";
import {
 auditEvents,domainEvents,canonicalClasses,canonicalClassEnrollments,
 canonicalClassOfferingVersions,canonicalClassOfferings,
 canonicalClassEnrollmentTransferRequests,canonicalPersons,
 learnerCourseAttempts,participationAttributions,
} from "@/db/canonical-v301";
import {AuthorizationError,assertCapability} from "@/domain/command-context";
import {getCanonicalCommandContext} from "@/modules/identity/canonical-command-context.server";
import {assertCurrentNativeClassLearnerForMutation} from "./native-class-learner-session.server";
import {currentClassAuthority} from "./native-class-authority.server";
import {verifiedAdultOn,assertNativeSelfEnrollmentEligible} from "@/domain/native-class-enrollment";
import {NATIVE_SELF_TRANSFER_CREDIT_MODES} from "@/domain/native-class-transfer-choices";
import {
 assertNativeClassSeatAvailable,assertNativeClassAttemptForExit,
 assertOperationalClassOfferingTerms,assertNativeClassRepeatEligible,
} from "@/domain/native-class-lifecycle";

const uuid=z.string().uuid();
const input=z.object({
 sourceClassEnrollmentId:uuid,
 targetClassOfferingVersionId:uuid,
 creditMode:z.enum(NATIVE_SELF_TRANSFER_CREDIT_MODES),
 adultAttested:z.literal(true),
 consentAccepted:z.literal(true),
 requestId:uuid,
}).strict();
function guard(){
 setResponseHeader("Cache-Control","private, no-store");
 setResponseHeader("Referrer-Policy","no-referrer");
}

/** Adult self-transfer to a published public Class with self-enrollment.
 *
 * One transaction locks both Classes in UUID order, checks current source and
 * destination authority, withdraws old Course Attempt before source enrollment,
 * creates a fresh destination Enrollment/Attempt, and atomically records the
 * transfer. Never rewrites the source history or creates a second seat pool.
 *
 * Approval-required destinations and youth/guardian transfers must use their
 * separately governed methods; this endpoint denies them rather than bypassing
 * their independent eligibility and consent decisions.
 */
export const transferMyNativeClassEnrollment=createServerFn({method:"POST"})
 .validator((v:unknown)=>input.parse(v))
 .handler(async({data})=>{
  guard();
  const request=getRequest();
  const actor=await getCanonicalCommandContext(request);
  if(!actor.actorPersonId||actor.role!=="learner")
   throw new AuthorizationError("current canonical adult learner");
  assertCapability(actor,"learning.participate");
  return db.transaction(async tx=>{
   const [sourceLocator]=await tx.select({
    classId:canonicalClassEnrollments.classId,
   }).from(canonicalClassEnrollments)
     .where(eq(canonicalClassEnrollments.id,data.sourceClassEnrollmentId)).limit(1);
   const [destinationLocator]=await tx.select({
    classId:canonicalClassOfferingVersions.classId,
   }).from(canonicalClassOfferingVersions)
     .where(eq(canonicalClassOfferingVersions.id,data.targetClassOfferingVersionId)).limit(1);
   if(!sourceLocator||!destinationLocator||
      sourceLocator.classId===destinationLocator.classId)
     throw new AuthorizationError("distinct existing source and destination Classes");

   // Same globally ordered locking for reciprocal or simultaneous transfers.
   const classIds=[sourceLocator.classId,destinationLocator.classId].sort();
   const locked=await tx.select().from(canonicalClasses)
     .where(inArray(canonicalClasses.id,classIds))
     .orderBy(asc(canonicalClasses.id)).for("update");
   if(locked.length!==2)throw new AuthorizationError("both current Classes");
   const sourceClass=locked.find(c=>c.id===sourceLocator.classId)!;
   const destinationClass=locked.find(c=>c.id===destinationLocator.classId)!;
   const [previous]=await tx.select().from(canonicalClassEnrollmentTransferRequests)
    .where(and(
      eq(canonicalClassEnrollmentTransferRequests.sourceEnrollmentId,data.sourceClassEnrollmentId),
      eq(canonicalClassEnrollmentTransferRequests.requestId,data.requestId),
    )).limit(1);
   if(previous){
    if(previous.targetClassId!==destinationClass.id||
       previous.targetOfferingVersionId!==data.targetClassOfferingVersionId||
       previous.learnerPersonId!==actor.actorPersonId||
       previous.state!=="approved"||!previous.destinationEnrollmentId)
      throw new AuthorizationError("conflicting or incomplete transfer replay");
    return {sourceEnrollmentId:data.sourceClassEnrollmentId,
      destinationEnrollmentId:previous.destinationEnrollmentId,alreadyTransferred:true};
   }

   const [source]=await tx.select().from(canonicalClassEnrollments)
    .where(and(eq(canonicalClassEnrollments.id,data.sourceClassEnrollmentId),
      eq(canonicalClassEnrollments.classId,sourceClass.id))).for("update").limit(1);
   if(!source||source.learnerPersonId!==actor.actorPersonId||
      source.status!=="active"||!source.courseAttemptId)
    throw new AuthorizationError("own active source Class participation");
   const now=new Date();
   const [person]=await tx.select({birthDate:canonicalPersons.birthDate})
    .from(canonicalPersons).where(eq(canonicalPersons.id,actor.actorPersonId)).limit(1);
   if(!verifiedAdultOn(person?.birthDate,now))
    throw new AuthorizationError("verified adult self-transfer only");
   const sourceAuthority=await currentClassAuthority(tx,sourceClass.id,now);
   const destinationAuthority=await currentClassAuthority(tx,destinationClass.id,now);
   if(sourceAuthority.classState!=="active"||!sourceAuthority.siteId||
      destinationAuthority.classState!=="active"||!destinationAuthority.siteId)
    throw new AuthorizationError("active source and destination Class Sites");

   const [terms]=await tx.select().from(canonicalClassOfferingVersions)
    .where(and(eq(canonicalClassOfferingVersions.id,data.targetClassOfferingVersionId),
      eq(canonicalClassOfferingVersions.classId,destinationClass.id)))
    .for("update").limit(1);
   if(!terms)throw new AuthorizationError("current destination Offering version");
   const [offering]=await tx.select({id:canonicalClassOfferings.id})
    .from(canonicalClassOfferings).where(and(
      eq(canonicalClassOfferings.id,terms.classOfferingId),
      eq(canonicalClassOfferings.classId,destinationClass.id),
    )).limit(1);
   if(!offering)throw new AuthorizationError("destination Offering belongs to Class");
   assertOperationalClassOfferingTerms(terms);
   assertNativeSelfEnrollmentEligible({
    classState:destinationAuthority.classState,offeringState:terms.state,
    terms:{visibility:terms.visibility,enrollmentMethods:terms.enrollmentMethods,
      opensAt:terms.opensAt,closesAt:terms.closesAt},
    adultVerified:true,adultAttested:data.adultAttested,
    consentAccepted:data.consentAccepted,
    consentVersion:terms.consentVersion,consentText:terms.consentText,
   },now);
   if(!terms.allowedCreditModes.includes(data.creditMode))
    throw new AuthorizationError("destination participation mode");
   await assertCurrentNativeClassLearnerForMutation(tx,request,actor);

   const [already]=await tx.select({id:canonicalClassEnrollments.id})
    .from(canonicalClassEnrollments).where(and(
      eq(canonicalClassEnrollments.classId,destinationClass.id),
      eq(canonicalClassEnrollments.learnerPersonId,actor.actorPersonId),
      inArray(canonicalClassEnrollments.status,["pending","active"]),
    )).limit(1);
   if(already)throw new AuthorizationError("destination already has open participation");
   const [completed]=await tx.select({id:canonicalClassEnrollments.id})
    .from(canonicalClassEnrollments).where(and(
      eq(canonicalClassEnrollments.classId,destinationClass.id),
      eq(canonicalClassEnrollments.learnerPersonId,actor.actorPersonId),
      eq(canonicalClassEnrollments.status,"completed"),
    )).limit(1);
   assertNativeClassRepeatEligible(completed?["completed"]:[]);
   const [occupancy]=await tx.select({total:count()}).from(canonicalClassEnrollments)
    .where(and(eq(canonicalClassEnrollments.classId,destinationClass.id),
      inArray(canonicalClassEnrollments.status,["pending","active"])));
   assertNativeClassSeatAvailable({
    method:"self",activeOrPending:occupancy?.total??0,
    classCapacity:destinationAuthority.classCapacity,offeringCapacity:terms.capacity,
   });
   const attempts=await tx.select().from(learnerCourseAttempts)
    .where(eq(learnerCourseAttempts.classEnrollmentId,source.id))
    .for("update");
   const selected=attempts.find(a=>a.id===source.courseAttemptId);
   if(!selected)throw new AuthorizationError("source Course Attempt pointer");
   assertNativeClassAttemptForExit({
    attempt:selected,enrollment:source,classInstance:sourceClass,
   });
   const live=attempts.filter(a=>a.status==="active");
   for(const attempt of live){
    assertNativeClassAttemptForExit({
      attempt,enrollment:source,classInstance:sourceClass,requireSelectedPointer:false,
    });
   }
   const consentSha256=createHash("sha256")
    .update(terms.consentVersion!).update("\u0000").update(terms.consentText!)
    .digest("hex");

   // Source Attempt changes precede its source Enrollment state change because
   // the canonical DB trigger insists the parent remains active during exit.
   for(const attempt of live){
    await tx.update(learnerCourseAttempts).set({status:"withdrawn"})
      .where(eq(learnerCourseAttempts.id,attempt.id));
   }
   await tx.update(canonicalClassEnrollments).set({status:"withdrawn"})
    .where(eq(canonicalClassEnrollments.id,source.id));
   const [destination]=await tx.insert(canonicalClassEnrollments).values({
    classId:destinationClass.id,classOfferingVersionId:terms.id,
    learnerPersonId:actor.actorPersonId,enrolledByPersonId:actor.actorPersonId,
    enrollmentMethod:"self",creditMode:data.creditMode,status:"active",
    consentVersion:terms.consentVersion,consentSha256,consentedAt:now,
   }).returning({id:canonicalClassEnrollments.id});
   if(!destination)throw new Error("destination Class Enrollment not saved");
   await tx.insert(participationAttributions).values({
    classEnrollmentId:destination.id,
    deliverySiteId:destinationAuthority.siteId,
    reportingSiteId:destinationAuthority.siteId,
    creditedOrganizationId:destinationAuthority.operatingOrganizationId,
    attributionBasis:"provider_default",
    relationshipSnapshot:{kind:"provider_default",classId:destinationClass.id,
      organizationId:destinationAuthority.operatingOrganizationId,
      siteId:destinationAuthority.siteId},
   });
   const [attempt]=await tx.insert(learnerCourseAttempts).values({
    classEnrollmentId:destination.id,enrollmentId:null,
    noncreditRegistrationId:null,sectionId:null,
    deploymentId:destinationAuthority.deploymentId,
    adoptionId:destinationAuthority.adoptionId,
    offeringVersionId:destinationAuthority.offeringVersionId,
    courseVersionId:destinationAuthority.courseVersionId,
    attemptNo:1,status:"active",
   }).returning({id:learnerCourseAttempts.id});
   if(!attempt)throw new Error("destination Course Attempt not saved");
   await tx.update(canonicalClassEnrollments).set({courseAttemptId:attempt.id})
    .where(eq(canonicalClassEnrollments.id,destination.id));
   const [transfer]=await tx.insert(canonicalClassEnrollmentTransferRequests).values({
    sourceEnrollmentId:source.id,targetClassId:destinationClass.id,
    targetOfferingVersionId:terms.id,learnerPersonId:actor.actorPersonId,
    requestedByPersonId:actor.actorPersonId,requestId:data.requestId,
    state:"approved",requestedAt:now,
    expiresAt:new Date(now.getTime()+60*60*1000),
    approvedByPersonId:actor.actorPersonId,decidedAt:now,
    updatedConsentVersion:terms.consentVersion,updatedConsentSha256:consentSha256,
    sourceClosedAt:now,destinationEnrollmentId:destination.id,
   }).returning({id:canonicalClassEnrollmentTransferRequests.id});
   if(!transfer)throw new Error("transfer intent not saved");
   const payload={sourceClassId:sourceClass.id,destinationClassId:destinationClass.id,
    sourceEnrollmentId:source.id,destinationEnrollmentId:destination.id,
    sourceAttemptIdsClosed:live.map(x=>x.id),destinationCourseAttemptId:attempt.id,
    sourceSiteId:sourceAuthority.siteId,destinationSiteId:destinationAuthority.siteId,
    consentVersion:terms.consentVersion,consentSha256};
   await tx.insert(auditEvents).values({actorPersonId:actor.actorPersonId,
    owningOrganizationId:sourceClass.operatingOrganizationId,
    eventCode:"class.enrollment.transferred",entityKind:"class_enrollment_transfer",
    entityId:transfer.id,payload});
   await tx.insert(domainEvents).values({actorPersonId:actor.actorPersonId,
    eventType:"ClassEnrollmentTransferred",aggregateType:"class_enrollment_transfer",
    aggregateId:transfer.id,payload});
   return {sourceEnrollmentId:source.id,
    destinationEnrollmentId:destination.id,alreadyTransferred:false};
  });
 });
