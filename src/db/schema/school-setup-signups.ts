import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { accessAccounts } from "./access";
import { createdAt, id, updatedAt } from "./common";
import { organizations, sites } from "./organizations";

/** Real-school self-service data is inert until its email challenge is redeemed. */
export const schoolSetupSignups = pgTable("school_setup_signups", {
  id: id(),
  accountId: uuid("account_id").notNull().references(() => accessAccounts.id, { onDelete: "cascade" }),
  schoolName: text("school_name").notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "restrict" }),
  siteId: uuid("site_id").references(() => sites.id, { onDelete: "restrict" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, table => [
  uniqueIndex("school_setup_signup_account_uq").on(table.accountId),
  uniqueIndex("school_setup_signup_org_uq").on(table.organizationId),
  uniqueIndex("school_setup_signup_site_uq").on(table.siteId),
  index("school_setup_signup_expiry_idx").on(table.expiresAt),
]);