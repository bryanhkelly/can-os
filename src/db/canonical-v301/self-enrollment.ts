import { boolean, index, integer, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { educationV30 } from "./core";
const id = () => uuid("id").defaultRandom().primaryKey();

/** Public-previewable only after an explicit provider publish command and
 * its runtime verification. An Offering alone never invites enrollment. */
export const noncreditSelfEnrollmentReleases = educationV30.table("noncredit_self_enrollment_releases", {
  id: id(),
  deploymentId: uuid("deployment_id").notNull(),
  adoptionId: uuid("adoption_id").notNull(),
  offeringVersionId: uuid("offering_version_id").notNull(),
  trainingVersionId: uuid("training_version_id").notNull(),
  courseVersionId: uuid("course_version_id").notNull(),
  providerOrganizationId: uuid("provider_organization_id").notNull(),
  registeringOrganizationId: uuid("registering_organization_id").notNull(),
  siteId: uuid("site_id"),
  deliveryMode: text("delivery_mode").$type<"independent"|"facilitated">().notNull(),
  status: text("status").$type<"published"|"closed">().notNull().default("published"),
  opensAt: timestamp("opens_at",{withTimezone:true}).notNull(),
  closesAt: timestamp("closes_at",{withTimezone:true}).notNull(),
  maxParticipants: integer("max_participants").notNull(),
  consentVersion: text("consent_version").notNull(),
  consentText: text("consent_text").notNull(),
  publishedByPersonId: uuid("published_by_person_id").notNull(),
  publishedAt: timestamp("published_at",{withTimezone:true}).notNull().defaultNow(),
  closedAt: timestamp("closed_at",{withTimezone:true}),
  createdAt: timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),
}, t => [
  index("noncredit_self_enroll_provider_idx").on(t.registeringOrganizationId,t.status,t.createdAt),
]);

export const noncreditSelfEnrollmentClaims = educationV30.table("noncredit_self_enrollment_claims", {
  id: id(),
  releaseId: uuid("release_id").notNull(),
  registrationId: uuid("registration_id").notNull(),
  participantPersonId: uuid("participant_person_id").notNull(),
  canonicalAccountId: uuid("canonical_account_id").notNull(),
  siteId: uuid("site_id"),
  consentVersion: text("consent_version").notNull(),
  consentSha256: text("consent_sha256").notNull(),
  adultAttested: boolean("adult_attested").notNull(),
  referralCode: text("referral_code"),
  createdAt: timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),
}, t => [
  uniqueIndex("noncredit_self_claim_registration_uq").on(t.registrationId),
  uniqueIndex("noncredit_self_claim_person_release_uq").on(t.releaseId,t.participantPersonId),
]);

/** These are native v3.0.1 Persons, NOT public.people identities. */
export const canonicalPersons = educationV30.table("persons",{
  id: id(),
  legalFirstName: text("legal_first_name"),
  legalLastName: text("legal_last_name"),
  preferredName: text("preferred_name"),
  birthDate: text("birth_date"),
});

/** Canonical Offering membership is source-of-truth for the chosen Course. */
export const canonicalOfferingCourses = educationV30.table("offering_courses", {
  offeringVersionId: uuid("offering_version_id").notNull(),
  courseVersionId: uuid("course_version_id").notNull(),
  isRequired: boolean("is_required").notNull(),
  sequenceNo: integer("sequence_no"),
});

/** Read-only canonical Site and provider labels for an explicitly published
 * enrollment release. Do not import similarly named public-schema entities. */
export const canonicalEnrollmentSites = educationV30.table("sites", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
  status: text("status").notNull(),
});
export const canonicalEnrollmentOrganizations = educationV30.table("organizations", {
  id: uuid("id").primaryKey(),
  displayName: text("display_name").notNull(),
  status: text("status").notNull(),
});
