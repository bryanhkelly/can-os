import { text, uuid, pgTable } from "drizzle-orm/pg-core";

/**
 * Roster names come from the ONE authoritative Person identity.
 * Classroom enrollment and verified room pairing still determine which
 * Person UUIDs may be included in a facilitator's attendance projection.
 * This table is never itself proof of classroom authorization.
 */
export const classroomPersons = pgTable("people", {
  id: uuid("id").primaryKey(),
  legalFirstName: text("legal_first_name").notNull(),
  legalLastName: text("legal_last_name").notNull(),
  preferredName: text("preferred_name"),
});
