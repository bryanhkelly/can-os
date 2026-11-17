import { createHash } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { and, asc, count, desc, eq, gt, ilike, inArray, isNotNull, isNull, lt, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  auditEvents, domainEvents, canonicalClasses, canonicalClassOfferings,
  canonicalClassOfferingVersions, canonicalClassEnrollments, canonicalPersons,
  canonicalClassOutcomes, canonicalClassAwards,
  canonicalClassEnrollmentInvitations,
  learnerCourseAttempts, courseVersions, courses, offeringVersions, offerings,
  programDeployments, deploymentOfferingAdoptions, educationOperations,
  educationOperationSites, classroomDeploymentSites, catalogSites, siteOrganizationRoles,
  educationOperationOrganizationRoles,
  canonicalOfferingCourses, participationAttributions, networkMemberships,
} from "@/db/canonical-v301";
import { AuthorizationError, assertCapability } from "@/domain/command-context";
import { assertNativeSelfEnrollmentEligible, verifiedAdultOn } from "@/domain/native-class-enrollment";
import {
  assertNativeClassRepeatEligible, assertOperationalClassOfferingTerms,
  assertNativeClassSeatAvailable,
} from "@/domain/native-class-lifecycle";
import { currentClassAuthority } from "./native-class-authority.server";
import { classCreditModeSchema } from "@/domain/unified-class";
import { getCanonicalCommandContext } from "@/modules/identity/canonical-command-context.server";
import { assertCurrentNativeClassLearnerForMutation } from "./native-class-learner-session.server";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
const uuid=z.string().uuid();
const selfInput=z.object({
  classOfferingVersionId:uuid,
  creditMode:classCreditModeSchema,
  adultAttested:z.literal(true),
  consentAccepted:z.literal(true),
  invitationId:uuid.optional(),
  networkMembershipId:z.string().uuid().optional(),
}).strict();
function guard(){
  setResponseHeader("Cache-Control","private, no-store");
  setResponseHeader("Referrer-Policy","no-referrer");
}
async function requireLearner(){
  const request=getRequest();
  const actor=await getCanonicalCommandContext(request);
  if(!actor.actorPersonId || actor.role!=="learner")
    throw new AuthorizationError("verified canonical learner Person");
  assertCapability(actor,"learning.participate");
  return {learnerPersonId:actor.actorPersonId,actor,request};
}

/** A live Class is permitted only while publisher/adoption/deployment and
 * its authorized Site are current, regardless of catalog visibility. */

/** The public catalog never discloses unlisted/private Class Offerings. */
export const getNativePublicClassCatalog=createServerFn({method:"GET"})
  .handler(async()=>{
    guard();
    const now=new Date();
    const rows=await db.select({
      classId:canonicalClasses.id,classTitle:canonicalClasses.title,
      courseVersionId:canonicalClasses.courseVersionId,
      deliveryMode:canonicalClasses.deliveryMode,
      siteId:canonicalClasses.siteId,
      classOfferingVersionId:canonicalClassOfferingVersions.id,
      enrollmentMethods:canonicalClassOfferingVersions.enrollmentMethods,
      opensAt:canonicalClassOfferingVersions.opensAt,
      closesAt:canonicalClassOfferingVersions.closesAt,
      capacity:canonicalClassOfferingVersions.capacity,
      allowedCreditModes:canonicalClassOfferingVersions.allowedCreditModes,
      consentText:canonicalClassOfferingVersions.consentText,
    }).from(canonicalClassOfferingVersions)
      .innerJoin(canonicalClasses,eq(canonicalClasses.id,canonicalClassOfferingVersions.classId))
      .where(and(
        eq(canonicalClassOfferingVersions.state,"published"),
        eq(canonicalClassOfferingVersions.visibility,"public"),
        eq(canonicalClasses.state,"active"),
        or(isNull(canonicalClassOfferingVersions.opensAt),lte(canonicalClassOfferingVersions.opensAt,now)),
        or(isNull(canonicalClassOfferingVersions.closesAt),gt(canonicalClassOfferingVersions.closesAt,now)),
      )).orderBy(asc(canonicalClasses.title)).limit(100);
    const allowed=[];
    for(const row of rows){
      try{
        // Previously published, unsupported methods remain invisible until
        // fully authorized invitation/approval commands are delivered.
        assertOperationalClassOfferingTerms(row);
        const {authority,openSeats}=await db.transaction(async tx=>{
          const authority=await currentClassAuthority(tx,row.classId,now);
          const [occupancy]=await tx.select({total:count()})
            .from(canonicalClassEnrollments).where(and(
              eq(canonicalClassEnrollments.classId,row.classId),
              inArray(canonicalClassEnrollments.status,["pending","active"]),
            ));
          return {authority,openSeats:occupancy?.total??0};
        });
        // All enrollment methods share one occupied-seat count. The optional
        // publication limit narrows only self-registration, not assignment.
        const limits=[row.capacity,authority.classCapacity]
          .filter((n):n is number=>n!==null);
        const capacity=limits.length?Math.min(...limits):null;
        allowed.push({...row,capacity,
          remainingSeats:capacity===null?null:Math.max(0,capacity-openSeats)});
      }catch(e){if(!(e instanceof AuthorizationError))throw e;}
    }
    return allowed;
  });

const nativeCatalogPageInput=z.object({
  search:z.string().trim().max(100).default(""),
  classId:uuid.optional(),
  cursor:z.object({title:z.string().min(1).max(200),classId:uuid}).strict().nullable().default(null),
}).strict();

/** Keyset-paginated public discovery: never expose a private/unlisted Class.
 * Authorization is checked on every candidate. A page can be sparse when
 * adoption or Site authority was revoked; the cursor still advances.
 * Server-side search and pagination avoid the legacy first-100 ceiling.
 */
export const getNativePublicClassCatalogPage=createServerFn({method:"GET"})
  .validator((raw:unknown)=>nativeCatalogPageInput.parse(raw))
  .handler(async({data})=>{
    guard();
    const now=new Date();
    const escaped=data.search.replace(/[\\%_]/g,character=>"\\"+character);
    return db.transaction(async tx=>{
      const rows=await tx.select({
        classId:canonicalClasses.id,classTitle:canonicalClasses.title,
        courseVersionId:canonicalClasses.courseVersionId,
        deliveryMode:canonicalClasses.deliveryMode,siteId:canonicalClasses.siteId,
        classOfferingVersionId:canonicalClassOfferingVersions.id,
        enrollmentMethods:canonicalClassOfferingVersions.enrollmentMethods,
        opensAt:canonicalClassOfferingVersions.opensAt,
        closesAt:canonicalClassOfferingVersions.closesAt,
        capacity:canonicalClassOfferingVersions.capacity,
        allowedCreditModes:canonicalClassOfferingVersions.allowedCreditModes,
        consentText:canonicalClassOfferingVersions.consentText,
      }).from(canonicalClassOfferingVersions)
        .innerJoin(canonicalClasses,eq(canonicalClasses.id,canonicalClassOfferingVersions.classId))
        .where(and(
          eq(canonicalClassOfferingVersions.state,"published"),
          eq(canonicalClassOfferingVersions.visibility,"public"),
          eq(canonicalClasses.state,"active"),
          data.classId?eq(canonicalClasses.id,data.classId):undefined,
          or(isNull(canonicalClassOfferingVersions.opensAt),lte(canonicalClassOfferingVersions.opensAt,now)),
          or(isNull(canonicalClassOfferingVersions.closesAt),gt(canonicalClassOfferingVersions.closesAt,now)),
          data.search?ilike(canonicalClasses.title,"%"+escaped+"%"):undefined,
          data.cursor?or(
            gt(canonicalClasses.title,data.cursor.title),
            and(eq(canonicalClasses.title,data.cursor.title),
              gt(canonicalClasses.id,data.cursor.classId)),
          ):undefined,
        )).orderBy(asc(canonicalClasses.title),asc(canonicalClasses.id)).limit(25);
      const page=rows.slice(0,24);
      const items=[];
      for(const row of page){
        try{
          assertOperationalClassOfferingTerms(row);
          const authority=await currentClassAuthority(tx,row.classId,now);
          const [occupancy]=await tx.select({total:count()})
            .from(canonicalClassEnrollments).where(and(
              eq(canonicalClassEnrollments.classId,row.classId),
              inArray(canonicalClassEnrollments.status,["pending","active"]),
            ));
          const limits=[row.capacity,authority.classCapacity]
            .filter((n):n is number=>n!==null);
          const capacity=limits.length?Math.min(...limits):null;
          items.push({...row,capacity,
            remainingSeats:capacity===null?null:
              Math.max(0,capacity-(occupancy?.total??0))});
        }catch(error){
          if(!(error instanceof AuthorizationError))throw error;
        }
      }
      const last=page[page.length-1];
      return {items,nextCursor:rows.length>24&&last?
        {title:last.classTitle,classId:last.classId}:null};
    });
  });

/** Transactionally creates one Class Enrollment and one canonical Course Attempt.
 * This entry point is adult self-enrollment only. Guardian, assignment, approval
 * and invitation require their own verified authorization commands. */
export const enrollInNativeClass=createServerFn({method:"POST"})
  .validator((raw:unknown)=>selfInput.parse(raw))
  .handler(async({data})=>{
    guard();const {learnerPersonId,actor,request}=await requireLearner();
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
      }else{
        assertNativeSelfEnrollmentEligible({
          classState:current.classState,offeringState:version.state,
          terms:{visibility:version.visibility,enrollmentMethods:version.enrollmentMethods,
            opensAt:version.opensAt,closesAt:version.closesAt},
          adultVerified:verifiedAdultOn(person?.birthDate,now),
          adultAttested:data.adultAttested,consentAccepted:data.consentAccepted,
          consentVersion:version.consentVersion,consentText:version.consentText,
        },now);
      }
      const previous=await tx.select({
        id:canonicalClassEnrollments.id,status:canonicalClassEnrollments.status,
        creditMode:canonicalClassEnrollments.creditMode,
        courseAttemptId:canonicalClassEnrollments.courseAttemptId,
      }).from(canonicalClassEnrollments).where(and(
        eq(canonicalClassEnrollments.classId,instance.id),
        eq(canonicalClassEnrollments.learnerPersonId,learnerPersonId),
        inArray(canonicalClassEnrollments.status,["pending","active"]),
      )).limit(2);
      if(previous.length>1)
        throw new AuthorizationError("duplicate open Class enrollments require reconciliation");
      const existing=previous[0];
      if(existing){
        if(existing.creditMode!==data.creditMode || !existing.courseAttemptId)
          throw new AuthorizationError("existing enrollment requires governed modification");
        return {classEnrollmentId:existing.id,courseAttemptId:existing.courseAttemptId,alreadyEnrolled:true};
      }
      // A bounded recent-history query is not sufficient for completed
      // participants who later withdrew multiple times. Check the complete
      // completion history via its indexed status predicate.
      const [completed]=await tx.select({id:canonicalClassEnrollments.id})
        .from(canonicalClassEnrollments).where(and(
          eq(canonicalClassEnrollments.classId,instance.id),
          eq(canonicalClassEnrollments.learnerPersonId,learnerPersonId),
          eq(canonicalClassEnrollments.status,"completed"),
        )).limit(1);
      assertNativeClassRepeatEligible(completed?["completed"]:[]);
      const [occupancy]=await tx.select({total:count()}).from(canonicalClassEnrollments)
        .where(and(eq(canonicalClassEnrollments.classId,instance.id),
          inArray(canonicalClassEnrollments.status,["pending","active"])));
      assertOperationalClassOfferingTerms(version);
      if(!version.allowedCreditModes.includes(data.creditMode))
        throw new AuthorizationError("allowed learner credit/audit participation mode");
      assertNativeClassSeatAvailable({method:invitation?"invitation":"self",
        activeOrPending:occupancy?.total??0,
        classCapacity:current.classCapacity,offeringCapacity:version.capacity});
      // Revocation between preflight and insertion must fail inside the same
      // transaction as the seat change, including cross-provider public Classes.
      await assertCurrentNativeClassLearnerForMutation(tx,request,actor);
      const consentSha256=createHash("sha256")
        .update(version.consentVersion!).update("\u0000").update(version.consentText!)
        .digest("hex");
      const [enrollment]=await tx.insert(canonicalClassEnrollments).values({
        classId:instance.id,classOfferingVersionId:version.id,
        learnerPersonId,enrolledByPersonId:learnerPersonId,
        enrollmentMethod:invitation?"invitation":"self",creditMode:data.creditMode,status:"active",
        consentVersion:version.consentVersion,consentSha256,consentedAt:now,
      }).returning({id:canonicalClassEnrollments.id});
      if(!enrollment)throw new Error("Class Enrollment insert failed");
      const [selectedMembership]=data.networkMembershipId
        ?await tx.select({
          id:networkMemberships.id,
          memberOrganizationId:networkMemberships.memberOrganizationId,
        }).from(networkMemberships).where(and(
          eq(networkMemberships.id,data.networkMembershipId),
          eq(networkMemberships.status,"approved"),
          eq(networkMemberships.directoryVisible,true),
          eq(networkMemberships.networkOrganizationId,current.operatingOrganizationId),
          lte(networkMemberships.validFrom,now),
          or(isNull(networkMemberships.validThrough),gt(networkMemberships.validThrough,now)),
        )).limit(1):[];
      if(data.networkMembershipId&&!selectedMembership)
        throw new AuthorizationError("approved directory-visible network affiliate");
      await tx.insert(participationAttributions).values({
        classEnrollmentId:enrollment.id,
        deliverySiteId:current.siteId,reportingSiteId:current.siteId,
        creditedOrganizationId:selectedMembership?.memberOrganizationId??
          current.operatingOrganizationId,
        networkMembershipId:selectedMembership?.id??null,
        attributionBasis:selectedMembership?"self_reported":"provider_default",
        relationshipSnapshot:selectedMembership?{}:{
          kind:"provider_default",classId:instance.id,
          organizationId:current.operatingOrganizationId,siteId:current.siteId},
      });
      const [attempt]=await tx.insert(learnerCourseAttempts).values({
        classEnrollmentId:enrollment.id,enrollmentId:null,noncreditRegistrationId:null,
        deploymentId:current.deploymentId,adoptionId:current.adoptionId,
        offeringVersionId:current.offeringVersionId,
        courseVersionId:current.courseVersionId,sectionId:null,
        attemptNo:1,status:"active",
      }).returning({id:learnerCourseAttempts.id});
      if(!attempt)throw new Error("Course Attempt insert failed");
      await tx.update(canonicalClassEnrollments).set({courseAttemptId:attempt.id})
        .where(eq(canonicalClassEnrollments.id,enrollment.id));
      if(invitation){
        await tx.update(canonicalClassEnrollmentInvitations).set({
          state:"accepted",respondedAt:now,acceptedEnrollmentId:enrollment.id,
        }).where(and(
          eq(canonicalClassEnrollmentInvitations.id,invitation.id),
          eq(canonicalClassEnrollmentInvitations.state,"pending"),
        ));
        await tx.insert(domainEvents).values({
          eventType:"ClassInvitationAccepted",aggregateType:"class_invitation",
          aggregateId:invitation.id,actorPersonId:learnerPersonId,
          payload:{classId:instance.id,classEnrollmentId:enrollment.id,
            classOfferingVersionId:version.id,siteId:current.siteId,
            acceptedAt:now.toISOString()},
        });
      }
      await tx.insert(auditEvents).values({
        actorPersonId:learnerPersonId,owningOrganizationId:current.operatingOrganizationId,
        eventCode:"class.enrollment.created",entityKind:"class_enrollment",entityId:enrollment.id,
        payload:{classId:instance.id,classOfferingVersionId:version.id,
          courseAttemptId:attempt.id,method:invitation?"invitation":"self",creditMode:data.creditMode,
          invitationId:invitation?.id??null,
          consentVersion:version.consentVersion,consentSha256},
      });
      await tx.insert(domainEvents).values({
        eventType:"ClassEnrollmentCreated",aggregateType:"class_enrollment",
        aggregateId:enrollment.id,actorPersonId:learnerPersonId,
        payload:{classId:instance.id,courseAttemptId:attempt.id},
      });
      return {classEnrollmentId:enrollment.id,courseAttemptId:attempt.id,alreadyEnrolled:false};
    });
  });

export const getMyNativeClassEnrollments=createServerFn({method:"GET"})
  .handler(async()=>{
    guard();const {learnerPersonId}=await requireLearner();
    return db.select({
      classEnrollmentId:canonicalClassEnrollments.id,classId:canonicalClasses.id,
      title:canonicalClasses.title,deliveryMode:canonicalClasses.deliveryMode,
      creditMode:canonicalClassEnrollments.creditMode,
      status:canonicalClassEnrollments.status,
      courseAttemptId:canonicalClassEnrollments.courseAttemptId,
      enrolledAt:canonicalClassEnrollments.enrolledAt,
      siteId:canonicalClasses.siteId,
    }).from(canonicalClassEnrollments)
      .innerJoin(canonicalClasses,eq(canonicalClasses.id,canonicalClassEnrollments.classId))
      .where(eq(canonicalClassEnrollments.learnerPersonId,learnerPersonId))
      .orderBy(desc(canonicalClassEnrollments.enrolledAt)).limit(100);
  });


/** Native source history for WS1's single My Activity read model.
 * This is not another participation engine: only existing immutable
 * class_enrollments rows are returned, with strict per-Person scope and
 * keyset pagination so participants never lose older records after 100.
 *
 * WS1 owns the cross-domain projection and final unified UI. Consumers
 * must not infer current lesson access from a historical status row.
 */
const myClassHistoryInput=z.object({
  cursor:z.object({
    enrolledAt:z.string().datetime({offset:true}),
    classEnrollmentId:uuid,
  }).strict().nullable().default(null),
}).strict();

export const getMyNativeClassEnrollmentHistoryPage=createServerFn({method:"GET"})
  .validator((raw:unknown)=>myClassHistoryInput.parse(raw))
  .handler(async({data})=>{
    guard();
    const {learnerPersonId}=await requireLearner();
    // Date objects truncate PostgreSQL microseconds to milliseconds. Using
    // them for a keyset cursor can skip same-millisecond history rows.
    // Cast the validated ISO cursor directly in PostgreSQL instead.
    const older=data.cursor?or(
      sql`${canonicalClassEnrollments.enrolledAt} < ${data.cursor.enrolledAt}::timestamptz`,
      and(sql`${canonicalClassEnrollments.enrolledAt} = ${data.cursor.enrolledAt}::timestamptz`,
        lt(canonicalClassEnrollments.id,data.cursor.classEnrollmentId)),
    ):undefined;
    const rows=await db.select({
      classEnrollmentId:canonicalClassEnrollments.id,
      classId:canonicalClasses.id,
      title:canonicalClasses.title,
      deliveryMode:canonicalClasses.deliveryMode,
      creditMode:canonicalClassEnrollments.creditMode,
      status:canonicalClassEnrollments.status,
      courseAttemptId:canonicalClassEnrollments.courseAttemptId,
      enrolledAt:canonicalClassEnrollments.enrolledAt,
      // Exact UTC microsecond cursor is kept separate from display Date.
      enrolledAtCursor:sql<string>`to_char(${canonicalClassEnrollments.enrolledAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
      siteId:canonicalClasses.siteId,
      enrollmentMethod:canonicalClassEnrollments.enrollmentMethod,
      classOfferingVersionId:canonicalClassEnrollments.classOfferingVersionId,
    }).from(canonicalClassEnrollments)
      .innerJoin(canonicalClasses,
        eq(canonicalClasses.id,canonicalClassEnrollments.classId))
      .where(and(eq(canonicalClassEnrollments.learnerPersonId,learnerPersonId),older))
      .orderBy(desc(canonicalClassEnrollments.enrolledAt),
        desc(canonicalClassEnrollments.id)).limit(51);
    const items=rows.slice(0,50);
    // Preserve original source-bound completion decisions in history, including
    // after a withdrawal. A plain enrollment state is not a credential.
    const enrollmentIds=items.map(item=>item.classEnrollmentId);
    const decisions=enrollmentIds.length?await db.select({
      id:canonicalClassOutcomes.id,
      classEnrollmentId:canonicalClassOutcomes.classEnrollmentId,
      resultCode:canonicalClassOutcomes.resultCode,
      recordedAt:canonicalClassOutcomes.recordedAt,
      supersedesOutcomeId:canonicalClassOutcomes.supersedesOutcomeId,
    }).from(canonicalClassOutcomes).where(and(
      inArray(canonicalClassOutcomes.classEnrollmentId,enrollmentIds),
      eq(canonicalClassOutcomes.outcomeKind,"completion"),
      isNotNull(canonicalClassOutcomes.completionPolicyVersionId),
      isNotNull(canonicalClassOutcomes.completionEvidenceVersionId),
      isNotNull(canonicalClassOutcomes.completionDecidedByPersonId),
    )).orderBy(desc(canonicalClassOutcomes.recordedAt),desc(canonicalClassOutcomes.id))
      .limit(1000):[];
    const superseded=new Set(decisions.flatMap(row=>
      row.supersedesOutcomeId?[row.supersedesOutcomeId]:[]));
    const current=new Map<string,(typeof decisions)[number]>();
    for(const decision of decisions)
      if(!superseded.has(decision.id)&&!current.has(decision.classEnrollmentId))
        current.set(decision.classEnrollmentId,decision);
    const currentIds=[...current.values()].map(row=>row.id);
    const awards=currentIds.length?await db.select({
      classOutcomeId:canonicalClassAwards.classOutcomeId,
      awardKind:canonicalClassAwards.awardKind,
      issuedAt:canonicalClassAwards.issuedAt,
    }).from(canonicalClassAwards).where(and(
      inArray(canonicalClassAwards.classOutcomeId,currentIds),
      isNull(canonicalClassAwards.revokedAt),
    )).orderBy(desc(canonicalClassAwards.issuedAt)).limit(1000):[];
    const awardByOutcome=new Map<string,(typeof awards)[number]>();
    for(const award of awards)if(!awardByOutcome.has(award.classOutcomeId))
      awardByOutcome.set(award.classOutcomeId,award);
    const historic=items.map(item=>{
      const decision=current.get(item.classEnrollmentId);
      const award=decision?awardByOutcome.get(decision.id):undefined;
      return {...item,officialOutcome:decision?{
        referenceId:decision.id,
        label:award
          ?award.awardKind.replaceAll("_"," ")+" issued"
          :"Completion decision: "+decision.resultCode.replaceAll("_"," "),
      }:null};
    });
    const last=items[items.length-1];
    return {items:historic,nextCursor:rows.length>50&&last?{
      enrolledAt:last.enrolledAtCursor,
      classEnrollmentId:last.classEnrollmentId,
    }:null};
  });
