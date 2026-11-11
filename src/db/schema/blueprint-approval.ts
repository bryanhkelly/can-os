import { sql } from "drizzle-orm";
import { boolean, check, date, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid, foreignKey } from "drizzle-orm/pg-core";
import { createdAt, id } from "./common";
import { sites } from "./organizations";
import { people } from "./identity";
import { siteConceptContacts, siteProgramPlans, siteBlueprintItems } from "./school-blueprint";

/** Submitted immutable proposal. A review never grants state licensure or school opening. */
export const siteBlueprintReviewRequests=pgTable("site_blueprint_review_requests",{
 id:id(),siteId:uuid("site_id").notNull().references(()=>sites.id,{onDelete:"restrict"}),
 sourceRevision:integer("source_revision").notNull(),proposalSnapshot:jsonb("proposal_snapshot").$type<Record<string,unknown>>().notNull(),
 status:text("status").notNull().default("submitted"),
 submittedByPersonId:uuid("submitted_by_person_id").notNull().references(()=>people.id,{onDelete:"restrict"}),
 submittedAt:createdAt(),
},t=>[
 uniqueIndex("site_blueprint_review_revision_uq").on(t.siteId,t.sourceRevision),
 index("site_blueprint_review_site_idx").on(t.siteId,t.status),
 check("site_blueprint_review_source_positive_ck",sql.raw("source_revision>0")),
 check("site_blueprint_review_status_ck",sql.raw("status in ('submitted','reviewed','withdrawn')")),
]);

/** CAN-approved baseline is append-only; later drafts never replace it. */
export const siteBlueprintApprovedVersions=pgTable("site_blueprint_approved_versions",{
 id:id(),siteId:uuid("site_id").notNull().references(()=>sites.id,{onDelete:"restrict"}),
 version:integer("version").notNull(),
 reviewRequestId:uuid("review_request_id").notNull().references(()=>siteBlueprintReviewRequests.id,{onDelete:"restrict"}),
 sourceRevision:integer("source_revision").notNull(),
 approvedSnapshot:jsonb("approved_snapshot").$type<Record<string,unknown>>().notNull(),
 schoolScopeStatement:text("school_scope_statement").notNull(),
 reviewedByPersonId:uuid("reviewed_by_person_id").notNull().references(()=>people.id,{onDelete:"restrict"}),
 reviewedAt:timestamp("reviewed_at",{withTimezone:true}).defaultNow().notNull(),
 effectiveFrom:date("effective_from"),
},t=>[
 uniqueIndex("site_blueprint_approved_version_uq").on(t.siteId,t.version),
 index("site_blueprint_approved_site_idx").on(t.siteId,t.reviewedAt),
 check("site_blueprint_approved_version_positive_ck",sql.raw("version>0 and source_revision>0")),
]);

/** Condition/evidence details stay private; public status requires separate projection review. */
export const siteBlueprintApprovalDecisions=pgTable("site_blueprint_approval_decisions",{
 id:id(),approvalVersionId:uuid("approval_version_id").notNull().references(()=>siteBlueprintApprovedVersions.id,{onDelete:"restrict"}),
 subjectKind:text("subject_kind").notNull(),subjectId:uuid("subject_id").notNull(),
 decision:text("decision").notNull(),
 conditions:jsonb("conditions").$type<Record<string,unknown>>().notNull().default({}),
 evidence:jsonb("evidence").$type<Record<string,unknown>>().notNull().default({}),
 requiredForOpening:boolean("required_for_opening").notNull().default(false),
 publicVisibility:text("public_visibility").notNull().default("hidden"),
 publicSummary:text("public_summary"),
 effectiveFrom:date("effective_from"),effectiveThrough:date("effective_through"),
},t=>[
 uniqueIndex("site_blueprint_decision_subject_uq").on(t.approvalVersionId,t.subjectKind,t.subjectId),
 index("site_blueprint_decision_lookup_idx").on(t.subjectKind,t.subjectId),
 check("site_blueprint_decision_kind_ck",sql.raw("subject_kind in ('program','item')")),
 check("site_blueprint_decision_status_ck",sql.raw("decision in ('approved','changes_required','future','declined')")),
 check("site_blueprint_decision_public_ck",sql.raw("public_visibility in ('confirmed','under_review','future','hidden')")),
 check("site_blueprint_decision_no_false_claim_ck",sql.raw("public_visibility <> 'confirmed' OR decision='approved'")),
 check("site_blueprint_decision_dates_ck",sql.raw("effective_through IS NULL OR effective_from IS NULL OR effective_through>=effective_from")),
]);

/** Prospect interest in a plan, not enrollment or student eligibility. */
export const siteConceptItemInterests=pgTable("site_concept_item_interests",{
 id:id(),siteId:uuid("site_id").notNull().references(()=>sites.id,{onDelete:"restrict"}),
 contactId:uuid("contact_id").notNull(),
 programPlanId:uuid("program_plan_id"),blueprintItemId:uuid("blueprint_item_id"),
 expressedAt:createdAt(),
},t=>[
 uniqueIndex("site_concept_item_program_uq").on(t.contactId,t.programPlanId),
 uniqueIndex("site_concept_item_blueprint_uq").on(t.contactId,t.blueprintItemId),
 index("site_concept_item_site_idx").on(t.siteId),
 foreignKey({name:"site_concept_item_contact_fk",columns:[t.contactId,t.siteId],foreignColumns:[siteConceptContacts.id,siteConceptContacts.siteId]}),
 foreignKey({name:"site_concept_item_program_fk",columns:[t.programPlanId,t.siteId],foreignColumns:[siteProgramPlans.id,siteProgramPlans.siteId]}),
 foreignKey({name:"site_concept_item_blueprint_fk",columns:[t.blueprintItemId,t.siteId],foreignColumns:[siteBlueprintItems.id,siteBlueprintItems.siteId]}),
 check("site_concept_item_exactly_one_ck",sql.raw("(program_plan_id IS NOT NULL) <> (blueprint_item_id IS NOT NULL)")),
]);


/** Public prospectus interest is Site-scoped and separate from the ten-family introduction cap. */
export const siteProspectusInterests=pgTable("site_prospectus_interests",{
 id:id(),siteId:uuid("site_id").notNull().references(()=>sites.id,{onDelete:"restrict"}),
 requestId:uuid("request_id").notNull(),
 firstName:text("first_name").notNull(),lastName:text("last_name").notNull(),
 emailNormalized:text("email_normalized").notNull(),emailDigest:text("email_digest").notNull(),
 subjectKind:text("subject_kind"),subjectId:uuid("subject_id"),
 contactConsentAt:timestamp("contact_consent_at",{withTimezone:true}).notNull(),
 optedOutAt:timestamp("opted_out_at",{withTimezone:true}),createdAt:createdAt(),
},t=>[
 uniqueIndex("site_prospectus_interest_request_uq").on(t.siteId,t.requestId),
 index("site_prospectus_interest_site_idx").on(t.siteId,t.createdAt),
 index("site_prospectus_interest_email_idx").on(t.siteId,t.emailDigest),
 check("site_prospectus_interest_subject_ck",sql.raw("(subject_kind IS NULL AND subject_id IS NULL) OR (subject_kind in ('program','item') AND subject_id IS NOT NULL)")),
]);
