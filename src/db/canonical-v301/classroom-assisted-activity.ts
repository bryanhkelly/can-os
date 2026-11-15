import { check, index, integer, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { educationV30 } from "./core";
import { facilitatedLearningSessions } from "./facilitated-learning";
import { facilitatedRoomActivityReleases } from "./facilitated-room-evidence";
import { learnerCourseAttempts } from "./learning";

/**
 * Paper, verbal, or shared-device evidence is explicitly FACILITATOR-attributed.
 * Do not write these into learner-submitted activity responses or grades.
 */
export const facilitatedRoomAssistedActivityEvidence =
  educationV30.table("facilitated_room_assisted_activity_evidence", {
    id:uuid("id").defaultRandom().primaryKey(),
    facilitatedSessionId:uuid("facilitated_session_id").notNull()
      .references(()=>facilitatedLearningSessions.id),
    activityReleaseId:uuid("activity_release_id").notNull()
      .references(()=>facilitatedRoomActivityReleases.id),
    courseAttemptId:uuid("course_attempt_id").notNull()
      .references(()=>learnerCourseAttempts.id),
    learnerPersonId:uuid("learner_person_id").notNull(),
    facilitatorPersonId:uuid("facilitator_person_id").notNull(),
    requestId:uuid("request_id").notNull(),
    method:text("method").$type<"paper"|"shared_device"|"verbal">().notNull(),
    answerChoice:integer("answer_choice"),
    answerText:text("answer_text"),
    evidenceNote:text("evidence_note").notNull(),
    recordedAt:timestamp("recorded_at",{withTimezone:true}).notNull().defaultNow(),
  },t=>[
    uniqueIndex("facilitated_assisted_activity_request_uq")
      .on(t.facilitatedSessionId,t.requestId),
    index("facilitated_assisted_activity_room_idx")
      .on(t.facilitatedSessionId,t.activityReleaseId),
    index("facilitated_assisted_activity_attempt_idx")
      .on(t.courseAttemptId,t.recordedAt),
    check("facilitated_assisted_activity_answer_ck",sql`(
      (${t.answerChoice} IS NOT NULL AND ${t.answerText} IS NULL)
      OR (${t.answerChoice} IS NULL AND ${t.answerText} IS NOT NULL)
    )`),
  ]);
