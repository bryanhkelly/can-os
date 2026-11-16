import { boolean, index, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { and, isNull } from "drizzle-orm";
import { educationV30 } from "./core";

const id = () => uuid("id").defaultRandom().primaryKey();

/** Native sign-in account. All IDs are issued by CAN OS v3.0.1. */
export const canonicalAccounts = educationV30.table("canonical_accounts", {
  id: id(),
  emailNormalized: text("email_normalized").notNull(),
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  disabledAt: timestamp("disabled_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [uniqueIndex("canonical_accounts_email_normalized_key").on(t.emailNormalized)]);

/** One active authority grant within an actual canonical Organization and Site. */
export const canonicalAccountGrants = educationV30.table("canonical_account_grants", {
  id: id(),
  accountId: uuid("account_id").notNull(),
  personId: uuid("person_id").notNull(),
  organizationId: uuid("organization_id").notNull(),
  siteId: uuid("site_id"),
  roleCode: text("role_code").$type<"site_admin" | "registrar" | "blueprint_reviewer" | "survey_reviewer" | "learner" | "room_facilitator">().notNull(),
  active: boolean("active").notNull().default(true),
  grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
}, t => [
  index("canonical_account_grants_account_idx").on(t.accountId)
    .where(and(t.active, isNull(t.revokedAt))),
]);

/** Independently approved time-bounded staff capability, not a role grant. */
export const canonicalSensitiveCapabilityApprovals = educationV30.table(
  "canonical_sensitive_capability_approvals", {
    id: id(),
    canonicalGrantId: uuid("canonical_grant_id").notNull(),
    capabilityCode: text("capability_code").$type<"credential.issue">().notNull(),
    requestedByCanAccountId: uuid("requested_by_can_account_id").notNull(),
    requestEvidenceReference: text("request_evidence_reference").notNull(),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    status: text("status").$type<"pending"|"approved"|"rejected"|"revoked">().notNull().default("pending"),
    reviewedByCanAccountId: uuid("reviewed_by_can_account_id"),
    reviewEvidenceReference: text("review_evidence_reference"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    approvedUntil: timestamp("approved_until", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedByCanAccountId: uuid("revoked_by_can_account_id"),
    revokedReason: text("revoked_reason"),
  }, t => [
    uniqueIndex("sensitive_approvals_open_grant_uq")
      .on(t.canonicalGrantId,t.capabilityCode)
      .where(and(isNull(t.revokedAt), // rejects coexistence of pending or approved
        isNull(t.revokedByCanAccountId))),
    index("sensitive_approvals_status_idx").on(t.status,t.requestedAt),
  ],
);

/** Hashed bearer session, anchored to the same account as the selected grant. */
export const canonicalSessions = educationV30.table("canonical_sessions", {
  id: id(),
  accountId: uuid("account_id").notNull(),
  activeGrantId: uuid("active_grant_id").notNull(),
  secretHash: text("secret_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastActivityAt: timestamp("last_activity_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  clientInstanceId:uuid("client_instance_id"),deviceCategory:text("device_category"),
  browserFamily:text("browser_family"),osFamily:text("os_family"),
  ipAddress:text("ip_address"),networkObservedAt:timestamp("network_observed_at",{withTimezone:true}),
  sharedDevice:boolean("shared_device").notNull().default(false),
}, t => [
  uniqueIndex("canonical_sessions_secret_hash_key").on(t.secretHash),
  index("canonical_sessions_account_idx").on(t.accountId).where(isNull(t.revokedAt)),
]);
