import { boolean, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt } from "./common";
import { accessAccounts, accountPersonGrants } from "./access";
import { people } from "./identity";
import { organizations, sites } from "./organizations";

/** Explicit demo classification and exact bootstrap identity bindings, not email-derived authority. */
export const demoSchoolTenants = pgTable("demo_school_tenants", {
  domain: text("domain").primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "restrict" }),
  siteId: uuid("site_id").notNull().references(() => sites.id, { onDelete: "restrict" }),
  adminAccountId: uuid("admin_account_id").notNull().references(() => accessAccounts.id, { onDelete: "restrict" }),
  adminPersonId: uuid("admin_person_id").notNull().references(() => people.id, { onDelete: "restrict" }),
  adminGrantId: uuid("admin_grant_id").notNull().references(() => accountPersonGrants.id, { onDelete: "restrict" }),
  enabled: boolean("enabled").default(true).notNull(),
  createdAt: createdAt(),
}, table => [
  uniqueIndex("demo_school_tenant_org_uq").on(table.organizationId),
  uniqueIndex("demo_school_tenant_site_uq").on(table.siteId),
  uniqueIndex("demo_school_tenant_account_uq").on(table.adminAccountId),
  uniqueIndex("demo_school_tenant_person_uq").on(table.adminPersonId),
  uniqueIndex("demo_school_tenant_grant_uq").on(table.adminGrantId),
]);
