import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, updatedAt } from "./common";
import { organizations, sites } from "./organizations";
import { people } from "./identity";

/** A reviewed network affiliation is NOT ownership, an education program, or a data-access grant. */
export const siteAffiliations = pgTable("site_affiliations", {
  id: id(),
  siteId: uuid("site_id").notNull().references(() => sites.id, { onDelete: "restrict" }),
  denominationOrganizationId: uuid("denomination_organization_id").notNull()
    .references(() => organizations.id, { onDelete: "restrict" }),
  status: text("status").notNull().default("pending"),
  requestNote: text("request_note").notNull(),
  requestedByPersonId: uuid("requested_by_person_id").notNull()
    .references(() => people.id, { onDelete: "restrict" }),
  requestedAt: timestamp("requested_at", { withTimezone: true }).defaultNow().notNull(),
  reviewedByPersonId: uuid("reviewed_by_person_id")
    .references(() => people.id, { onDelete: "restrict" }),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  decisionReason: text("decision_reason"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, table => [
  uniqueIndex("site_affiliations_pair_uq").on(table.siteId, table.denominationOrganizationId),
  index("site_affiliations_denom_status_idx").on(table.denominationOrganizationId, table.status),
  index("site_affiliations_site_idx").on(table.siteId),
]);
