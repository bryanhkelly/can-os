import { check, index, jsonb, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createdAt, id, updatedAt } from "./common";
import { sites, organizations } from "./organizations";
import { people } from "./identity";
import { siteMarketingPackages } from "./marketing-packages";
import { engagementDefinitionVersions } from "./engagement";
import type { GoDestination } from "@/domain/site-go-links";

/** Public code resolves to a finite internal destination. Never store visitor identity or a raw URL. */
export const siteGoLinks = pgTable("site_go_links", {
  id: id(),
  code: text("code").notNull(),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "restrict" }),
  siteId: uuid("site_id").references(() => sites.id, { onDelete: "restrict" }),
  packageId: uuid("package_id").references(() => siteMarketingPackages.id, { onDelete: "restrict" }),
  createdByPersonId: uuid("created_by_person_id").notNull().references(() => people.id, { onDelete: "restrict" }),
  destination: jsonb("destination").$type<GoDestination|null>(),
  engagementVersionId: uuid("engagement_version_id").references(()=>engagementDefinitionVersions.id,{onDelete:"restrict"}),
  channel: text("channel").$type<"email"|"sms"|"qr"|"social"|"partner"|"web"|"other">(),
  status: text("status").$type<"active" | "revoked">().notNull().default("active"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, t => [
  uniqueIndex("site_go_links_code_uq").on(t.code),
  index("site_go_links_package_idx").on(t.siteId, t.packageId, t.createdAt),
  index("site_go_links_engagement_idx").on(t.engagementVersionId,t.createdAt),
  check("site_go_links_code_ck", sql`length(${t.code}) = 12 AND ${t.code} ~ '^[A-Za-z0-9_-]+$'`),
  check("site_go_links_status_ck", sql`${t.status} IN ('active', 'revoked')`),
  check("site_go_links_destination_ck", sql`${t.destination} IS NULL OR jsonb_typeof(${t.destination}) = 'object'`),
  check("site_go_links_resolution_ck",sql`(${t.engagementVersionId} IS NOT NULL AND ${t.destination} IS NULL) OR (${t.engagementVersionId} IS NULL AND ${t.destination} IS NOT NULL AND ${t.organizationId} IS NOT NULL AND ${t.siteId} IS NOT NULL AND ${t.packageId} IS NOT NULL)`),
  check("site_go_links_channel_ck",sql`${t.channel} IS NULL OR ${t.channel} IN ('email','sms','qr','social','partner','web','other')`),
]);
