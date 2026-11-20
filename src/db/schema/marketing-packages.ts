import { check, index, integer, jsonb, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createdAt, id, updatedAt } from "./common";
import { organizations, sites } from "./organizations";
import { people } from "./identity";
import type { MarketingPackageContent } from "@/domain/marketing-package-v61";

/** One Site-owned package. Rendered collateral and distributions are not implied. */
export const siteMarketingPackages = pgTable("site_marketing_packages", {
  id: id(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, {onDelete:"restrict"}),
  siteId: uuid("site_id").notNull().references(() => sites.id, {onDelete:"restrict"}),
  createdByPersonId: uuid("created_by_person_id").notNull().references(() => people.id, {onDelete:"restrict"}),
  title: text("title").notNull(),
  content: jsonb("content").$type<MarketingPackageContent>().notNull(),
  brandVersionId: uuid("brand_version_id"),
  status: text("status").$type<"draft" | "archived">().notNull().default("draft"),
  revision: integer("revision").notNull().default(1),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, table => [
  index("site_marketing_packages_site_status_idx").on(table.siteId,table.status,table.updatedAt),
  uniqueIndex("site_marketing_packages_site_id_uq").on(table.siteId,table.id),
  check("site_marketing_packages_revision_ck",sql`${table.revision} >= 1`),
  check("site_marketing_packages_status_ck",sql`${table.status} IN ('draft','archived')`),
]);
