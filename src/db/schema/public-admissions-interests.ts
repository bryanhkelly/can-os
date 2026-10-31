import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, updatedAt } from "./common";
import { programs, sites } from "./organizations";
import { applications } from "./admissions";
import { communicationThreads } from "./communication";
import { publicFamilyStartRequests } from "./public-family-starts";
import { people } from "./identity";

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
  /** Explicit adult follow-up consent, never inferred from staff-imported contacts. */
  contactConsentAt: timestamp("contact_consent_at", { withTimezone: true }),
  source: text("source").notNull().default("published_site"),
  invitationBatchId: uuid("invitation_batch_id").references(() => communicationThreads.id, { onDelete: "restrict" }),
  invitationRecipientKey: uuid("invitation_recipient_key"),
  familyStartRequestId: uuid("family_start_request_id").references(() => publicFamilyStartRequests.id, { onDelete: "restrict" }),
  status: text("status").notNull().default("new"),
  contactedAt: timestamp("contacted_at", { withTimezone: true }),
  /** Set only by the existing registrar createAdmissionsInquiry command. */
  applicationId: uuid("application_id").references(() => applications.id, { onDelete: "restrict" }),
  convertedAt: timestamp("converted_at", { withTimezone: true }),
  convertedByPersonId: uuid("converted_by_person_id").references(() => people.id, { onDelete: "restrict" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, table => [
  uniqueIndex("public_admissions_interests_request_uq").on(table.requestId),
  uniqueIndex("public_admissions_interests_application_uq").on(table.applicationId),
  uniqueIndex("public_admissions_interests_invited_recipient_uq").on(table.invitationBatchId, table.invitationRecipientKey),
  index("public_admissions_interests_program_idx").on(table.programId, table.createdAt),
  index("public_admissions_interests_contact_idx").on(table.programId, table.emailDigest, table.createdAt),
]);
