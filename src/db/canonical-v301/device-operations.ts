import {boolean,check,index,integer,text,timestamp,uniqueIndex,uuid} from "drizzle-orm/pg-core";
import {sql} from "drizzle-orm";
import {educationV30} from "./core";
import {catalogSites} from "./catalog";
/** Registry of site-owned, loaned and personal equipment. Not a browser fingerprint. */
export const siteDeviceRegistrations=educationV30.table("site_device_registrations",{
 id:uuid("id").defaultRandom().primaryKey(),
 siteId:uuid("site_id").notNull().references(()=>catalogSites.id),
 assetId:uuid("asset_id"),label:text("label").notNull(),
 deviceCategory:text("device_category").$type<"desktop"|"laptop"|"tablet"|"phone"|"chromebook"|"other">().notNull(),
 ownership:text("ownership").$type<"site"|"organization"|"loaned"|"personal">().notNull(),
 managed:boolean("managed").notNull().default(false),
 status:text("status").$type<"active"|"repair"|"retired"|"lost">().notNull().default("active"),
 enrolledAt:timestamp("enrolled_at",{withTimezone:true}).notNull().defaultNow(),
 lastSeenAt:timestamp("last_seen_at",{withTimezone:true}),
},t=>[
 uniqueIndex("site_device_registrations_asset_uq").on(t.siteId,t.assetId).where(sql`${t.assetId} IS NOT NULL`),
 index("site_device_registrations_site_status_idx").on(t.siteId,t.status),
]);
export const siteDevicePolicies=educationV30.table("site_device_policies",{
 siteId:uuid("site_id").primaryKey().references(()=>catalogSites.id),
 sharedDeviceRequired:boolean("shared_device_required").notNull().default(false),
 managedDeviceRequiredForAssessments:boolean("managed_device_required_for_assessments").notNull().default(false),
 kioskIdleMinutes:integer("kiosk_idle_minutes").notNull().default(5),
 allowedCategories:text("allowed_categories").array().notNull().default(sql`ARRAY['desktop','laptop','tablet','phone','chromebook','other']::text[]`),
 updatedAt:timestamp("updated_at",{withTimezone:true}).notNull().defaultNow(),
},t=>[check("site_device_policies_idle_ck",sql`${t.kioskIdleMinutes} BETWEEN 1 AND 30`)]);
