import { nativeClassConsentDigest } from "./native-class-consent.server";
import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
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
import {nativeClassEnrollmentInput,enrollInNativeClassService} from "./native-class-enrollment-command.server";
export {nativeClassEnrollmentInput} from "./native-class-enrollment-command.server";
function guard(){
  setResponseHeader("Cache-Control","private, no-store");
  setResponseHeader("Referrer-Policy","no-referrer");
}
async function requireLearner(){
  const {actor,personId,request}=await resolveAuthorizedLearningPerson(
    getRequest(),"learning.participate",
  );
  return {learnerPersonId:personId,actor,request};
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
          const occupancy=await readNativeClassOccupancy(tx,row.classId);
          return {authority,openSeats:occupancy};
        });
        // All enrollment methods share one occupied-seat count. The optional
        // publication limit narrows only self-registration, not assignment.
        allowed.push({...row,...nativeClassCapacity({method:"self",activeOrPending:openSeats,
          classCapacity:authority.classCapacity,offeringCapacity:row.capacity})});
      }catch(e){if(!(e instanceof AuthorizationError))throw e;}
    }
    return allowed;
  });

const nativeCatalogPageInput=z.object({
  search:z.string().trim().max(100).default(""),
  classId:uuid.optional(),
  siteId:uuid.optional(),
  deliveryMode:z.enum(["self_paced","scheduled","facilitated","hybrid"]).optional(),
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
          data.siteId?eq(canonicalClasses.siteId,data.siteId):undefined,
          data.deliveryMode?eq(canonicalClasses.deliveryMode,data.deliveryMode):undefined,
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
          const occupancy=await readNativeClassOccupancy(tx,row.classId);
          items.push({...row,...nativeClassCapacity({method:"self",activeOrPending:occupancy,
            classCapacity:authority.classCapacity,offeringCapacity:row.capacity})});
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
 * This entry point accepts verified adult self-enrollment and independently
 * authorized adult invitations. Assignment is a separate staff command.
 * Guardian/youth participation and approval require their own verified
 * authorization, consent, and decision commands. */
export const enrollInNativeClass=createServerFn({method:"POST"})
 .validator((raw:unknown)=>nativeClassEnrollmentInput.parse(raw))
 .handler(async({data})=>{guard();return enrollInNativeClassService(getRequest(),data);});

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

type NativeClassHistoryCursor=NonNullable<z.infer<typeof myClassHistoryInput>["cursor"]>;
async function readNativeClassHistoryPage(
  learnerPersonId:string,cursor:NativeClassHistoryCursor|null,
  membership?:{siteId:string;organizationId:string},
){
    // Date objects truncate PostgreSQL microseconds to milliseconds. Using
    // them for a keyset cursor can skip same-millisecond history rows.
    // Cast the validated ISO cursor directly in PostgreSQL instead.
    const older=cursor?or(
      sql`${canonicalClassEnrollments.enrolledAt} < ${cursor.enrolledAt}::timestamptz`,
      and(sql`${canonicalClassEnrollments.enrolledAt} = ${cursor.enrolledAt}::timestamptz`,
        lt(canonicalClassEnrollments.id,cursor.classEnrollmentId)),
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
      siteName:canonicalEnrollmentSites.name,
      enrollmentMethod:canonicalClassEnrollments.enrollmentMethod,
      classOfferingVersionId:canonicalClassEnrollments.classOfferingVersionId,
    }).from(canonicalClassEnrollments)
      .innerJoin(canonicalClasses,
        eq(canonicalClasses.id,canonicalClassEnrollments.classId))
      .leftJoin(canonicalEnrollmentSites,
        eq(canonicalEnrollmentSites.id,canonicalClasses.siteId))
      .where(and(eq(canonicalClassEnrollments.learnerPersonId,learnerPersonId),older,
        membership?eq(canonicalClasses.siteId,membership.siteId):undefined,
        membership?eq(canonicalClasses.operatingOrganizationId,membership.organizationId):undefined))
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
      sql`NOT EXISTS(
        SELECT 1 FROM public.class_outcomes superseding
        WHERE superseding.supersedes_outcome_id=${canonicalClassOutcomes.id}
      )`,
    )).orderBy(desc(canonicalClassOutcomes.recordedAt),
      desc(canonicalClassOutcomes.id)):[];
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
    )).orderBy(desc(canonicalClassAwards.issuedAt)):[];
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
}

/** Native-session consumers retain their restricted canonical learner grant. */
export const getMyNativeClassEnrollmentHistoryPage=createServerFn({method:"GET"})
  .validator((raw:unknown)=>myClassHistoryInput.parse(raw))
  .handler(async({data})=>{
    guard();
    const {learnerPersonId}=await requireLearner();
    return readNativeClassHistoryPage(learnerPersonId,data.cursor);
  });

/**
 * Read-only CAN account history for My Activity. Direct Students use their verified Site grant and Person; other roles retain the existing bridge. This never issues a native
 * learner cookie, creates a canonical Person, or grants playback/enrollment.
 * It permits source-owned history only after a live CAN session, exact
 * explicit CAN→canonical Account+Person bridge, verified native account,
 * and a current native learner grant for that same Person.
 */
export const getMyNativeClassHistoryForCanAccountPage=createServerFn({method:"GET"})
  .validator((raw:unknown)=>myClassHistoryInput.parse(raw))
  .handler(async({data})=>{
    guard();
    const actor=await getCommandContext(getRequest());
    if(actor.role==="student"){
      const membership=studentSiteScope(actor);
      if(!membership)throw new AuthorizationError("current direct CAN student Site membership");
      return readNativeClassHistoryPage(membership.personId,data.cursor,membership);
    }
    if(!actor.actorPersonId||actor.sessionAccountId)
      throw new AuthorizationError("real verified CAN account Person");
    const [account]=await db.select({
      personId:accessAccounts.personId,
      email:accessAccounts.emailNormalized,
      disabled:accessAccounts.disabled,
      verifiedAt:accessAccounts.emailVerifiedAt,
    }).from(accessAccounts).where(eq(accessAccounts.id,actor.accountId)).limit(1);
    if(!account||account.disabled||!account.verifiedAt||
       account.personId!==actor.actorPersonId)
      throw new AuthorizationError("current verified CAN Person");
    const noncreditLinks=await db.select({
      canPersonId:accessAccountNoncreditPrincipals.accessPersonId,
      canonicalAccountId:accessAccountNoncreditPrincipals.canonicalAccountId,
      canonicalPersonId:accessAccountNoncreditPrincipals.canonicalPersonId,
    }).from(accessAccountNoncreditPrincipals)
      .where(and(
        eq(accessAccountNoncreditPrincipals.accessAccountId,actor.accountId),
        eq(accessAccountNoncreditPrincipals.accessPersonId,actor.actorPersonId),
      )).limit(2);
    const operatorLinks=await db.select({
      canonicalPersonId:accessAccountCanonicalPrincipals.canonicalPrincipalId,
      verifiedAt:accessAccountCanonicalPrincipals.verifiedAt,
      verifiedByAccountId:accessAccountCanonicalPrincipals.verifiedByAccountId,
    }).from(accessAccountCanonicalPrincipals)
      .where(and(
        eq(accessAccountCanonicalPrincipals.accountId,actor.accountId),
        isNull(accessAccountCanonicalPrincipals.revokedAt),
      )).limit(2);
    if(noncreditLinks.length>1||operatorLinks.length>1)
      throw new AuthorizationError("unambiguous source-verified canonical Person");
    const noncredit=noncreditLinks[0];
    const independentlyVerified=operatorLinks[0];
    if(noncredit&&noncredit.canPersonId!==actor.actorPersonId)
      throw new AuthorizationError("matching CAN source Person");
    if(independentlyVerified&&
       (independentlyVerified.verifiedByAccountId===actor.accountId||
        independentlyVerified.verifiedAt>new Date()))
      throw new AuthorizationError("independently verified current canonical Person");
    if(noncredit&&independentlyVerified&&
       noncredit.canonicalPersonId!==independentlyVerified.canonicalPersonId)
      throw new AuthorizationError("conflicting canonical Person links");
    const learnerPersonId=noncredit?.canonicalPersonId??
      independentlyVerified?.canonicalPersonId;
    if(!learnerPersonId)return {items:[],nextCursor:null};

    // For a noncredit self-enrollment bridge, preserve the original verified
    // native Account and matching-email contract. An independently verified
    // operator link is an alternative only after the independent verifier
    // recorded the exact native Person; email alone never establishes it.
    if(noncredit){
      const [native]=await db.select({id:canonicalAccounts.id})
        .from(canonicalAccounts).where(and(
          eq(canonicalAccounts.id,noncredit.canonicalAccountId),
          eq(canonicalAccounts.emailNormalized,account.email),
          isNull(canonicalAccounts.disabledAt),
          isNotNull(canonicalAccounts.emailVerifiedAt),
        )).limit(1);
      if(!native)throw new AuthorizationError("current noncredit native account link");
    }
    const grants=await db.select({id:canonicalAccountGrants.id})
      .from(canonicalAccountGrants)
      .innerJoin(canonicalAccounts,
        eq(canonicalAccounts.id,canonicalAccountGrants.accountId))
      .where(and(
        eq(canonicalAccountGrants.personId,learnerPersonId),
        eq(canonicalAccountGrants.roleCode,"learner"),
        eq(canonicalAccountGrants.active,true),
        isNull(canonicalAccountGrants.revokedAt),
        isNull(canonicalAccountGrants.siteId),
        isNull(canonicalAccounts.disabledAt),
        isNotNull(canonicalAccounts.emailVerifiedAt),
      )).limit(1);
    if(!grants.length)
      throw new AuthorizationError("current verified native learner Person grant");
    return readNativeClassHistoryPage(learnerPersonId,data.cursor);
  });
