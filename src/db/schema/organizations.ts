import {
  index,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, id, updatedAt } from "./common";
import { organizationType, programStatus, programType } from "./enums";
import { people } from "./identity";

export const jurisdictions = pgTable(
  "jurisdictions",
  {
    id: id(),
    code: text("code").notNull(),
    countryCode: text("country_code").default("US").notNull(),
    regionCode: text("region_code"),
    name: text("name").notNull(),
    configuration: jsonb("configuration")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex("jurisdiction_code_uq").on(table.code)],
);

export const organizations = pgTable(
  "organizations",
  {
    id: id(),
    parentOrganizationId: uuid("parent_organization_id"),
    type: organizationType("type").notNull(),
    name: text("name").notNull(),
    legalName: text("legal_name"),
    slug: text("slug").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("organization_slug_uq").on(table.slug),
    index("organization_parent_idx").on(table.parentOrganizationId),
    index("organization_type_idx").on(table.type),
  ],
);

export const sites = pgTable(
  "sites",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    address: jsonb("address").$type<Record<string, unknown>>(),
    timezone: text("timezone").default("America/Los_Angeles").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("site_org_slug_uq").on(table.organizationId, table.slug),
    index("site_org_idx").on(table.organizationId),
  ],
);

export const programs = pgTable(
  "programs",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    siteId: uuid("site_id").references(() => sites.id, { onDelete: "restrict" }),
    jurisdictionId: uuid("jurisdiction_id")
      .notNull()
      .references(() => jurisdictions.id, { onDelete: "restrict" }),
    type: programType("type").notNull(),
    status: programStatus("status").default("draft").notNull(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    gradeRange: jsonb("grade_range").$type<{ min: string; max: string }>().notNull(),
    deliveryModel: jsonb("delivery_model")
      .$type<{
        onsite?: boolean;
        asynchronous?: boolean;
        liveOnline?: boolean;
        onsiteDaysPerWeek?: number;
      }>()
      .default({})
      .notNull(),
    hostOrganizationId: uuid("host_organization_id").references(() => organizations.id, {
      onDelete: "restrict",
    }),
    academicProviderOrganizationId: uuid("academic_provider_organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    creditIssuingOrganizationId: uuid("credit_issuing_organization_id")
      .references(() => organizations.id, { onDelete: "restrict" }),
    accreditationAuthorityOrganizationId: uuid(
      "accreditation_authority_organization_id",
    ).references(() => organizations.id, { onDelete: "restrict" }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("program_org_slug_uq").on(table.organizationId, table.slug),
    index("program_site_idx").on(table.siteId),
    index("program_jurisdiction_idx").on(table.jurisdictionId),
    index("program_status_idx").on(table.status),
  ],
);

export const memberships = pgTable(
  "memberships",
  {
    id: id(),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    title: text("title"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("membership_person_org_uq").on(table.personId, table.organizationId),
    index("membership_org_idx").on(table.organizationId),
  ],
);

export const roleAssignments = pgTable(
  "role_assignments",
  {
    id: id(),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "cascade",
    }),
    siteId: uuid("site_id").references(() => sites.id, { onDelete: "cascade" }),
    programId: uuid("program_id").references(() => programs.id, { onDelete: "cascade" }),
    roleKey: text("role_key").notNull(),
    capabilities: jsonb("capabilities").$type<string[]>().default([]).notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("role_assignment_person_idx").on(table.personId),
    index("role_assignment_org_idx").on(table.organizationId),
    index("role_assignment_site_idx").on(table.siteId),
    index("role_assignment_program_idx").on(table.programId),
  ],
);
