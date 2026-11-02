import {
  index, integer, jsonb, pgTable, text, uniqueIndex, uuid,
} from "drizzle-orm/pg-core";
import { createdAt, id } from "./common";
import { sites } from "./organizations";
import { people } from "./identity";
import type { SiteLocalContent } from "@/domain/site-local-content";

/**
 * Append-only church-owned website copy. Current public copy is the highest
 * revision with status='published'; held revisions never replace it.
 * No CAN-owned curriculum, tuition or admissions fact is stored here.
 */
export const siteLocalContentVersions = pgTable("site_local_content_versions", {
  id: id(),
  siteId: uuid("site_id").notNull()
    .references(() => sites.id, { onDelete: "restrict" }),
  revision: integer("revision").notNull(),
  status: text("status").notNull(),
  content: jsonb("content").$type<SiteLocalContent>().notNull(),
  flaggedFields: jsonb("flagged_fields").$type<string[]>().default([]).notNull(),
  createdByPersonId: uuid("created_by_person_id").notNull()
    .references(() => people.id, { onDelete: "restrict" }),
  restoredFromRevision: integer("restored_from_revision"),
  createdAt: createdAt(),
}, t => [
  uniqueIndex("site_local_content_site_revision_uq").on(t.siteId, t.revision),
  index("site_local_content_site_status_idx").on(t.siteId, t.status, t.revision),
]);
