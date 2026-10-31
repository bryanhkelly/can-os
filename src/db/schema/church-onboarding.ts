import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, updatedAt } from "./common";
import { documents } from "./documents";
import { people } from "./identity";
import { organizations, sites } from "./organizations";

/** Anonymous requests are claims, never verified organizations or active grants. */
export const churchOnboardingRequests = pgTable("church_onboarding_requests", {
  id: id(),
  churchName: text("church_name").notNull(),
  churchSlug: text("church_slug").notNull(),
  siteName: text("site_name").notNull(),
  siteSlug: text("site_slug").notNull(),
  timezone: text("timezone").notNull(),
  churchWebsite: text("church_website"),
  leaderTitle: text("leader_title").notNull(),
  contactEmail: text("contact_email").notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  status: text("status").notNull().default("submitted"),
  authorityDocumentId: uuid("authority_document_id").references(() => documents.id, { onDelete: "restrict" }),
  verifiedByPersonId: uuid("verified_by_person_id").references(() => people.id, { onDelete: "restrict" }),
  approvedByPersonId: uuid("approved_by_person_id").references(() => people.id, { onDelete: "restrict" }),
  churchId: uuid("church_id").references(() => organizations.id, { onDelete: "restrict" }),
  siteId: uuid("site_id").references(() => sites.id, { onDelete: "restrict" }),
  invitationGrantId: uuid("invitation_grant_id"),
  decisionNote: text("decision_note"),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, t => [
  index("church_onboarding_requests_status_idx").on(t.status, t.createdAt),
  index("church_onboarding_requests_contact_idx").on(t.contactEmail, t.createdAt),
]);
