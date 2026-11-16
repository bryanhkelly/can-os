import {createServerFn} from "@tanstack/react-start";
import {getRequest,setResponseHeader} from "@tanstack/react-start/server";
import {and,asc,desc,eq,inArray,lte,sql} from "drizzle-orm";
import {z} from "zod";
import {db} from "@/db/client";
import {
  auditEvents,canonicalDeliverySessions,canonicalPersons,domainEvents,
  facilitatedClassroomPlans,facilitatedRoomAttendanceAssertions,
  learnerCourseAttempts,noncreditCompletionDecisions,
  noncreditRegistrations,noncreditSelfEnrollmentClaims,noncreditReleasedSeats,
  noncreditEnrollmentWaitlist,noncreditWaitlistEmailDeliveries,
  noncreditSelfEnrollmentReleases,noncreditTrainingVersions,
} from "@/db/canonical-v301";
import {AuthorizationError} from "@/domain/command-context";
import {requireCanonicalLabProvider} from "@/modules/operations/canonical-capability-lab-access.server";
import {assertCurrentCanonicalStaffForMutation} from "@/modules/identity/canonical-transaction-authorization.server";
import {readEligibleSelfEnrollmentReleases} from "./noncredit-self-enrollment-catalog.server";

const id=z.string().uuid();
const releaseInput=z.object({releaseId:id}).strict();
const attachInput=releaseInput.extend({planId:id}).strict();
type Executor=Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Never infer a participant's Site from account favorites or an operator's
 * other Site. A provider can view only its own releases at authorized Sites. */
async function scopedRelease(tx:Executor,releaseId:string,lock=false){
  const provider=await requireCanonicalLabProvider();
  const query=tx.select().from(noncreditSelfEnrollmentReleases)
    .where(and(eq(noncreditSelfEnrollmentReleases.id,releaseId),
      eq(noncreditSelfEnrollmentReleases.registeringOrganizationId,provider.organizationId)))
    .limit(1);
  const [release]=lock?await query.for("update"):await query;
  if(!release || (release.siteId && !provider.siteIds.includes(release.siteId)))
    throw new AuthorizationError("own release at an authorized Site");
  // Every mutating operation requests the locked release. Recheck the
  // underlying login and grant in that same transaction before any write.
  if(lock)await assertCurrentCanonicalStaffForMutation(tx,getRequest(),provider.actor);
  return {provider,release};
}
function guard(){
  setResponseHeader("Cache-Control","private, no-store");
  setResponseHeader("Referrer-Policy","no-referrer");
}

/** Operator-facing cohort sessions, roster and conservative evidence summary.
 * This endpoint exposes no email, funding eligibility or student records.
 * Raw pairing/telemetry is never treated as verified attendance. */
export const getNoncreditReleaseOperations=createServerFn({method:"GET"})
  .validator((v:unknown)=>releaseInput.parse(v))
  .handler(async({data})=>{
    guard();
    return db.transaction(async tx=>{
      const {provider,release}=await scopedRelease(tx,data.releaseId);
      const waitingEntries=await tx.select({id:noncreditEnrollmentWaitlist.id,
        status:noncreditEnrollmentWaitlist.status,
        inviteExpiresAt:noncreditEnrollmentWaitlist.inviteExpiresAt})
        .from(noncreditEnrollmentWaitlist)
        .where(eq(noncreditEnrollmentWaitlist.releaseId,release.id)).limit(1001);
      const deliveryRows=waitingEntries.length?await tx.select({
        waitlistId:noncreditWaitlistEmailDeliveries.waitlistId,
        invitationExpiresAt:noncreditWaitlistEmailDeliveries.invitationExpiresAt,
        status:noncreditWaitlistEmailDeliveries.status,
      }).from(noncreditWaitlistEmailDeliveries).where(inArray(
        noncreditWaitlistEmailDeliveries.waitlistId,
        waitingEntries.map(item=>item.id),
      )).limit(3001):[];
      const currentDeliveries=deliveryRows.filter(row=>waitingEntries.some(entry=>
        entry.id===row.waitlistId&&entry.inviteExpiresAt!==null&&
        entry.inviteExpiresAt.getTime()===row.invitationExpiresAt.getTime() &&
        entry.status==="invited"));
      const [eligibleRelease]=await readEligibleSelfEnrollmentReleases(tx,release.id);
      const [title]=await tx.select({title:noncreditTrainingVersions.title})
        .from(noncreditTrainingVersions)
        .where(eq(noncreditTrainingVersions.id,release.trainingVersionId)).limit(1);
      const plans=release.siteId?await tx.select({
        planId:facilitatedClassroomPlans.id,
        linkedReleaseId:facilitatedClassroomPlans.enrollmentReleaseId,
        state:facilitatedClassroomPlans.state,
        roomId:facilitatedClassroomPlans.facilitatedSessionId,
        startsAt:canonicalDeliverySessions.startsAt,
        endsAt:canonicalDeliverySessions.endsAt,
      }).from(facilitatedClassroomPlans)
        .innerJoin(canonicalDeliverySessions,eq(
          canonicalDeliverySessions.id,facilitatedClassroomPlans.deliverySessionId))
        .where(and(
          eq(facilitatedClassroomPlans.hostOrganizationId,provider.organizationId),
          eq(facilitatedClassroomPlans.siteId,release.siteId),
          eq(facilitatedClassroomPlans.deploymentId,release.deploymentId),
          eq(facilitatedClassroomPlans.courseVersionId,release.courseVersionId),
        )).orderBy(canonicalDeliverySessions.startsAt).limit(301):[];
      const visiblePlans=plans.filter(p=>p.linkedReleaseId===release.id||
        (p.linkedReleaseId===null&&p.state==="scheduled"&&p.startsAt>new Date()));
      const sessions=visiblePlans.map(p=>({
        planId:p.planId,linked:p.linkedReleaseId===release.id,
        state:p.state,startsAt:p.startsAt.toISOString(),
        endsAt:p.endsAt.toISOString(),
      }));
      const claims=await tx.select({
        registrationId:noncreditSelfEnrollmentClaims.registrationId,
        participantPersonId:noncreditSelfEnrollmentClaims.participantPersonId,
        consentAt:noncreditSelfEnrollmentClaims.createdAt,
        displayName:canonicalPersons.preferredName,
        first:canonicalPersons.legalFirstName,last:canonicalPersons.legalLastName,
        status:noncreditRegistrations.status,
        releasedSeatId:noncreditReleasedSeats.id,
        registeredAt:noncreditRegistrations.registeredAt,
        courseAttemptId:learnerCourseAttempts.id,
        attemptStatus:learnerCourseAttempts.status,
      }).from(noncreditSelfEnrollmentClaims)
        .innerJoin(noncreditRegistrations,eq(
          noncreditRegistrations.id,noncreditSelfEnrollmentClaims.registrationId))
        .innerJoin(canonicalPersons,eq(
          canonicalPersons.id,noncreditSelfEnrollmentClaims.participantPersonId))
        .leftJoin(learnerCourseAttempts,and(
          eq(learnerCourseAttempts.noncreditRegistrationId,noncreditRegistrations.id),
          eq(learnerCourseAttempts.courseVersionId,release.courseVersionId)))
        .leftJoin(noncreditReleasedSeats,eq(
          noncreditReleasedSeats.registrationId,noncreditRegistrations.id))
        .where(and(
          eq(noncreditSelfEnrollmentClaims.releaseId,release.id),
          eq(noncreditRegistrations.registeringOrganizationId,provider.organizationId),
        )).orderBy(desc(noncreditRegistrations.registeredAt)).limit(501);
      const unique=new Map<string,typeof claims[number]>();
      for(const row of claims)if(!unique.has(row.registrationId))unique.set(row.registrationId,row);
      const roster=[...unique.values()];
      const registrationIds=roster.map(x=>x.registrationId);
      const decisions=registrationIds.length?await tx.select({
        registrationId:noncreditCompletionDecisions.registrationId,
        outcome:noncreditCompletionDecisions.outcome,
        decidedAt:noncreditCompletionDecisions.decidedAt,
      }).from(noncreditCompletionDecisions)
        .where(inArray(noncreditCompletionDecisions.registrationId,registrationIds))
        .orderBy(desc(noncreditCompletionDecisions.decidedAt)).limit(2001):[];
      const latestDecision=new Map<string,string>();
      for(const item of decisions)if(!latestDecision.has(item.registrationId))
        latestDecision.set(item.registrationId,item.outcome);
      const roomIds=plans.filter(p=>p.linkedReleaseId===release.id && p.roomId!==null)
        .map(p=>p.roomId!);
      const attemptIds=roster.map(p=>p.courseAttemptId).filter((v):v is string=>!!v);
      const attestations=roomIds.length&&attemptIds.length?await tx.select({
        roomId:facilitatedRoomAttendanceAssertions.facilitatedSessionId,
        courseAttemptId:facilitatedRoomAttendanceAssertions.courseAttemptId,
        status:facilitatedRoomAttendanceAssertions.status,
      }).from(facilitatedRoomAttendanceAssertions)
        .where(and(
          inArray(facilitatedRoomAttendanceAssertions.facilitatedSessionId,roomIds),
          inArray(facilitatedRoomAttendanceAssertions.courseAttemptId,attemptIds),
        )).orderBy(desc(facilitatedRoomAttendanceAssertions.assertedAt),
          desc(facilitatedRoomAttendanceAssertions.id)).limit(3001):[];
      const latestAttendance=new Map<string,string>();
      for(const row of attestations){
        const key=row.roomId+":"+row.courseAttemptId;
        if(!latestAttendance.has(key))latestAttendance.set(key,row.status);
      }
      const present=new Set<string>();
      for(const [key,status] of latestAttendance)if(status==="present")
        present.add(key.split(":")[1]!);
      return {
        releaseId:release.id,title:title?.title??"Approved training",
        deliveryMode:release.deliveryMode,
        siteId:release.siteId,registrationStatus:release.status,
        seatsAvailable:eligibleRelease?.seatsRemaining??0,
        sessions,roster:roster.map(x=>({
          registrationId:x.registrationId,courseAttemptId:x.courseAttemptId,
          displayName:[x.displayName??x.first??"Registered learner",x.last]
            .filter(Boolean).join(" "),
          status:x.status,attemptStatus:x.attemptStatus,
          seatReleased:x.releasedSeatId!==null,
          registeredAt:x.registeredAt.toISOString(),
          attendedLinkedSession:x.courseAttemptId?present.has(x.courseAttemptId):false,
          completionOutcome:latestDecision.get(x.registrationId)??null,
        })),
        metrics:{
          registrations:roster.length,
          active:roster.filter(x=>["registered","active"].includes(x.status)).length,
          withdrawn:roster.filter(x=>x.status==="withdrawn").length,
          seatsReleased:roster.filter(x=>x.releasedSeatId!==null).length,
          completed:roster.filter(x=>latestDecision.get(x.registrationId)==="completed").length,
          verifiedAttendees:roster.filter(x=>x.courseAttemptId && present.has(x.courseAttemptId)).length,
          linkedSessions:plans.filter(p=>p.linkedReleaseId===release.id && p.state!=="cancelled").length,
          waiting:waitingEntries.filter(p=>p.status==="waiting"||
            (p.status==="invited"&&!!p.inviteExpiresAt&&p.inviteExpiresAt<=new Date())).length,
          invitations:waitingEntries.filter(p=>p.status==="invited"&&!!p.inviteExpiresAt&&p.inviteExpiresAt>new Date()).length,
          emailQueued:currentDeliveries.filter(d=>["pending","processing"].includes(d.status)).length,
          emailProviderAccepted:currentDeliveries.filter(d=>d.status==="accepted").length,
          emailFailed:currentDeliveries.filter(d=>d.status==="failed").length,
          emailSuppressed:currentDeliveries.filter(d=>d.status==="suppressed").length,
        },
        partial:claims.length>500||plans.length>300||waitingEntries.length>1000||deliveryRows.length>3000||
          decisions.length>2000||attestations.length>3000,
        evidenceNote:"Facilitator-attested presence covers linked rooms only; pairing, video playback and enrollment are not attendance. Completion uses the latest noncredit decision, not a certificate claim.",
      };
    });
  });

/** Assign dated classroom meetings to exactly one authorized enrollment
 * release. The release lock serializes competing operators; each plan is
 * checked independently and both assignment and audit commit atomically.
 */
type ScopedCohort=Awaited<ReturnType<typeof scopedRelease>>;
async function assignCohortPlan(tx:Executor,scope:ScopedCohort,planId:string){
  const {provider,release}=scope;
  if(release.status!=="published"||release.deliveryMode!=="facilitated"||
    !release.siteId)throw new AuthorizationError("open facilitated release");
  const [plan]=await tx.select({
    id:facilitatedClassroomPlans.id,
    enrollmentReleaseId:facilitatedClassroomPlans.enrollmentReleaseId,
    deploymentId:facilitatedClassroomPlans.deploymentId,
    courseVersionId:facilitatedClassroomPlans.courseVersionId,
    siteId:facilitatedClassroomPlans.siteId,
    hostOrganizationId:facilitatedClassroomPlans.hostOrganizationId,
    state:facilitatedClassroomPlans.state,
    startsAt:canonicalDeliverySessions.startsAt,
  }).from(facilitatedClassroomPlans)
    .innerJoin(canonicalDeliverySessions,eq(
      canonicalDeliverySessions.id,facilitatedClassroomPlans.deliverySessionId))
    .where(eq(facilitatedClassroomPlans.id,planId))
    .limit(1).for("update",{of:facilitatedClassroomPlans});
  if(!plan||plan.deploymentId!==release.deploymentId||
    plan.courseVersionId!==release.courseVersionId||
    plan.siteId!==release.siteId||
    plan.hostOrganizationId!==provider.organizationId)
    throw new AuthorizationError("own scheduled Course at the exact approved Site");
  if(plan.enrollmentReleaseId===release.id)return {planId,attached:true,duplicate:true};
  if(plan.enrollmentReleaseId!==null||plan.state!=="scheduled"||
    plan.startsAt<=new Date())
    throw new AuthorizationError("unallocated future classroom meeting");
  await tx.update(facilitatedClassroomPlans).set({
    enrollmentReleaseId:release.id,updatedAt:new Date(),
  }).where(eq(facilitatedClassroomPlans.id,plan.id));
  const payload={releaseId:release.id,planId:plan.id,siteId:release.siteId};
  await tx.insert(auditEvents).values({
    actorPersonId:provider.actor.actorPersonId!,
    owningOrganizationId:provider.organizationId,
    eventCode:"noncredit.cohort.session_assigned",
    entityKind:"facilitated_classroom_plan",entityId:plan.id,payload,
  });
  await tx.insert(domainEvents).values({
    eventType:"NoncreditCohortSessionAssigned",
    aggregateType:"noncredit_self_enrollment_release",
    aggregateId:release.id,actorPersonId:provider.actor.actorPersonId!,
    payload,
  });
  return {planId,attached:true,duplicate:false};
}
export const attachClassroomPlanToNoncreditRelease=createServerFn({method:"POST"})
  .validator((v:unknown)=>attachInput.parse(v))
  .handler(async({data})=>{
    guard();
    return db.transaction(async tx=>{
      const scope=await scopedRelease(tx,data.releaseId,true);
      return assignCohortPlan(tx,scope,data.planId);
    });
  });

/** Four-week cohort assignment is all-or-nothing, not four client requests.
 * A plan already attached to this release is idempotent; another release
 * or Site is always rejected. Never infer affiliation from a Site name.
 */
export const attachFourWeekCohortPlans=createServerFn({method:"POST"})
  .validator((v:unknown)=>releaseInput.extend({
    planIds:z.array(id).min(1).max(4).refine(xs=>new Set(xs).size===xs.length,
      "Every meeting must be distinct"),
  }).strict().parse(v))
  .handler(async({data})=>{
    guard();
    return db.transaction(async tx=>{
      const scope=await scopedRelease(tx,data.releaseId,true);
      const assigned=[];
      for(const planId of data.planIds)
        assigned.push(await assignCohortPlan(tx,scope,planId));
      return {plans:assigned,attached:assigned.filter(p=>!p.duplicate).length};
    });
  });

const seatInput=releaseInput.extend({
  registrationId:id,reason:z.string().trim().min(15).max(500),
}).strict();

/** Provider decision only. A learner's self-withdrawal is not permission
 * to delete the original claim, silently refund a fee, or free the seat.
 * Serialize with self-enrollment's release-level advisory lock. */
export const releaseWithdrawnNoncreditSeat=createServerFn({method:"POST"})
  .validator((v:unknown)=>seatInput.parse(v))
  .handler(async({data})=>{
    guard();
    return db.transaction(async tx=>{
      const {provider,release}=await scopedRelease(tx,data.releaseId,true);
      await tx.execute(
        // Same admission lock used by enrollMyselfInNoncredit.
        sql`SELECT pg_advisory_xact_lock(hashtext(${"self-enroll:"+release.id}))`
      );
      const [record]=await tx.select({
        status:noncreditRegistrations.status,
        registrationId:noncreditRegistrations.id,
      }).from(noncreditSelfEnrollmentClaims)
        .innerJoin(noncreditRegistrations,eq(
          noncreditRegistrations.id,noncreditSelfEnrollmentClaims.registrationId))
        .where(and(
          eq(noncreditSelfEnrollmentClaims.releaseId,release.id),
          eq(noncreditSelfEnrollmentClaims.registrationId,data.registrationId),
          eq(noncreditRegistrations.registeringOrganizationId,provider.organizationId),
        )).limit(1);
      if(!record||!["withdrawn","cancelled"].includes(record.status))
        throw new AuthorizationError("own withdrawn registration");
      const [existing]=await tx.select({id:noncreditReleasedSeats.id})
        .from(noncreditReleasedSeats)
        .where(eq(noncreditReleasedSeats.registrationId,record.registrationId))
        .limit(1);
      if(existing)return {released:true,duplicate:true};
      const [completion]=await tx.select({id:noncreditCompletionDecisions.id})
        .from(noncreditCompletionDecisions).where(and(
          eq(noncreditCompletionDecisions.registrationId,record.registrationId),
          eq(noncreditCompletionDecisions.outcome,"completed"),
        )).limit(1);
      if(completion)throw new AuthorizationError("completed registration history");
      const [saved]=await tx.insert(noncreditReleasedSeats).values({
        releaseId:release.id,registrationId:record.registrationId,
        releasedByPersonId:provider.actor.actorPersonId!,reason:data.reason,
      }).returning({id:noncreditReleasedSeats.id});
      if(!saved)throw new Error("Could not save seat release");
      const payload={releaseId:release.id,registrationId:record.registrationId,
        reason:data.reason};
      await tx.insert(auditEvents).values({
        actorPersonId:provider.actor.actorPersonId!,
        owningOrganizationId:provider.organizationId,
        eventCode:"noncredit.enrollment.seat_released",
        entityKind:"noncredit_released_seat",entityId:saved.id,payload,
      });
      await tx.insert(domainEvents).values({
        eventType:"NoncreditEnrollmentSeatReleased",
        aggregateType:"noncredit_self_enrollment_release",aggregateId:release.id,
        actorPersonId:provider.actor.actorPersonId!,payload,
      });
      return {released:true,duplicate:false};
    });
  });

const inviteInput=z.object({releaseId:id}).strict();

/** FIFO, 48-hour capacity hold. A host does NOT enroll or impersonate the
 * invited person; the invited adult must accept the current terms and claim
 * the held place using their own current verified CAN session. */
export const inviteNextNoncreditWaitlist=createServerFn({method:"POST"})
  .validator((v:unknown)=>inviteInput.parse(v))
  .handler(async({data})=>{
    guard();
    return db.transaction(async tx=>{
      const {provider,release}=await scopedRelease(tx,data.releaseId,true);
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"self-enroll:"+release.id}))`);
      const [eligible]=await readEligibleSelfEnrollmentReleases(tx,release.id);
      if(!eligible||eligible.seatsRemaining<=0)
        throw new AuthorizationError("a current authorized cohort with an available place");
      const now=new Date();
      // Expired holds no longer reserve a seat. Preserve timestamps in audit
      // before returning an applicant to the waiting state.
      const expired=await tx.update(noncreditEnrollmentWaitlist).set({
        status:"waiting",invitedAt:null,inviteExpiresAt:null,updatedAt:now,
      }).where(and(
        eq(noncreditEnrollmentWaitlist.releaseId,release.id),
        eq(noncreditEnrollmentWaitlist.status,"invited"),
        lte(noncreditEnrollmentWaitlist.inviteExpiresAt,now),
      )).returning({id:noncreditEnrollmentWaitlist.id});
      const [next]=await tx.select().from(noncreditEnrollmentWaitlist)
        .where(and(
          eq(noncreditEnrollmentWaitlist.releaseId,release.id),
          eq(noncreditEnrollmentWaitlist.status,"waiting"),
        )).orderBy(asc(noncreditEnrollmentWaitlist.joinedAt),
          asc(noncreditEnrollmentWaitlist.id)).limit(1).for("update");
      if(!next)return {invited:false,waiting:false};
      const until=new Date(Math.min(now.getTime()+48*60*60_000,release.closesAt.getTime()));
      if(until<=now)throw new AuthorizationError("registration window expires before invitation");
      await tx.update(noncreditEnrollmentWaitlist).set({
        status:"invited",invitedAt:now,inviteExpiresAt:until,updatedAt:now,
      }).where(eq(noncreditEnrollmentWaitlist.id,next.id));
      // Enqueue atomically with the 48h hold. Delivery occurs post-commit
      // through a leased, retryable worker, never inside this transaction.
      await tx.insert(noncreditWaitlistEmailDeliveries).values({
        waitlistId:next.id,invitationExpiresAt:until,
      }).onConflictDoNothing();
      const payload={releaseId:release.id,waitlistId:next.id,
        invitationExpiresAt:until.toISOString(),expiredPriorHolds:expired.length};
      await tx.insert(auditEvents).values({
        actorPersonId:provider.actor.actorPersonId!,
        owningOrganizationId:provider.organizationId,
        eventCode:"noncredit.waitlist.invited",
        entityKind:"noncredit_enrollment_waitlist",entityId:next.id,payload,
      });
      await tx.insert(domainEvents).values({
        eventType:"NoncreditWaitlistInvited",
        aggregateType:"noncredit_enrollment_waitlist",
        aggregateId:next.id,actorPersonId:provider.actor.actorPersonId!,payload,
      });
      return {invited:true,waiting:true,notificationQueued:true,inviteExpiresAt:until.toISOString()};
    });
  });
