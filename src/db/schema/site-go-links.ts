import { check, date, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createdAt, id, updatedAt } from "./common";
import { sites, organizations } from "./organizations";
import { people } from "./identity";
import { siteMarketingPackages } from "./marketing-packages";
import { engagementDefinitionVersions } from "./engagement";
import type { GoDestination } from "@/domain/site-go-links";

/** One private Go code table serves direct Site links and published universal
 * Engagement versions. It never stores identities of visitors or arbitrary URLs.
 */
export const siteGoLinks = pgTable("site_go_links", {
  id:id(),
  code:text("code").notNull(),
  organizationId:uuid("organization_id").references(()=>organizations.id,{onDelete:"restrict"}),
  siteId:uuid("site_id").references(()=>sites.id,{onDelete:"restrict"}),
  packageId:uuid("package_id").references(()=>siteMarketingPackages.id,{onDelete:"restrict"}),
  createdByPersonId:uuid("created_by_person_id").notNull().references(()=>people.id,{onDelete:"restrict"}),
  destination:jsonb("destination").$type<GoDestination|null>(),
  engagementVersionId:uuid("engagement_version_id")
    .references(()=>engagementDefinitionVersions.id,{onDelete:"restrict"}),
  requestId:uuid("request_id"),
  requestFingerprint:text("request_fingerprint"),
  name:text("name").notNull().default("Shared link"),
  channel:text("channel").$type<"email"|"sms"|"flyer"|"qr"|"social"|"partner"|"web"|"other">(),
  startsAt:timestamp("starts_at",{withTimezone:true}),
  expiresAt:timestamp("expires_at",{withTimezone:true}),
  status:text("status").$type<"active"|"paused"|"revoked">().notNull().default("active"),
  createdAt:createdAt(),
  updatedAt:updatedAt(),
},t=>[
  uniqueIndex("site_go_links_code_uq").on(t.code),
  index("site_go_links_package_idx").on(t.siteId,t.packageId,t.createdAt),
  index("site_go_links_engagement_idx").on(t.engagementVersionId,t.createdAt),
  index("site_go_links_site_page_idx").on(t.siteId,t.createdAt,t.id),
  uniqueIndex("site_go_links_request_uq").on(t.siteId,t.createdByPersonId,t.requestId)
    .where(sql`${t.requestId} IS NOT NULL`),
  check("site_go_links_code_ck",sql`length(${t.code})=12 AND ${t.code} ~ '^[A-Za-z0-9_-]+$'`),
  check("site_go_links_status_ck",sql`${t.status} IN ('active','paused','revoked')`),
  check("site_go_links_destination_ck",sql`${t.destination} IS NULL OR jsonb_typeof(${t.destination})='object'`),
  check("site_go_links_resolution_ck",sql`(
    ${t.engagementVersionId} IS NOT NULL AND ${t.destination} IS NULL
  ) OR (
    ${t.engagementVersionId} IS NULL AND ${t.destination} IS NOT NULL
    AND ${t.organizationId} IS NOT NULL AND ${t.siteId} IS NOT NULL
  )`),
  check("site_go_links_name_ck",sql`char_length(${t.name}) BETWEEN 1 AND 120`),
  check("site_go_links_channel_ck",sql`${t.channel} IS NULL OR ${t.channel} IN
    ('email','sms','flyer','qr','social','partner','web','other')`),
  check("site_go_links_schedule_ck",sql`${t.expiresAt} IS NULL OR ${t.startsAt} IS NULL OR
    ${t.expiresAt} > ${t.startsAt}`),
  check("site_go_links_request_fingerprint_ck",sql`(
    ${t.requestId} IS NULL AND ${t.requestFingerprint} IS NULL
  ) OR (
    ${t.requestId} IS NOT NULL AND ${t.requestFingerprint} ~ '^[0-9a-f]{64}$'
  )`),
]);

/** Only anonymous aggregate redirect counts, not Person IDs or cookies. */
export const siteGoLinkDailyVisits=pgTable("site_go_link_daily_visits",{
  linkId:uuid("link_id").notNull().references(()=>siteGoLinks.id,{onDelete:"restrict"}),
  day:date("day").notNull(),
  redirects:integer("redirects").notNull().default(0),
},t=>[
  uniqueIndex("site_go_link_daily_visits_day_uq").on(t.linkId,t.day),
  index("site_go_link_daily_visits_day_idx").on(t.day),
  check("site_go_link_daily_visits_count_ck",sql`${t.redirects} >= 0`),
]);
