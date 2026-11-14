import { createHash } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  canonicalLearningEvents, canonicalLearningSessions, courseLessons, learnerCourseAttempts,
} from "@/db/canonical-v301";
import { AuthorizationError } from "@/domain/command-context";
import {
  boundedCanonicalActiveMs, canonicalLearningEventSchema,
  learningSessionIsExpired, validateLearningEventTime,
} from "@/domain/canonical-learning-activity";
import { getCanonicalCommandContext } from "@/modules/identity/canonical-command-context.server";
import { authorizeCanonicalCourseAttempt } from "./canonical-course-participation.server";

const uuid = z.string().uuid();
const attemptInput = z.object({ courseAttemptId: uuid }).strict();
const sessionInput = attemptInput.extend({ learningSessionId: uuid });
const eventInput = sessionInput.extend({ event: canonicalLearningEventSchema });
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function currentLearner(tx: Tx, courseAttemptId: string) {
  const actor = await getCanonicalCommandContext(getRequest());
  if (!actor.sessionId || !actor.actorPersonId) throw new AuthorizationError("authenticated session");
  await authorizeCanonicalCourseAttempt(tx, actor, courseAttemptId);
  const [attempt] = await tx.select({
    id: learnerCourseAttempts.id,
    courseVersionId: learnerCourseAttempts.courseVersionId,
  }).from(learnerCourseAttempts)
    .where(eq(learnerCourseAttempts.id, courseAttemptId)).limit(1);
  if (!attempt) throw new AuthorizationError("current course attempt");
  return { actor, attempt };
}
async function ownedSession(tx: Tx, input: z.infer<typeof sessionInput>) {
  const { actor, attempt } = await currentLearner(tx, input.courseAttemptId);
  const [session] = await tx.select().from(canonicalLearningSessions)
    .where(and(
      eq(canonicalLearningSessions.id, input.learningSessionId),
      eq(canonicalLearningSessions.courseAttemptId, attempt.id),
      eq(canonicalLearningSessions.courseVersionId, attempt.courseVersionId),
      eq(canonicalLearningSessions.participantPersonId, actor.actorPersonId),
      eq(canonicalLearningSessions.accessSessionId, actor.sessionId),
    )).limit(1).for("update");
  if (!session) throw new AuthorizationError("owned course learning session");
  return { actor, attempt, session };
}
function output(session: typeof canonicalLearningSessions.$inferSelect) {
  return {
    learningSessionId: session.id, courseAttemptId: session.courseAttemptId,
    state: session.state, startedAt: session.startedAt.toISOString(),
    lastInteractionAt: session.lastInteractionAt?.toISOString() ?? null,
    estimatedActiveMs: session.estimatedActiveMs,
  };
}

/** Authenticated, attempt-scoped session. Reusing the same login does not create duplicate live rows. */
export const startCanonicalLearningSession = createServerFn({ method: "POST" })
  .validator((input: unknown) => attemptInput.parse(input))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    return db.transaction(async tx => {
      const { actor, attempt } = await currentLearner(tx, data.courseAttemptId);
      const now = new Date();
      const [existing] = await tx.select().from(canonicalLearningSessions).where(and(
        eq(canonicalLearningSessions.courseAttemptId, attempt.id),
        eq(canonicalLearningSessions.accessSessionId, actor.sessionId),
        isNull(canonicalLearningSessions.endedAt),
      )).limit(1).for("update");
      if (existing && !learningSessionIsExpired(existing.startedAt, existing.lastInteractionAt, now)) {
        if (existing.participantPersonId !== actor.actorPersonId ||
            existing.courseVersionId !== attempt.courseVersionId)
          throw new AuthorizationError("current session participant and course version");
        return { ...output(existing), reused: true };
      }
      if (existing) {
        await tx.update(canonicalLearningSessions).set({state:"ended", endedAt:now})
          .where(eq(canonicalLearningSessions.id,existing.id));
      }
      // Serialize browser-tab races through the partial unique live-session index.
      await tx.insert(canonicalLearningSessions).values({
        courseAttemptId: attempt.id, courseVersionId: attempt.courseVersionId,
        accessSessionId: actor.sessionId, participantPersonId: actor.actorPersonId,
      }).onConflictDoNothing();
      const [created] = await tx.select().from(canonicalLearningSessions).where(and(
        eq(canonicalLearningSessions.courseAttemptId,attempt.id),
        eq(canonicalLearningSessions.accessSessionId,actor.sessionId),
        isNull(canonicalLearningSessions.endedAt),
      )).limit(1);
      if (!created || created.participantPersonId !== actor.actorPersonId ||
          created.courseVersionId !== attempt.courseVersionId)
        throw new AuthorizationError("current learning session");
      return { ...output(created), reused: false };
    });
  });

/** Explicit lifecycle changes do not add active learning time. */
export const setCanonicalLearningSessionState = createServerFn({method:"POST"})
  .validator((input:unknown) => sessionInput.extend({
    action:z.enum(["pause","resume","end"]),
  }).parse(input))
  .handler(async ({data}) => {
    setResponseHeader("Cache-Control","private, no-store");
    return db.transaction(async tx => {
      const {session}=await ownedSession(tx,data);
      const now=new Date();
      if (session.endedAt) return { ...output(session), changed:false };
      const expired=learningSessionIsExpired(session.startedAt,session.lastInteractionAt,now);
      const end=data.action==="end" || expired;
      const state=end?"ended":data.action==="pause"?"paused":"active";
      const [saved]=await tx.update(canonicalLearningSessions)
        .set({
          state, endedAt:end?now:null,
          lastForeground:false,
          lastInteractionAt:session.lastInteractionAt,
          lastLessonId:null,
        }).where(eq(canonicalLearningSessions.id,session.id)).returning();
      if (!saved) throw new Error("Learning session update failed");
      return {...output(saved),changed:saved.state!==session.state};
    });
  });

/** Append-only evidence. No telemetry event writes an authoritative grade, attendance or completion. */
export const recordCanonicalLearningEvent = createServerFn({method:"POST"})
  .validator((input:unknown)=>eventInput.parse(input))
  .handler(async ({data})=>{
    setResponseHeader("Cache-Control","private, no-store");
    return db.transaction(async tx=>{
      const {attempt,session}=await ownedSession(tx,data);
      const digest=createHash("sha256").update(JSON.stringify(data.event)).digest("hex");
      const [prior]=await tx.select().from(canonicalLearningEvents).where(and(
        eq(canonicalLearningEvents.learningSessionId,session.id),
        eq(canonicalLearningEvents.clientEventId,data.event.clientEventId),
      )).limit(1);
      if (prior) {
        if(prior.requestDigest!==digest) throw new Error("Conflicting event retry");
        return {recorded:true,duplicate:true,estimatedActiveMs:prior.estimatedActiveMs};
      }
      const now=new Date();
      if(session.endedAt || session.state!=="active" ||
          learningSessionIsExpired(session.startedAt,session.lastInteractionAt,now))
        throw new AuthorizationError("active learning session");
      validateLearningEventTime(data.event.occurredAt,now);
      if(data.event.lessonId) {
        const [lesson]=await tx.select({id:courseLessons.id}).from(courseLessons).where(and(
          eq(courseLessons.id,data.event.lessonId),
          eq(courseLessons.courseVersionId,attempt.courseVersionId),
        )).limit(1);
        if(!lesson) throw new AuthorizationError("published course lesson");
      }
      // Resource/media/assessment references are observation hints, not validated academic outcomes.
      const estimatedActiveMs=boundedCanonicalActiveMs({
        event:data.event, previousReceivedAt:session.lastInteractionAt,now,
        previousForeground:session.lastForeground,
        sameLesson:session.lastLessonId===data.event.lessonId,
      });
      const [recorded]=await tx.insert(canonicalLearningEvents).values({
        learningSessionId:session.id,courseAttemptId:attempt.id,
        clientEventId:data.event.clientEventId,requestDigest:digest,
        kind:data.event.kind,lessonId:data.event.lessonId,resourceId:data.event.resourceId,
        occurredAt:new Date(data.event.occurredAt),receivedAt:now,estimatedActiveMs,
      }).returning({id:canonicalLearningEvents.id});
      if(!recorded)throw new Error("Unable to record learning event");
      await tx.update(canonicalLearningSessions).set({
        lastInteractionAt:now,
        lastForeground:data.event.kind==="engaged_interval"
          ? true
          : data.event.kind==="lesson_opened" || data.event.kind==="lesson_resumed",
        lastLessonId:data.event.lessonId,
        estimatedActiveMs:session.estimatedActiveMs+estimatedActiveMs,
      }).where(eq(canonicalLearningSessions.id,session.id));
      return {recorded:true,duplicate:false,estimatedActiveMs};
    });
  });

/** The current learner's own course-attempt timeline. */
export const getCanonicalLearningHistory=createServerFn({method:"GET"})
  .validator((input:unknown)=>attemptInput.parse(input))
  .handler(async({data})=>{
    setResponseHeader("Cache-Control","private, no-store");
    return db.transaction(async tx=>{
      // The completed-attempt history path may be enabled once policy and read grants are tested.
      await currentLearner(tx,data.courseAttemptId);
      const events=await tx.select({
        id:canonicalLearningEvents.id,kind:canonicalLearningEvents.kind,
        lessonId:canonicalLearningEvents.lessonId,resourceId:canonicalLearningEvents.resourceId,
        receivedAt:canonicalLearningEvents.receivedAt,
        estimatedActiveMs:canonicalLearningEvents.estimatedActiveMs,
      }).from(canonicalLearningEvents)
        .where(eq(canonicalLearningEvents.courseAttemptId,data.courseAttemptId))
        .orderBy(desc(canonicalLearningEvents.receivedAt)).limit(100);
      return {courseAttemptId:data.courseAttemptId,events:events.map(e=>({
        ...e,receivedAt:e.receivedAt.toISOString(),
      }))};
    });
  });
