import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { agentRuns, auditEvents, conversations, people, subscriptions } from "@/db/schema";
import { confirmRun } from "@/platform/agent/runtime";
import { setWatchStatus, type AgentContext } from "@/platform/agent/tools";

describe("approved agent mutations", () => {
  it("commits the watch with the approval and rolls back a failed enclosing transaction", async () => {
    const [person] = await db.insert(people).values({
      legalFirstName: "Agent", legalLastName: crypto.randomUUID(),
    }).returning();
    if (!person) throw new Error("Fixture person missing");
    const context: AgentContext = { actorPersonId: person.id, capabilities: new Set(), scope: {} };
    const [conversation] = await db.insert(conversations).values({ personId: person.id }).returning();
    const [watch] = await db.insert(subscriptions).values({
      subscriberPersonId: person.id, subjectType: "student_profile",
      subjectId: crypto.randomUUID(), eventTypes: ["AssignmentBecameMissing"],
    }).returning();
    if (!watch || !conversation) throw new Error("Fixture watch missing");

    await expect(db.transaction(async tx => {
      await setWatchStatus.execute(context, { subscriptionId: watch.id, status: "paused" }, tx);
      throw new Error("Later approval write failed");
    })).rejects.toThrow("Later approval write failed");
    const [unchanged] = await db.select().from(subscriptions).where(eq(subscriptions.id, watch.id));
    expect(unchanged?.status).toBe("active");

    const [run] = await db.insert(agentRuns).values({
      conversationId: conversation.id, personId: person.id, intent: "manage",
      status: "awaiting_approval",
      result: { tool: setWatchStatus.name, args: { subscriptionId: watch.id, status: "paused" } },
    }).returning();
    if (!run) throw new Error("Fixture approval missing");
    expect((await confirmRun(context, { runId: run.id, approve: true })).runStatus).toBe("completed");
    const [updated] = await db.select().from(subscriptions).where(eq(subscriptions.id, watch.id));
    expect(updated?.status).toBe("paused");
    expect(await db.select().from(auditEvents).where(and(
      eq(auditEvents.resourceId, run.id), eq(auditEvents.action, "agent.run.approve"),
    ))).toHaveLength(1);
    await expect(confirmRun(context, { runId: run.id, approve: true })).rejects.toThrow("not awaiting approval");
  });
});
