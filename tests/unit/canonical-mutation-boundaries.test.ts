import { describe, expect, it, vi } from "vitest";
import { auditEvents, domainEvents } from "@/db/schema";
import { emitCanonicalDomainEvent, writeCanonicalAudit } from "@/platform/canonical-mutation.server";

const AUDIT_ACTOR="00000000-0000-4000-8000-000000000001";
const AUDIT_RESOURCE="00000000-0000-4000-8000-000000000002";
const ORGANIZATION="00000000-0000-4000-8000-000000000003";
const EVENT_ID="00000000-0000-4000-8000-000000000004";

function fakeTransaction() {
  const returning=vi.fn(async () => [{ id:EVENT_ID }]);
  const values=vi.fn((_input: unknown) => ({
    returning,
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve().then(() => resolve(undefined), reject),
  }));
  const insert=vi.fn((_table: unknown) => ({ values }));
  return {tx:{insert} as never,insert,values,returning};
}

describe("native mutation evidence uses the shared public journals",()=>{
  it("maps native audit codes, scope, payload and original time without writing legacy tables",async()=>{
    const {tx,insert,values}=fakeTransaction();
    const occurredAt=new Date("2026-11-17T17:00:00.000Z");
    await writeCanonicalAudit(tx,{
      actorPersonId:AUDIT_ACTOR,owningOrganizationId:ORGANIZATION,
      eventCode:"class.enrollment.created",entityKind:"class_enrollment",
      entityId:AUDIT_RESOURCE,payload:{method:"approval",requestId:"abc"},occurredAt,
    });
    expect(insert).toHaveBeenCalledExactlyOnceWith(auditEvents);
    expect(values).toHaveBeenCalledWith({
      actorPersonId:AUDIT_ACTOR,action:"class.enrollment.created",
      resourceType:"class_enrollment",resourceId:AUDIT_RESOURCE,
      scope:{organizationId:ORGANIZATION},
      context:{source:"canonical_v301",nativeAuditPayload:{method:"approval",requestId:"abc"}},
      occurredAt,
    });
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it("enqueues native event facts in the same shared public outbox transaction",async()=>{
    const {tx,insert,values,returning}=fakeTransaction();
    const occurredAt=new Date("2026-11-17T17:00:00.000Z");
    await emitCanonicalDomainEvent(tx,{
      eventType:"ClassEnrollmentCreated",aggregateType:"class_enrollment",
      aggregateId:AUDIT_RESOURCE,actorPersonId:AUDIT_ACTOR,
      payload:{classId:ORGANIZATION},occurredAt,
    });
    expect(insert).toHaveBeenCalledExactlyOnceWith(domainEvents);
    expect(values).toHaveBeenCalledWith({
      eventType:"ClassEnrollmentCreated",aggregateType:"class_enrollment",
      aggregateId:AUDIT_RESOURCE,actorPersonId:AUDIT_ACTOR,
      payload:{classId:ORGANIZATION},occurredAt,
    });
    expect(returning).toHaveBeenCalledWith({id:domainEvents.id});
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it("does not fabricate an actor for system-generated audit and domain events",async()=>{
    const {tx,insert,values}=fakeTransaction();
    await writeCanonicalAudit(tx,{
      eventCode:"noncredit.waitlist.joined",entityKind:"noncredit_enrollment_waitlist",
      entityId:AUDIT_RESOURCE,payload:{siteId:ORGANIZATION},
    });
    expect(values).toHaveBeenCalledWith(expect.objectContaining({
      actorPersonId:null,scope:{},context:{
        source:"canonical_v301",nativeAuditPayload:{siteId:ORGANIZATION},
      },
    }));
    await emitCanonicalDomainEvent(tx,{
      eventType:"NoncreditWaitlistJoined",aggregateType:"noncredit_enrollment_waitlist",
      aggregateId:AUDIT_RESOURCE,
    });
    expect(values).toHaveBeenLastCalledWith(expect.objectContaining({
      actorPersonId:null,payload:{},
    }));
    expect(insert).toHaveBeenCalledTimes(2);
  });

  it("propagates write failure to the caller's business transaction",async()=>{
    const failure=new Error("transaction aborted");
    const tx={insert:()=>({values:()=>{throw failure;}})} as never;
    await expect(writeCanonicalAudit(tx,{
      eventCode:"test.failure",entityKind:"noncredit_registration",entityId:AUDIT_RESOURCE,
    })).rejects.toBe(failure);
    await expect(emitCanonicalDomainEvent(tx,{
      eventType:"TestFailure",aggregateType:"noncredit_registration",aggregateId:AUDIT_RESOURCE,
    })).rejects.toBe(failure);
  });
});
