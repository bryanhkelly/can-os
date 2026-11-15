import { check, index, integer, jsonb, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { educationV30 } from "./core";
import { learnerCourseAttempts } from "./learning";
import { facilitatedLearningSessions } from "./facilitated-learning";

const id = () => uuid("id").defaultRandom().primaryKey();
const at = () => timestamp("received_at", { withTimezone: true }).defaultNow().notNull();
export const facilitatedRoomActivityReleases = educationV30.table("facilitated_room_activity_releases",{
  id:id(),
  facilitatedSessionId:uuid("facilitated_session_id").notNull().references(()=>facilitatedLearningSessions.id),
  releasedByPersonId:uuid("released_by_person_id").notNull(),
  requestId:uuid("request_id").notNull(),
  lessonId:uuid("lesson_id"),
  prompt:text("prompt").notNull(),
  answerType:text("answer_type").$type<"single_choice"|"text">().notNull(),
  choices:jsonb("choices").$type<string[]>().notNull().default([]),
  releasedAt:timestamp("released_at",{withTimezone:true}).notNull().defaultNow(),
  closedAt:timestamp("closed_at",{withTimezone:true}),
},t=>[
  uniqueIndex("facilitated_room_activity_release_dedupe_uq").on(t.facilitatedSessionId,t.requestId),
  index("facilitated_room_release_session_time_idx").on(t.facilitatedSessionId,t.releasedAt),
  check("facilitated_room_release_prompt_ck",sql`length(${t.prompt}) BETWEEN 5 AND 1000`),
]);
export const facilitatedRoomActivityResponses = educationV30.table("facilitated_room_activity_responses",{
  id:id(),
  facilitatedSessionId:uuid("facilitated_session_id").notNull().references(()=>facilitatedLearningSessions.id),
  activityReleaseId:uuid("activity_release_id").notNull().references(()=>facilitatedRoomActivityReleases.id),
  courseAttemptId:uuid("course_attempt_id").notNull().references(()=>learnerCourseAttempts.id),
  participantPersonId:uuid("participant_person_id").notNull(),
  clientSubmissionId:uuid("client_submission_id").notNull(),
  clientInstanceId:uuid("client_instance_id").notNull(),
  answerChoice:integer("answer_choice"),
  answerText:text("answer_text"),
  submittedAt:timestamp("submitted_at",{withTimezone:true}).notNull().defaultNow(),
},t=>[
  uniqueIndex("facilitated_room_response_dedupe_uq").on(t.activityReleaseId,t.courseAttemptId,t.clientSubmissionId),
  index("facilitated_room_responses_room_idx").on(t.facilitatedSessionId,t.activityReleaseId),
  index("facilitated_room_responses_attempt_idx").on(t.courseAttemptId,t.submittedAt),
]);
export const facilitatedRoomPresenceEvents = educationV30.table("facilitated_room_presence_events",{
  id:id(),
  facilitatedSessionId:uuid("facilitated_session_id").notNull().references(()=>facilitatedLearningSessions.id),
  courseAttemptId:uuid("course_attempt_id").notNull().references(()=>learnerCourseAttempts.id),
  participantPersonId:uuid("participant_person_id").notNull(),
  clientInstanceId:uuid("client_instance_id").notNull(),
  clientEventId:uuid("client_event_id").notNull(),
  eventKind:text("event_kind").$type<"joined"|"heartbeat"|"away"|"left">().notNull(),
  receivedAt:at(),
},t=>[
  uniqueIndex("facilitated_room_presence_event_dedupe_uq").on(t.facilitatedSessionId,t.courseAttemptId,t.clientEventId),
  index("facilitated_room_presence_room_recent_idx").on(t.facilitatedSessionId,t.receivedAt),
  index("facilitated_room_presence_attempt_idx").on(t.courseAttemptId,t.receivedAt),
]);
export const facilitatedRoomAttendanceAssertions = educationV30.table("facilitated_room_attendance_assertions",{
  id:id(),
  facilitatedSessionId:uuid("facilitated_session_id").notNull().references(()=>facilitatedLearningSessions.id),
  courseAttemptId:uuid("course_attempt_id").notNull().references(()=>learnerCourseAttempts.id),
  facilitatorPersonId:uuid("facilitator_person_id").notNull(),
  requestId:uuid("request_id").notNull(),
  status:text("status").$type<"present"|"absent"|"unknown">().notNull(),
  method:text("method").$type<"in_person_roll_call"|"remote_live_check">().notNull(),
  evidenceNote:text("evidence_note"),
  assertedAt:timestamp("asserted_at",{withTimezone:true}).notNull().defaultNow(),
},t=>[
  uniqueIndex("facilitated_room_attendance_request_uq").on(t.facilitatedSessionId,t.requestId),
  index("facilitated_room_attendance_latest_idx").on(t.facilitatedSessionId,t.courseAttemptId,t.assertedAt),
]);
export const facilitatedRoomFeedback = educationV30.table("facilitated_room_feedback",{
  id:id(),
  facilitatedSessionId:uuid("facilitated_session_id").notNull().references(()=>facilitatedLearningSessions.id),
  courseAttemptId:uuid("course_attempt_id").notNull().references(()=>learnerCourseAttempts.id),
  participantPersonId:uuid("participant_person_id").notNull(),
  questionKey:text("question_key").$type<"clarity"|"technology"|"value">().notNull(),
  rating:integer("rating").notNull(),
  submittedAt:timestamp("submitted_at",{withTimezone:true}).notNull().defaultNow(),
  updatedAt:timestamp("updated_at",{withTimezone:true}).notNull().defaultNow(),
},t=>[
  uniqueIndex("facilitated_room_feedback_once_uq").on(t.facilitatedSessionId,t.courseAttemptId,t.questionKey),
  index("facilitated_room_feedback_time_idx").on(t.facilitatedSessionId,t.submittedAt),
]);
export const facilitatedRoomSurveyCampaigns = educationV30.table("facilitated_room_survey_campaigns",{
  facilitatedSessionId:uuid("facilitated_session_id").notNull().references(()=>facilitatedLearningSessions.id),
  surveyCampaignId:uuid("survey_campaign_id").notNull(),
  stage:text("stage").$type<"entry"|"pulse"|"exit">().notNull(),
  linkedByPersonId:uuid("linked_by_person_id").notNull(),
  linkedAt:timestamp("linked_at",{withTimezone:true}).notNull().defaultNow(),
},t=>[
 uniqueIndex("facilitated_room_survey_link_uq").on(t.facilitatedSessionId,t.surveyCampaignId,t.stage),
]);
