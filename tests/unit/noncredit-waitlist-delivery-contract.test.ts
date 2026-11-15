import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
const read=(path:string)=>readFileSync(resolve(process.cwd(),path),"utf8");
describe("noncredit 48-hour invitation delivery",()=>{
  it("creates one transactional outbox receipt with each invite, not a mail send inside a transaction",()=>{
    const api=read("src/modules/enrollment/noncredit-cohort-operations.functions.ts");
    expect(api).toContain("tx.insert(noncreditWaitlistEmailDeliveries)");
    expect(api).toContain("invitationExpiresAt:until");
    expect(api).toContain("notificationQueued:true");
    expect(api).not.toContain("sendNotificationEmail(");
  });
  it("rechecks live eligibility and verified adult identity before provider delivery",()=>{
    const worker=read("src/modules/enrollment/noncredit-waitlist-delivery.server.ts");
    expect(worker).toContain('record.waitlistStatus!=="invited"');
    expect(worker).toContain("record.delivery.invitationExpiresAt");
    expect(worker).toContain("readEligibleSelfEnrollmentReleases(db,record.releaseId)");
    expect(worker).toContain("record.releaseStatus");
    expect(worker).toContain("isDemoTenantOrganization(");
    expect(worker).toContain("accountPersonGrants.active,true");
    expect(worker).toContain('grant.role==="student"');
    expect(worker).toContain("sendNotificationEmail({");
    expect(worker).toContain("},claimed.id)");
    expect(worker).toContain('for("update",{skipLocked:true})');
    expect(worker).toContain("leaseUntil");
    expect(worker).toContain("nextAttemptAt");
    expect(worker).toContain("accepted");
  });
  it("does not make provider acceptance equal enrollment or learner receipt",()=>{
    const worker=read("src/modules/enrollment/noncredit-waitlist-delivery.server.ts");
    expect(worker).not.toContain("tx.insert(noncreditRegistrations)");
    expect(worker).not.toContain("tx.insert(learnerCourseAttempts)");
    expect(read("src/modules/enrollment/noncredit-waitlist.functions.ts"))
      .toContain("emailDeliveryStatus:");
    const cron=read("src/server.ts");
    expect(cron).toContain("processNoncreditWaitlistEmailDeliveries");
    const sql=read("database/canonical/v3.0.1/patch-noncredit-waitlist-email-deliveries.sql");
    expect(sql).toContain("FORCE ROW LEVEL SECURITY");
    expect(sql).toContain("REVOKE ALL ON education_v30.noncredit_waitlist_email_deliveries FROM PUBLIC");
    expect(sql).toContain("UNIQUE (waitlist_id,invitation_expires_at)");
  });
});
