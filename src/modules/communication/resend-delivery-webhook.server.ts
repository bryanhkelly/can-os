import { and, eq, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { notificationOutboundDeliveries } from "@/db/schema";
import {
  parseResendReceiptEvent,
  verifyResendWebhookSignature,
} from "@/domain/resend-webhook";

/**
 * Provider status evidence is attached only to a pre-existing email receipt.
 * This never mutates the authoritative school Action or the in-app notice
 * and never initiates a second send after a bounce.
 */
export async function handleResendDeliveryWebhook(request: Request): Promise<Response> {
  const signingSecret = process.env.RESEND_WEBHOOK_SECRET;
  if (!signingSecret) return Response.json({ error: "Unavailable" }, { status: 503 });
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (declaredLength > 64 * 1024) return new Response(null, { status: 413 });
  const body = await request.text();
  if (!verifyResendWebhookSignature(body, request.headers, signingSecret))
    return new Response(null, { status: 401 });
  let parsed: unknown;
  try { parsed = JSON.parse(body) as unknown; }
  catch { return new Response(null, { status: 400 }); }
  const event = parseResendReceiptEvent(parsed);
  if (!event) return new Response(null, { status: 200 });

  const receipt = notificationOutboundDeliveries;
  const occurredAt = new Date();
  const delivered = event.type === "email.delivered";
  const changes = delivered ? {
    providerMessageId: event.providerMessageId,
    providerDeliveredAt: sql`coalesce(${receipt.providerDeliveredAt}, ${occurredAt})`,
  } : {
    providerMessageId: event.providerMessageId,
    providerFailedAt: sql`coalesce(${receipt.providerFailedAt}, ${occurredAt})`,
    providerFailureKind: event.type,
  };

  await db.update(receipt).set(changes)
    .where(and(
      eq(receipt.id, event.receiptId),
      eq(receipt.channel, "email"),
      // Never attribute a callback to a receipt whose transport had
      // already recorded a different Resend message identifier.
      or(isNull(receipt.providerMessageId),
        eq(receipt.providerMessageId, event.providerMessageId)),
      // Suppressed or unsent receipts never get provider attribution.
      or(eq(receipt.status, "processing"), eq(receipt.status, "accepted")),
    ));
  return new Response(null, { status: 200 });
}
