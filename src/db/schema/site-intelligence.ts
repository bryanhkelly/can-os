import {check,foreignKey,index,integer,jsonb,pgTable,text,timestamp,uniqueIndex,uuid} from "drizzle-orm/pg-core";
import {sql} from "drizzle-orm";
import {id,createdAt,updatedAt} from "./common";
import {sites,organizations} from "./organizations";
import {people} from "./identity";
import type {SitePackageInput,SiteContentPackage} from "@/domain/site-content-package";
import type {SiteGenerationOptions} from "@/domain/site-content-generation";
import type {SiteContentBriefV61} from "@/domain/site-content-brief-v61";
/** Immutable request payload plus fenced processing state. */
export const siteIntelligenceVersions=pgTable("site_intelligence_versions",{
 id:id(),siteId:uuid("site_id").notNull().references(()=>sites.id,{onDelete:"restrict"}),organizationId:uuid("organization_id").notNull().references(()=>organizations.id,{onDelete:"restrict"}),
 revision:integer("revision").notNull(),inputDigest:text("input_digest").notNull(),input:jsonb("input").$type<SitePackageInput>().notNull(),options:jsonb("options").$type<SiteGenerationOptions>().notNull(),sourceRevisions:jsonb("source_revisions").$type<SiteContentBriefV61["sourceRevisions"]>().notNull(),
 requestedByPersonId:uuid("requested_by_person_id").notNull().references(()=>people.id,{onDelete:"restrict"}),
 status:text("status").$type<"processing"|"failed"|"ready">().notNull(),attempts:integer("attempts").notNull(),leaseToken:uuid("lease_token"),leaseUntil:timestamp("lease_until",{withTimezone:true}),errorCode:text("error_code"),
 createdAt:createdAt(),updatedAt:updatedAt(),
},t=>[
 uniqueIndex("site_intelligence_scope_id_uq").on(t.organizationId,t.siteId,t.id),uniqueIndex("site_intelligence_revision_uq").on(t.organizationId,t.siteId,t.revision),uniqueIndex("site_intelligence_digest_uq").on(t.organizationId,t.siteId,t.inputDigest),
 check("site_intelligence_digest_ck",sql`${t.inputDigest} ~ '^[a-f0-9]{64}$'`),
 check("site_intelligence_revision_ck",sql`${t.revision}>0 AND ${t.attempts} BETWEEN 1 AND 3`),
 check("site_intelligence_state_ck",sql`(${t.status}='processing' AND ${t.leaseToken} IS NOT NULL AND ${t.leaseUntil} IS NOT NULL AND ${t.errorCode} IS NULL) OR (${t.status}='failed' AND ${t.leaseToken} IS NULL AND ${t.leaseUntil} IS NULL AND ${t.errorCode} IS NOT NULL) OR (${t.status}='ready' AND ${t.leaseToken} IS NULL AND ${t.leaseUntil} IS NULL AND ${t.errorCode} IS NULL)`),
 index("site_intelligence_status_idx").on(t.organizationId,t.siteId,t.status,t.revision),
]);
/** One immutable validated package per successful input. Never a public publication. */
export const siteGeneratedContentVersions=pgTable("site_generated_content_versions",{
 id:id(),siteId:uuid("site_id").notNull().references(()=>sites.id,{onDelete:"restrict"}),organizationId:uuid("organization_id").notNull().references(()=>organizations.id,{onDelete:"restrict"}),intelligenceVersionId:uuid("intelligence_version_id").notNull(),
 content:jsonb("content").$type<SiteContentPackage>().notNull(),outputDigest:text("output_digest").notNull(),provider:text("provider").notNull(),model:text("model").notNull(),providerResponseId:text("provider_response_id"),createdAt:createdAt(),
},t=>[
 uniqueIndex("site_generated_content_input_uq").on(t.intelligenceVersionId),
 foreignKey({name:"site_generated_content_scope_fk",columns:[t.organizationId,t.siteId,t.intelligenceVersionId],foreignColumns:[siteIntelligenceVersions.organizationId,siteIntelligenceVersions.siteId,siteIntelligenceVersions.id]}).onDelete("restrict"),
 check("site_generated_content_digest_ck",sql`${t.outputDigest} ~ '^[a-f0-9]{64}$' AND ${t.provider}='gloo'`),
 index("site_generated_content_scope_idx").on(t.organizationId,t.siteId,t.createdAt),
]);
