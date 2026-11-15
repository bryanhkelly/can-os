import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  facilitatedLearningParticipants, facilitatedLearningSessions,
  facilitatedRoomFeedback,
} from "@/db/canonical-v301";
import { AuthorizationError } from "@/domain/command-context";
import {
  classroomFeedbackClosesAt, classroomFeedbackOpen, classroomFeedbackWindowMs,
} from "@/domain/classroom-feedback";
import { facilitatedRoomMaxMs } from "@/domain/facilitated-learning";
import { getInstructionalLearnerContext } from "@/modules/identity/learning-command-context.server";
import { authorizeCanonicalCourseAttempt } from "./canonical-course-participation.server";
import { requireFacilitatedLearningEnabled } from "./canonical-learning-release.server";

const uuid = z.string().uuid();
const historyInput = z.object({ courseAttemptId: uuid }).strict();
const feedbackInput = historyInput.extend({
  facilitatedSessionId: uuid,
  questionKey: z.enum(["clarity", "technology", "value"]),
  rating: z.number().int().min(1).max(5),
}).strict();

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Learner = Awaited<ReturnType<typeof getInstructionalLearnerContext>>;
type QuestionKey = "clarity" | "technology" | "value";

function privateFeedback() {
  requireFacilitatedLearningEnabled();
  setResponseHeader("Cache-Control", "private, no-store");
  setResponseHeader("Referrer-Policy", "no-referrer");
}

async function currentCourse(
  tx: Tx, actor: Learner, courseAttemptId: string,
) {
  if (!actor.actorPersonId || !["learner", "student"].includes(actor.role ?? ""))
    throw new AuthorizationError("authenticated learner feedback");
  return authorizeCanonicalCourseAttempt(tx, actor, courseAttemptId, true);
}

/**
 * Show only the signed-in person's own previously paired rooms. Feedback may
 * continue after a learner leaves or a room ends, but never after the bounded
 * seven-day period. We disclose no other participant identities or answers.
 */
export const getRecentClassroomFeedback = createServerFn({ method: "GET" })
  .validator((v: unknown) => historyInput.parse(v))
  .handler(async ({ data }) => {
    privateFeedback();
    const actor = await getInstructionalLearnerContext(getRequest());
    return db.transaction(async tx => {
      const access = await currentCourse(tx, actor, data.courseAttemptId);
      const now = new Date();
      const earliest = new Date(now.getTime() - facilitatedRoomMaxMs - classroomFeedbackWindowMs);
      const paired = await tx.select({ room: facilitatedLearningSessions })
        .from(facilitatedLearningParticipants)
        .innerJoin(facilitatedLearningSessions, eq(
          facilitatedLearningParticipants.facilitatedSessionId, facilitatedLearningSessions.id,
        ))
        .where(and(
          eq(facilitatedLearningParticipants.courseAttemptId, data.courseAttemptId),
          eq(facilitatedLearningParticipants.participantPersonId, actor.actorPersonId!),
          gte(facilitatedLearningSessions.startedAt, earliest),
        ))
        .orderBy(desc(facilitatedLearningSessions.startedAt)).limit(15);
      const rooms = paired.filter(({ room }) =>
        room.deploymentId === access.deploymentId &&
        room.courseVersionId === access.courseVersionId &&
        classroomFeedbackOpen(room, now),
      ).slice(0, 5);
      const ids = rooms.map(({ room }) => room.id);
      const saved = ids.length ? await tx.select({
        facilitatedSessionId: facilitatedRoomFeedback.facilitatedSessionId,
        questionKey: facilitatedRoomFeedback.questionKey,
        rating: facilitatedRoomFeedback.rating,
      }).from(facilitatedRoomFeedback).where(and(
        inArray(facilitatedRoomFeedback.facilitatedSessionId, ids),
        eq(facilitatedRoomFeedback.courseAttemptId, data.courseAttemptId),
        eq(facilitatedRoomFeedback.participantPersonId, actor.actorPersonId!),
      )) : [];
      return {
        rooms: rooms.map(({ room }) => {
          const ratings: Partial<Record<QuestionKey, number>> = {};
          for (const row of saved) {
            if (row.facilitatedSessionId === room.id) ratings[row.questionKey] = row.rating;
          }
          return {
            facilitatedSessionId: room.id,
            startedAt: room.startedAt.toISOString(),
            feedbackClosesAt: classroomFeedbackClosesAt(room).toISOString(),
            ratings,
          };
        }),
        notice: "Optional subjective ratings; never attendance, grades or completion.",
      };
    });
  });

/** One rating per participant, room and question; revisions are allowed.
 * DB writes are performed using trusted identity and explicit row ownership. */
export const submitClassroomFeedback = createServerFn({ method: "POST" })
  .validator((v: unknown) => feedbackInput.parse(v))
  .handler(async ({ data }) => {
    privateFeedback();
    const actor = await getInstructionalLearnerContext(getRequest());
    return db.transaction(async tx => {
      const access = await currentCourse(tx, actor, data.courseAttemptId);
      const [row] = await tx.select({ room: facilitatedLearningSessions })
        .from(facilitatedLearningParticipants)
        .innerJoin(facilitatedLearningSessions, eq(
          facilitatedLearningParticipants.facilitatedSessionId, facilitatedLearningSessions.id,
        )).where(and(
          eq(facilitatedLearningParticipants.facilitatedSessionId, data.facilitatedSessionId),
          eq(facilitatedLearningParticipants.courseAttemptId, data.courseAttemptId),
          eq(facilitatedLearningParticipants.participantPersonId, actor.actorPersonId!),
        )).limit(1);
      if (!row || row.room.deploymentId !== access.deploymentId ||
          row.room.courseVersionId !== access.courseVersionId ||
          !classroomFeedbackOpen(row.room, new Date())) {
        throw new AuthorizationError("own recently paired classroom");
      }
      await tx.insert(facilitatedRoomFeedback).values({
        facilitatedSessionId: data.facilitatedSessionId,
        courseAttemptId: data.courseAttemptId,
        participantPersonId: actor.actorPersonId!,
        questionKey: data.questionKey,
        rating: data.rating,
      }).onConflictDoUpdate({
        target: [
          facilitatedRoomFeedback.facilitatedSessionId,
          facilitatedRoomFeedback.courseAttemptId,
          facilitatedRoomFeedback.questionKey,
        ],
        set: { rating: data.rating, updatedAt: new Date() },
      });
      return { saved: true, note: "Session feedback saved; no learning outcome was changed." };
    });
  });
