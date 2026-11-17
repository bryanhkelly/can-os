import { and, asc, eq, gt, isNotNull, isNull, lte, notInArray, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import * as s from "@/db/schema";
import { guardianRelationshipPredicate } from "@/domain/guardian-relationship";
import { SMS_PROVIDER_OUTCOME_UNCONFIRMED, outboundAttemptOutcome } from "@/domain/outbound-sms-safety";
import { isDemoTenantOrganization } from "@/modules/identity/demo-school-tenants.server";
import {
  dispatchOutboundMessages, type OutboundClaim, type OutboundPreparation,
} from "./outbound-dispatcher.server";
import {
  sendNotificationEmail, type NotificationEmailMessage,
} from "./notification-email.server";
import {
  getNotificationPreferences, nextAllowedDelivery, sendOptedInSms,
} from "@/platform/subscriptions/preferences";

type OutboundMessage =
  | { channel: "email"; email: NotificationEmailMessage }
  | { channel: "sms"; phone: string; organizationId: string };

const delivery = s.notificationOutboundDeliveries;
/** The source-specific queue predicate is shared by claim and stale lease cleanup. */
function schoolFamilyReceipt() {
  return sql`exists (
          select 1 from public.notifications source_notification
          join public.actions source_action on source_action.id = source_notification.resource_id
          where source_notification.id = ${delivery.notificationId}
            and source_notification.type = 'school_family_alert'
            and source_notification.resource_type = 'action'
            and source_action.type = 'school_family_bulletin'
        )`;
}

function owned(claim: OutboundClaim) {
  return and(eq(delivery.id, claim.id),
    eq(delivery.status, "processing"),
    eq(delivery.leaseUntil, claim.leaseUntil));
}

/**
 * School-family alerts use the same leased transport coordination as
 * noncredit invitations, but retain their own current-guardian authorization,
 * notification preferences, SMS consent and safe content policy.
 * Original school Action and in-app Notification remain authoritative.
 */
const schoolFamilyAdapter = {
  async claim(now: Date, seenIds: readonly string[], leaseMs: number):
    Promise<OutboundClaim | null> {
    return db.transaction(async tx => {
      const [row] = await tx.select({
        id: delivery.id, attempts: delivery.attempts, channel: delivery.channel,
      }).from(delivery).where(and(
        // Only claim this feature's receipts. A correlated EXISTS avoids
        // locking a shared school bulletin Action during SKIP LOCKED claims.
        schoolFamilyReceipt(),
        ...(seenIds.length ? [notInArray(delivery.id, [...seenIds])] : []),
        or(
          and(eq(delivery.status, "pending"),
            or(isNull(delivery.nextAttemptAt), lte(delivery.nextAttemptAt, now))),
          and(eq(delivery.status, "failed"), lte(delivery.nextAttemptAt, now)),
          and(eq(delivery.status, "processing"), lte(delivery.leaseUntil, now)),
        ),
      )).orderBy(asc(delivery.createdAt)).limit(1)
        .for("update", { skipLocked: true });
      if (!row) return null;
      const leaseUntil = new Date(now.getTime() + leaseMs);
      await tx.update(delivery).set({
        status: "processing", leaseUntil, updatedAt: now,
      }).where(eq(delivery.id, row.id));
      return { id: row.id, attempts: row.attempts, leaseUntil, sourceChannel: row.channel };
    });
  },
  async prepare(claim: OutboundClaim, now: Date):
    Promise<OutboundPreparation<OutboundMessage>> {
    const [record] = await db.select({
      outbound: delivery,
      recipientPersonId: s.notifications.recipientPersonId,
      notificationType: s.notifications.type,
      resourceType: s.notifications.resourceType,
      actionId: s.actions.id,
      actionType: s.actions.type,
      title: s.notifications.title,
      message: s.notifications.body,
      programId: s.actions.programId,
      siteId: s.actions.siteId,
      organizationId: s.actions.organizationId,
    }).from(delivery)
      .innerJoin(s.notifications, eq(s.notifications.id, delivery.notificationId))
      .innerJoin(s.actions, eq(s.actions.id, s.notifications.resourceId))
      .where(owned(claim)).limit(1);
    if (!record) return { kind: "suppress", reason: "source_receipt_unavailable" };
    if (record.notificationType !== "school_family_alert" ||
        record.resourceType !== "action" ||
        record.actionType !== "school_family_bulletin" ||
        !record.programId || !record.siteId || !record.organizationId)
      return { kind: "suppress", reason: "invalid_school_alert" };
    if (await isDemoTenantOrganization(record.organizationId))
      return { kind: "suppress", reason: "demo_tenant_external_delivery" };

    // Re-evaluate custody, school enrollment, active account and scoped
    // guardian grant on every attempt, not from publication-time recipients.
    const [guardian] = await db.select({ id: s.guardianRelationships.id })
      .from(s.guardianRelationships)
      .innerJoin(s.studentProfiles, eq(
        s.studentProfiles.personId, s.guardianRelationships.studentPersonId))
      .innerJoin(s.enrollments, and(
        eq(s.enrollments.studentProfileId, s.studentProfiles.id),
        eq(s.enrollments.kind, "program"),
        eq(s.enrollments.status, "active"),
        eq(s.enrollments.programId, record.programId),
      ))
      .innerJoin(s.programs, and(
        eq(s.programs.id, s.enrollments.programId),
        eq(s.programs.siteId, record.siteId),
        eq(s.programs.organizationId, record.organizationId),
        eq(s.programs.status, "active"),
      ))
      .innerJoin(s.accountPersonGrants, and(
        eq(s.accountPersonGrants.personId, s.guardianRelationships.guardianPersonId),
        eq(s.accountPersonGrants.role, "guardian"),
        eq(s.accountPersonGrants.active, true),
        eq(s.accountPersonGrants.organizationId, record.organizationId),
        or(isNull(s.accountPersonGrants.siteId),
          eq(s.accountPersonGrants.siteId, record.siteId)),
      ))
      .innerJoin(s.accessAccounts, and(
        eq(s.accessAccounts.id, s.accountPersonGrants.accountId),
        eq(s.accessAccounts.disabled, false),
      ))
      .innerJoin(s.people, and(
        eq(s.people.id, s.guardianRelationships.guardianPersonId),
        eq(s.people.active, true),
      ))
      .where(guardianRelationshipPredicate({
        guardianPersonId: record.recipientPersonId, access: "enrollment",
      })).limit(1);
    if (!guardian)
      return { kind: "suppress", reason: "guardian_enrollment_access_revoked" };
    const preferences = await getNotificationPreferences(record.recipientPersonId);
    if (record.outbound.channel === "sms" &&
      (!preferences?.smsOptedIn || !preferences.smsVerifiedPhone || !preferences.smsVerifiedAt))
      return { kind: "suppress", reason: "sms_opt_in_or_verified_phone_missing" };

    const quietUntil = preferences
      ? nextAllowedDelivery(now, preferences.timezone, preferences.quietStart, preferences.quietEnd)
      : null;
    if (quietUntil) return { kind: "defer", nextAttemptAt: quietUntil };

    if (record.outbound.channel === "email") {
      const [mail] = await db.select({ email: s.accessAccounts.emailNormalized })
        .from(s.accountPersonGrants)
        .innerJoin(s.accessAccounts,
          eq(s.accessAccounts.id, s.accountPersonGrants.accountId))
        .where(and(
          eq(s.accountPersonGrants.personId, record.recipientPersonId),
          eq(s.accountPersonGrants.role, "guardian"),
          eq(s.accountPersonGrants.organizationId, record.organizationId),
          or(isNull(s.accountPersonGrants.siteId),
            eq(s.accountPersonGrants.siteId, record.siteId)),
          eq(s.accountPersonGrants.active, true),
          eq(s.accessAccounts.disabled, false),
          isNotNull(s.accessAccounts.emailVerifiedAt),
        )).limit(1);
      if (!mail?.email) return { kind: "fail", reason: "no_active_school_email" };
      return { kind: "ready", message: {
        channel: "email",
        email: {
          to: mail.email, subject: record.title,
          text: record.message ?? record.title, siteId: record.siteId,
        },
      }};
    }
    if (record.outbound.channel === "sms") {
      return { kind: "ready", message: {
        channel: "sms", phone: preferences!.smsVerifiedPhone!,
        organizationId: record.organizationId,
      }};
    }
    return { kind: "fail", reason: "unsupported_channel" };
  },
  async renew(claim: OutboundClaim, now: Date, leaseMs: number):
    Promise<OutboundClaim | null> {
    const leaseUntil = new Date(now.getTime() + leaseMs);
    const rows = await db.update(delivery).set({
      leaseUntil, updatedAt: now,
    }).where(and(owned(claim), gt(delivery.leaseUntil, now)))
      .returning({ id: delivery.id });
    return rows.length ? { ...claim, leaseUntil } : null;
  },
  async defer(claim: OutboundClaim, until: Date, now: Date): Promise<boolean> {
    const rows = await db.update(delivery).set({
      status: "pending", leaseUntil: null,
      nextAttemptAt: until, updatedAt: now,
    }).where(owned(claim)).returning({ id: delivery.id });
    return rows.length > 0;
  },
  async send(message: OutboundMessage, key: string): Promise<boolean> {
    if (message.channel === "email")
      return sendNotificationEmail(message.email, key);
    // SMS never includes free-form publisher content.
    return sendOptedInSms(
      message.phone,
      "CAN OS: Your school has issued an urgent family update. Sign in to review current instructions.",
      message.organizationId,
    );
  },
  async settle(claim: OutboundClaim, result: {
    kind: "accepted" | "failed" | "suppressed";
    now: Date; attempts: number; nextAttemptAt: Date | null; reason: string | null;
  }): Promise<boolean> {
    // Twilio's current sender does not provide a durable idempotent receipt.
    // A timeout or worker exception can follow provider acceptance, so SMS
    // failures are deliberately terminal until provider-side reconciliation.
    const outcome = outboundAttemptOutcome(claim.sourceChannel ?? "unknown", result);
    const rows = await db.update(delivery).set({
      status: result.kind, attempts: result.attempts,
      acceptedAt: result.kind === "accepted" ? result.now : null,
      lastError: outcome.lastError,
      nextAttemptAt: outcome.nextAttemptAt,
      leaseUntil: null, updatedAt: result.now,
    }).where(owned(claim)).returning({ id: delivery.id });
    return rows.length > 0;
  },
  async attemptsAfterError(claim: OutboundClaim): Promise<number | null> {
    const [row] = await db.select({ attempts: delivery.attempts })
      .from(delivery).where(owned(claim)).limit(1);
    return row ? row.attempts + 1 : null;
  },
};

/** Retain the original scheduled job contract and bounded concurrency. */
export async function processSchoolFamilyOutboundDeliveries(now = new Date(), limit = 120) {
  const bounded = Math.max(0, Math.trunc(limit));
  const workers = Math.min(6, bounded);
  if (!workers) return 0;
  // An expired SMS processing lease may mean the provider accepted the send
  // before the worker died. Never automatically re-send such SMS receipts.
  // Email retains its stable idempotency-key recovery behavior.
  const clock = new Date(Math.max(Date.now(), now.getTime()));
  await db.update(delivery).set({
    status: "failed", nextAttemptAt: null, leaseUntil: null,
    lastError: SMS_PROVIDER_OUTCOME_UNCONFIRMED, updatedAt: clock,
  }).where(and(
    schoolFamilyReceipt(),
    eq(delivery.channel, "sms"),
    eq(delivery.status, "processing"),
    lte(delivery.leaseUntil, clock),
  ));
  const counts = await Promise.all(Array.from({ length: workers }, (_, i) =>
    dispatchOutboundMessages(schoolFamilyAdapter, {
      now, limit: Math.floor(bounded / workers) + (i < bounded % workers ? 1 : 0),
    }),
  ));
  return counts.reduce((sum, row) => sum + row.accepted, 0);
}
