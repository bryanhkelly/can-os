import { index, integer, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { educationV30 } from "./core";
import { learnerCourseAttempts } from "./learning";
import { facilitatedLearningSessions } from "./facilitated-learning";

/**
 * Existing production and test01 feedback table from the Phase 2 SQL.
 * Optional subjective ratings are kept separate from official progress,
 * attendance, assessment grades, certificates and grant evidence.
 */
export const facilitatedRoomFeedback = educationV30.table("facilitated_room_feedback", {
  id: uuid("id").defaultRandom().primaryKey(),
  facilitatedSessionId: uuid("facilitated_session_id").notNull()
    .references(() => facilitatedLearningSessions.id),
  courseAttemptId: uuid("course_attempt_id").notNull()
    .references(() => learnerCourseAttempts.id),
  participantPersonId: uuid("participant_person_id").notNull(),
  questionKey: text("question_key").$type<"clarity" | "technology" | "value">().notNull(),
  rating: integer("rating").notNull(),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [
  uniqueIndex("facilitated_room_feedback_facilitated_session_id_course_att_key")
    .on(t.facilitatedSessionId, t.courseAttemptId, t.questionKey),
  index("facilitated_room_feedback_time_idx").on(t.facilitatedSessionId, t.submittedAt),
]);
