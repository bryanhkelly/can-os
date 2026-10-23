import { pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, updatedAt } from "./common";
import { sites } from "./organizations";

/**
 * A public address belongs to one canonical Site, not to an Organization name
 * or a Program slug. Nothing is public until a separate approved publication
 * workflow changes status from draft.
 */
export const sitePublications = pgTable("site_publications", {
  siteId: uuid("site_id").primaryKey().references(() => sites.id, { onDelete: "restrict" }),
  slug: text("slug").notNull(),
  status: text("status").notNull().default("draft"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, table => [
  uniqueIndex("site_publications_slug_uq").on(table.slug),
]);
