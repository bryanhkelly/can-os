/**
 * Server-only transactional email for in-app notifications.
 * Mirrors the Resend fetch pattern in identity/resend-access-mail.server.ts,
 * but never throws: email delivery must not break a domain transaction.
 * Call from server code only; never import this module into a client component.
 */
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/db/client";
import { accessAccounts, accountPersonGrants, people } from "@/db/schema";

export type NotificationEmailMessage = {
  to: string;
  subject: string;
  text: string;
  actionUrl?: string;
};

function resolveActionUrl(actionUrl: string | undefined): string | undefined {
  if (!actionUrl) return undefined;
  try {
    const url = new URL(actionUrl);
    if (url.protocol !== "https:" || !url.hostname) return undefined;
    const allowedOrigin = process.env.CAN_ACCESS_PUBLIC_ORIGIN;
    if (allowedOrigin && url.origin !== new URL(allowedOrigin).origin) {
      return undefined;
    }
    return url.toString();
  } catch {
    return undefined;
  }
}

export async function sendNotificationEmail(
  message: NotificationEmailMessage,
  idempotencyKey?: string,
): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from =
    process.env.CAN_NOTIFICATIONS_FROM_EMAIL ??
    process.env.CAN_ACCESS_FROM_EMAIL;
  if (!apiKey || !from) {
    console.log("[notification-email] Resend not configured; skipping email");
    return false;
  }

  const actionUrl = resolveActionUrl(message.actionUrl);
  const text = actionUrl
    ? `${message.text}\n\n${actionUrl}`
    : message.text;

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
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
      }),
    });
    if (!response.ok) {
      console.log(
        `[notification-email] Resend delivery failed with status ${response.status}`,
      );
      return false;
    }
    return true;
  } catch (error) {
    console.log(
      `[notification-email] Delivery error: ${error instanceof Error ? error.message : "unknown"}`,
    );
    return false;
  }
}

/** Defense in depth: account/grant eligibility must survive both the SQL
 * filter and projection, including if a caller changes the query later. */
export function eligibleNotificationEmailAccount(record: {
  accountDisabled:boolean;emailVerifiedAt:Date|null;
  grantActive:boolean;synthetic:boolean;personActive:boolean;
}): boolean {
  return !record.accountDisabled && !!record.emailVerifiedAt &&
    record.grantActive && !record.synthetic && record.personActive;
}

/**
 * Resolve notification recipient emails for a set of personIds through their
 * access accounts (people -> account_person_grants -> access_accounts).
 * Only real grants for active people on verified, non-disabled accounts are eligible. Returns at most
 * one email per person.
 */
export async function emailNotificationRecipients(
  personIds: string[],
): Promise<Map<string, string>> {
  const recipients = new Map<string, string>();
  const uniqueIds = [...new Set(personIds)];
  if (uniqueIds.length === 0) return recipients;

  const rows = await db
    .select({
      personId: accountPersonGrants.personId,
      email: accessAccounts.emailNormalized,
      accountDisabled: accessAccounts.disabled,
      emailVerifiedAt: accessAccounts.emailVerifiedAt,
      grantActive: accountPersonGrants.active,
      synthetic: accountPersonGrants.isSynthetic,
      personActive: people.active,
    })
    .from(accountPersonGrants)
    .innerJoin(accessAccounts, eq(accessAccounts.id, accountPersonGrants.accountId))
    .innerJoin(people, eq(people.id, accountPersonGrants.personId))
    .where(
      and(
        inArray(accountPersonGrants.personId, uniqueIds),
        eq(accountPersonGrants.active, true),
        eq(accountPersonGrants.isSynthetic, false),
        eq(people.active, true),
        eq(accessAccounts.disabled, false),
        isNotNull(accessAccounts.emailVerifiedAt),
      ),
    );

  for (const row of rows) {
    if (!eligibleNotificationEmailAccount(row)) continue;
    if (!recipients.has(row.personId)) {
      recipients.set(row.personId, row.email);
    }
  }
  return recipients;
}
