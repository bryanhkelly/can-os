import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  parseResendReceiptEvent,
  readBoundedResendWebhookBody,
  verifyResendWebhookSignature,
} from "@/domain/resend-webhook";

const receiptId = "9fdaf5bb-8fe1-4d87-92e0-463529b9c281";
const providerMessageId = "68855ead-9d43-4c97-8c3e-562ea5871684";
const secret = "whsec_" + Buffer.from("long_test_webhook_secret_32_bytes").toString("base64");
const timestamp = "1794950000";
const body = JSON.stringify({
  type: "email.delivered",
  data: { email_id: providerMessageId,
    tags: { can_source: "school_family", can_receipt: receiptId },
    to: ["private@example.com"], subject: "Private notification" },
});
function headers(payload = body, signedAt = timestamp) {
  const h = new Headers();
  h.set("svix-id", "msg_authenticated_1");
  h.set("svix-timestamp", signedAt);
  const signature = createHmac("sha256", Buffer.from(secret.slice(6), "base64"))
    .update(`msg_authenticated_1.${signedAt}.${payload}`).digest("base64");
  h.set("svix-signature", "v1," + signature);
  return h;
}
describe("signed Resend source receipt callbacks", () => {
  it("accepts an authentic raw payload with a fresh timestamp", () => {
    expect(verifyResendWebhookSignature(
      body, headers(), secret, Number(timestamp) * 1000,
    )).toBe(true);
  });
  it("rejects modified bytes, stale time, missing secret and bad signatures", () => {
    const now = Number(timestamp) * 1000;
    expect(verifyResendWebhookSignature(body + " ", headers(), secret, now)).toBe(false);
    expect(verifyResendWebhookSignature(body, headers(), secret, now + 301000)).toBe(false);
    expect(verifyResendWebhookSignature(body, headers(), undefined, now)).toBe(false);
    const wrong = headers(); wrong.set("svix-signature", "v1,ZmFrZQ==");
    expect(verifyResendWebhookSignature(body, wrong, secret, now)).toBe(false);
  });
  it("bounds raw request body bytes independently of Content-Length", async () => {
    const small = new Request("https://example.test/api/webhooks/resend", {
      method: "POST", body,
    });
    expect(await readBoundedResendWebhookBody(small)).toBe(body);
    const oversized = new Request("https://example.test/api/webhooks/resend", {
      method: "POST", body: "x".repeat(65 * 1024),
    });
    oversized.headers.delete("content-length");
    expect(await readBoundedResendWebhookBody(oversized)).toBeNull();
  });
  it("only correlates signed delivery outcomes to opaque school family receipts", () => {
    const parsed = parseResendReceiptEvent(JSON.parse(body));
    expect(parsed).toEqual({
      type: "email.delivered", source: "school_family",
      receiptId, providerMessageId,
    });
    for (const type of ["email.bounced", "email.complained", "email.failed", "email.suppressed"]) {
      expect(parseResendReceiptEvent({
        type, data: { email_id: providerMessageId,
          tags: { can_source: "school_family", can_receipt: receiptId } },
      })).toMatchObject({ type, receiptId, providerMessageId });
    }
  });
  it("correlates native campaign delivery without trusting recipient identity", () => {
    expect(parseResendReceiptEvent({type:"email.bounced",data:{email_id:providerMessageId,tags:{can_source:"engagement_campaign",can_receipt:receiptId},to:["secret@example.com"]}})).toEqual({type:"email.bounced",source:"engagement_campaign",receiptId,providerMessageId});
  });
  it("accepts canonical noncredit receipts and rejects unrelated products", () => {
    expect(parseResendReceiptEvent({ type: "email.delivered", data: {
      email_id: providerMessageId, tags: { can_source: "noncredit_waitlist", can_receipt: receiptId },
    } })).toMatchObject({source:"noncredit_waitlist",receiptId,providerMessageId});
    expect(parseResendReceiptEvent({ type: "email.delivered", data: {
      email_id: providerMessageId, tags: { can_source: "unknown_source", can_receipt: receiptId },
    } })).toBeNull();
    expect(parseResendReceiptEvent({ type: "email.delivered", data: {
      email_id: providerMessageId, tags: { can_source: "school_family", can_receipt: "not-uuid" },
    } })).toBeNull();
    expect(parseResendReceiptEvent({ type: "email.opened", data: {
      email_id: providerMessageId, tags: { can_source: "school_family", can_receipt: receiptId },
    } })).toBeNull();
  });
});
