import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, updatedAt } from "./common";
import { organizations } from "./organizations";
import { documents } from "./documents";
import { people } from "./identity";

/**
 * Verification of an externally signed agreement, not an e-signature system.
 * Never use this table alone as an access grant; actual HQ grants are separate.
 */
export const networkAgreements = pgTable("network_agreements", {
  id: id(),
  denominationOrganizationId: uuid("denomination_organization_id").notNull()
    .references(() => organizations.id, { onDelete: "restrict" }),
  agreementReference: text("agreement_reference").notNull(),
  evidenceDocumentId: uuid("evidence_document_id").notNull()
    .references(() => documents.id, { onDelete: "restrict" }),
  validFrom: timestamp("valid_from", { withTimezone: true }).notNull(),
  validThrough: timestamp("valid_through", { withTimezone: true }).notNull(),
  verifiedByPersonId: uuid("verified_by_person_id").notNull()
    .references(() => people.id, { onDelete: "restrict" }),
  verifiedAt: timestamp("verified_at", { withTimezone: true }).defaultNow().notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, table => [
  uniqueIndex("network_agreements_reference_uq")
    .on(table.denominationOrganizationId, table.agreementReference),
  index("network_agreements_term_idx").on(table.denominationOrganizationId, table.validThrough),
]);
