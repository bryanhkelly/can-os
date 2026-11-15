import { index, integer, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { educationV30 } from "./core";
import { facilitatedLearningSessions } from "./facilitated-learning";
/** Intent to control a shared display, not evidence that playback happened. */
export const facilitatedRoomControlCommands=educationV30.table("facilitated_room_control_commands",{
  id:uuid("id").defaultRandom().primaryKey(),
  facilitatedSessionId:uuid("facilitated_session_id").notNull().references(()=>facilitatedLearningSessions.id),
  facilitatorPersonId:uuid("facilitator_person_id").notNull(),
  requestId:uuid("request_id").notNull(),
  lessonId:uuid("lesson_id").notNull(),
  assetVersionId:uuid("asset_version_id").notNull(),
  commandKind:text("command_kind").$type<"load"|"play"|"pause"|"seek"|"stop">().notNull(),
  positionSeconds:integer("position_seconds").notNull().default(0),
  issuedAt:timestamp("issued_at",{withTimezone:true}).notNull().defaultNow(),
},t=>[
 uniqueIndex("facilitated_room_controls_request_uq").on(t.facilitatedSessionId,t.requestId),
 index("facilitated_room_controls_recent_idx").on(t.facilitatedSessionId,t.issuedAt,t.id),
]);
