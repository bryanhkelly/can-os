import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, id, updatedAt } from "./common";
import { communicationParticipantType } from "./enums";
import { people } from "./identity";

export const communicationThreads = pgTable(
  "communication_threads",
  {
    id: id(),
    subject: text("subject").notNull(),
    contextType: text("context_type"),
    contextId: uuid("context_id"),
    createdByPersonId: uuid("created_by_person_id")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("communication_context_idx").on(table.contextType, table.contextId)],
);

export const communicationParticipants = pgTable(
  "communication_participants",
  {
    id: id(),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => communicationThreads.id, { onDelete: "cascade" }),
    participantType: communicationParticipantType("participant_type").notNull(),
    participantId: uuid("participant_id").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("communication_participant_uq").on(
      table.threadId,
      table.participantType,
      table.participantId,
    ),
  ],
);

export const communicationMessages = pgTable(
  "communication_messages",
  {
    id: id(),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => communicationThreads.id, { onDelete: "cascade" }),
    senderPersonId: uuid("sender_person_id")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    body: text("body").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).defaultNow().notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: createdAt(),
  },
  (table) => [index("communication_message_thread_idx").on(table.threadId, table.sentAt)],
);
