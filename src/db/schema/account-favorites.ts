import { index, pgTable, primaryKey, timestamp, uuid } from "drizzle-orm/pg-core";
import { accessAccounts } from "./access";
import { sites } from "./organizations";

/** Account-owned bookmarks, never institutional memberships or access grants. */
export const accessAccountFavoriteSites = pgTable("access_account_favorite_sites", {
  accountId: uuid("account_id").notNull().references(() => accessAccounts.id, { onDelete: "cascade" }),
  siteId: uuid("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  primaryKey({ columns: [table.accountId, table.siteId] }),
  index("access_account_favorite_sites_site_idx").on(table.siteId),
]);
