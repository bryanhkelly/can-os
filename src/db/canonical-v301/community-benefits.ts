import {check,index,integer,text,timestamp,uniqueIndex,uuid} from "drizzle-orm/pg-core";
import {sql} from "drizzle-orm";
import {educationV30} from "./core";
const id=()=>uuid("id").defaultRandom().primaryKey();

/** Consumer memberships and class packs are NOT public.memberships,
 * school credits, funding entitlements, or verified payments.
 * No automatic access is granted by publishing a product. */
export const participationBenefitProducts=educationV30.table("participation_benefit_products",{
  id:id(),owningOrganizationId:uuid("owning_organization_id").notNull(),
  siteId:uuid("site_id"),
  code:text("code").notNull(),title:text("title").notNull(),
  kind:text("kind").$type<"membership"|"class_pack"|"session_credits">().notNull(),
  state:text("state").$type<"draft"|"published"|"retired">().notNull().default("draft"),
  createdAt:timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),
},t=>[uniqueIndex("participation_benefit_product_code_uq").on(t.owningOrganizationId,t.code)]);

export const participationBenefitVersions=educationV30.table("participation_benefit_versions",{
  id:id(),productId:uuid("product_id").notNull(),
  versionNo:integer("version_no").notNull(),
  unitsPerTerm:integer("units_per_term"),
  termDays:integer("term_days").notNull(),
  renewalMonths:integer("renewal_months"),
  publishedAt:timestamp("published_at",{withTimezone:true}),
  createdAt:timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),
},t=>[
  uniqueIndex("participation_benefit_product_version_uq").on(t.productId,t.versionNo),
  check("participation_benefit_term_positive_ck",sql`${t.termDays}>=1 AND ${t.termDays}<=730`),
  check("participation_benefit_units_positive_ck",sql`${t.unitsPerTerm} IS NULL OR (${t.unitsPerTerm}>=1 AND ${t.unitsPerTerm}<=100000)`),
]);

/** Membership rights require an independently authorized issuance and evidence
 * of payment, scholarship or sponsorship. No balances from self-reported orders.
 */
export const participationBenefitEntitlements=educationV30.table("participation_benefit_entitlements",{
  id:id(),benefitVersionId:uuid("benefit_version_id").notNull(),
  beneficiaryPersonId:uuid("beneficiary_person_id").notNull(),
  issuingOrganizationId:uuid("issuing_organization_id").notNull(),
  sourceKind:text("source_kind").$type<"settled_payment"|"sponsorship"|"approved_waiver">().notNull(),
  sourceEvidenceVersionId:uuid("source_evidence_version_id").notNull(),
  startsAt:timestamp("starts_at",{withTimezone:true}).notNull(),
  expiresAt:timestamp("expires_at",{withTimezone:true}).notNull(),
  status:text("status").$type<"active"|"suspended"|"expired"|"revoked">().notNull().default("active"),
  issuedByPersonId:uuid("issued_by_person_id").notNull(),
  issuedAt:timestamp("issued_at",{withTimezone:true}).notNull().defaultNow(),
},t=>[
  index("participation_benefit_person_idx").on(t.beneficiaryPersonId,t.status),
  check("participation_benefit_entitlement_window_ck",sql`${t.expiresAt}>${t.startsAt}`),
]);

/** Append-only benefits ledger. Never overwrite balances or use academic
 * credit hours as a class-pass unit. Authorized registration redemption must
 * atomically validate a real enrollment before creating a 'consume' entry. */
export const participationBenefitEvents=educationV30.table("participation_benefit_events",{
  id:id(),entitlementId:uuid("entitlement_id").notNull(),
  eventKind:text("event_kind").$type<"issue"|"consume"|"restore">().notNull(),
  units:integer("units").notNull(),
  relatedRegistrationId:uuid("related_registration_id"),
  reversesEventId:uuid("reverses_event_id"),
  requestId:uuid("request_id").notNull(),
  recordedByPersonId:uuid("recorded_by_person_id").notNull(),
  occurredAt:timestamp("occurred_at",{withTimezone:true}).notNull().defaultNow(),
},t=>[
  uniqueIndex("participation_benefit_event_request_uq").on(t.entitlementId,t.requestId),
  index("participation_benefit_event_registration_idx").on(t.relatedRegistrationId),
  check("participation_benefit_units_ck",sql`${t.units}>=1 AND ${t.units}<=100000`),
]);
