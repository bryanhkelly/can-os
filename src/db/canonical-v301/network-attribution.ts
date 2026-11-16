import { boolean, index, jsonb, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { educationV30, type JsonObject } from "./core";

const id = () => uuid("id").defaultRandom().primaryKey();

/** Network reporting units may be districts, jurisdictions, regions, chapters,
 * or any network-defined layer. Units never confer Site or learner authority. */
export const networkUnits = educationV30.table("network_units",{
  id:id(),
  networkOrganizationId:uuid("network_organization_id").notNull(),
  parentUnitId:uuid("parent_unit_id"),
  code:text("code").notNull(),
  name:text("name").notNull(),
  unitKind:text("unit_kind").notNull(),
  status:text("status").$type<"active"|"retired">().notNull().default("active"),
  validFrom:timestamp("valid_from",{withTimezone:true}).notNull().defaultNow(),
  validThrough:timestamp("valid_through",{withTimezone:true}),
  createdAt:timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),
},t=>[
  uniqueIndex("network_units_code_uq").on(t.networkOrganizationId,t.code),
  index("network_units_parent_idx").on(t.networkOrganizationId,t.parentUnitId),
]);

/** An Organization's reviewed, effective-dated membership in a network.
 * This does not verify the claimed affiliation of any individual learner. */
export const networkMemberships = educationV30.table("network_reporting_memberships",{
  id:id(),
  networkOrganizationId:uuid("network_organization_id").notNull(),
  memberOrganizationId:uuid("member_organization_id").notNull(),
  reportingUnitId:uuid("reporting_unit_id").notNull(),
  membershipKind:text("membership_kind").notNull().default("affiliate"),
  directoryVisible:boolean("directory_visible").notNull().default(false),
  status:text("status").$type<"pending"|"approved"|"suspended"|"revoked">().notNull().default("pending"),
  validFrom:timestamp("valid_from",{withTimezone:true}).notNull(),
  validThrough:timestamp("valid_through",{withTimezone:true}),
  evidenceVersionId:uuid("evidence_version_id"),
  reviewedByPersonId:uuid("reviewed_by_person_id"),
  reviewedAt:timestamp("reviewed_at",{withTimezone:true}),
  createdAt:timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),
},t=>[
  index("network_reporting_memberships_member_idx").on(t.memberOrganizationId,t.networkOrganizationId,t.status),
  index("network_reporting_memberships_unit_idx").on(t.networkOrganizationId,t.reportingUnitId,t.status),
]);

/** A network-assigned church, chapter or affiliate number is a mapping
 * onto an existing membership. It never replaces canonical identity. */
export const networkMemberIdentifiers=educationV30.table("network_member_identifiers",{
  id:id(),
  networkOrganizationId:uuid("network_organization_id").notNull(),
  networkMembershipId:uuid("network_membership_id").notNull(),
  identifierType:text("identifier_type").notNull(),
  identifierValue:text("identifier_value").notNull(),
  evidenceVersionId:uuid("evidence_version_id"),
  verifiedByPersonId:uuid("verified_by_person_id"),
  verifiedAt:timestamp("verified_at",{withTimezone:true}),
  recordedAt:timestamp("recorded_at",{withTimezone:true}).notNull().defaultNow(),
},t=>[
  uniqueIndex("network_member_external_id_uq")
    .on(t.networkOrganizationId,t.identifierType,t.identifierValue),
  index("network_member_identifiers_membership_idx").on(t.networkMembershipId),
]);

/** A member Site's affiliation never authorizes data exports or learner reads.
 * Each data-owning host separately permits named aggregate metrics. */
export const networkReportingGrants = educationV30.table("network_reporting_grants",{
  id:id(),
  networkOrganizationId:uuid("network_organization_id").notNull(),
  hostOrganizationId:uuid("host_organization_id").notNull(),
  allowedMetrics:text("allowed_metrics").array().notNull(),
  evidenceVersionId:uuid("evidence_version_id").notNull(),
  grantedByPersonId:uuid("granted_by_person_id").notNull(),
  validFrom:timestamp("valid_from",{withTimezone:true}).notNull(),
  validThrough:timestamp("valid_through",{withTimezone:true}),
  revokedAt:timestamp("revoked_at",{withTimezone:true}),
  createdAt:timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),
},t=>[
  index("network_reporting_grants_scope_idx").on(t.networkOrganizationId,t.hostOrganizationId,t.validFrom),
]);

/** Append-only attribution referencing one native Class enrollment OR one
 * existing noncredit registration, never creating another learning source. */
export const participationAttributions = educationV30.table("participation_attributions",{
  id:id(),
  noncreditRegistrationId:uuid("noncredit_registration_id"),
  classEnrollmentId:uuid("class_enrollment_id"),
  releaseId:uuid("release_id"),
  deliverySiteId:uuid("delivery_site_id").notNull(),
  reportingSiteId:uuid("reporting_site_id").notNull(),
  creditedOrganizationId:uuid("credited_organization_id").notNull(),
  networkMembershipId:uuid("network_membership_id"),
  attributionBasis:text("attribution_basis").$type<"provider_default"|"self_reported"|"verified_member">()
    .notNull().default("provider_default"),
  relationshipSnapshot:jsonb("relationship_snapshot").$type<JsonObject>().notNull().default({}),
  attributedAt:timestamp("attributed_at",{withTimezone:true}).notNull().defaultNow(),
  recordedAt:timestamp("recorded_at",{withTimezone:true}).notNull().defaultNow(),
},t=>[
  uniqueIndex("participation_attributions_noncredit_registration_id_key").on(t.noncreditRegistrationId),
  uniqueIndex("participation_attributions_class_enrollment_id_key").on(t.classEnrollmentId),
  index("participation_attribution_credit_idx").on(t.creditedOrganizationId,t.attributedAt),
  index("participation_attribution_membership_idx").on(t.networkMembershipId,t.attributedAt),
  index("participation_attribution_site_idx").on(t.reportingSiteId,t.attributedAt),
]);
