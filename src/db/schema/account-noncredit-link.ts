import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { accessAccounts } from "./access";
import { people } from "./identity";

/** User-confirmed, verified-session bridge; never inferred from email alone. */
export const accessAccountNoncreditPrincipals = pgTable("access_account_noncredit_principals", {
  accessAccountId: uuid("access_account_id").primaryKey()
    .references(() => accessAccounts.id,{onDelete:"restrict"}),
  accessPersonId: uuid("access_person_id").notNull()
    .references(() => people.id,{onDelete:"restrict"}),
  canonicalAccountId: uuid("canonical_account_id").notNull().unique(),
  canonicalPersonId: uuid("canonical_person_id").notNull().unique(),
  linkedAt: timestamp("linked_at",{withTimezone:true}).notNull().defaultNow(),
  linkageMethod: text("linkage_method").notNull().default("verified_existing_can_session"),
});
