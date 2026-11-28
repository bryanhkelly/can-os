import { nativeClassConsentDigest } from "./native-class-consent.server";
import { and, asc, desc, eq, gt, ilike, inArray, isNotNull, isNull, lt, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { accessAccounts,accessAccountNoncreditPrincipals,
  accessAccountCanonicalPrincipals } from "@/db/schema";
import {getCommandContext} from "@/modules/identity/command-context.server";
import {
  canonicalClasses, canonicalClassOfferings,
  canonicalClassOfferingVersions, canonicalClassEnrollments, canonicalPersons,
  canonicalClassOutcomes, canonicalClassAwards,
  canonicalAccounts, canonicalAccountGrants,
  canonicalEnrollmentSites,
  canonicalClassEnrollmentInvitations,canonicalClassEnrollmentApprovalRequests,
  courseVersions, courses, offeringVersions, offerings,
  programDeployments, deploymentOfferingAdoptions, educationOperations,
  educationOperationSites, classroomDeploymentSites, catalogSites, siteOrganizationRoles,
  educationOperationOrganizationRoles,
  canonicalOfferingCourses, } from "@/db/canonical-v301";
import { AuthorizationError } from "@/domain/command-context";
import { writeCanonicalAudit, emitCanonicalDomainEvent } from "@/platform/canonical-mutation.server";
import { assertNativeSelfEnrollmentEligible, verifiedAdultOn } from "@/domain/native-class-enrollment";
import {
  assertOperationalClassOfferingTerms,
  assertNativeClassSeatAvailable, nativeClassCapacity,
} from "@/domain/native-class-lifecycle";
import { currentClassAuthority } from "./native-class-authority.server";
import {readOpenNativeClassEnrollment,readLatestCompletedNativeClassEnrollment} from "./native-class-enrollment-history.server";
import { readNativeClassOccupancy } from "./native-class-capacity.server";
import { createInitialNativeClassAttempt } from "./native-class-attempt.server";
import {writeNativeClassAttribution} from "./native-class-attribution.server";
import { requireNativeRepeatAuthorization } from "./native-class-repeats.server";
import {consumeNativeClassRepeatAuthorization} from "./native-class-repeat-consumption.server";
import { classCreditModeSchema } from "@/domain/unified-class";
import { studentSiteScope } from "@/domain/student-site-scope";
import { getCanonicalCommandContext } from "@/modules/identity/canonical-command-context.server";
import { resolveAuthorizedLearningPerson } from "@/modules/identity/authorized-learning-person.server";
import { assertCurrentNativeClassLearnerForMutation } from "./native-class-learner-session.server";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
const uuid=z.string().uuid();
export const nativeClassEnrollmentInput=z.object({
  classOfferingVersionId:uuid,
  creditMode:classCreditModeSchema,
  adultAttested:z.literal(true),
  consentAccepted:z.literal(true),
  invitationId:uuid.optional(),
  approvalRequestId:uuid.optional(),
  networkMembershipId:z.string().uuid().optional(),
}).strict();
export async function enrollInNativeClassService(request:Request,raw:unknown){
 const data=nativeClassEnrollmentInput.parse(raw);
 const {actor,personId:learnerPersonId}=await resolveAuthorizedLearningPerson(request,"learning.participate");
    return db.transaction(async tx=>{
      // Resolve the parent Class ID without locking the Offering. Publisher
      // publication/closure also locks Class before Offering; using the same
      // order avoids deadlocks. This first read is only a locator, NEVER the
      // authoritative published terms for a seat-changing decision.
      const [sourceVersion]=await tx.select({
        classId:canonicalClassOfferingVersions.classId,
      }).from(canonicalClassOfferingVersions)
        .where(eq(canonicalClassOfferingVersions.id,data.classOfferingVersionId))
        .limit(1);
      if(!sourceVersion)throw new AuthorizationError("valid Class Offering version");
      const [instance]=await tx.select({id:canonicalClasses.id}).from(canonicalClasses)
        .where(eq(canonicalClasses.id,sourceVersion.classId)).for("update").limit(1);
      if(!instance)throw new AuthorizationError("current Class");
      // Re-read + lock published terms AFTER waiting for the Class lock.
      // Otherwise an Offering closed by the publisher while this request
      // waits could be admitted using its stale pre-lock publication state.
      const [version]=await tx.select().from(canonicalClassOfferingVersions)
        .where(and(eq(canonicalClassOfferingVersions.id,data.classOfferingVersionId),
          eq(canonicalClassOfferingVersions.classId,instance.id)))
        .for("update").limit(1);
      if(!version)throw new AuthorizationError("current Class Offering version");
      // Evaluate temporal eligibility at the actual admission decision time,
      // not before waiting on another transaction's Class/Offering locks.
      const now=new Date();
      const current=await currentClassAuthority(tx,instance.id,now);
      if(!current.siteId)throw new AuthorizationError("Class enrollment requires a Site");
      const [offering]=await tx.select({id:canonicalClassOfferings.id})
        .from(canonicalClassOfferings).where(and(
          eq(canonicalClassOfferings.id,version.classOfferingId),
          eq(canonicalClassOfferings.classId,instance.id),
        )).limit(1);
      if(!offering)throw new AuthorizationError("Class Offering belongs to this Class");
      const [person]=await tx.select({birthDate:canonicalPersons.birthDate})
        .from(canonicalPersons).where(eq(canonicalPersons.id,learnerPersonId)).limit(1);
      const [invitation]=data.invitationId
        ?await tx.select().from(canonicalClassEnrollmentInvitations)
          .where(eq(canonicalClassEnrollmentInvitations.id,data.invitationId))
          .for("update").limit(1):[];
      if(data.invitationId&&data.approvalRequestId)
        throw new AuthorizationError("only one Class admission authority is permitted");
      const [approval]=data.approvalRequestId
        ?await tx.select().from(canonicalClassEnrollmentApprovalRequests)
          .where(eq(canonicalClassEnrollmentApprovalRequests.id,data.approvalRequestId))
          .for("update").limit(1):[];
      if(data.approvalRequestId){
        if(!approval||approval.state!=="approved"||
           approval.expiresAt<=now||approval.acceptedEnrollmentId||
           approval.applicantPersonId!==learnerPersonId||
           approval.learnerPersonId!==learnerPersonId||
           approval.classId!==instance.id||
           approval.classOfferingVersionId!==version.id||
           approval.operatingOrganizationId!==current.operatingOrganizationId||
           approval.siteId!==current.siteId||
           !approval.reviewedByPersonId||
           approval.reviewedByPersonId===learnerPersonId||
           !version.enrollmentMethods.includes("approval")||
           version.state!=="published"||current.classState!=="active"||
           (version.opensAt&&version.opensAt>now)||
           (version.closesAt&&version.closesAt<=now)||
           !verifiedAdultOn(person?.birthDate,now)||
           data.adultAttested!==true||data.consentAccepted!==true||
           !version.consentVersion||!version.consentText)
          throw new AuthorizationError("current independently approved adult Class request");
      }
      if(data.invitationId){
        // The Class is locked before the invitation so that an issuer, a
        // learner and a last-seat registrar cannot deadlock or reuse terms.
        if(!invitation||invitation.state!=="pending"||
          invitation.expiresAt<=now||
          invitation.learnerPersonId!==learnerPersonId||
          invitation.classId!==instance.id||
          invitation.classOfferingVersionId!==version.id||
          invitation.operatingOrganizationId!==current.operatingOrganizationId||
          invitation.siteId!==current.siteId||
          invitation.creditMode!==data.creditMode||
          !version.enrollmentMethods.includes("invitation")||
          version.state!=="published"||
          current.classState!=="active"||
          (version.opensAt&&version.opensAt>now)||
          (version.closesAt&&version.closesAt<=now)||
          !verifiedAdultOn(person?.birthDate,now)||
          !version.consentVersion||!version.consentText)
          throw new AuthorizationError("current exact-Person adult Class invitation");
      }else if(!approval){
        assertNativeSelfEnrollmentEligible({
          classState:current.classState,offeringState:version.state,
          terms:{visibility:version.visibility,enrollmentMethods:version.enrollmentMethods,
            opensAt:version.opensAt,closesAt:version.closesAt},
          adultVerified:verifiedAdultOn(person?.birthDate,now),
          adultAttested:data.adultAttested,consentAccepted:data.consentAccepted,
          consentVersion:version.consentVersion,consentText:version.consentText,
        },now);
      }
      const existing=await readOpenNativeClassEnrollment(tx,instance.id,learnerPersonId);
      if(existing){
        // Idempotent responses are still current privileged learner reads.
        // The native session may have been revoked while this transaction
        // was waiting for the Class/Offering lock.
        await assertCurrentNativeClassLearnerForMutation(tx,request,actor);
        if(existing.creditMode!==data.creditMode || !existing.courseAttemptId)
          throw new AuthorizationError("existing enrollment requires governed modification");
        return {classEnrollmentId:existing.id,courseAttemptId:existing.courseAttemptId,alreadyEnrolled:true};
      }
      // A bounded recent-history query is not sufficient for completed
      // participants who later withdrew multiple times. Check the complete
      // completion history via its indexed status predicate.
      const completed=await readLatestCompletedNativeClassEnrollment(tx,instance.id,learnerPersonId);
      const repeatAuthorization=completed
        ?await requireNativeRepeatAuthorization(tx,instance.id,learnerPersonId,completed.id,now)
        :null;
      const occupancy=await readNativeClassOccupancy(tx,instance.id);
      assertOperationalClassOfferingTerms(version);
      if(!version.allowedCreditModes.includes(data.creditMode))
        throw new AuthorizationError("allowed learner credit/audit participation mode");
      assertNativeClassSeatAvailable({method:invitation?"invitation":approval?"approval":"self",
        activeOrPending:occupancy,
        classCapacity:current.classCapacity,offeringCapacity:version.capacity});
      // Revocation between preflight and insertion must fail inside the same
      // transaction as the seat change, including cross-provider public Classes.
      await assertCurrentNativeClassLearnerForMutation(tx,request,actor);
      const consentSha256=nativeClassConsentDigest(version.consentVersion!,version.consentText!);
      const [enrollment]=await tx.insert(canonicalClassEnrollments).values({
        classId:instance.id,classOfferingVersionId:version.id,
        learnerPersonId,enrolledByPersonId:learnerPersonId,
        enrollmentMethod:invitation?"invitation":approval?"approval":"self",creditMode:data.creditMode,status:"active",
        consentVersion:version.consentVersion,consentSha256,consentedAt:now,
      }).returning({id:canonicalClassEnrollments.id});
      if(!enrollment)throw new Error("Class Enrollment insert failed");
      await writeNativeClassAttribution(tx,{enrollmentId:enrollment.id,source:current,now:now,networkMembershipId:data.networkMembershipId});
      const attempt=await createInitialNativeClassAttempt(tx,enrollment.id,current);
      if(repeatAuthorization){
        await consumeNativeClassRepeatAuthorization(tx,{
          authorizationId:repeatAuthorization.id,classId:instance.id,learnerPersonId:learnerPersonId,
          priorEnrollmentId:completed!.id,classEnrollmentId:enrollment.id,
          courseAttemptId:attempt.id,actorPersonId:learnerPersonId,
        });
      }
      if(approval){
        await tx.update(canonicalClassEnrollmentApprovalRequests).set({
          acceptedEnrollmentId:enrollment.id,
        }).where(and(
          eq(canonicalClassEnrollmentApprovalRequests.id,approval.id),
          eq(canonicalClassEnrollmentApprovalRequests.state,"approved"),
        ));
        await emitCanonicalDomainEvent(tx,{
          eventType:"ClassApprovalAccepted",aggregateType:"class_approval_request",
          aggregateId:approval.id,actorPersonId:learnerPersonId,
          payload:{classId:instance.id,classEnrollmentId:enrollment.id,
            classOfferingVersionId:version.id,siteId:current.siteId},
        });
      }
      if(invitation){
        await tx.update(canonicalClassEnrollmentInvitations).set({
          state:"accepted",respondedAt:now,acceptedEnrollmentId:enrollment.id,
        }).where(and(
          eq(canonicalClassEnrollmentInvitations.id,invitation.id),
          eq(canonicalClassEnrollmentInvitations.state,"pending"),
        ));
        await emitCanonicalDomainEvent(tx,{
          eventType:"ClassInvitationAccepted",aggregateType:"class_invitation",
          aggregateId:invitation.id,actorPersonId:learnerPersonId,
          payload:{classId:instance.id,classEnrollmentId:enrollment.id,
            classOfferingVersionId:version.id,siteId:current.siteId,
            acceptedAt:now.toISOString()},
        });
      }
      await writeCanonicalAudit(tx,{
        actorPersonId:learnerPersonId,owningOrganizationId:current.operatingOrganizationId,
        eventCode:"class.enrollment.created",entityKind:"class_enrollment",entityId:enrollment.id,
        payload:{classId:instance.id,classOfferingVersionId:version.id,
          courseAttemptId:attempt.id,method:invitation?"invitation":approval?"approval":"self",creditMode:data.creditMode,
          invitationId:invitation?.id??null,approvalRequestId:approval?.id??null,
          consentVersion:version.consentVersion,consentSha256},
      });
      await emitCanonicalDomainEvent(tx,{
        eventType:"ClassEnrollmentCreated",aggregateType:"class_enrollment",
        aggregateId:enrollment.id,actorPersonId:learnerPersonId,
        payload:{classId:instance.id,courseAttemptId:attempt.id},
      });
      return {classEnrollmentId:enrollment.id,courseAttemptId:attempt.id,alreadyEnrolled:false};
    });
}
