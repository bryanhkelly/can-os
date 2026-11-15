import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { accessAccounts } from "./access";

/** Provisional, email-verified personal account setup. Not an institutional grant. */
export const accessAccountSignups = pgTable("access_account_signups", {
  accountId: uuid("account_id").primaryKey().references(() => accessAccounts.id, { onDelete: "cascade" }),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
