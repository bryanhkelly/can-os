import { and, eq, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { notificationOutboundDeliveries } from "@/db/schema";
import { noncreditWaitlistEmailDeliveries } from "@/db/canonical-v301";
import {
  parseResendReceiptEvent,
  readBoundedResendWebhookBody,
  verifyResendWebhookSignature,
  type ResendReceiptEvent,
} from "@/domain/resend-webhook";

function processingOrSent(status: typeof notificationOutboundDeliveries.status) {
  return or(eq(status, "pending"), eq(status, "processing"),
    eq(status, "accepted"), eq(status, "failed"));
}

/**
 * Signed source evidence only. Never disclose the recipient, alter canonical
 * enrollment or send a second email. A provider callback may arrive before
 * the sender settles or after an ambiguous HTTP failure.
 */
async function attachResendReceiptEvent(event: ResendReceiptEvent) {
  const now = new Date();
  const delivered = event.type === "email.delivered";
  if (event.source === "school_family") {
    const r = notificationOutboundDeliveries;
    await db.update(r).set({
      status: "accepted",
      acceptedAt: sql`coalesce(${r.acceptedAt}, ${now})`,
      nextAttemptAt: null,
      providerMessageId: event.providerMessageId,
      ...(delivered ? {
        providerDeliveredAt: sql`coalesce(${r.providerDeliveredAt}, ${now})`,
      } : {
        providerFailedAt: sql`coalesce(${r.providerFailedAt}, ${now})`,
        providerFailureKind: sql`case when ${r.providerFailureKind} = 'email.complained' then ${r.providerFailureKind} else ${event.type} end`,
      }),
    }).where(and(
      eq(r.id, event.receiptId),
      eq(r.channel, "email"),
      or(isNull(r.providerMessageId), eq(r.providerMessageId, event.providerMessageId)),
      processingOrSent(r.status),
    ));
    return;
  }
  const r = noncreditWaitlistEmailDeliveries;
  await db.update(r).set({
    status: "accepted",
    acceptedAt: sql`coalesce(${r.acceptedAt}, ${now})`,
    nextAttemptAt: null,
    providerMessageId: event.providerMessageId,
    ...(delivered ? {
      providerDeliveredAt: sql`coalesce(${r.providerDeliveredAt}, ${now})`,
    } : {
      providerFailedAt: sql`coalesce(${r.providerFailedAt}, ${now})`,
      providerFailureKind: sql`case when ${r.providerFailureKind} = 'email.complained' then ${r.providerFailureKind} else ${event.type} end`,
    }),
  }).where(and(
    eq(r.id, event.receiptId),
    or(isNull(r.providerMessageId), eq(r.providerMessageId, event.providerMessageId)),
    processingOrSent(r.status),
  ));
}

export async function handleResendDeliveryWebhook(request: Request): Promise<Response> {
  const signingSecret = process.env.RESEND_WEBHOOK_SECRET;
  if (!signingSecret) return Response.json({ error: "Unavailable" }, { status: 503 });
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (declaredLength > 64 * 1024) return new Response(null, { status: 413 });
  const body = await readBoundedResendWebhookBody(request);
  if (body === null) return new Response(null, { status: 413 });
  if (!verifyResendWebhookSignature(body, request.headers, signingSecret))
    return new Response(null, { status: 401 });
  let parsed: unknown;
  try { parsed = JSON.parse(body) as unknown; }
  catch { return new Response(null, { status: 400 }); }
  const event = parseResendReceiptEvent(parsed);
  if (!event) return new Response(null, { status: 200 });

  await attachResendReceiptEvent(event);
  return new Response(null, { status: 200 });
}
