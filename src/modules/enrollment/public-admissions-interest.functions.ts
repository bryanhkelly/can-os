import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { programs, publicAdmissionsInterests } from "@/db/schema";
import { assertCapability, AuthorizationError } from "@/domain/command-context";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { emitEvent, writeAudit } from "@/platform/mutation";

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
      programName: programs.name,
      firstName: publicAdmissionsInterests.contactFirstName,
      lastName: publicAdmissionsInterests.contactLastName,
      email: publicAdmissionsInterests.contactEmail,
      message: publicAdmissionsInterests.message,
      status: publicAdmissionsInterests.status,
      createdAt: publicAdmissionsInterests.createdAt,
      contactedAt: publicAdmissionsInterests.contactedAt,
    }).from(publicAdmissionsInterests)
      .innerJoin(programs, eq(programs.id, publicAdmissionsInterests.programId))
      .where(and(
        inArray(publicAdmissionsInterests.programId, actor.scope.programIds),
        inArray(programs.organizationId, actor.scope.organizationIds),
        inArray(publicAdmissionsInterests.siteId, actor.scope.siteIds ?? []),
        eq(publicAdmissionsInterests.siteId, programs.siteId),
      )).orderBy(desc(publicAdmissionsInterests.createdAt)).limit(200);
    return rows.map(row => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
      contactedAt: row.contactedAt?.toISOString() ?? null,
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
      if (current.status === "closed")
        throw new Error("Closed interest requests cannot be modified");
      const now = new Date();
      await tx.update(publicAdmissionsInterests).set({
        status: data.status,
        contactedAt: current.contactedAt ?? (data.status === "contacted" ? now : null),
        updatedAt: now,
      }).where(eq(publicAdmissionsInterests.id, current.id));
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
