import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { actions, programs, publicAdmissionsInterests } from "@/db/schema";
import { assertCapability, AuthorizationError } from "@/domain/command-context";
import {
  appendPublicInterestContact, publicInterestContactOutcomes,
  publicInterestOutcomeCloses, publicInterestOutcomeIsReached,
} from "@/domain/public-interest-contact-history";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { emitEvent, writeAudit } from "@/platform/mutation";
import {
  completePublicInterestFollowUp, ensurePublicInterestFollowUp,
  publicInterestFollowUpType, publicInterestSubjectType,
} from "./public-interest-follow-up.server";

/** This is an internal staff contact log, not an outbound message sender.
 * We do not create a family identity, Application or CommunicationThread. */
export const recordPublicInterestContact = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({
    requestId: z.string().uuid(),
    interestId: z.string().uuid(),
    outcome: z.enum(publicInterestContactOutcomes),
    note: z.string().trim().max(500).default(""),
    nextFollowUpAt: z.string().datetime({ offset: true }).nullable().default(null),
  }).strict().parse(value))
  .handler(async ({ data }) => {
    const actor = await getCommandContext(getRequest());
    if (actor.role !== "registrar" || !actor.actorPersonId ||
        !actor.scope.siteIds?.length || !actor.scope.organizationIds?.length ||
        !actor.scope.programIds?.length)
      throw new AuthorizationError("admissions registrar");
    assertCapability(actor, "enrollment.decide");
    const actorPersonId = actor.actorPersonId;

    return db.transaction(async tx => {
      // This lock also serializes assignment, close and reviewed conversion.
      const [interest] = await tx.select({
        id: publicAdmissionsInterests.id,
        siteId: publicAdmissionsInterests.siteId,
        programId: publicAdmissionsInterests.programId,
        organizationId: programs.organizationId,
        status: publicAdmissionsInterests.status,
        contactedAt: publicAdmissionsInterests.contactedAt,
      }).from(publicAdmissionsInterests)
        .innerJoin(programs, eq(programs.id, publicAdmissionsInterests.programId))
        .where(and(
          eq(publicAdmissionsInterests.id, data.interestId),
          eq(publicAdmissionsInterests.siteId, programs.siteId),
          inArray(publicAdmissionsInterests.siteId, actor.scope.siteIds ?? []),
          inArray(publicAdmissionsInterests.programId, actor.scope.programIds ?? []),
          inArray(programs.organizationId, actor.scope.organizationIds ?? []),
        )).for("update", { of: publicAdmissionsInterests }).limit(1);
      if (!interest) throw new AuthorizationError("public interest contact scope");

      // A retry is permitted after 'not interested' closes the interest:
      // it must not create a second contact event or reopen the interest.
      let [followUp] = await tx.select().from(actions).where(and(
        eq(actions.type, publicInterestFollowUpType),
        eq(actions.subjectType, publicInterestSubjectType),
        eq(actions.subjectId, interest.id),
        eq(actions.organizationId, interest.organizationId),
        eq(actions.siteId, interest.siteId),
        eq(actions.programId, interest.programId),
      )).for("update").limit(1);
      if (!followUp && interest.status !== "closed" && interest.status !== "converted")
        followUp = await ensurePublicInterestFollowUp(tx, {
          interestId: interest.id, siteId: interest.siteId,
          programId: interest.programId, organizationId: interest.organizationId,
          actor,
        });
      if (!followUp) throw new AuthorizationError("active inquiry follow-up");
      const now = new Date();
      const nextFollowUpAt = data.nextFollowUpAt ? new Date(data.nextFollowUpAt) : null;
      const appended = appendPublicInterestContact(followUp.evidence, {
        kind: "public_interest_contact", requestId: data.requestId,
        outcome: data.outcome, actorPersonId,
        recordedAt: now.toISOString(), note: data.note,
        nextFollowUpAt: nextFollowUpAt?.toISOString() ?? null,
      });
      if (!appended.changed) return { changed: false as const };
      if (interest.status === "closed" || interest.status === "converted" ||
          followUp.status === "resolved" || followUp.status === "cancelled")
        throw new Error("Closed or converted interest cannot record new contact");

      if (!publicInterestOutcomeCloses(data.outcome) &&
          (!nextFollowUpAt || nextFollowUpAt.getTime() <= now.getTime() ||
            nextFollowUpAt.getTime() > now.getTime() + 180 * 24 * 60 * 60 * 1000))
        throw new Error("Schedule the next follow-up within the next 180 days");

      await tx.update(actions).set({
        evidence: appended.evidence,
        ...(nextFollowUpAt ? { dueAt: nextFollowUpAt } : {}),
        updatedAt: now,
      }).where(eq(actions.id, followUp.id));

      // Status is only a high-level summary; evidence contains every contact
      // attempt, including failures and no-response outcomes.
      const desiredStatus = publicInterestOutcomeCloses(data.outcome)
        ? "closed"
        : publicInterestOutcomeIsReached(data.outcome) ? "contacted" : interest.status;
      if (desiredStatus !== interest.status) {
        await tx.update(publicAdmissionsInterests).set({
          status: desiredStatus,
          contactedAt: publicInterestOutcomeIsReached(data.outcome)
            ? interest.contactedAt ?? now : interest.contactedAt,
          updatedAt: now,
        }).where(eq(publicAdmissionsInterests.id, interest.id));
        await writeAudit(tx, actor, {
          action: "admissions.public_interest.status_change",
          entityType: "public_admissions_interest", entityId: interest.id,
          scope: { organizationId: interest.organizationId,
            siteId: interest.siteId, programId: interest.programId },
          before: { status: interest.status },
          after: { status: desiredStatus, source: "record_contact" },
        });
        await emitEvent(tx, {
          eventType: "PublicAdmissionsInterestStatusChanged",
          aggregateType: "public_admissions_interest",
          aggregateId: interest.id, actorPersonId: actor.actorPersonId,
          organizationId: interest.organizationId, siteId: interest.siteId,
          programId: interest.programId, payload: { status: desiredStatus },
        });
      }
      await writeAudit(tx, actor, {
        action: "admissions.public_interest.contact_recorded",
        entityType: "action", entityId: followUp.id,
        scope: { organizationId: interest.organizationId,
          siteId: interest.siteId, programId: interest.programId },
        after: { outcome: data.outcome, hasNote: !!data.note,
          recordedAt: now.toISOString(),
          nextFollowUpAt: nextFollowUpAt?.toISOString() ?? null },
      });
      await emitEvent(tx, {
        eventType: "PublicAdmissionsInterestContactRecorded",
        aggregateType: "action", aggregateId: followUp.id,
        actorPersonId: actor.actorPersonId,
        organizationId: interest.organizationId, siteId: interest.siteId,
        programId: interest.programId,
        payload: { outcome: data.outcome,
          nextFollowUpAt: nextFollowUpAt?.toISOString() ?? null },
      });
      if (publicInterestOutcomeCloses(data.outcome))
        await completePublicInterestFollowUp(tx, actor, {
          interestId: interest.id, organizationId: interest.organizationId,
          siteId: interest.siteId, programId: interest.programId,
          resolutionNote: "Adult contact reported no interest in program",
        });
      return { changed: true as const };
    });
  });
