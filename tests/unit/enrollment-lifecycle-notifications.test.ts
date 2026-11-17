import { describe, expect, it } from "vitest";
import { EventTypes } from "@/domain/event-types";
import { getNotificationPolicy } from "@/platform/notifications/policy";
import "@/platform/notifications/policies";
import { sectionScheduleChangedPolicy } from "@/platform/notifications/policies/section-schedule-changed";
import { sectionEnrollmentWithdrawnPolicy } from "@/platform/notifications/policies/section-enrollment-withdrawn";
import { sectionWaitlistSeatOfferedPolicy } from "@/platform/notifications/policies/section-waitlist-seat-offered";
import { sectionCreationRequestDeclinedPolicy, sectionCreationRequestFulfilledPolicy } from "@/platform/notifications/policies/section-creation-request-outcomes";

const a="11111111-1111-4111-8111-111111111111";
const b="22222222-2222-4222-8222-222222222222";
const resource="33333333-3333-4333-8333-333333333333";

describe("enrollment lifecycle notification policies", () => {
  it("registers lifecycle notification policies for durable event dispatch", () => {
    expect(getNotificationPolicy(EventTypes.SectionScheduleChanged)).toBe(sectionScheduleChangedPolicy);
    expect(getNotificationPolicy(EventTypes.SectionEnrollmentWithdrawn)).toBe(sectionEnrollmentWithdrawnPolicy);
    expect(getNotificationPolicy(EventTypes.SectionWaitlistSeatOffered)).toBe(sectionWaitlistSeatOfferedPolicy);
    expect(getNotificationPolicy(EventTypes.SectionCreationRequestDeclined)).toBe(sectionCreationRequestDeclinedPolicy);
    expect(getNotificationPolicy(EventTypes.SectionCreationRequestFulfilled)).toBe(sectionCreationRequestFulfilledPolicy);
  });
  it("notifies authorized schedule recipients without claiming email delivery", () => {
    const plans=sectionScheduleChangedPolicy.plans({
      sectionId:resource, sectionTitle:"Geometry", recipients:[a,b],
    }, {} as never);
    expect(plans).toHaveLength(2);
    expect(plans.map(plan=>plan.recipientPersonId)).toEqual([a,b]);
    expect(plans.every(plan=>plan.resourceType==="section"&&plan.resourceId===resource)).toBe(true);
    expect(plans.every(plan=>!plan.body.includes("delivered"))).toBe(true);
  });
  it("seat offers preserve expiry and do not claim enrollment", () => {
    const expiry = new Date("2026-12-01T18:00:00.000Z");
    const plans = sectionWaitlistSeatOfferedPolicy.plans({
      actionId:resource, title:"Geometry", expiry, recipients:[a],
    }, {} as never);
    expect(plans).toHaveLength(1);
    expect(plans[0]).toMatchObject({recipientPersonId:a,resourceType:"action",resourceId:resource});
    expect(plans[0]?.body).toContain(expiry.toISOString());
    expect(plans[0]?.body).toContain("not an enrollment");
  });
  it("notifies only the class request owner about each approval outcome", () => {
    for (const [policy, outcome] of [
      [sectionCreationRequestDeclinedPolicy, "declined"],
      [sectionCreationRequestFulfilledPolicy, "fulfilled"],
    ] as const) {
      const plans = policy.plans({requestId:resource,ownerId:a,title:"Class setup request",outcome}, {} as never);
      expect(plans).toHaveLength(1);
      expect(plans[0]).toMatchObject({recipientPersonId:a,resourceType:"action",resourceId:resource});
      expect(plans[0]?.body).not.toContain("delivered");
    }
  });
  it("withdrawal is personal and never a roster broadcast", () => {
    const plans=sectionEnrollmentWithdrawnPolicy.plans({
      enrollmentId:resource, sectionTitle:"Geometry", recipients:[a],
    }, {} as never);
    expect(plans).toHaveLength(1);
    expect(plans[0]).toMatchObject({
      recipientPersonId:a,resourceType:"enrollment",resourceId:resource,
    });
  });
});
