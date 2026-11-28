import { createServerFn } from "@tanstack/react-start";
import { appendResponseHeader, getRequest,setResponseHeader } from "@tanstack/react-start/server";
import { and, desc, eq, gt, inArray, isNotNull, isNull, lt, lte, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { z } from "zod";
import {
  accessAccounts, accessAccountCanonicalPrincipals, accessAccountNoncreditPrincipals,
  accessAdultLearningReviews, people,
} from "@/db/schema";
import {
  canonicalAccounts, canonicalAccountGrants,
  canonicalClasses,canonicalClassEnrollments,canonicalClassSessions,
  canonicalEnrollmentSites,canonicalDeliverySessions,facilitatedClassroomPlans,
  learnerProfiles, noncreditRegistrations, learnerCourseAttempts,
  noncreditSelfEnrollmentReleases, noncreditSelfEnrollmentClaims,
  participationAttributions,networkMemberships,
  noncreditEnrollmentWaitlist,
  noncreditCompletionPolicies, noncreditCompletionDecisions, noncreditTrainingVersions,
} from "@/db/canonical-v301";
import { AuthorizationError } from "@/domain/command-context";
import { writeCanonicalAudit, emitCanonicalDomainEvent } from "@/platform/canonical-mutation.server";
import { noncreditEnrollCommand } from "@/domain/noncredit-self-enrollment";
import { probeCanonicalAuthReader } from "@/modules/identity/canonical-command-context.server";
import { assertCurrentReviewedNativeLearner } from "@/modules/identity/reviewed-learning-evidence.server";
import { assertUnambiguousAdultAccount } from "@/modules/identity/unambiguous-adult-account.server";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { isDemoAccountEmail } from "@/domain/local-demo-access";
import { readEligibleSelfEnrollmentReleases } from "./noncredit-self-enrollment-catalog.server";
import { verifyNoncreditGoReferral } from "@/modules/engagement/engagement-go.server";
import { placeCourseRegistrationInClass } from "./course-class-placement.server";

import {enrollMyselfInNoncreditService} from "./noncredit-self-registration.server";
export const enrollMyselfInNoncredit=createServerFn({method:"POST"})
 .validator((value:unknown)=>noncreditEnrollCommand.parse(value))
 .handler(async({data})=>{
  setResponseHeader("Cache-Control","private, no-store");
  const {cookie,result}=await enrollMyselfInNoncreditService(getRequest(),data);
  appendResponseHeader("Set-Cookie",cookie);
  return result;
 });

/** Public projections disclose only current approved releases and schedules,
 * never named participants, internal authorizations or other Sites' rosters. */
async function projectPublicSelfEnrollment(
  releases:Awaited<ReturnType<typeof readEligibleSelfEnrollmentReleases>>,
){
  const plans=releases.length?await db.select({
    releaseId:facilitatedClassroomPlans.enrollmentReleaseId,
    startsAt:canonicalDeliverySessions.startsAt,
    endsAt:canonicalDeliverySessions.endsAt,
  }).from(facilitatedClassroomPlans).innerJoin(canonicalDeliverySessions,
    eq(canonicalDeliverySessions.id,facilitatedClassroomPlans.deliverySessionId))
    .where(and(
      inArray(facilitatedClassroomPlans.enrollmentReleaseId,releases.map(r=>r.id)),
      inArray(facilitatedClassroomPlans.state,["scheduled","started"]),
    )).orderBy(canonicalDeliverySessions.startsAt).limit(1001):[];
  return releases.map(row=>({
    id:row.id,title:row.title,provider:row.organizationName,
    deploymentName:row.deploymentName,siteName:row.siteName,
    deliveryMode:row.deliveryMode,requiredMinutes:row.requiredMinutes,
    seatsRemaining:row.seatsRemaining,opensAt:row.opensAt.toISOString(),
    closesAt:row.closesAt.toISOString(),
    consentVersion:row.consentVersion,consentText:row.consentText,
    consentSha256:row.consentSha256,hasWaitingQueue:row.hasWaitingQueue,
    sessions:plans.filter(p=>p.releaseId===row.id).slice(0,20).map(p=>({
      startsAt:p.startsAt.toISOString(),endsAt:p.endsAt.toISOString(),
    })),
    schedulePartial:plans.length>1000||
      plans.filter(p=>p.releaseId===row.id).length>20,
  }));
}

/** Legacy first-page API retained for existing clients and QA consumers.
 * The public discovery UI now uses the paginated endpoint below. */
export const getOpenNoncreditSelfEnrollment=createServerFn({method:"GET"})
  .handler(async()=>{
    setResponseHeader("Cache-Control","public, max-age=30");
    return projectPublicSelfEnrollment(await readEligibleSelfEnrollmentReleases());
  });

const pageInput=z.object({
  cursor:z.string().uuid().nullable().default(null),
  term:z.string().trim().max(100).default(""),
}).strict();

/** Keyset pagination over approved, published adult training, including
 * independent online and Site-facilitated releases across organizations. */
export const getOpenNoncreditSelfEnrollmentPage=createServerFn({method:"GET"})
  .validator((v:unknown)=>pageInput.parse(v))
  .handler(async({data})=>{
    setResponseHeader("Cache-Control","public, max-age=30");
    const rows=await readEligibleSelfEnrollmentReleases(db,undefined,{
      after:data.cursor,term:data.term,limit:31,
    });
    const pageRows=rows.slice(0,30);
    return {
      items:await projectPublicSelfEnrollment(pageRows),
      nextCursor:rows.length>30?pageRows[pageRows.length-1]!.id:null,
    };
  });

/** Exact deep link remains valid independently of whichever page was loaded. */
export const getOpenNoncreditSelfEnrollmentById=createServerFn({method:"GET"})
  .validator((v:unknown)=>z.object({releaseId:z.string().uuid()}).strict().parse(v))
  .handler(async({data})=>{
    setResponseHeader("Cache-Control","public, max-age=30");
    const rows=await readEligibleSelfEnrollmentReleases(db,data.releaseId);
    const publicRows=await projectPublicSelfEnrollment(rows);
    return publicRows[0]??null;
  });

/** Only the signed-in Person's explicitly bridged canonical Course history. */

// Original registration/attempt rows remain the only participation authority.
// A cursor is an ordering hint, never a Person, Site or scope selector.
const personalNoncreditCursor=z.object({
  registeredAt:z.string().datetime({offset:true}),
  registrationId:z.string().uuid(),
}).strict();
async function readMyNoncreditHistoryPage(
  cursor:z.infer<typeof personalNoncreditCursor>|null,
  registrationId?:string,
  courseAttemptId?:string,
){
    setResponseHeader("Cache-Control","private, no-store");
    // Read-only personal history follows the original explicitly bound CAN
    // Person, irrespective of which authorized role is selected now. New
    // enrollment still requires the independently verified adult write path.
    const actor=await getCommandContext(getRequest());
    if(!actor.actorPersonId||actor.sessionAccountId)
      throw new AuthorizationError("real CAN account Person");
    const [owner]=await db.select({
      accountId:accessAccounts.id,personId:accessAccounts.personId,
      email:accessAccounts.emailNormalized,
      disabled:accessAccounts.disabled,
      verifiedAt:accessAccounts.emailVerifiedAt,
    }).from(accessAccounts).where(eq(accessAccounts.id,actor.accountId)).limit(1);
    if(!owner||owner.disabled||!owner.verifiedAt||
       owner.personId!==actor.actorPersonId||isDemoAccountEmail(owner.email))
      throw new AuthorizationError("verified CAN participation identity");
    const [link]=await db.select().from(accessAccountNoncreditPrincipals)
      .where(eq(accessAccountNoncreditPrincipals.accessAccountId,owner.accountId)).limit(1);
    if(!link || link.accessPersonId!==owner.personId)return {items:[],nextCursor:null};
    const [native]=await db.select({id:canonicalAccounts.id})
      .from(canonicalAccounts).where(and(
        eq(canonicalAccounts.id,link.canonicalAccountId),
        eq(canonicalAccounts.emailNormalized,owner.email),
        isNull(canonicalAccounts.disabledAt),
        isNotNull(canonicalAccounts.emailVerifiedAt),
      )).limit(1);
    if(!native)return {items:[],nextCursor:null};
    const registrations=await db.select({
      releaseId:noncreditSelfEnrollmentClaims.releaseId,
      registrationId:noncreditRegistrations.id,
      courseAttemptId:learnerCourseAttempts.id,
      classId:canonicalClassEnrollments.classId,
      classTitle:canonicalClasses.title,
      trainingTitle:noncreditTrainingVersions.title,
      deliveryMode:noncreditSelfEnrollmentReleases.deliveryMode,
      siteId:noncreditSelfEnrollmentReleases.siteId,
      organizationId:noncreditSelfEnrollmentReleases.registeringOrganizationId,
      siteName:canonicalEnrollmentSites.name,
      registrationStatus:noncreditRegistrations.status,
      attemptStatus:learnerCourseAttempts.status,
      registeredAt:noncreditRegistrations.registeredAt,
      registeredAtCursor:sql<string>`to_char(${noncreditRegistrations.registeredAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
    }).from(noncreditSelfEnrollmentClaims)
      .innerJoin(noncreditSelfEnrollmentReleases,eq(
        noncreditSelfEnrollmentReleases.id,noncreditSelfEnrollmentClaims.releaseId))
      .leftJoin(canonicalEnrollmentSites,eq(
        canonicalEnrollmentSites.id,noncreditSelfEnrollmentReleases.siteId))
      .innerJoin(noncreditRegistrations,eq(
        noncreditSelfEnrollmentClaims.registrationId,noncreditRegistrations.id))
      .innerJoin(learnerCourseAttempts,and(
        eq(learnerCourseAttempts.noncreditRegistrationId,noncreditRegistrations.id),
        isNull(learnerCourseAttempts.enrollmentId),
        // Registration is one participation identity even with multiple
        // historical attempts. Select its latest original Course Attempt.
        sql`${learnerCourseAttempts.id} = (
          SELECT attempt.id FROM ${learnerCourseAttempts} attempt
          WHERE attempt.noncredit_registration_id=${noncreditRegistrations.id}
            AND attempt.enrollment_id IS NULL
          ORDER BY attempt.attempt_no DESC,attempt.started_at DESC,attempt.id DESC
          LIMIT 1
        )`,
      ))
      .leftJoin(canonicalClassEnrollments,
        eq(canonicalClassEnrollments.id,learnerCourseAttempts.classEnrollmentId))
      .leftJoin(canonicalClasses,eq(canonicalClasses.id,canonicalClassEnrollments.classId))
      .innerJoin(noncreditTrainingVersions,
        eq(noncreditTrainingVersions.id,noncreditRegistrations.trainingVersionId))
      .where(and(
        eq(noncreditSelfEnrollmentClaims.canonicalAccountId,link.canonicalAccountId),
        eq(noncreditSelfEnrollmentClaims.participantPersonId,link.canonicalPersonId),
        eq(noncreditRegistrations.participantPersonId,link.canonicalPersonId),
        registrationId?eq(noncreditRegistrations.id,registrationId):undefined,
        courseAttemptId?eq(learnerCourseAttempts.id,courseAttemptId):undefined,
        cursor?or(
          sql`${noncreditRegistrations.registeredAt} < ${cursor.registeredAt}::timestamptz`,
          and(sql`${noncreditRegistrations.registeredAt} = ${cursor.registeredAt}::timestamptz`,
            lt(noncreditRegistrations.id,cursor.registrationId)),
        ):undefined,
      )).orderBy(desc(noncreditRegistrations.registeredAt),desc(noncreditRegistrations.id)).limit(51);
    const page=registrations.slice(0,50);
    const last=page[page.length-1];
    const nextCursor=registrations.length>50&&last
      ?{registeredAt:last.registeredAtCursor,registrationId:last.registrationId}:null;
    const releaseIds=[...new Set(page.map(r=>r.releaseId))];
    const classIds=[...new Set(page.flatMap(r=>r.classId?[r.classId]:[]))];
    const classSessions=classIds.length?await db.select({
      classId:canonicalClassSessions.classId,
      startsAt:canonicalDeliverySessions.startsAt,
      endsAt:canonicalDeliverySessions.endsAt,
    }).from(canonicalClassSessions)
      .innerJoin(facilitatedClassroomPlans,eq(
        facilitatedClassroomPlans.id,canonicalClassSessions.classroomPlanId))
      .innerJoin(canonicalDeliverySessions,eq(
        canonicalDeliverySessions.id,canonicalClassSessions.deliverySessionId))
      .where(and(
        inArray(canonicalClassSessions.classId,classIds),
        inArray(facilitatedClassroomPlans.state,["scheduled","started"]),
      )).orderBy(canonicalDeliverySessions.startsAt).limit(1001):[];
    const plans=releaseIds.length?await db.select({
      releaseId:facilitatedClassroomPlans.enrollmentReleaseId,
      startsAt:canonicalDeliverySessions.startsAt,
      endsAt:canonicalDeliverySessions.endsAt,
    }).from(facilitatedClassroomPlans)
      .innerJoin(canonicalDeliverySessions,eq(
        canonicalDeliverySessions.id,facilitatedClassroomPlans.deliverySessionId))
      .where(and(
        inArray(facilitatedClassroomPlans.enrollmentReleaseId,releaseIds),
        inArray(facilitatedClassroomPlans.state,["scheduled","started"]),
      )).orderBy(canonicalDeliverySessions.startsAt).limit(1001):[];
    // Only the source-owned, latest non-superseded formal decisions are
    // displayed. Progress, elapsed time, registration, and assessment alone
    // are never promoted into an official completion.
    const registrationIds=[...new Set(page.map(row=>row.registrationId))];
    const decisions=registrationIds.length?await db.select({
      id:noncreditCompletionDecisions.id,
      registrationId:noncreditCompletionDecisions.registrationId,
      outcome:noncreditCompletionDecisions.outcome,
      supersedesId:noncreditCompletionDecisions.supersedesId,
    }).from(noncreditCompletionDecisions).where(and(
      inArray(noncreditCompletionDecisions.registrationId,registrationIds),
      sql`NOT EXISTS(
        SELECT 1 FROM ${noncreditCompletionDecisions} later
        WHERE later.supersedes_id=${noncreditCompletionDecisions.id}
      )`,
    )).orderBy(desc(noncreditCompletionDecisions.decidedAt),
      desc(noncreditCompletionDecisions.id)):[];
    const superseded=new Set(decisions.flatMap(item=>
      item.supersedesId?[item.supersedesId]:[]));
    const current=new Map<string,(typeof decisions)[number]>();
    for(const item of decisions)
      if(!superseded.has(item.id)&&!current.has(item.registrationId))
        current.set(item.registrationId,item);
    return {items:page.map(r=>({
      ...r,officialOutcome:current.has(r.registrationId)?{
        referenceId:current.get(r.registrationId)!.id,
        label:"Completion decision: "+current.get(r.registrationId)!.outcome.replaceAll("_"," "),
      }:null,
      upcomingSessions:(r.classId
        ?classSessions.filter(p=>p.classId===r.classId)
        :plans.filter(p=>p.releaseId===r.releaseId))
        .filter(p=>p.endsAt.getTime()>Date.now()).slice(0,20).map(p=>({
          startsAt:p.startsAt.toISOString(),endsAt:p.endsAt.toISOString(),
        })),
      schedulePartial:r.classId?classSessions.length>1000:plans.length>1000,
    })),nextCursor};

}
export const getMyNoncreditSelfEnrollmentHistoryPage=createServerFn({method:"GET"})
  .validator((raw:unknown)=>z.object({
    cursor:personalNoncreditCursor.nullable().default(null),
  }).strict().parse(raw))
  .handler(async({data})=>readMyNoncreditHistoryPage(data.cursor));

/** Single source-authorized registration, resolved inside the database.
 * Never accept a caller-selected Person, account, Site or organization scope. */
export const getMyNoncreditRegistrationById=createServerFn({method:"GET"})
  .validator((raw:unknown)=>z.object({registrationId:z.string().uuid()}).strict().parse(raw))
  .handler(async({data})=>{
    const page=await readMyNoncreditHistoryPage(null,data.registrationId);
    return page.items[0]??null;
  });

/** Exact learner-owned Course Attempt lookup for bookmarked learning URLs.
 * The authorized CAN Account + canonical Person/claim join still determines
 * ownership. A bookmark never widens Person, Site, or Organization scope.
 * Never scan the first 100 registrations to guess whether an attempt exists. */
export const getMyNoncreditCourseByAttemptId=createServerFn({method:"GET"})
  .validator((raw:unknown)=>z.object({
    courseAttemptId:z.string().uuid(),
  }).strict().parse(raw))
  .handler(async({data})=>{
    const page=await readMyNoncreditHistoryPage(null,undefined,data.courseAttemptId);
    return page.items[0]??null;
  });

/** Existing bounded view; My Activity advances through source-owned pages. */
export const getMyNoncreditSelfEnrollments=createServerFn({method:"GET"})
  .handler(async()=>{
    const first=await readMyNoncreditHistoryPage(null);
    if(!first.nextCursor)return first.items;
    const second=await readMyNoncreditHistoryPage(first.nextCursor);
    return [...first.items,...second.items];
  });
