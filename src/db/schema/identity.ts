import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, id, updatedAt } from "./common";

export const people = pgTable(
  "people",
  {
    id: id(),
    legalFirstName: text("legal_first_name").notNull(),
    legalLastName: text("legal_last_name").notNull(),
    preferredName: text("preferred_name"),
    email: text("email"),
    phone: text("phone"),
    active: boolean("active").default(true).notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("people_email_idx").on(table.email),
    index("people_name_idx").on(table.legalLastName, table.legalFirstName),
  ],
);

export const authIdentities = pgTable(
  "auth_identities",
  {
    id: id(),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    providerSubject: text("provider_subject").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("auth_identity_provider_subject_uq").on(
      table.provider,
      table.providerSubject,
    ),
    index("auth_identity_person_idx").on(table.personId),
  ],
);

export const studentProfiles = pgTable(
  "student_profiles",
  {
    id: id(),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    studentNumber: text("student_number"),
    gradeLevel: text("grade_level"),
    preferredPronouns: text("preferred_pronouns"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("student_profile_person_uq").on(table.personId),
    uniqueIndex("student_profile_number_uq").on(table.studentNumber),
  ],
);

export const households = pgTable("households", {
  id: id(),
  displayName: text("display_name").notNull(),
  primaryEmail: text("primary_email"),
  primaryPhone: text("primary_phone"),
  address: jsonb("address").$type<{
    line1?: string;
    line2?: string;
    city?: string;
    region?: string;
    postalCode?: string;
    country?: string;
  }>(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const householdMemberships = pgTable(
  "household_memberships",
  {
    id: id(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    relationshipLabel: text("relationship_label").notNull(),
    isPrimaryContact: boolean("is_primary_contact").default(false).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("household_person_uq").on(table.householdId, table.personId),
    index("household_membership_person_idx").on(table.personId),
  ],
);

export const guardianRelationships = pgTable(
  "guardian_relationships",
  {
    id: id(),
    guardianPersonId: uuid("guardian_person_id")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    studentPersonId: uuid("student_person_id")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    relationshipLabel: text("relationship_label").notNull(),
    canViewAcademics: boolean("can_view_academics").default(false).notNull(),
    canManageEnrollment: boolean("can_manage_enrollment").default(false).notNull(),
    canSubmitAttendanceExcuse: boolean("can_submit_attendance_excuse")
      .default(false)
      .notNull(),
    canManagePickup: boolean("can_manage_pickup").default(false).notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("guardian_student_uq").on(
      table.guardianPersonId,
      table.studentPersonId,
    ),
    index("guardian_student_student_idx").on(table.studentPersonId),
  ],
);
