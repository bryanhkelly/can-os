import { and, desc, eq, gt, isNull, lte, or } from "drizzle-orm";
import { db, type Database } from "@/db/client";
import { lockAttendanceConfigurationAtSite } from "@/domain/attendance-configuration-lock";
import {
  deliveryArrangements,
  instructionalCapacityOfferings,
  instructionalCapacityReservations,
  people,
  programs,
  sectionCapacityDemands,
  sections,
  sectionTeachers,
} from "@/db/schema";
import {
  assertCapability,
  assertProgramScope,
  assertSectionScope,
  assertSiteScope,
  type CommandContext,
} from "@/domain/command-context";
import { EventTypes } from "@/domain/event-types";
import { emitEvent, writeAudit } from "@/platform/mutation";
import { isCurrentCapacityReservation } from "./reservation-policy";

export async function createDeliveryArrangement(
  context: CommandContext,
  input: {
    sectionId: string;
    academicProviderOrganizationId: string;
    capacityReservationId?: string | null;
    instructorPersonId?: string | null;
    facilitatorPersonId?: string | null;
    modality: "onsite" | "live_online" | "asynchronous" | "hybrid";
    status?: "proposed" | "reserved" | "ready" | "active";
    effectiveFrom?: Date | null;
    effectiveThrough?: Date | null;
  },
): Promise<string> {
  assertCapability(context, "capacity.reserve");

  return db.transaction(async tx => {
    const [section] = await tx
      .select({
        id: sections.id, programId: sections.programId, siteId: sections.siteId,
        providerId: programs.academicProviderOrganizationId,
      })
      .from(sections)
      .innerJoin(programs, eq(programs.id, sections.programId))
      .where(eq(sections.id, input.sectionId))
      .limit(1);
    if (!section) throw new Error("Section not found");

    assertSectionScope(context, section.id);
    assertProgramScope(context, section.programId);
    assertSiteScope(context, section.siteId);
    if (!section.siteId) throw new Error("Teaching assignment requires a school site");
    if (input.academicProviderOrganizationId !== section.providerId) {
      throw new Error("Delivery arrangement provider must match the Program's current academic provider");
    }
    await lockAttendanceConfigurationAtSite(tx, section.siteId);

    let instructorPersonId = input.instructorPersonId ?? null;

    if (input.capacityReservationId) {
      const [reservation] = await tx
        .select({
          id: instructionalCapacityReservations.id,
          sectionId: instructionalCapacityReservations.sectionId,
          status: instructionalCapacityReservations.status,
          expiresAt: instructionalCapacityReservations.expiresAt,
          personId: instructionalCapacityOfferings.personId,
        })
        .from(instructionalCapacityReservations)
        .innerJoin(
          instructionalCapacityOfferings,
          eq(instructionalCapacityOfferings.id, instructionalCapacityReservations.offeringId),
        )
        .where(eq(instructionalCapacityReservations.id, input.capacityReservationId))
        .limit(1).for("update");

      if (!reservation || reservation.sectionId !== input.sectionId) {
        throw new Error("Capacity reservation does not belong to section");
      }
      if (!isCurrentCapacityReservation(reservation, new Date())) {
        throw new Error("Capacity reservation is inactive or expired");
      }
      if (instructorPersonId && instructorPersonId !== reservation.personId) {
        throw new Error("Delivery instructor must match reserved instructional capacity");
      }
      instructorPersonId = reservation.personId;
    }

    if (!instructorPersonId && input.modality !== "asynchronous") {
      throw new Error("Instructor is required for synchronous delivery");
    }

    const status = input.status ?? (input.capacityReservationId ? "reserved" : "proposed");
    const [arrangement] = await tx
      .insert(deliveryArrangements)
      .values({
        sectionId: input.sectionId,
        academicProviderOrganizationId: input.academicProviderOrganizationId,
        instructorPersonId,
        facilitatorPersonId: input.facilitatorPersonId ?? null,
        modality: input.modality,
        capacityReservationId: input.capacityReservationId ?? null,
        status,
        effectiveFrom: input.effectiveFrom ?? null,
        effectiveThrough: input.effectiveThrough ?? null,
      })
      .returning({ id: deliveryArrangements.id });

    if (!arrangement) throw new Error("Unable to create delivery arrangement");

    if (instructorPersonId && ["ready", "active"].includes(status)) {
      await tx.insert(sectionTeachers).values({
        sectionId: input.sectionId,
        personId: instructorPersonId,
        role: "teacher",
      }).onConflictDoNothing({
        target: [sectionTeachers.sectionId, sectionTeachers.personId],
      });
    }

    await emitEvent(tx, {
      eventType: EventTypes.DeliveryArrangementCreated,
      aggregateType: "delivery_arrangement",
      aggregateId: arrangement.id,
      actorPersonId: context.actorPersonId,
      siteId: section.siteId,
      programId: section.programId,
      sectionId: section.id,
      payload: {
        academicProviderOrganizationId: input.academicProviderOrganizationId,
        instructorPersonId,
        facilitatorPersonId: input.facilitatorPersonId ?? null,
        modality: input.modality,
        status,
        capacityReservationId: input.capacityReservationId ?? null,
      },
    });
    await writeAudit(tx, context, {
      action: "delivery.arrangement.created",
      entityType: "delivery_arrangement",
      entityId: arrangement.id,
      scope: { programId: section.programId, siteId: section.siteId },
      after: {
        sectionId: input.sectionId,
        academicProviderOrganizationId: input.academicProviderOrganizationId,
        instructorPersonId,
        modality: input.modality,
        status,
        capacityReservationId: input.capacityReservationId ?? null,
      },
    });

    return arrangement.id;
  });
}

export async function activateDeliveryArrangement(
  context: CommandContext,
  arrangementId: string,
): Promise<void> {
  assertCapability(context, "capacity.reserve");

  await db.transaction(async tx => {
    const [lookup] = await tx
      .select({ sectionId: deliveryArrangements.sectionId })
      .from(deliveryArrangements)
      .where(eq(deliveryArrangements.id, arrangementId))
      .limit(1);
    if (!lookup) throw new Error("Delivery arrangement not found");

    const [section] = await tx
      .select({
        programId: sections.programId, siteId: sections.siteId,
        providerId: programs.academicProviderOrganizationId,
      })
      .from(sections)
      .innerJoin(programs, eq(programs.id, sections.programId))
      .where(eq(sections.id, lookup.sectionId))
      .limit(1);
    if (!section) throw new Error("Section not found");

    assertSectionScope(context, lookup.sectionId);
    assertProgramScope(context, section.programId);
    assertSiteScope(context, section.siteId);
    if (!section.siteId) throw new Error("Teaching assignment requires a school site");
    await lockAttendanceConfigurationAtSite(tx, section.siteId);

    // Read transition state only after the site lock, then lock the exact arrangement.
    const [arrangement] = await tx
      .select({
        id: deliveryArrangements.id,
        sectionId: deliveryArrangements.sectionId,
        academicProviderOrganizationId: deliveryArrangements.academicProviderOrganizationId,
        instructorPersonId: deliveryArrangements.instructorPersonId,
        capacityReservationId: deliveryArrangements.capacityReservationId,
        status: deliveryArrangements.status,
      })
      .from(deliveryArrangements)
      .where(and(eq(deliveryArrangements.id, arrangementId), eq(deliveryArrangements.sectionId, lookup.sectionId)))
      .limit(1).for("update");
    if (!arrangement) throw new Error("Delivery arrangement not found");
    if (arrangement.status === "completed") throw new Error("Completed delivery arrangements cannot be activated");
    if (arrangement.academicProviderOrganizationId !== section.providerId) {
      throw new Error("Delivery arrangement provider no longer matches the Program's current academic provider");
    }

    if (arrangement.capacityReservationId) {
      const [reservation] = await tx
        .select({
          status: instructionalCapacityReservations.status,
          expiresAt: instructionalCapacityReservations.expiresAt,
        })
        .from(instructionalCapacityReservations)
        .where(eq(instructionalCapacityReservations.id, arrangement.capacityReservationId))
        .limit(1).for("update");
      if (!reservation || !isCurrentCapacityReservation(reservation, new Date())) {
        throw new Error("Delivery capacity is no longer reserved or has expired");
      }
      if (arrangement.status === "active") return;
      await tx.update(instructionalCapacityReservations)
        .set({ status: "committed", updatedAt: new Date() })
        .where(eq(instructionalCapacityReservations.id, arrangement.capacityReservationId));
    }
    if (arrangement.status === "active") return;

    if (arrangement.instructorPersonId) {
      await tx.insert(sectionTeachers).values({
        sectionId: arrangement.sectionId,
        personId: arrangement.instructorPersonId,
        role: "teacher",
      }).onConflictDoNothing({
        target: [sectionTeachers.sectionId, sectionTeachers.personId],
      });
    }

    await tx.update(deliveryArrangements)
      .set({ status: "active", updatedAt: new Date() })
      .where(eq(deliveryArrangements.id, arrangement.id));

    await emitEvent(tx, {
      eventType: EventTypes.DeliveryArrangementActivated,
      aggregateType: "delivery_arrangement",
      aggregateId: arrangement.id,
      actorPersonId: context.actorPersonId,
      siteId: section.siteId,
      programId: section.programId,
      sectionId: arrangement.sectionId,
      payload: {
        instructorPersonId: arrangement.instructorPersonId,
        capacityReservationId: arrangement.capacityReservationId,
      },
    });
    await writeAudit(tx, context, {
      action: "delivery.arrangement.activated",
      entityType: "delivery_arrangement",
      entityId: arrangement.id,
      scope: { programId: section.programId, siteId: section.siteId },
      before: { status: arrangement.status },
      after: { status: "active" },
    });
  });
}

export async function getActiveDeliveryArrangement(
  sectionId: string,
  executor: Pick<Database, "select"> = db,
  at = new Date(),
) {
  if (!Number.isFinite(at.getTime())) throw new Error("Delivery evaluation time must be valid");
  const [row] = await executor
    .select({
      id: deliveryArrangements.id,
      sectionId: deliveryArrangements.sectionId,
      academicProviderOrganizationId: deliveryArrangements.academicProviderOrganizationId,
      instructorPersonId: deliveryArrangements.instructorPersonId,
      facilitatorPersonId: deliveryArrangements.facilitatorPersonId,
      modality: deliveryArrangements.modality,
      capacityReservationId: deliveryArrangements.capacityReservationId,
      status: deliveryArrangements.status,
      effectiveFrom: deliveryArrangements.effectiveFrom,
      effectiveThrough: deliveryArrangements.effectiveThrough,
    })
    .from(deliveryArrangements)
    .innerJoin(sections, eq(sections.id, deliveryArrangements.sectionId))
    .innerJoin(programs, eq(programs.id, sections.programId))
    .where(and(
      eq(deliveryArrangements.sectionId, sectionId),
      eq(deliveryArrangements.status, "active"),
      eq(deliveryArrangements.academicProviderOrganizationId, programs.academicProviderOrganizationId),
      or(isNull(deliveryArrangements.effectiveFrom), lte(deliveryArrangements.effectiveFrom, at)),
      or(isNull(deliveryArrangements.effectiveThrough), gt(deliveryArrangements.effectiveThrough, at)),
    ))
    .orderBy(desc(deliveryArrangements.updatedAt), desc(deliveryArrangements.id))
    .limit(1);
  return row ?? null;
}
