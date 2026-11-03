import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createdAt, id } from "./common";
import { sites } from "./organizations";
import { people } from "./identity";
import { churchSourceReferences } from "./church-source-references";
import type { ChurchSuggestionField } from "@/domain/church-source-references";

/** Private attributable editorial proposals, never public School facts. */
export const churchContentSuggestions = pgTable("church_content_suggestions", {
  id: id(),
  siteId: uuid("site_id").notNull().references(() => sites.id, { onDelete: "restrict" }),
  sourceReferenceId: uuid("source_reference_id").notNull()
    .references(() => churchSourceReferences.id, { onDelete: "restrict" }),
  field: text("field").$type<ChurchSuggestionField>().notNull(),
  proposedText: text("proposed_text").notNull(),
  sourcePageUrl: text("source_page_url"),
  retrievedAt: timestamp("retrieved_at", { withTimezone: true }).notNull(),
  confidence: text("confidence").$type<"high"|"medium"|"low">().notNull().default("low"),
  reviewDecision: text("review_decision").$type<"pending"|"accepted"|"edited"|"discarded">().notNull().default("pending"),
  reviewedByPersonId: uuid("reviewed_by_person_id").references(() => people.id, { onDelete: "restrict" }),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdByPersonId: uuid("created_by_person_id").notNull().references(() => people.id, { onDelete: "restrict" }),
  createdAt: createdAt(),
}, t => [index("church_content_suggestion_site_review_idx").on(t.siteId, t.reviewDecision)]);
