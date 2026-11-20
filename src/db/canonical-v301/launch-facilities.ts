import { check, integer, index, jsonb, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/** Authoritative Site physical spaces. Room resources are self-reported and
 * never substitute for independent capability verification or accessibility
 * approval. Existing Site Space assertions retain their independent owner. */
export const siteSpaces = pgTable("site_spaces",{
  id:uuid("id").defaultRandom().primaryKey(),
  siteId:uuid("site_id").notNull(),
  code:text("code").notNull(),
  name:text("name").notNull(),
  maxOccupancy:integer("max_occupancy"),
  resources:jsonb("resources").$type<Record<string,unknown>>().notNull().default({}),
  revision:integer("revision").notNull().default(1),
}, t=>[
  uniqueIndex("site_spaces_site_code_idx").on(t.siteId,t.code),
  uniqueIndex("site_spaces_site_id_idx").on(t.id,t.siteId),
  index("site_spaces_lookup_idx").on(t.siteId),
  check("site_spaces_revision_positive",sql`${t.revision} > 0`),
]);
