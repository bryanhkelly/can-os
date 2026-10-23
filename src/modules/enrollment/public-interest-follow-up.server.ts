import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { actions } from "@/db/schema";
import { type CommandContext } from "@/domain/command-context";
import { emitEvent, writeAudit } from "@/platform/mutation";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Public contact is NOT a verified guardian, Application or student identity. */
export const publicInterestFollowUpType = "public_interest_follow_up" as const;
export const publicInterestSubjectType = "public_admissions_interest" as const;
const followUpTitle = "Follow up on public school information request";

/** Called only in the transaction that creates a new interest, or under a
 * FOR UPDATE lock on an existing interest by an authorized registrar. */
export async function ensurePublicInterestFollowUp(tx: Tx, input: {
  interestId: string; organizationId: string; siteId: string; programId: string;
  actor?: CommandContext;
}) {
  const [existing] = await tx.select().from(actions).where(and(
    eq(actions.type, publicInterestFollowUpType),
    eq(actions.subjectType, publicInterestSubjectType),
    eq(actions.subjectId, input.interestId),
  )).limit(1);
  if (existing) {
    if (existing.organizationId !== input.organizationId ||
        existing.siteId !== input.siteId || existing.programId !== input.programId)
      throw new Error("Inconsistent inquiry follow-up scope");
    return existing;
  }

  const [created] = await tx.insert(actions).values({
    type: publicInterestFollowUpType, subjectType: publicInterestSubjectType,
    subjectId: input.interestId, organizationId: input.organizationId,
    siteId: input.siteId, programId: input.programId,
    title: followUpTitle,
    description: "Contact the adult requester using the restricted admissions inbox.",
    dueAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
    status: "open", priority: "normal",
  }).returning();
  if (!created) throw new Error("Could not create inquiry follow-up");
  await writeAudit(tx, {
    action: "admissions.public_interest.follow_up.created",
    resourceType: "action", resourceId: created.id,
    actorPersonId: input.actor?.actorPersonId ?? null,
    scope: { organizationId: input.organizationId, siteId: input.siteId,
      programId: input.programId },
    after: { type: publicInterestFollowUpType, subjectId: input.interestId,
      dueAt: created.dueAt?.toISOString() ?? null },
    context: input.actor ? { source: "registrar_intake" } : { anonymous: true },
  });
  await emitEvent(tx, {
    eventType: "PublicAdmissionsInterestFollowUpCreated",
    aggregateType: "action", aggregateId: created.id,
    actorPersonId: input.actor?.actorPersonId ?? null,
    organizationId: input.organizationId, siteId: input.siteId,
    programId: input.programId,
    payload: { subjectType: publicInterestSubjectType, subjectId: input.interestId },
  });
  return created;
}

/** Domain-owned closure, used by explicit registrar resolution, closing an
 * interest and the existing reviewed GF22 conversion transaction. */
export async function completePublicInterestFollowUp(tx: Tx, actor: CommandContext, input: {
  interestId: string; organizationId: string; siteId: string;
  programId: string; resolutionNote: string;
}) {
  const [followUp] = await tx.select().from(actions).where(and(
    eq(actions.type, publicInterestFollowUpType),
    eq(actions.subjectType, publicInterestSubjectType),
    eq(actions.subjectId, input.interestId),
  )).for("update").limit(1);
  if (!followUp) return false; // Existing interests created before PUB-09.
  if (followUp.organizationId !== input.organizationId ||
      followUp.siteId !== input.siteId || followUp.programId !== input.programId)
    throw new Error("Inconsistent inquiry follow-up scope");
  if (followUp.status === "resolved" || followUp.status === "cancelled") return false;
  const now = new Date();
  await tx.update(actions).set({
    status: "resolved", resolutionNote: input.resolutionNote,
    resolvedAt: now, updatedAt: now,
  }).where(eq(actions.id, followUp.id));
  await writeAudit(tx, actor, {
    action: "admissions.public_interest.follow_up.resolved",
    entityType: "action", entityId: followUp.id,
    scope: { organizationId: input.organizationId, siteId: input.siteId,
      programId: input.programId },
    before: { status: followUp.status },
    after: { status: "resolved", resolutionNote: input.resolutionNote },
  });
  await emitEvent(tx, {
    eventType: "PublicAdmissionsInterestFollowUpResolved",
    aggregateType: "action", aggregateId: followUp.id,
    actorPersonId: actor.actorPersonId,
    organizationId: input.organizationId, siteId: input.siteId,
    programId: input.programId,
    payload: { subjectType: publicInterestSubjectType, subjectId: input.interestId },
  });
  return true;
}
