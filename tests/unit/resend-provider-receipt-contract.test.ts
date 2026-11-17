import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read=(path:string)=>readFileSync(resolve(process.cwd(),path),"utf8");

describe("Resend provider receipt reconciliation contracts",()=>{
  it("tags only source-owned school-family emails with opaque receipt IDs",()=>{
    const sender=read("src/modules/communication/notification-email.server.ts");
    const school=read("src/modules/communication/school-family-alert-delivery.server.ts");
    expect(sender).toContain('name: "can_source"');
    expect(sender).toContain('name: "can_receipt"');
    expect(school).toContain('providerReceipt: { source: "school_family", receiptId: key }');
    expect(school).toContain("providerMessageId: result.providerMessageId");
    expect(school).toContain("sendNotificationEmailWithReceipt");
    const waitlist=read("src/modules/enrollment/noncredit-waitlist-delivery.server.ts");
    expect(waitlist).toContain('providerReceipt: { source: "noncredit_waitlist", receiptId: key }');
    expect(waitlist).toContain("sendNotificationEmailWithReceipt");
  });

  it("validates signatures before parsing the raw payload and never sends",()=>{
    const route=read("src/routes/api.webhooks.resend.ts");
    const callback=read("src/modules/communication/resend-delivery-webhook.server.ts");
    expect(route).toContain('createFileRoute("/api/webhooks/resend")');
    expect(callback.indexOf("verifyResendWebhookSignature(body"))
      .toBeLessThan(callback.indexOf("JSON.parse(body)"));
    expect(callback).toContain("eq(r.id, event.receiptId)");
    expect(callback).toContain("noncreditWaitlistEmailDeliveries");
    expect(callback).toContain('eq(r.channel, "email")');
    expect(callback).toContain("eq(r.providerMessageId, event.providerMessageId)");
    expect(callback).toContain('status: "accepted"');
    expect(callback).toContain("nextAttemptAt: null");
    expect(callback).not.toContain("sendNotificationEmail(");
    expect(callback).not.toContain("sendOptedInSms(");
  });

  it("adds nullable provider evidence fields via the committed Drizzle migration",()=>{
    const sql=read("drizzle/0086_notification_provider_receipts.sql");
    const schema=read("src/db/schema/notification-outbound.ts");
    const journal=JSON.parse(read("drizzle/meta/_journal.json")) as {
      entries:Array<{tag:string}>,
    };
    const snapshot=JSON.parse(read("drizzle/meta/0086_snapshot.json")) as {
      tables:Record<string,{columns:Record<string,unknown>}>,
    };
    expect(sql).toContain('"provider_message_id" text');
    expect(sql).toContain('"provider_delivered_at" timestamp with time zone');
    expect(sql).toContain('"provider_failed_at" timestamp with time zone');
    expect(schema).toContain('providerMessageId:text("provider_message_id")');
    expect(journal.entries.some(e=>e.tag==="0086_notification_provider_receipts")).toBe(true);
    expect(snapshot.tables["public.notification_outbound_deliveries"].columns)
      .toHaveProperty("provider_message_id");
    const canonical=read("database/canonical/v3.0.1/patch-noncredit-waitlist-provider-receipts.sql");
    expect(canonical).toContain("provider_message_id text");
    expect(canonical).toContain("FORCE ROW LEVEL SECURITY");
  });
});
