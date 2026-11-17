import { createHmac, timingSafeEqual } from "node:crypto";

const MAX_WEBHOOK_BYTES = 64 * 1024;
const MAX_SIGNATURE_AGE_SECONDS = 300;

/** Verify raw UTF-8 payload bytes before parsing any Resend event. */
export function verifyResendWebhookSignature(
  body: string,
  headers: Headers,
  secret: string | undefined,
  nowMs = Date.now(),
): boolean {
  if (!secret?.startsWith("whsec_") || Buffer.byteLength(body, "utf8") > MAX_WEBHOOK_BYTES)
    return false;
  const encodedSecret = secret.slice("whsec_".length);
  if (!/^[A-Za-z0-9+/=_-]+$/.test(encodedSecret)) return false;
  const key = Buffer.from(encodedSecret.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  if (key.length < 16) return false;
  const id = headers.get("svix-id");
  const timestamp = headers.get("svix-timestamp");
  const signature = headers.get("svix-signature");
  if (!id || id.length > 256 || !timestamp || !/^\d{10}$/.test(timestamp) ||
      !signature || signature.length > 2048) return false;
  const seconds = Number(timestamp);
  if (!Number.isSafeInteger(seconds) ||
      Math.abs(Math.floor(nowMs / 1000) - seconds) > MAX_SIGNATURE_AGE_SECONDS)
    return false;
  const expected = createHmac("sha256", key)
    .update(`${id}.${timestamp}.${body}`, "utf8")
    .digest();
  return signature.split(/\s+/).some(part => {
    if (!part.startsWith("v1,")) return false;
    const encoded = part.slice(3);
    if (!/^[A-Za-z0-9+/=]+$/.test(encoded)) return false;
    const actual = Buffer.from(encoded, "base64");
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  });
}

export type ResendReceiptEvent = {
  type: "email.delivered" | "email.bounced" | "email.complained" | "email.failed" | "email.suppressed";
  source: "school_family";
  receiptId: string;
  providerMessageId: string;
};

/** No email address, subject, custom HTML, or recipient-provided content is trusted. */
export function parseResendReceiptEvent(raw: unknown): ResendReceiptEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const event = raw as Record<string, unknown>;
  if (!["email.delivered", "email.bounced", "email.complained",
    "email.failed", "email.suppressed"].includes(String(event.type))) return null;
  const data = event.data;
  if (!data || typeof data !== "object") return null;
  const info = data as Record<string, unknown>;
  const tags = info.tags;
  if (!tags || typeof tags !== "object" || Array.isArray(tags)) return null;
  const values = tags as Record<string, unknown>;
  const receiptId = values.can_receipt;
  const messageId = info.email_id;
  if (values.can_source !== "school_family" ||
      typeof receiptId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(receiptId) ||
      typeof messageId !== "string" || messageId.length < 8 || messageId.length > 256)
    return null;
  return {
    type: event.type as ResendReceiptEvent["type"],
    source: "school_family",
    receiptId,
    providerMessageId: messageId,
  };
}
