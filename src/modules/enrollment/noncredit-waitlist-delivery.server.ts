import { and, asc, eq, gt, isNull, lte, notInArray, or } from "drizzle-orm";
import { db } from "@/db/client";
import { accessAccounts, accountPersonGrants, people } from "@/db/schema";
import {
  noncreditEnrollmentWaitlist, noncreditSelfEnrollmentReleases,
  noncreditWaitlistEmailDeliveries,
} from "@/db/canonical-v301";
import {
  dispatchOutboundMessages, type OutboundClaim,
  type OutboundPreparation,
} from "@/modules/communication/outbound-dispatcher.server";
import {
  sendNotificationEmail, type NotificationEmailMessage,
} from "@/modules/communication/notification-email.server";
import { assertUnambiguousAdultAccount } from "@/modules/identity/unambiguous-adult-account.server";
import { AuthorizationError } from "@/domain/command-context";
import { isDemoTenantOrganization } from "@/modules/identity/demo-school-tenants.server";
import { readEligibleSelfEnrollmentReleases } from "./noncredit-self-enrollment-catalog.server";
import { currentWaitlistEmailOpportunity } from "@/domain/noncredit-waitlist-email-policy";

function owned(claim: OutboundClaim) {
  return and(
    eq(noncreditWaitlistEmailDeliveries.id, claim.id),
    eq(noncreditWaitlistEmailDeliveries.status, "processing"),
    eq(noncreditWaitlistEmailDeliveries.leaseUntil, claim.leaseUntil),
  );
}

/**
 * Source-specific adapter for the shared outbound dispatcher.
 * The originating transaction creates the durable receipt; this worker
 * rechecks release visibility, invitation expiry, verified account-to-person
 * grants and demo suppression immediately before external delivery.
 * A provider HTTP acceptance is NOT an inbox delivery confirmation.
 */
const waitlistAdapter = {
  async claim(now: Date, seenIds: readonly string[], leaseMs: number): Promise<OutboundClaim | null> {
    return db.transaction(async tx => {
      const [row] = await tx.select({
        id: noncreditWaitlistEmailDeliveries.id,
        attempts: noncreditWaitlistEmailDeliveries.attempts,
      }).from(noncreditWaitlistEmailDeliveries)
        .where(and(
          ...(seenIds.length
            ? [notInArray(noncreditWaitlistEmailDeliveries.id, [...seenIds])]
            : []),
          or(
            and(eq(noncreditWaitlistEmailDeliveries.status, "pending"),
              or(isNull(noncreditWaitlistEmailDeliveries.nextAttemptAt),
                lte(noncreditWaitlistEmailDeliveries.nextAttemptAt, now))),
            and(eq(noncreditWaitlistEmailDeliveries.status, "failed"),
              lte(noncreditWaitlistEmailDeliveries.nextAttemptAt, now)),
            and(eq(noncreditWaitlistEmailDeliveries.status, "processing"),
              lte(noncreditWaitlistEmailDeliveries.leaseUntil, now)),
          ),
        )).orderBy(asc(noncreditWaitlistEmailDeliveries.createdAt))
        .limit(1).for("update", { skipLocked: true });
      if (!row) return null;
      const leaseUntil = new Date(now.getTime() + leaseMs);
      await tx.update(noncreditWaitlistEmailDeliveries).set({
        status: "processing", leaseUntil, updatedAt: now,
      }).where(eq(noncreditWaitlistEmailDeliveries.id, row.id));
      return { id: row.id, attempts: row.attempts, leaseUntil };
    });
  },

  async prepare(claim: OutboundClaim, now: Date):
    Promise<OutboundPreparation<NotificationEmailMessage>> {
    const [record] = await db.select({
      delivery: noncreditWaitlistEmailDeliveries,
      releaseId: noncreditEnrollmentWaitlist.releaseId,
      accountId: noncreditEnrollmentWaitlist.accessAccountId,
      personId: noncreditEnrollmentWaitlist.accessPersonId,
      waitlistStatus: noncreditEnrollmentWaitlist.status,
      actualExpiry: noncreditEnrollmentWaitlist.inviteExpiresAt,
      releaseStatus: noncreditSelfEnrollmentReleases.status,
      releaseClosesAt: noncreditSelfEnrollmentReleases.closesAt,
      organizationId: noncreditSelfEnrollmentReleases.registeringOrganizationId,
    }).from(noncreditWaitlistEmailDeliveries)
      .innerJoin(noncreditEnrollmentWaitlist,
        eq(noncreditEnrollmentWaitlist.id, noncreditWaitlistEmailDeliveries.waitlistId))
      .innerJoin(noncreditSelfEnrollmentReleases,
        eq(noncreditSelfEnrollmentReleases.id, noncreditEnrollmentWaitlist.releaseId))
      .where(owned(claim)).limit(1);
    if (!record) return { kind: "suppress", reason: "source_receipt_unavailable" };
    const opportunity = {
      waitlistStatus: record.waitlistStatus,
      invitationExpiresAt: record.actualExpiry,
      deliveryInvitationExpiresAt: record.delivery.invitationExpiresAt,
      releaseStatus: record.releaseStatus,
      releaseClosesAt: record.releaseClosesAt,
      now,
    };
    if (!currentWaitlistEmailOpportunity(opportunity))
      return { kind: "suppress", reason: "invitation_no_longer_active" };

    // A published release alone does not confer authorization.
    const [eligibleRelease] = await readEligibleSelfEnrollmentReleases(db, record.releaseId);
    if (!eligibleRelease)
      return { kind: "suppress", reason: "release_eligibility_revoked" };
    if (await isDemoTenantOrganization(record.organizationId))
      return { kind: "suppress", reason: "demo_tenant_external_delivery" };

    const [recipient] = await db.select({ email: accessAccounts.emailNormalized })
      .from(accessAccounts)
      .innerJoin(accountPersonGrants, and(
        eq(accountPersonGrants.accountId, accessAccounts.id),
        eq(accountPersonGrants.personId, record.personId),
        eq(accountPersonGrants.active, true),
      ))
      .innerJoin(people, and(
        eq(people.id, accountPersonGrants.personId),
        eq(people.active, true),
      ))
      .where(and(
        eq(accessAccounts.id, record.accountId),
        eq(accessAccounts.disabled, false),
        gt(accessAccounts.emailVerifiedAt, new Date(0)),
      )).limit(1);
    if (!recipient?.email)
      return { kind: "suppress", reason: "verified_account_person_unavailable" };
    try {
      await assertUnambiguousAdultAccount(record.accountId, record.personId);
    } catch (error) {
      if (!(error instanceof AuthorizationError)) throw error;
      return { kind: "suppress", reason: "adult_person_identity_reconciliation_required" };
    }

    // Only a fixed, HTTPS public origin may appear in outbound email.
    const origin = process.env.CAN_ACCESS_PUBLIC_ORIGIN;
    let actionUrl: string | undefined;
    try {
      if (origin && new URL(origin).protocol === "https:")
        actionUrl = new URL("/learn/my-activity#noncredit-management", origin).toString();
    } catch { /* A message without a URL is still usable. */ }
    return {
      kind: "ready",
      message: {
        to: recipient.email,
        subject: "CAN learning: a place is available",
        text: "A place is available in a CAN learning program you joined the waitlist for. " +
          "Sign in to your own CAN account to review and accept the invitation before " +
          opportunity.invitationExpiresAt.toISOString() + ". An invitation is not an enrollment.",
        ...(actionUrl ? { actionUrl } : {}),
      },
    };
  },

  async renew(claim: OutboundClaim, now: Date, leaseMs: number):
    Promise<OutboundClaim | null> {
    const leaseUntil = new Date(now.getTime() + leaseMs);
    const rows = await db.update(noncreditWaitlistEmailDeliveries)
      .set({ leaseUntil, updatedAt: now })
      .where(and(owned(claim),
        gt(noncreditWaitlistEmailDeliveries.leaseUntil, now)))
      .returning({ id: noncreditWaitlistEmailDeliveries.id });
    return rows.length ? { ...claim, leaseUntil } : null;
  },

  send(message: NotificationEmailMessage, key: string) {
    return sendNotificationEmail(message, key);
  },

  async settle(claim: OutboundClaim, result: {
    kind: "accepted" | "failed" | "suppressed";
    now: Date;
    attempts: number;
    nextAttemptAt: Date | null;
    reason: string | null;
  }): Promise<boolean> {
    const rows = await db.update(noncreditWaitlistEmailDeliveries).set({
      status: result.kind,
      attempts: result.attempts,
      acceptedAt: result.kind === "accepted" ? result.now : null,
      lastError: result.reason,
      nextAttemptAt: result.nextAttemptAt,
      leaseUntil: null,
      updatedAt: result.now,
    }).where(owned(claim))
      .returning({ id: noncreditWaitlistEmailDeliveries.id });
    return rows.length > 0;
  },

  async attemptsAfterError(claim: OutboundClaim): Promise<number | null> {
    const [current] = await db.select({
      attempts: noncreditWaitlistEmailDeliveries.attempts,
    }).from(noncreditWaitlistEmailDeliveries).where(owned(claim)).limit(1);
    return current ? current.attempts + 1 : null;
  },
};

/** Backward-compatible scheduled job and Cloudflare entrypoint. */
export function processNoncreditWaitlistEmailDeliveries(now = new Date(), limit = 30):
  Promise<{ accepted: number; suppressed: number; failed: number }> {
  return dispatchOutboundMessages(waitlistAdapter, { now, limit });
}
