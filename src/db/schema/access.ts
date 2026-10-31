import { boolean, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, updatedAt } from "./common";
import { people } from "./identity";

/** Provider-independent local account. Never treat browser persona as an account. */
export const accessAccounts = pgTable("access_accounts", {
 id: id(),
 emailNormalized: text("email_normalized").notNull(),
 emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
 disabled: boolean("disabled").notNull().default(false),
 createdAt: createdAt(),
 updatedAt: updatedAt(),
}, t => [uniqueIndex("access_accounts_email_uq").on(t.emailNormalized)]);

/** Verified account-to-person assignment; one login can represent multiple genuine memberships. */
export const accountPersonGrants = pgTable("account_person_grants", {
 id: id(),
 accountId: uuid("account_id").notNull().references(() => accessAccounts.id, {onDelete:"cascade"}),
 personId: uuid("person_id").notNull().references(() => people.id, {onDelete:"restrict"}),
 role: text("role").notNull(),
 organizationId: uuid("organization_id"),
 siteId: uuid("site_id"),
 active: boolean("active").notNull().default(true),
 isSynthetic: boolean("is_synthetic").notNull().default(false),
 createdAt: createdAt(),
 updatedAt: updatedAt(),
}, t => [index("account_person_grants_account_idx").on(t.accountId),index("account_person_grants_person_idx").on(t.personId)]);

/** Hash at rest; one-time token redemption must be atomic and attempt limited. */
export const accessChallenges = pgTable("access_challenges", {
 id: id(),
 accountId: uuid("account_id").notNull().references(() => accessAccounts.id,{onDelete:"cascade"}),
 tokenHash: text("token_hash").notNull(),
 expiresAt: timestamp("expires_at",{withTimezone:true}).notNull(),
 consumedAt: timestamp("consumed_at",{withTimezone:true}),
 attempts: integer("attempts").notNull().default(0),
 createdAt: createdAt(),
}, t => [uniqueIndex("access_challenges_hash_uq").on(t.tokenHash),index("access_challenges_account_idx").on(t.accountId)]);

/**
 * Shared global safety buckets (sign-in request, verification and church application), not per-user or per-IP.
 * Postgres upserts the count atomically; no untrusted proxy headers are used.
 * This is a coarse emergency admission limit until trusted-edge rate limiting
 * can be configured. Fixed-size table: no unbounded attempt log.
 */
export const authRequestRateLimits = pgTable("auth_request_rate_limits", {
 route: text("route").primaryKey(),
 windowStartedAt: timestamp("window_started_at", {withTimezone:true}).notNull().defaultNow(),
 requestCount: integer("request_count").notNull().default(0),
});

/** Independent of OTP provider; hash opaque session secret and revoke server-side. */
export const accessSessions = pgTable("access_sessions", {
 id: id(),
 accountId: uuid("account_id").notNull().references(() => accessAccounts.id,{onDelete:"cascade"}),
 secretHash: text("secret_hash").notNull(),
 activeGrantId: uuid("active_grant_id").references(() => accountPersonGrants.id,{onDelete:"set null"}),
 expiresAt: timestamp("expires_at",{withTimezone:true}).notNull(),
 revokedAt: timestamp("revoked_at",{withTimezone:true}),
 createdAt: createdAt(),
 updatedAt: updatedAt(),
}, t => [uniqueIndex("access_sessions_secret_uq").on(t.secretHash),index("access_sessions_account_idx").on(t.accountId)]);
