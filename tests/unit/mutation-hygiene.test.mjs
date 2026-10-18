import { describe, expect, it } from "vitest";
import { inlineEvidenceWrites } from "../../scripts/check-mutation-hygiene.mjs";

describe("mutation hygiene", () => {
  it("detects named aliases, namespaces, and multiline insert chains", () => {
    const text = `
      import { domainEvents as outbox } from "@/db/schema";
      await tx.insert(outbox).values({ eventType: "Changed" });
      await tx
        .insert(s.auditEvents)
        .values({ action: "change" });
      await db.insert(schema.notifications).values(rows);
    `;
    expect(inlineEvidenceWrites("example.ts", text).map(write => write.table))
      .toEqual(["domainEvents", "auditEvents", "notifications"]);
  });

  it("allows reads, delivery ledgers, updates, and shared helpers", () => {
    const text = `
      await tx.select().from(s.domainEvents);
      await tx.update(s.notifications).set({ status: "read" });
      await tx.insert(s.incidentNotifications).values(rows);
      await emitEvent(tx, event);
    `;
    expect(inlineEvidenceWrites("example.ts", text)).toEqual([]);
  });
});
