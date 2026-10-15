import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, id, updatedAt } from "./common";
import { people } from "./identity";

export const documents = pgTable(
  "documents",
  {
    id: id(),
    subjectType: text("subject_type").notNull(),
    subjectId: uuid("subject_id").notNull(),
    category: text("category").notNull(),
    fileName: text("file_name").notNull(),
    storageProvider: text("storage_provider").notNull(),
    storageKey: text("storage_key").notNull(),
    mimeType: text("mime_type"),
    sensitivityTier: text("sensitivity_tier").default("standard").notNull(),
    retentionPolicy: text("retention_policy"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    verifiedByPersonId: uuid("verified_by_person_id").references(() => people.id, {
      onDelete: "restrict",
    }),
    uploadedByPersonId: uuid("uploaded_by_person_id")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("document_subject_idx").on(table.subjectType, table.subjectId),
    index("document_category_idx").on(table.category),
    index("document_sensitivity_idx").on(table.sensitivityTier),
    index("document_expiry_idx").on(table.expiresAt),
  ],
);
