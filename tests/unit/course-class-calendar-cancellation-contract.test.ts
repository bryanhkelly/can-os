import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const source=(path:string)=>readFileSync(resolve(process.cwd(),path),"utf8");

describe("Class calendar cancellation on Course withdrawal",()=>{
  const withdrawal=source("src/modules/enrollment/noncredit-self-enrollment-withdraw.server.ts");
  const events=source("src/modules/classes/class-participant-events.server.ts");
  const delivery=source("src/modules/classes/class-participant-delivery.server.ts");
  const migration=source("drizzle/0096_class_enrollment_calendar_cancellation.sql");
  it("changes the original Class and Course in the same transaction",()=>{
    expect(withdrawal).toContain('eventType:"ClassEnrollmentWithdrawn"');
    expect(withdrawal).toContain('.set({status:"withdrawn"})');
    expect(withdrawal).toContain("linkedClasses");
  });
  it("queues the exit from the authoritative Class enrollment event",()=>{
    expect(events).toContain('type==="ClassEnrollmentWithdrawn"');
    expect(events).toContain('enqueue(enrollment.classId,enrollment.id,recipient,"enrollment_cancelled")');
  });
  it("uses exact verified recipients and calendar CANCEL instead of deleting history",()=>{
    expect(delivery).toContain('record.kind==="enrollment_cancelled"');
    expect(delivery).toContain('inArray(canonicalClassEnrollments.status,["withdrawn","cancelled"])');
    expect(delivery).toContain('enrollment??cancelledEnrollment??null');
    expect(delivery).toContain('"cancelled-class-sessions.ics"');
    expect(delivery).toContain('"CANCEL"');
    expect(migration).toContain("'enrollment_cancelled'");
  });
});
