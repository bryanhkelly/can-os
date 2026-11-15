import { boolean, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { accessAccounts } from "./access";
import { people } from "./identity";
import { sites } from "./organizations";

/** Immutable, versioned consent. Favorites and role grants never imply sharing. */
export const accessSiteContactShareRevisions = pgTable("access_site_contact_share_revisions", {
  id: uuid("id").defaultRandom().primaryKey(),
  accountId: uuid("account_id").notNull().references(() => accessAccounts.id, { onDelete: "restrict" }),
  personId: uuid("person_id").notNull().references(() => people.id, { onDelete: "restrict" }),
  siteId: uuid("site_id").notNull().references(() => sites.id, { onDelete: "restrict" }),
  revisionNo: integer("revision_no").notNull(),
  decision: text("decision").$type<"grant"|"revoke">().notNull(),
  shareEmail: boolean("share_email").notNull(),
  shareName: boolean("share_name").notNull(),
  sharePhone: boolean("share_phone").notNull(),
  purpose: text("purpose").$type<"program_inquiry"|"school_application"|"staff_onboarding">().notNull(),
  consentVersion: text("consent_version").notNull(),
  decidedAt: timestamp("decided_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [
  uniqueIndex("access_site_contact_share_revision_uq").on(t.accountId, t.personId, t.siteId, t.revisionNo),
  index("access_site_contact_share_site_idx").on(t.siteId, t.personId, t.decidedAt),
]);
