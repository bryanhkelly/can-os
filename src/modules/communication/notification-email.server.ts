/**
 * Server-only transactional email for in-app notifications.
 * Mirrors the Resend fetch pattern in identity/resend-access-mail.server.ts,
 * but never throws: email delivery must not break a domain transaction.
 * Call from server code only; never import this module into a client component.
 */
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/db/client";
import { accessAccounts, accountPersonGrants, people } from "@/db/schema";
import { isDemoAccountEmail } from "@/domain/local-demo-access";
import { isDemoTenantOrganization } from "@/modules/identity/demo-school-tenants.server";

export type NotificationEmailMessage = {
  to: string;
  subject: string;
  text: string;
  /** HTML from a server-owned, escaped template; never publisher-supplied markup. */
  html?: string;
  actionUrl?: string;
  siteId?: string;
  /** Server-owned receipt tags for authenticated provider callbacks. */
  providerReceipt?: { source: "school_family" | "noncredit_waitlist"; receiptId: string };
  attachments?: { filename: string; content: string; contentType: string }[];
};

function resolveActionUrl(actionUrl: string | undefined): string | undefined {
  if (!actionUrl) return undefined;
  try {
    const url = new URL(actionUrl);
    if (url.protocol !== "https:" || !url.hostname) return undefined;
    // The sending service must never fall back to arbitrary HTTPS links if
    // the trusted application origin is missing or misconfigured.
    const allowedOrigin = process.env.CAN_ACCESS_PUBLIC_ORIGIN;
    if (!allowedOrigin) return undefined;
    const trusted = new URL(allowedOrigin);
    if (trusted.protocol !== "https:" || url.origin !== trusted.origin) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

export type NotificationEmailSendReceipt = {
  accepted: boolean;
  providerMessageId?: string;
};

/**
 * Outbox-only API. Resend's HTTP 2xx means accepted for processing, NOT
 * delivered to the recipient's server or opened by a person.
 */
export async function sendNotificationEmailWithReceipt(
  message: NotificationEmailMessage,
  idempotencyKey?: string,
): Promise<NotificationEmailSendReceipt> {
  return sendNotificationEmailCore(message, idempotencyKey);
}

/** Compatibility API for callers that only need provider acceptance. */
export async function sendNotificationEmail(
  message: NotificationEmailMessage,
  idempotencyKey?: string,
): Promise<boolean> {
  return (await sendNotificationEmailCore(message, idempotencyKey)).accepted;
}

async function sendNotificationEmailCore(
  message: NotificationEmailMessage,
  idempotencyKey?: string,
): Promise<NotificationEmailSendReceipt> {
  if(isDemoAccountEmail(message.to)){
    console.log("[notification-email] Demo account delivery suppressed");
    return { accepted: false };
  }
  const apiKey = process.env.RESEND_API_KEY;
  const from =
    process.env.CAN_NOTIFICATIONS_FROM_EMAIL ??
    process.env.CAN_ACCESS_FROM_EMAIL;
  if (!apiKey || !from) {
    console.log("[notification-email] Resend not configured; skipping email");
    return { accepted: false };
  }

  const actionUrl = resolveActionUrl(message.actionUrl);
  const text = actionUrl
    ? `${message.text}\n\n${actionUrl}`
    : message.text;

  try {
    const brand = message.siteId
      ? await import("@/modules/sites/school-brand.server")
        .then(module => module.readSchoolBrand(message.siteId!))
        .catch(() => { console.warn("[notification-email] School branding unavailable; using CAN branding"); return null; }) : null;
    const { renderSchoolEmail, schoolEmailLogoAttachment } = await import("@/domain/school-email");
    const logoAttachment = schoolEmailLogoAttachment(brand);
    const attachments = [
      ...(message.attachments ?? []).map(attachment => ({ filename: attachment.filename,
        content: attachment.content, content_type: attachment.contentType })),
      ...(logoAttachment ? [logoAttachment] : []),
    ];
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      signal: AbortSignal.timeout(20_000),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      body: JSON.stringify({
        from,
        to: [message.to],
        subject: message.subject,
        text,
        html: message.html ?? renderSchoolEmail({ brand, text, actionUrl }),
        ...(attachments.length ? { attachments } : {}),
        ...(message.providerReceipt ? { tags: [
          { name: "can_source", value: message.providerReceipt.source },
          { name: "can_receipt", value: message.providerReceipt.receiptId },
        ] } : {}),
      }),
    });
    if (!response.ok) {
      console.log(
        `[notification-email] Resend delivery failed with status ${response.status}`,
      );
      return { accepted: false };
    }
    const responseBody = await response.json().catch(() => null) as { id?: unknown } | null;
    const providerMessageId = typeof responseBody?.id === "string" ? responseBody.id : undefined;
    return { accepted: true, ...(providerMessageId ? { providerMessageId } : {}) };
  } catch (error) {
    console.log(
      `[notification-email] Delivery error: ${error instanceof Error ? error.message : "unknown"}`,
    );
    return { accepted: false };
  }
}

/** Defense in depth: account/grant eligibility must survive both the SQL
 * filter and projection, including if a caller changes the query later. */
export function eligibleNotificationEmailAccount(record: {
  accountDisabled:boolean;emailVerifiedAt:Date|null;
  grantActive:boolean;personActive:boolean;
}): boolean {
  return !record.accountDisabled && !!record.emailVerifiedAt &&
    record.grantActive && record.personActive;
}

/**
 * Resolve notification recipient emails for a set of personIds through their
 * access accounts (people -> account_person_grants -> access_accounts).
 * After callers authorize recipients, active grants on verified, non-disabled accounts are eligible. Returns at most
 * one email per person.
 */
export async function emailNotificationRecipients(
  personIds: string[],
  organizationId: string | null,
): Promise<Map<string, string>> {
  const recipients = new Map<string, string>();
  if(!organizationId || await isDemoTenantOrganization(organizationId))return recipients;
  const uniqueIds = [...new Set(personIds)];
  if (uniqueIds.length === 0) return recipients;

  const rows = await db
    .select({
      personId: accountPersonGrants.personId,
      email: accessAccounts.emailNormalized,
      accountDisabled: accessAccounts.disabled,
      emailVerifiedAt: accessAccounts.emailVerifiedAt,
      grantActive: accountPersonGrants.active,
      personActive: people.active,
    })
    .from(accountPersonGrants)
    .innerJoin(accessAccounts, eq(accessAccounts.id, accountPersonGrants.accountId))
    .innerJoin(people, eq(people.id, accountPersonGrants.personId))
    .where(
      and(
        inArray(accountPersonGrants.personId, uniqueIds),
        eq(accountPersonGrants.active, true),
        eq(people.active, true),
        eq(accessAccounts.disabled, false),
        isNotNull(accessAccounts.emailVerifiedAt),
      ),
    );

  for (const row of rows) {
    if (!eligibleNotificationEmailAccount(row) || isDemoAccountEmail(row.email)) continue;
    if (!recipients.has(row.personId)) {
      recipients.set(row.personId, row.email);
    }
  }
  return recipients;
}
