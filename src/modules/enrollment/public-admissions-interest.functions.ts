import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { and, asc, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { accessAccounts, accountPersonGrants, actions, people, programs, publicAdmissionsInterests } from "@/db/schema";
import { assertCapability, AuthorizationError } from "@/domain/command-context";
import { publicInterestContactHistory } from "@/domain/public-interest-contact-history";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { emitEvent, notify, writeAudit } from "@/platform/mutation";
import { completePublicInterestFollowUp, ensurePublicInterestFollowUp, publicInterestFollowUpType, publicInterestSubjectType } from "./public-interest-follow-up.server";

async function requireAdmissionsIntakeReader() {
  const actor = await getCommandContext(getRequest());
  if (actor.role !== "registrar" || !actor.actorPersonId ||
    !actor.scope.programIds?.length || !actor.scope.organizationIds?.length)
    throw new AuthorizationError("admissions intake registrar");
  assertCapability(actor, "enrollment.decide");
  return actor;
}

/**
 * Scoped inbox alongside GF22 admissions intake. An interest is never an
 * Application until staff verifies student/guardian identity and follows
 * the existing createAdmissionsInquiry command.
 */
export const listPublicAdmissionsInterests = createServerFn({ method: "GET" })
  .handler(async () => {
    setResponseHeader("Cache-Control", "private, no-store");
    const actor = await requireAdmissionsIntakeReader();
    const rows = await db.select({
      id: publicAdmissionsInterests.id,
      siteId: publicAdmissionsInterests.siteId,
      programId: publicAdmissionsInterests.programId,
      organizationId: programs.organizationId,
      followUpId: actions.id,
      followUpOwnerPersonId: actions.ownerPersonId,
      followUpDueAt: actions.dueAt,
      followUpStatus: actions.status,
      followUpEvidence: actions.evidence,
      programName: programs.name,
      firstName: publicAdmissionsInterests.contactFirstName,
      lastName: publicAdmissionsInterests.contactLastName,
      email: publicAdmissionsInterests.contactEmail,
      message: publicAdmissionsInterests.message,
      status: publicAdmissionsInterests.status,
      applicationId: publicAdmissionsInterests.applicationId,
      convertedAt: publicAdmissionsInterests.convertedAt,
      createdAt: publicAdmissionsInterests.createdAt,
      contactedAt: publicAdmissionsInterests.contactedAt,
    }).from(publicAdmissionsInterests)
      .innerJoin(programs, eq(programs.id, publicAdmissionsInterests.programId))
      .leftJoin(actions, and(eq(actions.type, publicInterestFollowUpType),
        eq(actions.subjectType, publicInterestSubjectType),
        eq(actions.subjectId, publicAdmissionsInterests.id),
        eq(actions.siteId, publicAdmissionsInterests.siteId),
        eq(actions.programId, publicAdmissionsInterests.programId)))
      .where(and(
        inArray(publicAdmissionsInterests.programId, actor.scope.programIds),
        inArray(programs.organizationId, actor.scope.organizationIds),
        inArray(publicAdmissionsInterests.siteId, actor.scope.siteIds ?? []),
        eq(publicAdmissionsInterests.siteId, programs.siteId),
      )).orderBy(
        sql`CASE WHEN ${publicAdmissionsInterests.status} IN ('closed', 'converted') OR ${actions.status} IN ('resolved', 'cancelled') THEN 2
                 WHEN ${actions.dueAt} < now() THEN 0 ELSE 1 END`,
        asc(actions.dueAt), desc(publicAdmissionsInterests.createdAt),
      ).limit(200);
    const authorIds = [...new Set(rows.flatMap(row =>
      publicInterestContactHistory(row.followUpEvidence ?? []).map(item => item.actorPersonId)))];
    const authors = authorIds.length ? await db.select({
      id: people.id, firstName: people.legalFirstName, lastName: people.legalLastName,
    }).from(people).where(inArray(people.id, authorIds)).limit(5000) : [];
    const contactActors = Object.fromEntries(authors.map(person =>
      [person.id, `${person.firstName} ${person.lastName}`]));
    return rows.map(({ followUpEvidence, ...row }) => ({
      ...row,
      contactHistory: publicInterestContactHistory(followUpEvidence ?? []),
      contactActors,
      createdAt: row.createdAt.toISOString(),
      contactedAt: row.contactedAt?.toISOString() ?? null,
      convertedAt: row.convertedAt?.toISOString() ?? null,
      followUpDueAt: row.followUpDueAt?.toISOString() ?? null,
    }));
  });

export const setPublicAdmissionsInterestStatus = createServerFn({ method: "POST" })
  .validator((v: unknown) => z.object({
    interestId: z.string().uuid(),
    status: z.enum(["contacted", "closed"]),
  }).strict().parse(v))
  .handler(async ({ data }) => {
    const actor = await requireAdmissionsIntakeReader();
    return db.transaction(async tx => {
      const [current] = await tx.select({
        id: publicAdmissionsInterests.id,
        status: publicAdmissionsInterests.status,
        siteId: publicAdmissionsInterests.siteId,
        programId: publicAdmissionsInterests.programId,
        organizationId: programs.organizationId,
        contactedAt: publicAdmissionsInterests.contactedAt,
      }).from(publicAdmissionsInterests)
        .innerJoin(programs, eq(programs.id, publicAdmissionsInterests.programId))
        .where(and(
          eq(publicAdmissionsInterests.id, data.interestId),
          eq(publicAdmissionsInterests.siteId, programs.siteId),
          inArray(publicAdmissionsInterests.programId, actor.scope.programIds ?? []),
          inArray(programs.organizationId, actor.scope.organizationIds ?? []),
          inArray(publicAdmissionsInterests.siteId, actor.scope.siteIds ?? []),
        )).for("update", { of: publicAdmissionsInterests }).limit(1);
      if (!current) throw new AuthorizationError("admissions interest scope");
      if (current.status === data.status) return { changed: false };
      if (current.status === "closed" || current.status === "converted")
        throw new Error("Closed or converted interest requests cannot be modified");
      const now = new Date();
      await tx.update(publicAdmissionsInterests).set({
        status: data.status,
        contactedAt: current.contactedAt ?? (data.status === "contacted" ? now : null),
        updatedAt: now,
      }).where(eq(publicAdmissionsInterests.id, current.id));
      if (data.status === "closed") await completePublicInterestFollowUp(tx, actor, {
        interestId: current.id, organizationId: current.organizationId,
        siteId: current.siteId, programId: current.programId,
        resolutionNote: "Information request closed by registrar",
      });
      await writeAudit(tx, actor, {
        action: "admissions.public_interest.status_change",
        entityType: "public_admissions_interest", entityId: current.id,
        scope: { organizationId: current.organizationId,
          siteId: current.siteId, programId: current.programId },
        before: { status: current.status },
        after: { status: data.status },
      });
      await emitEvent(tx, {
        eventType: "PublicAdmissionsInterestStatusChanged",
        aggregateType: "public_admissions_interest",
        aggregateId: current.id,
        actorPersonId: actor.actorPersonId,
        organizationId: current.organizationId,
        siteId: current.siteId, programId: current.programId,
        payload: { status: data.status },
      });
      return { changed: true };
    });
  });

/** Assignees are verified, active registrars in the same organization and
 * Site (or an organization-wide grant). Other staff roles are deliberately
 * excluded: Action ownership must not turn into family-data access. */
export const listPublicInterestFollowUpAssignees = createServerFn({ method: "GET" })
  .handler(async () => {
    setResponseHeader("Cache-Control", "private, no-store");
    const actor = await requireAdmissionsIntakeReader();
    return db.select({
      personId: accountPersonGrants.personId,
      organizationId: accountPersonGrants.organizationId,
      siteId: accountPersonGrants.siteId,
      firstName: people.legalFirstName, lastName: people.legalLastName,
    }).from(accountPersonGrants)
      .innerJoin(people, eq(people.id, accountPersonGrants.personId))
      .innerJoin(accessAccounts, eq(accessAccounts.id, accountPersonGrants.accountId))
      .where(and(
        eq(accountPersonGrants.role, "registrar"),
        eq(accountPersonGrants.active, true),
        eq(people.active, true),
        eq(accessAccounts.disabled, false),
        inArray(accountPersonGrants.organizationId, actor.scope.organizationIds ?? []),
        or(isNull(accountPersonGrants.siteId),
          inArray(accountPersonGrants.siteId, actor.scope.siteIds ?? [])),
      ));
  });

const followUpScope = (actor: Awaited<ReturnType<typeof requireAdmissionsIntakeReader>>, interestId: string) =>
  and(eq(publicAdmissionsInterests.id, interestId),
    eq(publicAdmissionsInterests.siteId, programs.siteId),
    inArray(publicAdmissionsInterests.siteId, actor.scope.siteIds ?? []),
    inArray(publicAdmissionsInterests.programId, actor.scope.programIds ?? []),
    inArray(programs.organizationId, actor.scope.organizationIds ?? []));

/** Reassignment is serialized by the interest row lock, also shared with
 * reviewed conversion and disposition changes. No GET request creates Actions. */
export const assignPublicInterestFollowUp = createServerFn({ method: "POST" })
  .validator((v: unknown) => z.object({
    interestId: z.string().uuid(),
    ownerPersonId: z.string().uuid().nullable(),
    dueAt: z.string().datetime({ offset: true }),
  }).strict().parse(v))
  .handler(async ({ data }) => {
    const actor = await requireAdmissionsIntakeReader();
    return db.transaction(async tx => {
      const [interest] = await tx.select({
        id: publicAdmissionsInterests.id,
        siteId: publicAdmissionsInterests.siteId,
        programId: publicAdmissionsInterests.programId,
        organizationId: programs.organizationId,
        status: publicAdmissionsInterests.status,
      }).from(publicAdmissionsInterests)
        .innerJoin(programs, eq(programs.id, publicAdmissionsInterests.programId))
        .where(followUpScope(actor, data.interestId))
        .for("update", { of: publicAdmissionsInterests }).limit(1);
      if (!interest || interest.status === "closed" || interest.status === "converted")
        throw new AuthorizationError("active public interest scope");
      if (data.ownerPersonId) {
        const [eligible] = await tx.select({ id: accountPersonGrants.id })
          .from(accountPersonGrants)
          .innerJoin(people, eq(people.id, accountPersonGrants.personId))
          .innerJoin(accessAccounts, eq(accessAccounts.id, accountPersonGrants.accountId))
          .where(and(
            eq(accountPersonGrants.personId, data.ownerPersonId),
            eq(accountPersonGrants.role, "registrar"),
            eq(accountPersonGrants.organizationId, interest.organizationId),
            or(eq(accountPersonGrants.siteId, interest.siteId), isNull(accountPersonGrants.siteId)),
            eq(accountPersonGrants.active, true), eq(people.active, true),
            eq(accessAccounts.disabled, false),
          )).limit(1);
        if (!eligible) throw new AuthorizationError("active admissions registrar assignee");
      }
      const followUp = await ensurePublicInterestFollowUp(tx, {
        interestId: interest.id, organizationId: interest.organizationId,
        siteId: interest.siteId, programId: interest.programId, actor,
      });
      if (followUp.status === "resolved" || followUp.status === "cancelled")
        throw new Error("Follow-up is already completed");
      const dueAt = new Date(data.dueAt);
      if (followUp.ownerPersonId === data.ownerPersonId &&
          followUp.dueAt?.getTime() === dueAt.getTime()) return { changed: false };
      await tx.update(actions).set({
        ownerPersonId: data.ownerPersonId, dueAt, updatedAt: new Date(),
      }).where(eq(actions.id, followUp.id));
      await writeAudit(tx, actor, {
        action: "admissions.public_interest.follow_up.assigned",
        entityType: "action", entityId: followUp.id,
        scope: { organizationId: interest.organizationId,
          siteId: interest.siteId, programId: interest.programId },
        before: { ownerPersonId: followUp.ownerPersonId,
          dueAt: followUp.dueAt?.toISOString() ?? null },
        after: { ownerPersonId: data.ownerPersonId, dueAt: dueAt.toISOString() },
      });
      await emitEvent(tx, {
        eventType: "PublicAdmissionsInterestFollowUpAssigned",
        aggregateType: "action", aggregateId: followUp.id,
        actorPersonId: actor.actorPersonId,
        organizationId: interest.organizationId,
        siteId: interest.siteId, programId: interest.programId,
        payload: { ownerPersonId: data.ownerPersonId, dueAt: dueAt.toISOString() },
      });
      if (data.ownerPersonId && data.ownerPersonId !== followUp.ownerPersonId)
        await notify(tx, {
          recipientPersonId: data.ownerPersonId,
          type: "public_interest_follow_up_assigned",
          title: "School inquiry follow-up assigned",
          body: "Open the authorized admissions intake workspace to review.",
          resourceType: "action", resourceId: followUp.id,
        });
      return { changed: true };
    });
  });

export const resolvePublicInterestFollowUp = createServerFn({ method: "POST" })
  .validator((v: unknown) => z.object({
    interestId: z.string().uuid(),
    resolutionNote: z.string().trim().min(5).max(500),
  }).strict().parse(v))
  .handler(async ({ data }) => {
    const actor = await requireAdmissionsIntakeReader();
    return db.transaction(async tx => {
      const [interest] = await tx.select({
        id: publicAdmissionsInterests.id,
        siteId: publicAdmissionsInterests.siteId,
        programId: publicAdmissionsInterests.programId,
        organizationId: programs.organizationId,
        status: publicAdmissionsInterests.status,
      }).from(publicAdmissionsInterests)
        .innerJoin(programs, eq(programs.id, publicAdmissionsInterests.programId))
        .where(followUpScope(actor, data.interestId))
        .for("update", { of: publicAdmissionsInterests }).limit(1);
      if (!interest) throw new AuthorizationError("public interest scope");
      // A legacy interest can still be completed without a separate backfill.
      if (interest.status !== "closed" && interest.status !== "converted")
        await ensurePublicInterestFollowUp(tx, {
          interestId: interest.id, organizationId: interest.organizationId,
          siteId: interest.siteId, programId: interest.programId, actor,
        });
      const changed = await completePublicInterestFollowUp(tx, actor, {
        interestId: interest.id, organizationId: interest.organizationId,
        siteId: interest.siteId, programId: interest.programId,
        resolutionNote: data.resolutionNote,
      });
      return { changed };
    });
  });
