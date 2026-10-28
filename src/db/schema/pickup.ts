import {
  boolean,
  date,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, id, updatedAt } from "./common";
import { households, people, studentProfiles } from "./identity";
import { programs, sites } from "./organizations";
import { attendanceEvents } from "./attendance";

/** Family release authority for one canonical Person, Program and Household. */
export const pickupAuthorizations = pgTable(
  "pickup_authorizations",
  {
    id: id(),
    studentProfileId: uuid("student_profile_id").notNull().references(
      () => studentProfiles.id, { onDelete: "restrict" }),
    householdId: uuid("household_id").notNull().references(
      () => households.id, { onDelete: "restrict" }),
    programId: uuid("program_id").notNull().references(
      () => programs.id, { onDelete: "restrict" }),
    siteId: uuid("site_id").notNull().references(
      () => sites.id, { onDelete: "restrict" }),
    pickupPersonId: uuid("pickup_person_id").notNull().references(
      () => people.id, { onDelete: "restrict" }),
    authorizedByPersonId: uuid("authorized_by_person_id").notNull().references(
      () => people.id, { onDelete: "restrict" }),
    relationshipLabel: text("relationship_label").notNull(),
    identityVerificationMethod: text("identity_verification_method").notNull(),
    status: text("status").default("active").notNull(),
    startsOn: date("starts_on").notNull(),
    expiresOn: date("expires_on"),
    sourceKey: text("source_key").notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedByPersonId: uuid("revoked_by_person_id").references(
      () => people.id, { onDelete: "restrict" }),
    revocationReason: text("revocation_reason"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("pickup_authorization_source_key_uq").on(table.sourceKey),
    index("pickup_authorization_roster_idx").on(
      table.programId, table.studentProfileId, table.status),
    index("pickup_authorization_person_idx").on(table.pickupPersonId),
    index("pickup_authorization_household_idx").on(table.householdId),
  ],
);

/** An active hold blocks every release until an authorized staff resolution. */
export const pickupCustodyHolds = pgTable(
  "pickup_custody_holds",
  {
    id: id(),
    studentProfileId: uuid("student_profile_id").notNull().references(
      () => studentProfiles.id, { onDelete: "restrict" }),
    householdId: uuid("household_id").notNull().references(
      () => households.id, { onDelete: "restrict" }),
    programId: uuid("program_id").notNull().references(
      () => programs.id, { onDelete: "restrict" }),
    siteId: uuid("site_id").notNull().references(
      () => sites.id, { onDelete: "restrict" }),
    kind: text("kind").notNull(),
    reason: text("reason").notNull(),
    status: text("status").default("active").notNull(),
    createdByPersonId: uuid("created_by_person_id").notNull().references(
      () => people.id, { onDelete: "restrict" }),
    sourceKey: text("source_key").notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedByPersonId: uuid("resolved_by_person_id").references(
      () => people.id, { onDelete: "restrict" }),
    resolutionNote: text("resolution_note"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("pickup_custody_hold_source_key_uq").on(table.sourceKey),
    index("pickup_custody_hold_roster_idx").on(
      table.programId, table.studentProfileId, table.status),
    index("pickup_custody_hold_household_idx").on(table.householdId),
  ],
);

/** Append-only staff-witnessed handoff or denied-attempt evidence. */
export const pickupReleaseEvents = pgTable(
  "pickup_release_events",
  {
    id: id(),
    studentProfileId: uuid("student_profile_id").notNull().references(
      () => studentProfiles.id, { onDelete: "restrict" }),
    householdId: uuid("household_id").notNull().references(
      () => households.id, { onDelete: "restrict" }),
    programId: uuid("program_id").notNull().references(
      () => programs.id, { onDelete: "restrict" }),
    siteId: uuid("site_id").notNull().references(
      () => sites.id, { onDelete: "restrict" }),
    attendanceEventId: uuid("attendance_event_id").notNull().references(
      () => attendanceEvents.id, { onDelete: "restrict" }),
    pickupAuthorizationId: uuid("pickup_authorization_id").references(
      () => pickupAuthorizations.id, { onDelete: "restrict" }),
    pickupPersonId: uuid("pickup_person_id").references(
      () => people.id, { onDelete: "restrict" }),
    presentedName: text("presented_name").notNull(),
    releaseDate: date("release_date").notNull(),
    status: text("status").notNull(),
    denialReason: text("denial_reason"),
    identityVerified: boolean("identity_verified").default(false).notNull(),
    identityVerificationMethod: text("identity_verification_method"),
    staffWitnessPersonId: uuid("staff_witness_person_id").notNull().references(
      () => people.id, { onDelete: "restrict" }),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    handoffEvidence: text("handoff_evidence"),
    detail: text("detail"),
    sourceKey: text("source_key").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("pickup_release_event_source_key_uq").on(table.sourceKey),
    index("pickup_release_event_roster_idx").on(
      table.programId, table.studentProfileId, table.releaseDate),
    index("pickup_release_event_attendance_idx").on(table.attendanceEventId),
    index("pickup_release_event_site_time_idx").on(table.siteId, table.occurredAt),
  ],
);
