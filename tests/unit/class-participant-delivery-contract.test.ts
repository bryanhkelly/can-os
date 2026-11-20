import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
const read=(path:string)=>readFileSync(resolve(process.cwd(),path),"utf8");

describe("enrollment-to-Class communication integration",()=>{
  it("uses native lifecycle events and source-owned receipt rows",()=>{
    const events=read("src/modules/classes/class-participant-events.server.ts");
    const worker=read("src/workers/domain-event-worker.ts");
    for(const event of [
      "ClassEnrollmentCreated","ClassEnrollmentAssigned","ClassGuardianEnrollmentCreated",
      "ClassInvitationIssued","ClassSessionScheduled","ClassSessionScheduleChanged",
    ]){
      expect(worker).toContain(event);
      expect(events).toContain(event);
    }
    expect(events).toContain(".onConflictDoNothing()");
    expect(events).toContain('status: "processed"');
    expect(events).toContain('enrollment.enrollmentMethod === "approval"');
    expect(events).not.toContain("sendNotificationEmail(");
  });
  it("rechecks recipient and Session eligibility immediately before email",()=>{
    const delivery=read("src/modules/classes/class-participant-delivery.server.ts");
    expect(delivery).toContain("verifiedRecipient(");
    expect(delivery).toContain('eq(canonicalClassEnrollments.status, "active")');
    expect(delivery).toContain('eq(canonicalAccountGrants.roleCode, "learner")');
    expect(delivery).toContain('eq(accountPersonGrants.role, "guardian")');
    expect(delivery).toContain('terms.state!=="published"');
    expect(delivery).toContain("sendNotificationEmailWithReceipt");
    expect(delivery).toContain('"class-participant:" + key');
    expect(delivery).toContain('original.state!=="scheduled"');
    expect(delivery).toContain('original.state !== "cancelled"');
  });
  it("routes chronological delivery and calendar actions through shared services",()=>{
    const cron=read("src/server.ts");
    const scheduled=read("src/workers/scheduled-jobs.ts");
    const card=read("src/components/learning/native-class/EnrolledClassCard.tsx");
    const calendar=read("src/modules/classes/native-class-calendar.functions.ts");
    expect(cron).toContain("processClassParticipantDeliveries");
    expect(scheduled).toContain("processClassParticipantDeliveries");
    expect(card).toContain("Download Class schedule (.ics)");
    expect(calendar).toContain("authorizeCanonicalCourseAttempt(");
  });
  it("holds migration and TypeScript schema in sync",()=>{
    const migration=read("drizzle/0093_class_participant_delivery.sql");
    const schema=read("src/db/schema/class-participant-deliveries.ts");
    for(const key of ["enrollment_confirmed","invitation_issued",
      "session_scheduled","session_changed","session_reminder"]){
      expect(migration).toContain(key);
      expect(schema).toContain(key);
    }
    expect(migration).toContain("class_participant_delivery_event_key_uq");
    expect(schema).toContain("class_participant_delivery_event_key_uq");
  });
});
