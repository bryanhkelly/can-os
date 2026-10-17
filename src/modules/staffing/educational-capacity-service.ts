import { and, eq, inArray, lte, gte, or, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  courseTemplateVersions,
  courseTemplates,
  instructorAvailabilityWindows,
  instructorCapabilities,
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

const ACTIVE_RESERVATION_STATUSES = ["held", "committed"] as const;

export type CapacityCandidate = {
  offeringId: string;
  personId: string;
  instructorName: string;
  capabilityId: string;
  modality: string;
  maxSeats: number;
  reservedSeats: number;
  remainingSeats: number;
  availability: {
    startsAt: Date;
    endsAt: Date;
    timezone: string;
    weeklyPattern: { days?: number[]; startTime?: string; endTime?: string } | null;
  };
  scope: {
    organizationId: string | null;
    siteId: string | null;
    programId: string | null;
    jurisdictionId: string | null;
  };
};

export function remainingSeats(maxSeats: number, reservedSeats: number): number {
  return Math.max(0, maxSeats - reservedSeats);
}

function modalityMatches(offered: string, requested: string): boolean {
  if (offered === requested) return true;
  if (offered === "hybrid") return requested === "onsite" || requested === "live_online" || requested === "hybrid";
  return false;
}

function scopedMatch(
  offering: {
    organizationId: string | null;
    siteId: string | null;
    programId: string | null;
    jurisdictionId: string | null;
  },
  demand: {
    organizationId: string;
    siteId: string | null;
    programId: string;
    jurisdictionId: string;
  },
): boolean {
  return (
    (!offering.organizationId || offering.organizationId === demand.organizationId) &&
    (!offering.siteId || offering.siteId === demand.siteId) &&
    (!offering.programId || offering.programId === demand.programId) &&
    (!offering.jurisdictionId || offering.jurisdictionId === demand.jurisdictionId)
  );
}

async function loadDemandContext(executor: typeof db, demandId: string) {
  const [row] = await executor
    .select({
      demandId: sectionCapacityDemands.id,
      sectionId: sections.id,
      expectedSeats: sectionCapacityDemands.expectedSeats,
      modality: sectionCapacityDemands.modality,
      startsAt: sectionCapacityDemands.startsAt,
      endsAt: sectionCapacityDemands.endsAt,
      demandStatus: sectionCapacityDemands.status,
      programId: sections.programId,
      siteId: sections.siteId,
      organizationId: programs.organizationId,
      jurisdictionId: programs.jurisdictionId,
      courseTemplateId: courseTemplates.id,
      courseSubject: courseTemplates.subject,
      courseTitle: courseTemplates.title,
    })
    .from(sectionCapacityDemands)
    .innerJoin(sections, eq(sections.id, sectionCapacityDemands.sectionId))
    .innerJoin(programs, eq(programs.id, sections.programId))
    .innerJoin(courseTemplateVersions, eq(courseTemplateVersions.id, sections.courseTemplateVersionId))
    .innerJoin(courseTemplates, eq(courseTemplates.id, courseTemplateVersions.courseTemplateId))
    .where(eq(sectionCapacityDemands.id, demandId))
    .limit(1);
  return row ?? null;
}

function assertDemandScope(context: CommandContext, demand: NonNullable<Awaited<ReturnType<typeof loadDemandContext>>>) {
  assertSectionScope(context, demand.sectionId);
  assertProgramScope(context, demand.programId);
  assertSiteScope(context, demand.siteId);
}

export async function upsertSectionCapacityDemand(
  context: CommandContext,
  input: {
    sectionId: string;
    expectedSeats: number;
    modality: "onsite" | "live_online" | "asynchronous" | "hybrid";
    startsAt: Date;
    endsAt: Date;
    metadata?: Record<string, unknown>;
  },
): Promise<string> {
  assertCapability(context, "capacity.demand.manage");
  if (!Number.isInteger(input.expectedSeats) || input.expectedSeats < 1) {
    throw new Error("Expected seats must be a positive integer");
  }
  if (input.endsAt <= input.startsAt) throw new Error("Capacity demand must end after it starts");

  return db.transaction(async (tx) => {
    const [section] = await tx
      .select({ id: sections.id, programId: sections.programId, siteId: sections.siteId })
      .from(sections)
      .where(eq(sections.id, input.sectionId))
      .limit(1);
    if (!section) throw new Error("Section not found");

    assertSectionScope(context, section.id);
    assertProgramScope(context, section.programId);
    assertSiteScope(context, section.siteId);

    const [demand] = await tx
      .insert(sectionCapacityDemands)
      .values({
        sectionId: input.sectionId,
        expectedSeats: input.expectedSeats,
        modality: input.modality,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        status: "open",
        metadata: input.metadata ?? {},
      })
      .onConflictDoUpdate({
        target: sectionCapacityDemands.sectionId,
        set: {
          expectedSeats: input.expectedSeats,
          modality: input.modality,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          status: "open",
          metadata: input.metadata ?? {},
          updatedAt: new Date(),
        },
      })
      .returning({ id: sectionCapacityDemands.id });

    if (!demand) throw new Error("Unable to create section capacity demand");
    return demand.id;
  });
}

export async function findCapacityCandidates(
  context: CommandContext,
  demandId: string,
): Promise<CapacityCandidate[]> {
  assertCapability(context, "capacity.read");
  const demand = await loadDemandContext(db, demandId);
  if (!demand) throw new Error("Section capacity demand not found");
  assertDemandScope(context, demand);

  const rows = await db
    .select({
      offeringId: instructionalCapacityOfferings.id,
      personId: instructionalCapacityOfferings.personId,
      firstName: people.legalFirstName,
      lastName: people.legalLastName,
      capabilityId: instructorCapabilities.id,
      capabilityCourseTemplateId: instructorCapabilities.courseTemplateId,
      capabilitySubject: instructorCapabilities.subject,
      modality: instructionalCapacityOfferings.modality,
      maxSeats: instructionalCapacityOfferings.maxSeats,
      organizationId: instructionalCapacityOfferings.organizationId,
      siteId: instructionalCapacityOfferings.siteId,
      programId: instructionalCapacityOfferings.programId,
      jurisdictionId: instructionalCapacityOfferings.jurisdictionId,
      availabilityStartsAt: instructorAvailabilityWindows.startsAt,
      availabilityEndsAt: instructorAvailabilityWindows.endsAt,
      timezone: instructorAvailabilityWindows.timezone,
      weeklyPattern: instructorAvailabilityWindows.weeklyPattern,
    })
    .from(instructionalCapacityOfferings)
    .innerJoin(instructorCapabilities, eq(instructorCapabilities.id, instructionalCapacityOfferings.capabilityId))
    .innerJoin(instructorAvailabilityWindows, eq(instructorAvailabilityWindows.id, instructionalCapacityOfferings.availabilityWindowId))
    .innerJoin(people, eq(people.id, instructionalCapacityOfferings.personId))
    .where(
      and(
        eq(instructionalCapacityOfferings.status, "open"),
        eq(instructorCapabilities.active, true),
        eq(instructorAvailabilityWindows.active, true),
        lte(instructorAvailabilityWindows.startsAt, demand.startsAt),
        gte(instructorAvailabilityWindows.endsAt, demand.endsAt),
      ),
    );

  const compatible = rows.filter((row) => {
    const subjectMatches =
      row.capabilityCourseTemplateId === demand.courseTemplateId ||
      (!row.capabilityCourseTemplateId &&
        !!row.capabilitySubject &&
        row.capabilitySubject.toLocaleLowerCase() === demand.courseSubject.toLocaleLowerCase());

    return (
      subjectMatches &&
      modalityMatches(row.modality, demand.modality) &&
      scopedMatch(row, demand)
    );
  });

  if (!compatible.length) return [];

  const now = new Date();
  const reservations = await db
    .select({
      offeringId: instructionalCapacityReservations.offeringId,
      seats: instructionalCapacityReservations.seats,
    })
    .from(instructionalCapacityReservations)
    .where(
      and(
        inArray(
          instructionalCapacityReservations.offeringId,
          compatible.map((row) => row.offeringId),
        ),
        inArray(instructionalCapacityReservations.status, [...ACTIVE_RESERVATION_STATUSES]),
        or(
          isNull(instructionalCapacityReservations.expiresAt),
          gte(instructionalCapacityReservations.expiresAt, now),
        ),
      ),
    );

  const reservedByOffering = new Map<string, number>();
  for (const reservation of reservations) {
    reservedByOffering.set(
      reservation.offeringId,
      (reservedByOffering.get(reservation.offeringId) ?? 0) + reservation.seats,
    );
  }

  return compatible
    .map((row) => {
      const reservedSeats = reservedByOffering.get(row.offeringId) ?? 0;
      return {
        offeringId: row.offeringId,
        personId: row.personId,
        instructorName: `${row.firstName} ${row.lastName}`,
        capabilityId: row.capabilityId,
        modality: row.modality,
        maxSeats: row.maxSeats,
        reservedSeats,
        remainingSeats: remainingSeats(row.maxSeats, reservedSeats),
        availability: {
          startsAt: row.availabilityStartsAt,
          endsAt: row.availabilityEndsAt,
          timezone: row.timezone,
          weeklyPattern: row.weeklyPattern,
        },
        scope: {
          organizationId: row.organizationId,
          siteId: row.siteId,
          programId: row.programId,
          jurisdictionId: row.jurisdictionId,
        },
      } satisfies CapacityCandidate;
    })
    .filter((row) => row.remainingSeats > 0)
    .sort((a, b) => b.remainingSeats - a.remainingSeats || a.instructorName.localeCompare(b.instructorName));
}

export async function reserveInstructionalCapacity(
  context: CommandContext,
  input: {
    demandId: string;
    offeringId: string;
    seats?: number;
    status?: "held" | "committed";
    expiresAt?: Date | null;
  },
): Promise<{ reservationId: string; remainingSeats: number }> {
  assertCapability(context, "capacity.reserve");

  return db.transaction(async (tx) => {
    const demand = await loadDemandContext(tx as typeof db, input.demandId);
    if (!demand) throw new Error("Section capacity demand not found");
    assertDemandScope(context, demand);
    if (demand.demandStatus !== "open") throw new Error("Section capacity demand is not open");

    const [offering] = await tx
      .select({
        id: instructionalCapacityOfferings.id,
        personId: instructionalCapacityOfferings.personId,
        capabilityId: instructionalCapacityOfferings.capabilityId,
        maxSeats: instructionalCapacityOfferings.maxSeats,
        status: instructionalCapacityOfferings.status,
        modality: instructionalCapacityOfferings.modality,
        organizationId: instructionalCapacityOfferings.organizationId,
        siteId: instructionalCapacityOfferings.siteId,
        programId: instructionalCapacityOfferings.programId,
        jurisdictionId: instructionalCapacityOfferings.jurisdictionId,
        capabilityCourseTemplateId: instructorCapabilities.courseTemplateId,
        capabilitySubject: instructorCapabilities.subject,
        availabilityStartsAt: instructorAvailabilityWindows.startsAt,
        availabilityEndsAt: instructorAvailabilityWindows.endsAt,
      })
      .from(instructionalCapacityOfferings)
      .innerJoin(instructorCapabilities, eq(instructorCapabilities.id, instructionalCapacityOfferings.capabilityId))
      .innerJoin(instructorAvailabilityWindows, eq(instructorAvailabilityWindows.id, instructionalCapacityOfferings.availabilityWindowId))
      .where(eq(instructionalCapacityOfferings.id, input.offeringId))
      .limit(1)
      .for("update");

    if (!offering || offering.status !== "open") throw new Error("Capacity offering is not available");

    const courseMatches =
      offering.capabilityCourseTemplateId === demand.courseTemplateId ||
      (!offering.capabilityCourseTemplateId &&
        !!offering.capabilitySubject &&
        offering.capabilitySubject.toLocaleLowerCase() === demand.courseSubject.toLocaleLowerCase());
    if (!courseMatches) throw new Error("Instructor capability does not match section demand");
    if (!modalityMatches(offering.modality, demand.modality)) throw new Error("Capacity modality does not match section demand");
    if (!scopedMatch(offering, demand)) throw new Error("Capacity offering is outside the section delivery scope");
    if (offering.availabilityStartsAt > demand.startsAt || offering.availabilityEndsAt < demand.endsAt) {
      throw new Error("Instructor availability does not cover the section demand window");
    }

    const seats = input.seats ?? demand.expectedSeats;
    if (!Number.isInteger(seats) || seats < 1 || seats > demand.expectedSeats) {
      throw new Error("Reserved seats must be a positive integer no greater than section demand");
    }

    // Serialize reservations for one offering so two schools cannot both claim
    // the same last seats.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`capacity:${offering.id}`}))`);

    const existingRows = await tx
      .select({
        id: instructionalCapacityReservations.id,
        demandId: instructionalCapacityReservations.demandId,
        seats: instructionalCapacityReservations.seats,
        status: instructionalCapacityReservations.status,
        expiresAt: instructionalCapacityReservations.expiresAt,
      })
      .from(instructionalCapacityReservations)
      .where(eq(instructionalCapacityReservations.offeringId, offering.id));

    const now = new Date();
    const usedByOthers = existingRows
      .filter((row) =>
        row.demandId !== input.demandId &&
        ACTIVE_RESERVATION_STATUSES.includes(row.status as (typeof ACTIVE_RESERVATION_STATUSES)[number]) &&
        (!row.expiresAt || row.expiresAt >= now),
      )
      .reduce((sum, row) => sum + row.seats, 0);

    if (usedByOthers + seats > offering.maxSeats) {
      throw new Error(`Only ${remainingSeats(offering.maxSeats, usedByOthers)} seats remain in this instructional capacity offering`);
    }

    const [reservation] = await tx
      .insert(instructionalCapacityReservations)
      .values({
        offeringId: offering.id,
        demandId: demand.demandId,
        sectionId: demand.sectionId,
        seats,
        status: input.status ?? "held",
        expiresAt: input.expiresAt ?? null,
        createdByPersonId: context.actorPersonId,
      })
      .onConflictDoUpdate({
        target: [
          instructionalCapacityReservations.offeringId,
          instructionalCapacityReservations.demandId,
        ],
        set: {
          seats,
          status: input.status ?? "held",
          expiresAt: input.expiresAt ?? null,
          updatedAt: new Date(),
        },
      })
      .returning({ id: instructionalCapacityReservations.id });

    if (!reservation) throw new Error("Unable to reserve instructional capacity");

    if ((input.status ?? "held") === "committed") {
      await tx
        .insert(sectionTeachers)
        .values({
          sectionId: demand.sectionId,
          personId: offering.personId,
          role: "teacher",
        })
        .onConflictDoNothing({
          target: [sectionTeachers.sectionId, sectionTeachers.personId],
        });
    }

    return {
      reservationId: reservation.id,
      remainingSeats: remainingSeats(offering.maxSeats, usedByOthers + seats),
    };
  });
}

export async function releaseInstructionalCapacity(
  context: CommandContext,
  reservationId: string,
): Promise<void> {
  assertCapability(context, "capacity.reserve");

  await db.transaction(async (tx) => {
    const [reservation] = await tx
      .select({
        id: instructionalCapacityReservations.id,
        demandId: instructionalCapacityReservations.demandId,
      })
      .from(instructionalCapacityReservations)
      .where(eq(instructionalCapacityReservations.id, reservationId))
      .limit(1);
    if (!reservation) throw new Error("Capacity reservation not found");

    const demand = await loadDemandContext(tx as typeof db, reservation.demandId);
    if (!demand) throw new Error("Section capacity demand not found");
    assertDemandScope(context, demand);

    await tx
      .update(instructionalCapacityReservations)
      .set({ status: "released", updatedAt: new Date() })
      .where(eq(instructionalCapacityReservations.id, reservationId));
  });
}

export async function getInstructorCapacity(
  context: CommandContext,
  personId: string,
): Promise<Array<{
  offeringId: string;
  modality: string;
  maxSeats: number;
  reservedSeats: number;
  remainingSeats: number;
  startsAt: Date;
  endsAt: Date;
  scope: { organizationId: string | null; siteId: string | null; programId: string | null; jurisdictionId: string | null };
}>> {
  assertCapability(context, "capacity.read");

  const offerings = await db
    .select({
      offeringId: instructionalCapacityOfferings.id,
      modality: instructionalCapacityOfferings.modality,
      maxSeats: instructionalCapacityOfferings.maxSeats,
      organizationId: instructionalCapacityOfferings.organizationId,
      siteId: instructionalCapacityOfferings.siteId,
      programId: instructionalCapacityOfferings.programId,
      jurisdictionId: instructionalCapacityOfferings.jurisdictionId,
      startsAt: instructorAvailabilityWindows.startsAt,
      endsAt: instructorAvailabilityWindows.endsAt,
    })
    .from(instructionalCapacityOfferings)
    .innerJoin(instructorAvailabilityWindows, eq(instructorAvailabilityWindows.id, instructionalCapacityOfferings.availabilityWindowId))
    .where(and(eq(instructionalCapacityOfferings.personId, personId), eq(instructionalCapacityOfferings.status, "open")));

  if (!offerings.length) return [];

  const now = new Date();
  const reservations = await db
    .select({
      offeringId: instructionalCapacityReservations.offeringId,
      seats: instructionalCapacityReservations.seats,
    })
    .from(instructionalCapacityReservations)
    .where(
      and(
        inArray(instructionalCapacityReservations.offeringId, offerings.map((o) => o.offeringId)),
        inArray(instructionalCapacityReservations.status, [...ACTIVE_RESERVATION_STATUSES]),
        or(isNull(instructionalCapacityReservations.expiresAt), gte(instructionalCapacityReservations.expiresAt, now)),
      ),
    );

  const used = new Map<string, number>();
  for (const row of reservations) used.set(row.offeringId, (used.get(row.offeringId) ?? 0) + row.seats);

  return offerings.map((o) => {
    const reservedSeats = used.get(o.offeringId) ?? 0;
    return {
      offeringId: o.offeringId,
      modality: o.modality,
      maxSeats: o.maxSeats,
      reservedSeats,
      remainingSeats: remainingSeats(o.maxSeats, reservedSeats),
      startsAt: o.startsAt,
      endsAt: o.endsAt,
      scope: {
        organizationId: o.organizationId,
        siteId: o.siteId,
        programId: o.programId,
        jurisdictionId: o.jurisdictionId,
      },
    };
  });
}
