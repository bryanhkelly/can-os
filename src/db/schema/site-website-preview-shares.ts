import { index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { id, createdAt } from "./common";
import { sites } from "./organizations";
import { people } from "./identity";
import type { PublicSitePath } from "@/domain/public-site-paths";

/** Immutable, public-safe website HTML snapshots. No private Site Story or raw token. */
export const siteWebsitePreviewShares=pgTable("site_website_preview_shares",{
  id:id(),
  siteId:uuid("site_id").notNull().references(()=>sites.id,{onDelete:"restrict"}),
  websiteRevision:integer("website_revision").notNull(),
  tokenSha256:text("token_sha256").notNull().unique(),
  pages:jsonb("pages").$type<Partial<Record<PublicSitePath,string>>>().notNull(),
  createdByPersonId:uuid("created_by_person_id").notNull().references(()=>people.id,{onDelete:"restrict"}),
  createdAt:createdAt(),
  expiresAt:timestamp("expires_at",{withTimezone:true}).notNull(),
  revokedAt:timestamp("revoked_at",{withTimezone:true}),
},t=>[index("site_website_preview_share_site_idx").on(t.siteId,t.createdAt)]);
