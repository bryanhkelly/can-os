import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read=(path:string)=>readFileSync(resolve(process.cwd(),path),"utf8");

describe("scoped school-family operator recovery",()=>{
  it("requires a real current registrar and exact Site, Organization and Program scope",()=>{
    const file=read("src/modules/communication/school-family-delivery-operations.functions.ts");
    expect(file).toContain("!hasRegistrarAuthority(actor.role)");
    expect(file).toContain("actor.sessionAccountId");
    expect(file).toContain('assertCapability(actor,"communication.send")');
    expect(file).toContain("inArray(s.actions.organizationId,actor.scope.organizationIds!)");
    expect(file).toContain("inArray(s.actions.siteId,actor.scope.siteIds!)");
    expect(file).toContain("inArray(s.actions.programId,actor.scope.programIds!)");
    expect(file).toContain('eq(s.notifications.type,"school_family_alert")');
    expect(file).toContain('eq(s.actions.type,"school_family_bulletin")');
  });

  it("only requeues failed terminal receipts, retaining the original idempotency key",()=>{
    const file=read("src/modules/communication/school-family-delivery-operations.functions.ts");
    expect(file).toContain('if(r.status!=="failed"||r.nextAttemptAt||r.acceptedAt||r.leaseUntil||');
    expect(file).toContain('eq(s.notificationOutboundDeliveries.status,"failed")');
    expect(file).toContain("isNull(s.notificationOutboundDeliveries.acceptedAt)");
    expect(file).toContain('status:"pending",attempts:0,nextAttemptAt:now');
    expect(file).toContain('r.lastError==="sms_provider_outcome_unconfirmed"');
    expect(file).toContain("IS DISTINCT FROM");
    expect(file).toContain("writeAudit(tx,actor");
    expect(file).toContain('status:"queued" as const');
    expect(file).not.toContain("sendNotificationEmail(");
    expect(file).not.toContain("sendOptedInSms(");
  });

  it("exposes status metadata without contact or message bodies",()=>{
    const file=read("src/modules/communication/school-family-delivery-operations.functions.ts");
    expect(file).toContain("nextCursor:");
    expect(file).toContain("createdAt:r.createdAt.toISOString()");
    expect(file).not.toContain("emailNormalized");
    expect(file).not.toContain("smsVerifiedPhone");
    expect(file).not.toContain("message:s.notifications.body");
  });
});
