import { index, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { isNull } from "drizzle-orm";
import { educationV30 } from "./core";

const id = () => uuid("id").defaultRandom().primaryKey();

/**
 * Explicit, independently verified mappings from authenticated legacy grants
 * to canonical identities. The legacy grant UUID is never a canonical Person.
 */
export const canonicalLegacyGrantBindings = educationV30.table(
  "canonical_legacy_grant_bindings",
  {
    id: id(),
    legacyAccountId: uuid("legacy_account_id").notNull(),
    legacyGrantId: uuid("legacy_grant_id").notNull(),
    canonicalPersonId: uuid("canonical_person_id").notNull(),
    canonicalOrganizationId: uuid("canonical_organization_id").notNull(),
    verifiedByPersonId: uuid("verified_by_person_id").notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  t => [
    uniqueIndex("canonical_legacy_grant_active_uq")
      .on(t.legacyAccountId, t.legacyGrantId).where(isNull(t.revokedAt)),
    index("canonical_legacy_grant_org_idx").on(t.canonicalOrganizationId),
  ],
);

export const canonicalLegacySiteLinks = educationV30.table(
  "canonical_legacy_site_links",
  {
    id: id(),
    legacySiteId: uuid("legacy_site_id").notNull(),
    canonicalSiteId: uuid("canonical_site_id").notNull(),
    canonicalOrganizationId: uuid("canonical_organization_id").notNull(),
    verifiedByPersonId: uuid("verified_by_person_id").notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  t => [
    uniqueIndex("canonical_legacy_site_link_active_legacy_uq")
      .on(t.legacySiteId).where(isNull(t.revokedAt)),
    uniqueIndex("canonical_legacy_site_link_active_canonical_uq")
      .on(t.canonicalSiteId).where(isNull(t.revokedAt)),
  ],
);
