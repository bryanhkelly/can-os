import { check, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createdAt, id, updatedAt } from "./common";
import { organizations, programs, sites } from "./organizations";
import { people } from "./identity";
import type { EngagementDefinition } from "@/domain/engagement-definition";

/** Exact ownership is validated against current server grants at every mutation. */
export const engagementDefinitions=pgTable("engagement_definitions", {
  id:id(),
  ownerKind:text("owner_kind").$type<"platform"|"organization"|"site"|"program">().notNull(),
  organizationId:uuid("organization_id").references(()=>organizations.id,{onDelete:"restrict"}),
  siteId:uuid("site_id").references(()=>sites.id,{onDelete:"restrict"}),
  programId:uuid("program_id").references(()=>programs.id,{onDelete:"restrict"}),
  status:text("status").$type<"active"|"retired">().notNull().default("active"),
  createdByPersonId:uuid("created_by_person_id").notNull().references(()=>people.id,{onDelete:"restrict"}),
  createdAt:createdAt(),
  updatedAt:updatedAt(),
},t=>[
  index("engagement_definitions_org_idx").on(t.organizationId,t.createdAt),
  index("engagement_definitions_site_idx").on(t.siteId,t.createdAt),
  check("engagement_definitions_owner_ck",sql`(
    (${t.ownerKind} = 'platform' AND ${t.organizationId} IS NULL AND ${t.siteId} IS NULL AND ${t.programId} IS NULL)
    OR (${t.ownerKind} = 'organization' AND ${t.organizationId} IS NOT NULL AND ${t.siteId} IS NULL AND ${t.programId} IS NULL)
    OR (${t.ownerKind} = 'site' AND ${t.organizationId} IS NOT NULL AND ${t.siteId} IS NOT NULL AND ${t.programId} IS NULL)
    OR (${t.ownerKind} = 'program' AND ${t.organizationId} IS NOT NULL AND ${t.programId} IS NOT NULL)
  )`),
  check("engagement_definitions_status_ck",sql`${t.status} IN ('active','retired')`),
]);

/** Content, contract and selected experience are immutable by policy. */
export const engagementDefinitionVersions=pgTable("engagement_definition_versions", {
  id:id(),
  engagementId:uuid("engagement_id").notNull().references(()=>engagementDefinitions.id,{onDelete:"restrict"}),
  version:integer("version").notNull(),
  content:jsonb("content").$type<EngagementDefinition>().notNull(),
  publishedAt:timestamp("published_at",{withTimezone:true}).notNull().defaultNow(),
  createdByPersonId:uuid("created_by_person_id").notNull().references(()=>people.id,{onDelete:"restrict"}),
  createdAt:createdAt(),
},t=>[
  uniqueIndex("engagement_definition_versions_number_uq").on(t.engagementId,t.version),
  index("engagement_definition_versions_engagement_idx").on(t.engagementId,t.publishedAt),
  check("engagement_definition_versions_positive_ck",sql`${t.version} >= 1`),
]);
