import { sql } from "drizzle-orm";
import { type AnyPgColumn, boolean, check, date, foreignKey, index, integer, jsonb, pgTable, text, time, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, updatedAt } from "./common";
import { sites, organizations, programs } from "./organizations";
import { people } from "./identity";
import { documents } from "./documents";
import { activities } from "./activities";
import { fieldTrips } from "./field-trips";
import { curriculumPacks, curriculumPackVersions, curriculumAdoptions } from "./curriculum-marketplace";
import { siteLocalContentVersions } from "./site-local-content";

/** Self-declared religious/cultural identity never grants formal affiliation. */
export const religiousAffiliationOptions = pgTable("religious_affiliation_options", {
  code: text("code").primaryKey(),
  label: text("label").notNull(),
  groupCode: text("group_code").notNull(),
  parentCode: text("parent_code").references(():AnyPgColumn=>religiousAffiliationOptions.code,{onDelete:"restrict"}),
  classification: text("classification").notNull().default("religious"),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
},t=>[index("religious_affiliation_group_idx").on(t.groupCode,t.sortOrder),
  check("religious_affiliation_options_classification_check",sql.raw("classification in ('religious','nonsectarian','unaffiliated','interfaith')"))]);

/** Durable school planning, distinct from account/grant-specific Launch Studio scratch drafts. */
export const siteBlueprints = pgTable("site_blueprints", {
  siteId:uuid("site_id").primaryKey().references(()=>sites.id,{onDelete:"restrict"}),
  currentRevision:integer("current_revision").notNull().default(0),
  status:text("status").notNull().default("draft"),
  religiousAffiliationCode:text("religious_affiliation_code").references(()=>religiousAffiliationOptions.code),
  editorialIdentity:text("editorial_identity").notNull().default("community_belonging"),
  culturalContext:jsonb("cultural_context").$type<Record<string,unknown>>().notNull().default({}),
  createdByPersonId:uuid("created_by_person_id").notNull().references(()=>people.id,{onDelete:"restrict"}),
  updatedByPersonId:uuid("updated_by_person_id").notNull().references(()=>people.id,{onDelete:"restrict"}),
  createdAt:createdAt(),updatedAt:updatedAt(),
},t=>[
  check("site_blueprints_current_revision_check",sql.raw("current_revision>=0")),
  check("site_blueprints_status_check",sql.raw("status in ('draft','in_review','planning_complete','archived')")),
]);

/** Never modify an earlier Site Blueprint revision; an authorized save appends one. */
export const siteBlueprintRevisions=pgTable("site_blueprint_revisions",{
  id:id(),siteId:uuid("site_id").notNull().references(()=>sites.id,{onDelete:"restrict"}),
  revision:integer("revision").notNull(),schemaVersion:integer("schema_version").notNull().default(1),
  snapshot:jsonb("snapshot").$type<Record<string,unknown>>().notNull(),
  createdByPersonId:uuid("created_by_person_id").notNull().references(()=>people.id,{onDelete:"restrict"}),
  createdAt:createdAt(),
},t=>[
  uniqueIndex("site_blueprint_revision_uq").on(t.siteId,t.revision),
  check("site_blueprint_revisions_revision_check",sql.raw("revision>0")),
  check("site_blueprint_revisions_schema_version_check",sql.raw("schema_version>0")),
]);

export const siteHostRelationships=pgTable("site_host_relationships",{
  id:id(),siteId:uuid("site_id").notNull().references(()=>sites.id,{onDelete:"restrict"}),
  organizationId:uuid("organization_id").notNull().references(()=>organizations.id,{onDelete:"restrict"}),
  role:text("role").notNull(),status:text("status").notNull().default("draft"),
  isPrimary:boolean("is_primary").notNull().default(false),
  services:jsonb("services").$type<string[]>().notNull().default([]),
  agreementDocumentId:uuid("agreement_document_id").references(()=>documents.id,{onDelete:"restrict"}),
  effectiveFrom:date("effective_from"),effectiveThrough:date("effective_through"),
  approvedByPersonId:uuid("approved_by_person_id").references(()=>people.id,{onDelete:"restrict"}),
  approvedAt:timestamp("approved_at",{withTimezone:true}),
  createdByPersonId:uuid("created_by_person_id").notNull().references(()=>people.id,{onDelete:"restrict"}),
  createdAt:createdAt(),updatedAt:updatedAt(),
},t=>[
  index("site_host_relationship_site_idx").on(t.siteId,t.role,t.status),
  uniqueIndex("site_host_relationship_primary_uq").on(t.siteId,t.role)
    .where(sql.raw("status='approved' AND is_primary=true")),
  uniqueIndex("site_host_relationship_org_pair_uq").on(t.id,t.organizationId),
  check("site_host_relationships_role_check",sql.raw("role in ('facility_host','local_operator','sponsor','property_owner')")),
  check("site_host_relationships_status_check",sql.raw("status in ('draft','submitted','approved','revoked','expired')")),
  check("site_host_relationship_dates_ck",sql.raw("effective_through is null or effective_from is null or effective_through>=effective_from")),
  check("site_host_relationship_approval_ck",sql.raw("status<>'approved' or (agreement_document_id is not null and approved_by_person_id is not null and approved_at is not null)")),
]);

/** Proposed contract amounts are not tuition-invoice shares or paid settlements. */
export const siteHostCompensationTerms=pgTable("site_host_compensation_terms",{
  id:id(),relationshipId:uuid("relationship_id").notNull().references(()=>siteHostRelationships.id,{onDelete:"restrict"}),
  payerOrganizationId:uuid("payer_organization_id").notNull().references(()=>organizations.id,{onDelete:"restrict"}),
  payeeOrganizationId:uuid("payee_organization_id").notNull().references(()=>organizations.id,{onDelete:"restrict"}),
  basis:text("basis").notNull(),amountCents:integer("amount_cents"),
  currency:text("currency").notNull().default("USD"),
  terms:jsonb("terms").$type<Record<string,unknown>>().notNull().default({}),
  status:text("status").notNull().default("draft"),
  agreementDocumentId:uuid("agreement_document_id").references(()=>documents.id,{onDelete:"restrict"}),
  effectiveFrom:date("effective_from"),effectiveThrough:date("effective_through"),
  approvedByPersonId:uuid("approved_by_person_id").references(()=>people.id,{onDelete:"restrict"}),
  approvedAt:timestamp("approved_at",{withTimezone:true}),
  createdByPersonId:uuid("created_by_person_id").notNull().references(()=>people.id,{onDelete:"restrict"}),
  createdAt:createdAt(),updatedAt:updatedAt(),
},t=>[
  index("site_host_compensation_relationship_idx").on(t.relationshipId,t.status),
  foreignKey({name:"site_host_compensation_payee_fk",columns:[t.relationshipId,t.payeeOrganizationId],
    foreignColumns:[siteHostRelationships.id,siteHostRelationships.organizationId]}),
  check("site_host_compensation_terms_basis_check",sql.raw("basis in ('fixed_monthly','per_enrolled_student','reimbursement','hybrid','other')")),
  check("site_host_compensation_terms_status_check",sql.raw("status in ('draft','under_review','approved','suspended','expired','cancelled')")),
  check("site_host_compensation_terms_amount_cents_check",sql.raw("amount_cents is null or amount_cents>=0")),
  check("site_host_compensation_dates_ck",sql.raw("effective_through is null or effective_from is null or effective_through>=effective_from")),
  check("site_host_compensation_approval_ck",sql.raw("status<>'approved' or (agreement_document_id is not null and approved_by_person_id is not null and approved_at is not null and effective_from is not null)")),
]);

/** CAN-curated references only; no operational rights or phantom public offerings. */
export const blueprintCatalogItems=pgTable("blueprint_catalog_items",{
  id:id(),code:text("code").notNull(),kind:text("kind").notNull(),
  category:text("category").notNull(),name:text("name").notNull(),summary:text("summary").notNull(),
  status:text("status").notNull().default("available"),sortOrder:integer("sort_order").notNull().default(0),
  metadata:jsonb("metadata").$type<Record<string,unknown>>().notNull().default({}),
  createdAt:createdAt(),updatedAt:updatedAt(),
},t=>[
  uniqueIndex("blueprint_catalog_code_uq").on(t.code),
  index("blueprint_catalog_kind_category_idx").on(t.kind,t.category,t.status),
  check("blueprint_catalog_items_kind_check",sql.raw("kind in ('program','community','experience','club','activity')")),
  check("blueprint_catalog_items_status_check",sql.raw("status in ('available','retired')")),
]);
export const blueprintCatalogItemVersions=pgTable("blueprint_catalog_item_versions",{
  id:id(),itemId:uuid("item_id").notNull().references(()=>blueprintCatalogItems.id,{onDelete:"restrict"}),
  version:integer("version").notNull(),description:text("description").notNull(),
  gradeRange:jsonb("grade_range").$type<{min?:string;max?:string}>().notNull().default({}),
  scheduleSuggestion:jsonb("schedule_suggestion").$type<Record<string,unknown>>().notNull().default({}),
  configuration:jsonb("configuration").$type<Record<string,unknown>>().notNull().default({}),
  publishedAt:timestamp("published_at",{withTimezone:true}).notNull().defaultNow(),
},t=>[
  uniqueIndex("blueprint_catalog_item_version_uq").on(t.itemId,t.version),
  check("blueprint_catalog_item_versions_version_check",sql.raw("version>0")),
]);

/** A canonical Program must be linked through an authorized, idempotent command. */
export const siteProgramPlans=pgTable("site_program_plans",{
  id:id(),siteId:uuid("site_id").notNull().references(()=>sites.id,{onDelete:"restrict"}),
  catalogVersionId:uuid("catalog_version_id").references(()=>blueprintCatalogItemVersions.id,{onDelete:"restrict"}),
  name:text("name").notNull(),kind:text("kind").notNull(),
  gradeRange:jsonb("grade_range").$type<{min?:string;max?:string}>().notNull().default({}),
  deliveryModel:jsonb("delivery_model").$type<Record<string,unknown>>().notNull().default({}),
  religiousAffiliationCode:text("religious_affiliation_code").references(()=>religiousAffiliationOptions.code),
  status:text("status").notNull().default("draft"),revision:integer("revision").notNull().default(1),
  canonicalProgramId:uuid("canonical_program_id").references(()=>programs.id,{onDelete:"restrict"}),
  createdByPersonId:uuid("created_by_person_id").notNull().references(()=>people.id,{onDelete:"restrict"}),
  createdAt:createdAt(),updatedAt:updatedAt(),
},t=>[
  index("site_program_plan_site_status_idx").on(t.siteId,t.status),
  uniqueIndex("site_program_plans_canonical_program_id_key").on(t.canonicalProgramId),
  uniqueIndex("site_program_plan_site_pair_uq").on(t.id,t.siteId),
  check("site_program_plans_status_check",sql.raw("status in ('draft','in_review','ready_to_convert','linked','retired')")),
  check("site_program_plans_revision_check",sql.raw("revision>0")),
  check("site_program_plan_link_ck",sql.raw("status<>'linked' or canonical_program_id is not null")),
]);
export const siteSchedulePlans=pgTable("site_schedule_plans",{
  id:id(),siteId:uuid("site_id").notNull().references(()=>sites.id,{onDelete:"restrict"}),
  programPlanId:uuid("program_plan_id"),name:text("name").notNull(),timezone:text("timezone").notNull(),
  status:text("status").notNull().default("draft"),
  validFrom:date("valid_from"),validThrough:date("valid_through"),
  createdByPersonId:uuid("created_by_person_id").notNull().references(()=>people.id,{onDelete:"restrict"}),
  createdAt:createdAt(),updatedAt:updatedAt(),
},t=>[
  index("site_schedule_plan_site_idx").on(t.siteId,t.programPlanId),
  foreignKey({name:"site_schedule_plan_program_site_fk",columns:[t.programPlanId,t.siteId],
    foreignColumns:[siteProgramPlans.id,siteProgramPlans.siteId]}),
  check("site_schedule_plans_status_check",sql.raw("status in ('draft','in_review','approved_plan','retired')")),
  check("site_schedule_plan_dates_ck",sql.raw("valid_through is null or valid_from is null or valid_through>=valid_from")),
]);
export const siteSchedulePlanPeriods=pgTable("site_schedule_plan_periods",{
  id:id(),schedulePlanId:uuid("schedule_plan_id").notNull().references(()=>siteSchedulePlans.id,{onDelete:"cascade"}),
  dayOfWeek:integer("day_of_week").notNull(),startsAtLocal:time("starts_at_local").notNull(),
  endsAtLocal:time("ends_at_local").notNull(),kind:text("kind").notNull(),label:text("label").notNull(),
},t=>[
  uniqueIndex("site_schedule_plan_period_uq").on(t.schedulePlanId,t.dayOfWeek,t.startsAtLocal,t.endsAtLocal,t.kind),
  check("site_schedule_plan_periods_day_of_week_check",sql.raw("day_of_week between 0 and 6")),
  check("site_schedule_plan_period_time_ck",sql.raw("starts_at_local<ends_at_local")),
  check("site_schedule_plan_periods_kind_check",sql.raw("kind in ('site_hours','attendance','instruction','support','enrichment')")),
]);

/** Planned curricular intention never grants publisher license or adoption rights. */
export const siteCurriculumPlans=pgTable("site_curriculum_plans",{
  id:id(),siteId:uuid("site_id").notNull().references(()=>sites.id,{onDelete:"restrict"}),
  programPlanId:uuid("program_plan_id"),subject:text("subject").notNull(),
  pathway:text("pathway").notNull().default("core"),
  packId:uuid("pack_id").references(()=>curriculumPacks.id,{onDelete:"restrict"}),
  packVersionId:uuid("pack_version_id").references(()=>curriculumPackVersions.id,{onDelete:"restrict"}),
  notes:text("notes").notNull().default(""),status:text("status").notNull().default("draft"),
  canonicalAdoptionId:uuid("canonical_adoption_id").references(()=>curriculumAdoptions.id,{onDelete:"restrict"}),
  createdByPersonId:uuid("created_by_person_id").notNull().references(()=>people.id,{onDelete:"restrict"}),
  createdAt:createdAt(),updatedAt:updatedAt(),
},t=>[
  index("site_curriculum_plan_site_idx").on(t.siteId,t.programPlanId,t.status),
  uniqueIndex("site_curriculum_plans_canonical_adoption_id_key").on(t.canonicalAdoptionId),
  foreignKey({name:"site_curriculum_plan_program_site_fk",columns:[t.programPlanId,t.siteId],
    foreignColumns:[siteProgramPlans.id,siteProgramPlans.siteId]}),
  check("site_curriculum_plans_status_check",sql.raw("status in ('draft','in_review','ready_to_adopt','linked','retired')")),
  check("site_curriculum_plan_pack_ck",sql.raw("pack_version_id is null or pack_id is not null")),
  check("site_curriculum_plan_link_ck",sql.raw("status<>'linked' or canonical_adoption_id is not null")),
]);

export const siteBlueprintItems=pgTable("site_blueprint_items",{
  id:id(),siteId:uuid("site_id").notNull().references(()=>sites.id,{onDelete:"restrict"}),
  programPlanId:uuid("program_plan_id"),
  catalogVersionId:uuid("catalog_version_id").references(()=>blueprintCatalogItemVersions.id,{onDelete:"restrict"}),
  kind:text("kind").notNull(),title:text("title").notNull(),summary:text("summary").notNull().default(""),
  configuration:jsonb("configuration").$type<Record<string,unknown>>().notNull().default({}),
  status:text("status").notNull().default("draft"),revision:integer("revision").notNull().default(1),
  canonicalActivityId:uuid("canonical_activity_id").references(()=>activities.id,{onDelete:"restrict"}),
  canonicalFieldTripId:uuid("canonical_field_trip_id").references(()=>fieldTrips.id,{onDelete:"restrict"}),
  createdByPersonId:uuid("created_by_person_id").notNull().references(()=>people.id,{onDelete:"restrict"}),
  createdAt:createdAt(),updatedAt:updatedAt(),
},t=>[
  index("site_blueprint_item_site_kind_idx").on(t.siteId,t.kind,t.status),
  uniqueIndex("site_blueprint_item_site_pair_uq").on(t.id,t.siteId),
  uniqueIndex("site_blueprint_items_canonical_activity_id_key").on(t.canonicalActivityId),
  uniqueIndex("site_blueprint_items_canonical_field_trip_id_key").on(t.canonicalFieldTripId),
  foreignKey({name:"site_blueprint_item_program_site_fk",columns:[t.programPlanId,t.siteId],
    foreignColumns:[siteProgramPlans.id,siteProgramPlans.siteId]}),
  check("site_blueprint_items_kind_check",sql.raw("kind in ('community','experience','club','activity')")),
  check("site_blueprint_items_status_check",sql.raw("status in ('draft','in_review','ready_to_convert','linked','retired')")),
  check("site_blueprint_items_revision_check",sql.raw("revision>0")),
  check("site_blueprint_item_single_link_ck",sql.raw("not(canonical_activity_id is not null and canonical_field_trip_id is not null)")),
  check("site_blueprint_item_link_ck",sql.raw("status<>'linked' or canonical_activity_id is not null or canonical_field_trip_id is not null")),
]);

/** Concept stage never masquerades as a verified Guardian or official admissions. */
export const siteConceptContacts=pgTable("site_concept_contacts",{
  id:id(),siteId:uuid("site_id").notNull().references(()=>sites.id,{onDelete:"restrict"}),
  firstName:text("first_name").notNull(),lastName:text("last_name").notNull(),
  emailNormalized:text("email_normalized").notNull(),emailDigest:text("email_digest").notNull(),
  contactConsentAt:timestamp("contact_consent_at",{withTimezone:true}),
  consentWithdrawnAt:timestamp("consent_withdrawn_at",{withTimezone:true}),
  status:text("status").notNull().default("candidate"),
  createdByPersonId:uuid("created_by_person_id").references(()=>people.id,{onDelete:"restrict"}),
  createdAt:createdAt(),updatedAt:updatedAt(),
},t=>[
  uniqueIndex("site_concept_contact_dedupe_uq").on(t.siteId,t.emailDigest),
  uniqueIndex("site_concept_contact_site_pair_uq").on(t.id,t.siteId),
  index("site_concept_contacts_site_status_idx").on(t.siteId,t.status),
  check("site_concept_contacts_status_check",sql.raw("status in ('candidate','invited','responded','opted_out','converted')")),
]);
export const siteConceptCampaigns=pgTable("site_concept_campaigns",{
  id:id(),siteId:uuid("site_id").notNull().references(()=>sites.id,{onDelete:"restrict"}),
  name:text("name").notNull(),kind:text("kind").notNull().default("family_introduction"),
  status:text("status").notNull().default("draft"),
  websiteRevisionId:uuid("website_revision_id").references(()=>siteLocalContentVersions.id,{onDelete:"restrict"}),
  createdByPersonId:uuid("created_by_person_id").notNull().references(()=>people.id,{onDelete:"restrict"}),
  createdAt:createdAt(),updatedAt:updatedAt(),
},t=>[
  uniqueIndex("site_concept_campaign_site_pair_uq").on(t.id,t.siteId),
  index("site_concept_campaign_site_idx").on(t.siteId,t.status),
  check("site_concept_campaigns_status_check",sql.raw("status in ('draft','approved','sending','completed','cancelled')")),
  check("site_concept_campaigns_kind_check",sql.raw("kind in ('family_introduction','survey','interest_event')")),
]);
export const siteConceptResponses=pgTable("site_concept_responses",{
  id:id(),siteId:uuid("site_id").notNull().references(()=>sites.id,{onDelete:"restrict"}),
  contactId:uuid("contact_id").notNull(),campaignId:uuid("campaign_id").notNull(),
  answers:jsonb("answers").$type<Record<string,unknown>>().notNull().default({}),
  contactConsentAt:timestamp("contact_consent_at",{withTimezone:true}),
  status:text("status").notNull().default("submitted"),
  createdAt:createdAt(),updatedAt:updatedAt(),
},t=>[
  uniqueIndex("site_concept_response_contact_campaign_uq").on(t.contactId,t.campaignId),
  index("site_concept_response_site_idx").on(t.siteId,t.status),
  foreignKey({name:"site_concept_response_contact_site_fk",columns:[t.contactId,t.siteId],
    foreignColumns:[siteConceptContacts.id,siteConceptContacts.siteId]}),
  foreignKey({name:"site_concept_response_campaign_site_fk",columns:[t.campaignId,t.siteId],
    foreignColumns:[siteConceptCampaigns.id,siteConceptCampaigns.siteId]}),
  check("site_concept_responses_status_check",sql.raw("status in ('submitted','updated','withdrawn')")),
]);

/** Candidate public snapshots: existing Site/Program publication gates remain mandatory. */
export const sitePublicationReleases=pgTable("site_publication_releases",{
  id:id(),siteId:uuid("site_id").notNull().references(()=>sites.id,{onDelete:"restrict"}),
  revision:integer("revision").notNull(),status:text("status").notNull().default("draft"),
  mode:text("mode").notNull().default("operational"),
  websiteRevisionId:uuid("website_revision_id").references(()=>siteLocalContentVersions.id,{onDelete:"restrict"}),
  contentSnapshot:jsonb("content_snapshot").$type<Record<string,unknown>>().notNull(),
  sourceRevisionMap:jsonb("source_revision_map").$type<Record<string,unknown>>().notNull().default({}),
  reviewedByPersonId:uuid("reviewed_by_person_id").references(()=>people.id,{onDelete:"restrict"}),
  reviewedAt:timestamp("reviewed_at",{withTimezone:true}),
  publishedByPersonId:uuid("published_by_person_id").references(()=>people.id,{onDelete:"restrict"}),
  publishedAt:timestamp("published_at",{withTimezone:true}),createdAt:createdAt(),
},t=>[
  uniqueIndex("site_publication_release_site_revision_uq").on(t.siteId,t.revision),
  index("site_publication_release_status_idx").on(t.siteId,t.status,t.revision),
  index("site_publication_release_mode_idx").on(t.siteId,t.mode,t.status,t.publishedAt),
  check("site_publication_release_mode_ck",sql.raw("mode in (\x27planning_prospectus\x27,\x27operational\x27)")),
  check("site_publication_releases_revision_check",sql.raw("revision>0")),
  check("site_publication_releases_status_check",sql.raw("status in ('draft','in_review','approved','published','withdrawn')")),
  check("site_publication_release_published_ck",sql.raw("status<>'published' or (reviewed_by_person_id is not null and reviewed_at is not null and published_by_person_id is not null and published_at is not null)")),
]);
