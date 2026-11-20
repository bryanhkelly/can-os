import { check, foreignKey, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createdAt, id } from "./common";
import { sites } from "./organizations";
import { people } from "./identity";
import { siteMarketingPackages } from "./marketing-packages";
import type { SiteBrandConfiguration } from "@/domain/site-brand";

/** Content-addressed immutable logo/identity image. Only rights revocation is mutable. */
export const siteBrandAssets=pgTable("site_brand_assets",{
  id:id(),
  siteId:uuid("site_id").notNull().references(()=>sites.id,{onDelete:"restrict"}),
  dataUrl:text("data_url").notNull(),
  checksum:text("checksum").notNull(),
  altText:text("alt_text").notNull(),
  rightsConfirmed:text("rights_confirmed").notNull().$type<"true"|"false">(),
  childImageConsent:text("child_image_consent").notNull()
    .$type<"unconfirmed"|"no_identifiable_children"|"guardian_consent_confirmed">(),
  revokedAt:timestamp("revoked_at",{withTimezone:true}),
  createdByPersonId:uuid("created_by_person_id").notNull().references(()=>people.id,{onDelete:"restrict"}),
  createdAt:createdAt(),
},t=>[
  index("site_brand_assets_site_idx").on(t.siteId),
  uniqueIndex("site_brand_assets_site_id_uq").on(t.siteId,t.id),
  check("site_brand_assets_checksum_ck",sql`${t.checksum} ~ '^[a-f0-9]{64}$'`),
]);

/** The ONLY Site Brand store. No mutable site_brands or website copy of identity. */
export const siteBrandVersions=pgTable("site_brand_versions",{
  id:id(),
  siteId:uuid("site_id").notNull().references(()=>sites.id,{onDelete:"restrict"}),
  revision:integer("revision").notNull(),
  configuration:jsonb("configuration").$type<SiteBrandConfiguration>().notNull(),
  fingerprint:text("fingerprint").notNull(),
  createdByPersonId:uuid("created_by_person_id").notNull().references(()=>people.id,{onDelete:"restrict"}),
  createdAt:createdAt(),
},t=>[
  uniqueIndex("site_brand_versions_site_revision_uq").on(t.siteId,t.revision),
  uniqueIndex("site_brand_versions_site_id_uq").on(t.siteId,t.id),
  check("site_brand_versions_revision_ck",sql`${t.revision} >= 1`),
  check("site_brand_versions_fingerprint_ck",sql`${t.fingerprint} ~ '^[a-f0-9]{64}$'`),
]);

/**
 * The immutable, atomic unit of marketing distribution. Every selected
 * output is created in the same transaction and references this snapshot.
 * Older standalone outputs retain packageReleaseId=null.
 */
export const siteMarketingPackageReleases=pgTable("site_marketing_package_releases",{
  id:id(),
  siteId:uuid("site_id").notNull().references(()=>sites.id,{onDelete:"restrict"}),
  packageId:uuid("package_id").notNull(),
  releaseNumber:integer("release_number").notNull(),
  requestId:uuid("request_id").notNull(),
  brandVersionId:uuid("brand_version_id").notNull().references(()=>siteBrandVersions.id,{onDelete:"restrict"}),
  sourcePackageRevision:integer("source_package_revision").notNull(),
  contentSnapshot:jsonb("content_snapshot").$type<Record<string,unknown>>().notNull(),
  formats:jsonb("formats").$type<string[]>().notNull(),
  createdByPersonId:uuid("created_by_person_id").notNull().references(()=>people.id,{onDelete:"restrict"}),
  createdAt:createdAt(),
},t=>[
  index("site_marketing_package_releases_site_idx").on(t.siteId,t.createdAt),
  uniqueIndex("site_marketing_package_releases_number_uq").on(t.packageId,t.releaseNumber),
  uniqueIndex("site_marketing_package_releases_request_uq").on(t.packageId,t.requestId),
  uniqueIndex("site_marketing_package_releases_site_id_uq").on(t.siteId,t.id),
  uniqueIndex("site_marketing_package_releases_scope_uq").on(t.siteId,t.packageId,t.id),
  foreignKey({name:"site_marketing_package_releases_package_scope_fk",
    columns:[t.siteId,t.packageId],foreignColumns:[siteMarketingPackages.siteId,siteMarketingPackages.id]}),
  foreignKey({name:"site_marketing_package_releases_brand_scope_fk",
    columns:[t.siteId,t.brandVersionId],foreignColumns:[siteBrandVersions.siteId,siteBrandVersions.id]}),
  check("site_marketing_package_releases_number_ck",sql`${t.releaseNumber} >= 1`),
  check("site_marketing_package_releases_source_revision_ck",sql`${t.sourcePackageRevision} >= 1`),
]);

/** Artifact release snapshot is immutable; hosted access status is separate. */
export const siteArtifactReleases=pgTable("site_artifact_releases",{
  id:id(),
  siteId:uuid("site_id").notNull().references(()=>sites.id,{onDelete:"restrict"}),
  packageId:uuid("package_id"),
  packageReleaseId:uuid("package_release_id"),
  brandVersionId:uuid("brand_version_id").notNull().references(()=>siteBrandVersions.id,{onDelete:"restrict"}),
  sourcePackageRevision:integer("source_package_revision"),
  artifactKind:text("artifact_kind").notNull(),
  templateId:text("template_id").notNull(),
  templateVersion:integer("template_version").notNull().default(1),
  contentSnapshot:jsonb("content_snapshot").$type<Record<string,unknown>>().notNull(),
  assetManifest:jsonb("asset_manifest").$type<Record<string,unknown>>().notNull(),
  outputManifest:jsonb("output_manifest").$type<Record<string,unknown>>().notNull(),
  outputChecksum:text("output_checksum").notNull(),
  createdByPersonId:uuid("created_by_person_id").notNull().references(()=>people.id,{onDelete:"restrict"}),
  createdAt:createdAt(),
},t=>[
  index("site_artifact_releases_site_idx").on(t.siteId,t.createdAt),
  index("site_artifact_releases_package_idx").on(t.packageId),
  index("site_artifact_releases_package_release_idx").on(t.packageReleaseId),
  uniqueIndex("site_artifact_releases_one_format_per_package_release_uq")
    .on(t.packageReleaseId,t.artifactKind)
    .where(sql`${t.packageReleaseId} IS NOT NULL`),
  foreignKey({name:"site_artifact_releases_package_scope_fk",columns:[t.siteId,t.packageId],
    foreignColumns:[siteMarketingPackages.siteId,siteMarketingPackages.id]}),
  foreignKey({name:"site_artifact_releases_package_release_scope_fk",
    columns:[t.siteId,t.packageId,t.packageReleaseId],
    foreignColumns:[siteMarketingPackageReleases.siteId,siteMarketingPackageReleases.packageId,siteMarketingPackageReleases.id]}),
  foreignKey({name:"site_artifact_releases_brand_scope_fk",columns:[t.siteId,t.brandVersionId],
    foreignColumns:[siteBrandVersions.siteId,siteBrandVersions.id]}),
  check("site_artifact_releases_package_parent_ck",sql`${t.packageReleaseId} IS NULL OR ${t.packageId} IS NOT NULL`),
  check("site_artifact_releases_checksum_ck",sql`${t.outputChecksum} ~ '^[a-f0-9]{64}$'`),
]);

export const siteArtifactReleaseAccess=pgTable("site_artifact_release_access",{
  releaseId:uuid("release_id").primaryKey().references(()=>siteArtifactReleases.id,{onDelete:"restrict"}),
  withdrawnAt:timestamp("withdrawn_at",{withTimezone:true}),
  withdrawnReason:text("withdrawn_reason"),
});
