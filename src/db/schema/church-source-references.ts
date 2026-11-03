import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, updatedAt } from "./common";
import { sites } from "./organizations";
import { people } from "./identity";
import type { ChurchReferenceKind, ChurchReferenceState } from "@/domain/church-source-references";

/** Private editorial inputs; not a source for any anonymous public projection. */
export const churchSourceReferences = pgTable("church_source_references", {
  id: id(),
  siteId: uuid("site_id").notNull().references(() => sites.id, { onDelete: "restrict" }),
  kind: text("kind").$type<ChurchReferenceKind>().notNull(),
  normalizedUrl: text("normalized_url").notNull(),
  referenceState: text("reference_state").$type<ChurchReferenceState>().notNull().default("saved"),
  addedByPersonId: uuid("added_by_person_id").notNull().references(() => people.id, { onDelete: "restrict" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
}, t => [
  uniqueIndex("church_source_reference_site_kind_uq").on(t.siteId, t.kind),
  index("church_source_reference_site_idx").on(t.siteId),
]);
