import { index, integer, jsonb, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { educationV30 } from "./core";
import type { ClassSessionAgendaItem } from "@/domain/native-class-session-agenda";

/**
 * WS4-only, append-only Session agenda revisions. No second timetable,
 * Course version, assessment, attendance or progress ledger is introduced.
 * Migration pending shared-schema approval in WS00.
 */
export const classSessionAgendaRevisions = educationV30.table(
  "class_session_agenda_revisions", {
    id: uuid("id").defaultRandom().primaryKey(),
    classSessionId: uuid("class_session_id").notNull(),
    courseVersionId: uuid("course_version_id").notNull(),
    revisionNo: integer("revision_no").notNull(),
    requestId: uuid("request_id").notNull(),
    items: jsonb("items").$type<ClassSessionAgendaItem[]>().notNull(),
    createdByPersonId: uuid("created_by_person_id").notNull(),
    createdAt: timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),
  }, t => [
    uniqueIndex("class_session_agenda_revision_uq").on(t.classSessionId,t.revisionNo),
    uniqueIndex("class_session_agenda_request_uq").on(t.classSessionId,t.requestId),
    index("class_session_agenda_history_idx").on(t.classSessionId,t.createdAt),
  ],
);
