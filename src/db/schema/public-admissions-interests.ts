import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, updatedAt } from "./common";
import { programs, sites } from "./organizations";

/**
 * An anonymous expression of interest, NOT an Application/Student/Household
 * or verified Guardian. Staged in the canonical admissions bounded context
 * until a registrar validates the relationship and uses existing intake.
 */
export const publicAdmissionsInterests = pgTable("public_admissions_interests", {
  id: id(),
  requestId: uuid("request_id").notNull(),
  siteId: uuid("site_id").notNull().references(() => sites.id, { onDelete: "restrict" }),
  programId: uuid("program_id").notNull().references(() => programs.id, { onDelete: "restrict" }),
  contactFirstName: text("contact_first_name").notNull(),
  contactLastName: text("contact_last_name").notNull(),
  contactEmail: text("contact_email").notNull(),
  /** Pepper-keyed digest for cooldown; no raw contact email in audit/event. */
  emailDigest: text("email_digest").notNull(),
  message: text("message").notNull(),
  status: text("status").notNull().default("new"),
  contactedAt: timestamp("contacted_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, table => [
  uniqueIndex("public_admissions_interests_request_uq").on(table.requestId),
  index("public_admissions_interests_program_idx").on(table.programId, table.createdAt),
  index("public_admissions_interests_contact_idx").on(table.programId, table.emailDigest, table.createdAt),
]);
