import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("notification outbox source boundaries", () => {
  it("commits the canonical completion and CAN notification event together", () => {
    const command = source("src/modules/learning/noncredit-completion-decisions.functions.ts");
    expect(command).toContain("return db.transaction(async tx=>{");
    expect(command).toContain("tx.insert(noncreditCompletionDecisions)");
    expect(command).toContain("tx.insert(domainEvents)");
    expect(command).toContain("tx.insert(canNotificationEvents)");
    expect(command).toContain("actorPersonId:null");
    expect(command).not.toContain("sendNotificationEmail(");
    const handler = source("src/workers/domain-event-worker.ts");
    expect(handler).toContain(
      "registerDomainEventHandler(EventTypes.NoncreditTrainingCompleted, handleNotificationPolicyEvent)",
    );
  });

  it("keeps both source queues on the generic dispatcher without weakening eligibility", () => {
    const waitlist = source("src/modules/enrollment/noncredit-waitlist-delivery.server.ts");
    const school = source("src/modules/communication/school-family-alert-delivery.server.ts");
    const shared = source("src/modules/communication/outbound-dispatcher.server.ts");
    expect(waitlist).toContain("dispatchOutboundMessages(waitlistAdapter");
    expect(school).toContain("dispatchOutboundMessages(schoolFamilyAdapter");
    expect(waitlist).toContain("currentWaitlistEmailOpportunity");
    expect(school).toContain("guardianRelationshipPredicate");
    expect(school).toContain('access: "enrollment"');
    expect(school).toContain("smsOptedIn");
    expect(school).toContain("nextAllowedDelivery");
    expect(shared).toContain("adapter.renew(active");
    expect(shared).toContain("adapter.send(prepared.message, active.id)");
    expect(shared).toContain('kind: "defer"');
  });

  it("records in-app notifications and acknowledges their event atomically", () => {
    const handler = source("src/platform/notifications/policy-handler.ts");
    expect(handler).toContain("await db.transaction(async (tx)");
    expect(handler).toContain("await applyNotificationPolicy(tx, event, policy, context)");
    expect(handler).toContain("await tx.update(domainEvents).set({");
    expect(handler).toContain('status: "processed"');
  });
});
