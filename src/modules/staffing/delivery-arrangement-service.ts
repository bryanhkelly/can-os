import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
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
      .select({ id: sections.id, programId: sections.programId, siteId: sections.siteId })
      .from(sections)
      .where(eq(sections.id, input.sectionId))
      .limit(1);
    if (!section) throw new Error("Section not found");

    assertSectionScope(context, section.id);
    assertProgramScope(context, section.programId);
    assertSiteScope(context, section.siteId);
    if (!section.siteId) throw new Error("Teaching assignment requires a school site");
    await lockAttendanceConfigurationAtSite(tx, section.siteId);

    let instructorPersonId = input.instructorPersonId ?? null;

    if (input.capacityReservationId) {
      const [reservation] = await tx
        .select({
          id: instructionalCapacityReservations.id,
          sectionId: instructionalCapacityReservations.sectionId,
          status: instructionalCapacityReservations.status,
          personId: instructionalCapacityOfferings.personId,
        })
        .from(instructionalCapacityReservations)
        .innerJoin(
          instructionalCapacityOfferings,
          eq(instructionalCapacityOfferings.id, instructionalCapacityReservations.offeringId),
        )
        .where(eq(instructionalCapacityReservations.id, input.capacityReservationId))
        .limit(1);

      if (!reservation || reservation.sectionId !== input.sectionId) {
        throw new Error("Capacity reservation does not belong to section");
      }
      if (!["held", "committed"].includes(reservation.status)) {
        throw new Error("Capacity reservation is not active");
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
    const [arrangement] = await tx
      .select({
        id: deliveryArrangements.id,
        sectionId: deliveryArrangements.sectionId,
        instructorPersonId: deliveryArrangements.instructorPersonId,
        capacityReservationId: deliveryArrangements.capacityReservationId,
        status: deliveryArrangements.status,
      })
      .from(deliveryArrangements)
      .where(eq(deliveryArrangements.id, arrangementId))
      .limit(1);
    if (!arrangement) throw new Error("Delivery arrangement not found");

    const [section] = await tx
      .select({ programId: sections.programId, siteId: sections.siteId })
      .from(sections)
      .where(eq(sections.id, arrangement.sectionId))
      .limit(1);
    if (!section) throw new Error("Section not found");

    assertSectionScope(context, arrangement.sectionId);
    assertProgramScope(context, section.programId);
    assertSiteScope(context, section.siteId);
    if (!section.siteId) throw new Error("Teaching assignment requires a school site");
    await lockAttendanceConfigurationAtSite(tx, section.siteId);

    if (arrangement.capacityReservationId) {
      const [reservation] = await tx
        .select({ status: instructionalCapacityReservations.status })
        .from(instructionalCapacityReservations)
        .where(eq(instructionalCapacityReservations.id, arrangement.capacityReservationId))
        .limit(1);
      if (!reservation || !["held", "committed"].includes(reservation.status)) {
        throw new Error("Delivery capacity is no longer reserved");
      }
      await tx.update(instructionalCapacityReservations)
        .set({ status: "committed", updatedAt: new Date() })
        .where(eq(instructionalCapacityReservations.id, arrangement.capacityReservationId));
    }

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

export async function getActiveDeliveryArrangement(sectionId: string, executor: any = db) {
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
    .where(and(
      eq(deliveryArrangements.sectionId, sectionId),
      eq(deliveryArrangements.status, "active"),
    ))
    .orderBy(desc(deliveryArrangements.updatedAt))
    .limit(1);
  return row ?? null;
}
