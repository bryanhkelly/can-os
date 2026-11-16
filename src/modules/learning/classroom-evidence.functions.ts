import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { and, desc, eq, gt, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  courseLessons, learnerCourseAttempts, noncreditSelfEnrollmentClaims,
  canonicalClassEnrollments,
  facilitatedLearningParticipants, facilitatedLearningSessions,
  facilitatedRoomActivityReleases, facilitatedRoomActivityResponses,
  facilitatedRoomPresenceEvents,
} from "@/db/canonical-v301";
import { AuthorizationError } from "@/domain/command-context";
import {assignedClassroomRelease,attemptInAssignedClassroomRelease} from "./classroom-release-boundary.server";
import { facilitatedRoomOperationalState } from "@/domain/facilitated-learning";
import { getInstructionalLearnerContext } from "@/modules/identity/learning-command-context.server";
import { authorizeCanonicalCourseAttempt } from "./canonical-course-participation.server";
import { requireCanonicalFacilitator } from "./canonical-facilitator-access.server";
import {
  ownedRoom, roomHostIsCurrent, schoolAttemptIsPlacedAtSite,
} from "./facilitated-learning-operations.server";
import { requireFacilitatedLearningEnabled } from "./canonical-learning-release.server";
import { nativeClassForRoom } from "@/modules/classes/native-class-room-boundary.server";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
const uuid = z.string().uuid();
const roomInput = z.object({ facilitatedSessionId: uuid }).strict();
const learnerInput = roomInput.extend({ courseAttemptId: uuid }).strict();

function guard() {
  requireFacilitatedLearningEnabled(); // restricted credentials, not a feature flag
  setResponseHeader("Cache-Control", "private, no-store");
  setResponseHeader("Referrer-Policy", "no-referrer");
}
function assertLive(room: typeof facilitatedLearningSessions.$inferSelect, now: Date) {
  if (facilitatedRoomOperationalState(room, now) !== "live")
    throw new AuthorizationError("current classroom session");
}

async function learnerRoom(tx: Tx, courseAttemptId: string, roomId: string) {
  const actor = await getInstructionalLearnerContext(getRequest());
  if (!actor.actorPersonId || !["student", "learner"].includes(actor.role ?? ""))
    throw new AuthorizationError("authenticated course learner");
  const access = await authorizeCanonicalCourseAttempt(tx, actor, courseAttemptId);
  const [pair] = await tx.select({ id: facilitatedLearningParticipants.id })
    .from(facilitatedLearningParticipants).where(and(
      eq(facilitatedLearningParticipants.facilitatedSessionId, roomId),
      eq(facilitatedLearningParticipants.courseAttemptId, courseAttemptId),
      eq(facilitatedLearningParticipants.participantPersonId, actor.actorPersonId),
      isNull(facilitatedLearningParticipants.leftAt),
    )).limit(1);
  const [room] = await tx.select().from(facilitatedLearningSessions)
    .where(eq(facilitatedLearningSessions.id, roomId)).limit(1);
  const now = new Date();
  if (!room || !pair || room.deploymentId !== access.deploymentId ||
      room.courseVersionId !== access.courseVersionId)
    throw new AuthorizationError("registered classroom participant");
  assertLive(room, now);
  if (!await roomHostIsCurrent(tx, room, now))
    throw new AuthorizationError("current classroom hosting authority");
  if (access.source === "school" && !await schoolAttemptIsPlacedAtSite(
    tx, access.courseAttemptId, room.deploymentId, room.siteId, now,
  )) throw new AuthorizationError("current school Site placement");
  if(!await attemptInAssignedClassroomRelease(
    tx,room,access.courseAttemptId,actor.actorPersonId,
  ))throw new AuthorizationError("registered learner in assigned classroom release");
  return { room, personId: actor.actorPersonId };
}

const activityInput = roomInput.extend({
  requestId: uuid,
  lessonId: uuid.nullable(),
  prompt: z.string().trim().min(5).max(1000),
  answerType: z.enum(["single_choice", "text"]),
  choices: z.array(z.string().trim().min(1).max(200)).max(8),
}).strict().superRefine((value, ctx) => {
  if (value.answerType === "single_choice" && value.choices.length < 2)
    ctx.addIssue({ code: "custom", path: ["choices"], message: "Use at least two choices" });
  if (value.answerType === "text" && value.choices.length > 0)
    ctx.addIssue({ code: "custom", path: ["choices"], message: "Text prompts do not have choices" });
});

export const getClassroomLearnerActivities = createServerFn({ method: "GET" })
  .validator((v: unknown) => learnerInput.parse(v))
  .handler(async ({ data }) => {
    guard();
    return db.transaction(async tx => {
      await learnerRoom(tx, data.courseAttemptId, data.facilitatedSessionId);
      const releases = await tx.select().from(facilitatedRoomActivityReleases)
        .where(eq(facilitatedRoomActivityReleases.facilitatedSessionId, data.facilitatedSessionId))
        .orderBy(desc(facilitatedRoomActivityReleases.releasedAt)).limit(41);
      const responses = await tx.select({
        activityReleaseId: facilitatedRoomActivityResponses.activityReleaseId,
      }).from(facilitatedRoomActivityResponses).where(and(
        eq(facilitatedRoomActivityResponses.facilitatedSessionId, data.facilitatedSessionId),
        eq(facilitatedRoomActivityResponses.courseAttemptId, data.courseAttemptId),
      )).limit(1001);
      const answered = new Set(responses.map(r => r.activityReleaseId));
      return {
        activities: releases.slice(0, 40).map(row => ({
          id: row.id, prompt: row.prompt, answerType: row.answerType,
          choices: row.choices, closed: row.closedAt !== null,
          releasedAt: row.releasedAt.toISOString(), responded: answered.has(row.id),
        })),
        truncated: releases.length > 40 || responses.length > 1000,
        notice: "These are formative responses, not official assessment grades or completion.",
      };
    });
  });

export const releaseClassroomActivity = createServerFn({ method: "POST" })
  .validator((v: unknown) => activityInput.parse(v))
  .handler(async ({ data }) => {
    guard();
    const host = await requireCanonicalFacilitator();
    return db.transaction(async tx => {
      const room = await ownedRoom(tx, host, data.facilitatedSessionId, true);
      assertLive(room, new Date());
      if (data.lessonId) {
        const [lesson] = await tx.select({ id: courseLessons.id }).from(courseLessons)
          .where(and(
            eq(courseLessons.id, data.lessonId),
            eq(courseLessons.courseVersionId, room.courseVersionId),
          )).limit(1);
        if (!lesson) throw new AuthorizationError("lesson in this Course version");
      }
      const [created] = await tx.insert(facilitatedRoomActivityReleases).values({
        facilitatedSessionId: room.id, releasedByPersonId: host.actor.actorPersonId!,
        requestId: data.requestId, lessonId: data.lessonId,
        prompt: data.prompt, answerType: data.answerType, choices: data.choices,
      }).onConflictDoNothing().returning({ id: facilitatedRoomActivityReleases.id });
      if (!created) {
        const [prior] = await tx.select().from(facilitatedRoomActivityReleases)
          .where(and(
            eq(facilitatedRoomActivityReleases.facilitatedSessionId, room.id),
            eq(facilitatedRoomActivityReleases.requestId, data.requestId),
          )).limit(1);
        if (!prior || prior.releasedByPersonId !== host.actor.actorPersonId ||
            prior.lessonId !== data.lessonId || prior.prompt !== data.prompt ||
            prior.answerType !== data.answerType ||
            JSON.stringify(prior.choices) !== JSON.stringify(data.choices))
          throw new Error("Conflicting classroom activity retry");
        return { id: prior.id, duplicate: true };
      }
      return { id: created.id, duplicate: false };
    });
  });

export const closeClassroomActivity = createServerFn({ method: "POST" })
  .validator((v: unknown) => roomInput.extend({ activityReleaseId: uuid }).strict().parse(v))
  .handler(async ({ data }) => {
    guard();
    const host = await requireCanonicalFacilitator();
    return db.transaction(async tx => {
      const room = await ownedRoom(tx, host, data.facilitatedSessionId, true);
      assertLive(room, new Date());
      const [closed] = await tx.update(facilitatedRoomActivityReleases)
        .set({ closedAt: new Date() }).where(and(
          eq(facilitatedRoomActivityReleases.id, data.activityReleaseId),
          eq(facilitatedRoomActivityReleases.facilitatedSessionId, room.id),
          isNull(facilitatedRoomActivityReleases.closedAt),
        )).returning({ id: facilitatedRoomActivityReleases.id });
      return { closed: !!closed };
    });
  });

const responseInput = learnerInput.extend({
  activityReleaseId: uuid, clientSubmissionId: uuid, clientInstanceId: uuid,
  answerChoice: z.number().int().min(0).max(7).nullable(),
  answerText: z.string().trim().min(1).max(1000).nullable(),
}).strict().refine(v => (v.answerChoice === null) !== (v.answerText === null),
  "Provide exactly one response");

export const submitClassroomResponse = createServerFn({ method: "POST" })
  .validator((v: unknown) => responseInput.parse(v))
  .handler(async ({ data }) => {
    guard();
    return db.transaction(async tx => {
      const { room, personId } = await learnerRoom(
        tx, data.courseAttemptId, data.facilitatedSessionId,
      );
      const [release] = await tx.select().from(facilitatedRoomActivityReleases)
        .where(and(
          eq(facilitatedRoomActivityReleases.id, data.activityReleaseId),
          eq(facilitatedRoomActivityReleases.facilitatedSessionId, room.id),
        )).for("update").limit(1);
      if (!release) throw new AuthorizationError("classroom activity for current room");
      // A retry after the facilitator closes the activity must still resolve
      // to the exact original immutable response.
      const [prior] = await tx.select().from(facilitatedRoomActivityResponses)
        .where(and(
          eq(facilitatedRoomActivityResponses.activityReleaseId, release.id),
          eq(facilitatedRoomActivityResponses.courseAttemptId, data.courseAttemptId),
          eq(facilitatedRoomActivityResponses.clientSubmissionId, data.clientSubmissionId),
        )).limit(1);
      if (prior) {
        if (prior.participantPersonId !== personId ||
            prior.clientInstanceId !== data.clientInstanceId ||
            prior.answerChoice !== data.answerChoice ||
            prior.answerText !== data.answerText)
          throw new Error("Conflicting learner response retry");
        return { saved: true, duplicate: true, graded: false };
      }
      if (release.closedAt ||
          (release.answerType === "single_choice" && (
            data.answerChoice === null || data.answerChoice >= release.choices.length)) ||
          (release.answerType === "text" && data.answerText === null))
        throw new AuthorizationError("open classroom activity and matching answer");
      const [saved] = await tx.insert(facilitatedRoomActivityResponses).values({
        facilitatedSessionId: room.id, activityReleaseId: release.id,
        courseAttemptId: data.courseAttemptId, participantPersonId: personId,
        clientInstanceId: data.clientInstanceId,
        clientSubmissionId: data.clientSubmissionId,
        answerChoice: data.answerChoice, answerText: data.answerText,
      }).onConflictDoNothing().returning({ id: facilitatedRoomActivityResponses.id });
      if (!saved) throw new Error("Concurrent response retry; refresh before another submission");
      return { saved: true, duplicate: false, graded: false };
    });
  });

const presenceInput = learnerInput.extend({
  clientInstanceId: uuid, clientEventId: uuid,
  eventKind: z.enum(["joined", "heartbeat", "away", "left"]),
}).strict();

export const recordClassroomPresence = createServerFn({ method: "POST" })
  .validator((v: unknown) => presenceInput.parse(v))
  .handler(async ({ data }) => {
    guard();
    return db.transaction(async tx => {
      const { room, personId } = await learnerRoom(
        tx, data.courseAttemptId, data.facilitatedSessionId,
      );
      const [prior] = await tx.select().from(facilitatedRoomPresenceEvents)
        .where(and(
          eq(facilitatedRoomPresenceEvents.facilitatedSessionId, room.id),
          eq(facilitatedRoomPresenceEvents.courseAttemptId, data.courseAttemptId),
          eq(facilitatedRoomPresenceEvents.clientEventId, data.clientEventId),
        )).limit(1);
      if (prior) {
        if (prior.participantPersonId !== personId ||
            prior.clientInstanceId !== data.clientInstanceId ||
            prior.eventKind !== data.eventKind)
          throw new Error("Conflicting device presence retry");
        return { recorded: true, duplicate: true, throttled: false };
      }
      if (data.eventKind === "heartbeat") {
        const [recent] = await tx.select({ id: facilitatedRoomPresenceEvents.id })
          .from(facilitatedRoomPresenceEvents).where(and(
            eq(facilitatedRoomPresenceEvents.facilitatedSessionId, room.id),
            eq(facilitatedRoomPresenceEvents.courseAttemptId, data.courseAttemptId),
            eq(facilitatedRoomPresenceEvents.clientInstanceId, data.clientInstanceId),
            eq(facilitatedRoomPresenceEvents.eventKind, "heartbeat"),
            gt(facilitatedRoomPresenceEvents.receivedAt, new Date(Date.now() - 30_000)),
          )).limit(1);
        if (recent) return { recorded: false, duplicate: false, throttled: true };
      }
      await tx.insert(facilitatedRoomPresenceEvents).values({
        facilitatedSessionId: room.id, courseAttemptId: data.courseAttemptId,
        participantPersonId: personId, clientInstanceId: data.clientInstanceId,
        clientEventId: data.clientEventId, eventKind: data.eventKind,
      }).onConflictDoNothing();
      return { recorded: true, duplicate: false, throttled: false };
    });
  });

/** Host-only operational aggregates. Never return raw learner answers to
 * projector routes; they use getClassroomPresentationState instead. */
export const getClassroomHostActivity = createServerFn({ method: "GET" })
  .validator((v: unknown) => roomInput.parse(v))
  .handler(async ({ data }) => {
    guard();
    const host = await requireCanonicalFacilitator();
    return db.transaction(async tx => {
      const room = await ownedRoom(tx, host, data.facilitatedSessionId);
      const releaseScope=await assignedClassroomRelease(tx,room);
      const releases = await tx.select().from(facilitatedRoomActivityReleases)
        .where(eq(facilitatedRoomActivityReleases.facilitatedSessionId, room.id))
        .orderBy(desc(facilitatedRoomActivityReleases.releasedAt)).limit(51);
      const paired = await tx.select({
        courseAttemptId: facilitatedLearningParticipants.courseAttemptId,
        participantPersonId: facilitatedLearningParticipants.participantPersonId,
      }).from(facilitatedLearningParticipants).where(and(
        eq(facilitatedLearningParticipants.facilitatedSessionId, room.id),
        isNull(facilitatedLearningParticipants.leftAt),
      )).limit(501);
      // Historical pairings created before a room was associated with a
      // release are never counted as this cohort's current participants.
      const allowed=new Set(paired.map(p=>p.courseAttemptId));
      const native=await nativeClassForRoom(tx,room);
      if(native){
        // A previously paired learner who transferred, withdrew or lost their
        // Class Enrollment must disappear from the aggregate denominator.
        // The Class ID is included BEFORE reading response counts.
        allowed.clear();
        const eligible=paired.length?await tx.select({
          attemptId:learnerCourseAttempts.id,
          personId:canonicalClassEnrollments.learnerPersonId,
        }).from(canonicalClassEnrollments)
          .innerJoin(learnerCourseAttempts,and(
            eq(learnerCourseAttempts.id,canonicalClassEnrollments.courseAttemptId),
            eq(learnerCourseAttempts.classEnrollmentId,canonicalClassEnrollments.id),
            eq(learnerCourseAttempts.deploymentId,room.deploymentId),
            eq(learnerCourseAttempts.courseVersionId,room.courseVersionId),
            eq(learnerCourseAttempts.status,"active"),
          ))
          .where(and(
            eq(canonicalClassEnrollments.classId,native.classId),
            eq(canonicalClassEnrollments.status,"active"),
            inArray(learnerCourseAttempts.id,paired.map(p=>p.courseAttemptId)),
          )):[];
        const identities=new Set(paired.map(p=>p.courseAttemptId+":"+p.participantPersonId));
        for(const member of eligible)if(identities.has(member.attemptId+":"+member.personId))
          allowed.add(member.attemptId);
      }
      if(releaseScope){
        allowed.clear();
        const claims=paired.length?await tx.select({
          attemptId:learnerCourseAttempts.id,
          personId:noncreditSelfEnrollmentClaims.participantPersonId,
        }).from(noncreditSelfEnrollmentClaims)
          .innerJoin(learnerCourseAttempts,eq(
            learnerCourseAttempts.noncreditRegistrationId,
            noncreditSelfEnrollmentClaims.registrationId,
          ))
          .where(and(
            eq(noncreditSelfEnrollmentClaims.releaseId,releaseScope),
            eq(noncreditSelfEnrollmentClaims.siteId,room.siteId),
            inArray(learnerCourseAttempts.id,paired.map(p=>p.courseAttemptId)),
          )):[];
        const identities=new Set(paired.map(
          p=>p.courseAttemptId+":"+p.participantPersonId,
        ));
        for(const claim of claims)if(identities.has(claim.attemptId+":"+claim.personId))
          allowed.add(claim.attemptId);
      }
      const responses = await tx.select({
        activityReleaseId: facilitatedRoomActivityResponses.activityReleaseId,
        courseAttemptId: facilitatedRoomActivityResponses.courseAttemptId,
        answerChoice: facilitatedRoomActivityResponses.answerChoice,
      }).from(facilitatedRoomActivityResponses)
        .where(eq(facilitatedRoomActivityResponses.facilitatedSessionId, room.id)).limit(1501);
      const presence = await tx.select({
        courseAttemptId: facilitatedRoomPresenceEvents.courseAttemptId,
        clientInstanceId: facilitatedRoomPresenceEvents.clientInstanceId,
        eventKind: facilitatedRoomPresenceEvents.eventKind,
        receivedAt: facilitatedRoomPresenceEvents.receivedAt,
      }).from(facilitatedRoomPresenceEvents)
        .where(eq(facilitatedRoomPresenceEvents.facilitatedSessionId, room.id))
        .orderBy(desc(facilitatedRoomPresenceEvents.receivedAt)).limit(2001);
      const latest = new Map<string, typeof presence[number]>();
      for (const event of presence) {
        const key = event.courseAttemptId + ":" + event.clientInstanceId;
        if (!latest.has(key)) latest.set(key, event);
      }
      const nowMs = Date.now();
      const active = new Set([...latest.values()].filter(event =>
        ["joined", "heartbeat"].includes(event.eventKind) &&
        nowMs - event.receivedAt.getTime() < 90_000,
      ).map(event => event.courseAttemptId).filter(id=>allowed.has(id)));
      return {
        roomState: facilitatedRoomOperationalState(room, new Date(nowMs)),
        releases: releases.slice(0, 50).map(r => {
          const answers = responses.filter(a => a.activityReleaseId === r.id &&
            allowed.has(a.courseAttemptId));
          const counts = r.answerType === "single_choice"
            ? r.choices.map((_, i) => answers.filter(a => a.answerChoice === i).length) : [];
          return {
            id: r.id, prompt: r.prompt, answerType: r.answerType,
            choices: r.choices, closed: r.closedAt !== null,
            releasedAt: r.releasedAt.toISOString(),
            responseEvents: answers.length,
            respondingLearners: new Set(answers.map(a => a.courseAttemptId)).size,
            choiceCounts: counts,
          };
        }),
        pairedCount: allowed.size,
        activeDevicesEstimate: active.size,
        partial: releases.length > 50 || paired.length > 500 ||
          responses.length > 1500 || presence.length > 2000,
        labels: {
          device: "Observed client activity, not verified attendance",
          response: "Formative answers; never official grades or completion",
        },
      };
    });
  });

/** Projector-safe: prompt and choices only. No student IDs, roster, responses,
 * text answers, presence, or attendance even in the server response body.
 */
export const getClassroomPresentationState = createServerFn({ method: "GET" })
  .validator((v: unknown) => roomInput.parse(v))
  .handler(async ({ data }) => {
    guard();
    const host = await requireCanonicalFacilitator();
    return db.transaction(async tx => {
      const room = await ownedRoom(tx, host, data.facilitatedSessionId);
      const [released] = await tx.select({
        id: facilitatedRoomActivityReleases.id,
        prompt: facilitatedRoomActivityReleases.prompt,
        answerType: facilitatedRoomActivityReleases.answerType,
        choices: facilitatedRoomActivityReleases.choices,
      }).from(facilitatedRoomActivityReleases)
        .where(and(
          eq(facilitatedRoomActivityReleases.facilitatedSessionId, room.id),
          isNull(facilitatedRoomActivityReleases.closedAt),
        )).orderBy(desc(facilitatedRoomActivityReleases.releasedAt)).limit(1);
      return {
        roomState: facilitatedRoomOperationalState(room, new Date()),
        current: released ?? null,
        note: "The shared display contains no private learner identities or responses.",
      };
    });
  });
