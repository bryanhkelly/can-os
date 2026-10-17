import { and, arrayContains, eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  subscriptions, guardianRelationships, studentProfiles, notifications,
  conversationMessages, auditEvents,
} from "@/db/schema";
import { getStudentAcademicSummary } from "@/platform/agent/tools";

/**
 * Weekly digest subscriptions are standing instructions using the same watch
 * lifecycle, but their trigger is local calendar time rather than a domain event.
 * The scheduler makes the last-run transition and notification atomically.
 */
export async function processWeeklyDigests(now = new Date(), limit = 50): Promise<number> {
  let sent = 0;
  let offset = 0;
  for (;;) {
    const rows = await db.select().from(subscriptions)
      .where(and(eq(subscriptions.status, "active"),
        arrayContains(subscriptions.eventTypes, ["WeeklyStudentDigest"])))
      .orderBy(subscriptions.id)
      .limit(limit).offset(offset);
    if (!rows.length) break;
    offset += rows.length;
    for (const row of rows) {
      try {
    const f = row.filter;
    if (f.kind !== "weekly_digest") continue;
    const tz = typeof f.timezone === "string" ? f.timezone : "UTC";
    let local: Date;
    try { local = new Date(now.toLocaleString("en-US", { timeZone: tz })); }
    catch { continue; }
    const weekday = typeof f.weekday === "number" ? f.weekday : 5;
    const hour = typeof f.hour === "number" ? f.hour : 19;
    if (local.getDay() !== weekday || local.getHours() < hour) continue;
    const localDate = [local.getFullYear(), String(local.getMonth() + 1).padStart(2, "0"),
      String(local.getDate()).padStart(2, "0")].join("-");
    if (f.lastRunDate === localDate) continue;

    // The relationship must still authorize the student on this execution day.
    const [student] = await db.select({ personId: studentProfiles.personId })
      .from(studentProfiles).where(eq(studentProfiles.id, row.subjectId)).limit(1);
    if (!student) continue;
    const [guardian] = await db.select({ id: guardianRelationships.id })
      .from(guardianRelationships).where(and(
        eq(guardianRelationships.studentPersonId, student.personId),
        eq(guardianRelationships.guardianPersonId, row.subscriberPersonId),
        eq(guardianRelationships.canViewAcademics, true),
      )).limit(1);
    if (!guardian) continue;

    const result = await getStudentAcademicSummary.execute({
      actorPersonId: row.subscriberPersonId,
      capabilities: new Set(["student:related-read"]),
      scope: {},
    }, { studentProfileId: row.subjectId });

    await db.transaction(async tx => {
      // Multiple scheduled workers cannot deliver the same weekly digest.
      const [current] = await tx.select().from(subscriptions)
        .where(eq(subscriptions.id, row.id)).limit(1).for("update");
      if (!current || current.status !== "active" || current.filter.lastRunDate === localDate) return;
      const [permission] = await tx.select({ id: guardianRelationships.id })
        .from(guardianRelationships).where(and(
          eq(guardianRelationships.studentPersonId, student.personId),
          eq(guardianRelationships.guardianPersonId, current.subscriberPersonId),
          eq(guardianRelationships.canViewAcademics, true),
        )).limit(1);
      if (!permission) return;
      const title = "Your weekly CAN academic digest";
      await tx.insert(notifications).values({
        recipientPersonId: current.subscriberPersonId,
        type: "watch_digest",
        title, body: result.summary,
        status: "unread",
        resourceType: "student_profile",
        resourceId: current.subjectId,
      });
      if (current.sourceConversationId) {
        await tx.insert(conversationMessages).values({
          conversationId: current.sourceConversationId, role: "agent",
          body: title + "\n\n" + result.summary, evidenceRefs: result.evidence,
        });
      }
      await tx.update(subscriptions).set({
        filter: { ...current.filter, lastRunDate: localDate }, updatedAt: now,
      }).where(eq(subscriptions.id, current.id));
      await tx.insert(auditEvents).values({
        actorPersonId: current.subscriberPersonId,
        action: "agent.weekly_digest.delivered",
        resourceType: "subscription",
        resourceId: current.id,
        after: { localDate },
      });
      sent++;
    });
      } catch (error) {
        // One invalid subscription must not block every school's digests.
        console.error("weekly-digest evaluation failed", row.id, error instanceof Error ? error.message : "unknown");
      }
    }
  }
  return sent;
}
