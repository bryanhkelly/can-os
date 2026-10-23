import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, updatedAt } from "./common";
import { documents } from "./documents";
import { people } from "./identity";
import { organizations, programs, sites } from "./organizations";
import type { OperatingService } from "@/domain/program-site-operating-policy";

/** This agreement-derived relationship is NOT an account grant or legal accreditation.
 * Only independently reviewed, effective rows may authorize the specified services.
 */
export const programSiteAuthorizations = pgTable("program_site_authorizations", {
  id: id(),
  programId: uuid("program_id").notNull().references(() => programs.id, { onDelete: "restrict" }),
  siteId: uuid("site_id").notNull().references(() => sites.id, { onDelete: "restrict" }),
  hostOrganizationId: uuid("host_organization_id").notNull().references(() => organizations.id, { onDelete: "restrict" }),
  institutionOrganizationId: uuid("institution_organization_id").notNull().references(() => organizations.id, { onDelete: "restrict" }),
  version: integer("version").notNull(),
  status: text("status").notNull().default("requested"),
  services: jsonb("services").$type<OperatingService[]>().notNull(),
  requestedByPersonId: uuid("requested_by_person_id").notNull().references(() => people.id, { onDelete: "restrict" }),
  requestedAt: timestamp("requested_at", { withTimezone: true }).defaultNow().notNull(),
  evidenceDocumentId: uuid("evidence_document_id").references(() => documents.id, { onDelete: "restrict" }),
  effectiveFrom: timestamp("effective_from", { withTimezone: true }),
  effectiveThrough: timestamp("effective_through", { withTimezone: true }),
  reviewedByPersonId: uuid("reviewed_by_person_id").references(() => people.id, { onDelete: "restrict" }),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  reviewReason: text("review_reason"),
  revokedByPersonId: uuid("revoked_by_person_id").references(() => people.id, { onDelete: "restrict" }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  revocationReason: text("revocation_reason"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, table => [
  uniqueIndex("program_site_authorization_version_uq").on(table.programId,table.version),
  index("program_site_authorization_site_idx").on(table.siteId,table.status),
  index("program_site_authorization_institution_idx").on(table.institutionOrganizationId,table.status),
]);
