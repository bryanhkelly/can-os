import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, id, updatedAt } from "./common";
import { sections } from "./academics";
import { organizations } from "./organizations";
import { people } from "./identity";
import { instructionalCapacityReservations } from "./educational-capacity";

/** Canonical policy governing enrollment into one Section. */
export const sectionRegistrationPolicies = pgTable(
  "section_registration_policies",
  {
    id: id(),
    sectionId: uuid("section_id").notNull().references(() => sections.id, { onDelete: "cascade" }),
    enrollmentCapacity: integer("enrollment_capacity").notNull(),
    addDropEndsOn: text("add_drop_ends_on").notNull(),
    withdrawalEndsOn: text("withdrawal_ends_on").notNull(),
    credits: numeric("credits", { precision: 5, scale: 2 }).default("1").notNull(),
    maxCreditsPerTerm: numeric("max_credits_per_term", { precision: 5, scale: 2 }).default("7").notNull(),
    guardianApprovalRequired: boolean("guardian_approval_required").default(false).notNull(),
    approvalMode: text("approval_mode").default("registrar").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("section_registration_policy_section_uq").on(t.sectionId),
  ],
);

export const sectionPrerequisites = pgTable(
  "section_prerequisites",
  {
    id: id(),
    sectionId: uuid("section_id").notNull().references(() => sections.id, { onDelete: "cascade" }),
    prerequisiteCourseCode: text("prerequisite_course_code").notNull(),
    minimumGrade: text("minimum_grade"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("section_prerequisite_code_uq").on(t.sectionId, t.prerequisiteCourseCode),
    index("section_prerequisite_section_idx").on(t.sectionId),
  ],
);

/**
 * Canonical bridge from planned Section to actual delivery.
 * Historical arrangements remain instead of overwriting who delivered a class.
 */
export const deliveryArrangements = pgTable(
  "delivery_arrangements",
  {
    id: id(),
    sectionId: uuid("section_id").notNull().references(() => sections.id, { onDelete: "cascade" }),
    academicProviderOrganizationId: uuid("academic_provider_organization_id")
      .notNull().references(() => organizations.id, { onDelete: "restrict" }),
    instructorPersonId: uuid("instructor_person_id").references(() => people.id, { onDelete: "restrict" }),
    facilitatorPersonId: uuid("facilitator_person_id").references(() => people.id, { onDelete: "restrict" }),
    modality: text("modality").notNull(),
    capacityReservationId: uuid("capacity_reservation_id")
      .references(() => instructionalCapacityReservations.id, { onDelete: "restrict" }),
    status: text("status").default("proposed").notNull(),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }),
    effectiveThrough: timestamp("effective_through", { withTimezone: true }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("delivery_arrangement_section_idx").on(t.sectionId, t.status),
    index("delivery_arrangement_instructor_idx").on(t.instructorPersonId, t.status),
  ],
);
