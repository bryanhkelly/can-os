import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { and, eq, lt } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { admissionOffers } from "@/db/schema";
import { assertCapability, AuthorizationError } from "@/domain/command-context";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { expireAdmissionOffersCommand } from "@/modules/enrollment/admissions-offer-service";

/**
 * Reconcile elapsed offers on demand using the canonical pool-locked service.
 * A signed-in registrar must have an active verified program grant. This
 * operation does not change application or enrollment status directly.
 */
export const reconcileExpiredAdmissionOffers = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({ programId: z.string().uuid() }).parse(value))
  .handler(async ({ data }) => {
    const actor = await getCommandContext(getRequest());
    if (actor.role !== "registrar" || !actor.actorPersonId ||
        !actor.scope.programIds?.includes(data.programId))
      throw new AuthorizationError("registrar offer reconciliation scope");
    assertCapability(actor, "enrollment.decide");

    const overdue = await db.select({ schoolYearId: admissionOffers.schoolYearId })
      .from(admissionOffers).where(and(
        eq(admissionOffers.programId, data.programId),
        eq(admissionOffers.status, "issued"),
        lt(admissionOffers.expiresAt, new Date()),
      ));
    let expired = 0;
    for (const schoolYearId of new Set(overdue.map(row => row.schoolYearId))) {
      expired += await expireAdmissionOffersCommand(actor, {
        programId: data.programId, schoolYearId,
      });
    }
    return { expired };
  });
