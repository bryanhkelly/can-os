import { db } from "@/db/client";
import {
courseTemplates,
courseTemplateVersions,
instructionalCapacityOfferings,
instructionalCapacityReservations,
instructorAvailabilityWindows,
instructorCapabilities,
people,
programs,
roleAssignments,
scheduleTemplatePeriods,
sectionCapacityDemands,
sections,
sectionTeachers
} from "@/db/schema";
import { lockAttendanceConfigurationAtSite } from "@/domain/attendance-configuration-lock";
import {
assertCapability,
assertProgramScope,
assertSectionScope,
assertSiteScope,
type CommandContext,
} from "@/domain/command-context";
import { EventTypes } from "@/domain/event-types";
import { emitEvent,notify,writeAudit } from "@/platform/mutation";
import { and,eq,gte,inArray,lte,sql } from "drizzle-orm";
import { currentCapacityReservationFilter, isCurrentCapacityReservation } from "./reservation-policy";
import { activeRoleAssignmentPredicate } from "@/modules/identity/role-assignment-state.server";

/** Acquired before capacity reservation locks when teacher assignments may change. */
async function lockSectionStaffingSite(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  context: CommandContext, sectionId: string,
) {
  const [site] = await tx.select({
    siteId: sections.siteId, programId: sections.programId,
  }).from(sections).where(eq(sections.id, sectionId)).limit(1);
  if (!site?.siteId || !context.scope.programIds?.includes(site.programId) ||
      !context.scope.siteIds?.includes(site.siteId))
    throw new Error("Section capacity is not in the authorized teaching site");
  await lockAttendanceConfigurationAtSite(tx, site.siteId);
}

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

export async function createInstructorCapability(
  context: CommandContext,
  input: {
    personId: string;
    courseTemplateId?: string | null;
    subject?: string | null;
    gradeRange?: { min?: string; max?: string };
    modalities?: string[];
    metadata?: Record<string, unknown>;
  },
): Promise<string> {
  assertCapability(context, "capacity.manage");
  if (!input.courseTemplateId && !input.subject?.trim()) {
    throw new Error("Instructor capability requires a course template or subject");
  }

  const [person] = await db.select({ id: people.id }).from(people)
    .where(eq(people.id, input.personId)).limit(1);
  if (!person) throw new Error("Instructor person not found");

  const [capability] = await db.insert(instructorCapabilities).values({
    personId: input.personId,
    courseTemplateId: input.courseTemplateId ?? null,
    subject: input.subject?.trim() || null,
    gradeRange: input.gradeRange ?? {},
    modalities: input.modalities ?? [],
    metadata: input.metadata ?? {},
  }).returning({ id: instructorCapabilities.id });

  if (!capability) throw new Error("Unable to create instructor capability");
  return capability.id;
}

export async function createInstructorAvailability(
  context: CommandContext,
  input: {
    personId: string;
    startsAt: Date;
    endsAt: Date;
    timezone: string;
    weeklyPattern?: { days?: number[]; startTime?: string; endTime?: string } | null;
    metadata?: Record<string, unknown>;
  },
): Promise<string> {
  assertCapability(context, "capacity.manage");
  if (input.endsAt <= input.startsAt) throw new Error("Availability must end after it starts");

  const [availability] = await db.insert(instructorAvailabilityWindows).values({
    personId: input.personId,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    timezone: input.timezone,
    weeklyPattern: input.weeklyPattern ?? null,
    metadata: input.metadata ?? {},
  }).returning({ id: instructorAvailabilityWindows.id });

  if (!availability) throw new Error("Unable to create instructor availability");
  return availability.id;
}

export async function createCapacityOffering(
  context: CommandContext,
  input: {
    personId: string;
    capabilityId: string;
    availabilityWindowId: string;
    modality: "onsite" | "live_online" | "asynchronous" | "hybrid";
    maxSeats: number;
    organizationId?: string | null;
    siteId?: string | null;
    programId?: string | null;
    jurisdictionId?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<string> {
  assertCapability(context, "capacity.manage");
  if (!Number.isInteger(input.maxSeats) || input.maxSeats < 1) {
    throw new Error("Capacity offering max seats must be a positive integer");
  }

  const [capability] = await db.select({
    id: instructorCapabilities.id,
    personId: instructorCapabilities.personId,
  }).from(instructorCapabilities).where(eq(instructorCapabilities.id, input.capabilityId)).limit(1);
  if (!capability || capability.personId !== input.personId) {
    throw new Error("Capability does not belong to instructor");
  }

  const [availability] = await db.select({
    id: instructorAvailabilityWindows.id,
    personId: instructorAvailabilityWindows.personId,
  }).from(instructorAvailabilityWindows)
    .where(eq(instructorAvailabilityWindows.id, input.availabilityWindowId)).limit(1);
  if (!availability || availability.personId !== input.personId) {
    throw new Error("Availability does not belong to instructor");
  }

  if (input.siteId) assertSiteScope(context, input.siteId);
  if (input.programId) assertProgramScope(context, input.programId);

  const [offering] = await db.insert(instructionalCapacityOfferings).values({
    personId: input.personId,
    capabilityId: input.capabilityId,
    availabilityWindowId: input.availabilityWindowId,
    modality: input.modality,
    maxSeats: input.maxSeats,
    organizationId: input.organizationId ?? null,
    siteId: input.siteId ?? null,
    programId: input.programId ?? null,
    jurisdictionId: input.jurisdictionId ?? null,
    metadata: input.metadata ?? {},
  }).returning({ id: instructionalCapacityOfferings.id });

  if (!offering) throw new Error("Unable to create instructional capacity offering");
  return offering.id;
}

function modalityMatches(offered: string, requested: string): boolean {
  if (offered === requested) return true;
  if (offered === "hybrid") return requested === "onsite" || requested === "live_online" || requested === "hybrid";
  return false;
}

function normalizeLocalTime(value: string): string {
  return /^\d{2}:\d{2}$/.test(value) ? `${value}:00` : value;
}

function weeklyPatternCovers(
  pattern: { days?: number[]; startTime?: string; endTime?: string } | null,
  periods: readonly { dayOfWeek: number; startsAtLocal: string; endsAtLocal: string }[],
): boolean {
  if (!pattern || periods.length === 0) return true;
  const days = pattern.days ?? [];
  const start = pattern.startTime ? normalizeLocalTime(pattern.startTime) : null;
  const end = pattern.endTime ? normalizeLocalTime(pattern.endTime) : null;
  return periods.every((period) => {
    if (days.length > 0 && !days.includes(period.dayOfWeek)) return false;
    if (start && normalizeLocalTime(period.startsAtLocal) < start) return false;
    if (end && normalizeLocalTime(period.endsAtLocal) > end) return false;
    return true;
  });
}

async function loadSectionPeriods(executor: any, scheduleTemplateId: string | null) {
  if (!scheduleTemplateId) return [];
  return executor
    .select({
      dayOfWeek: scheduleTemplatePeriods.dayOfWeek,
      startsAtLocal: scheduleTemplatePeriods.startsAtLocal,
      endsAtLocal: scheduleTemplatePeriods.endsAtLocal,
    })
    .from(scheduleTemplatePeriods)
    .where(eq(scheduleTemplatePeriods.scheduleTemplateId, scheduleTemplateId));
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

async function loadDemandContext(executor: any, demandId: string) {
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
      scheduleTemplateId: sections.scheduleTemplateId,
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

  const sectionPeriods = await loadSectionPeriods(db, demand.scheduleTemplateId);

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
      scopedMatch(row, demand) &&
      weeklyPatternCovers(row.weeklyPattern, sectionPeriods)
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
        currentCapacityReservationFilter(now),
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
    const demand = await loadDemandContext(tx, input.demandId);
    if (!demand) throw new Error("Section capacity demand not found");
    assertDemandScope(context, demand);
    if (input.status === "committed")
      await lockSectionStaffingSite(tx, context, demand.sectionId);
    if (demand.demandStatus !== "open") throw new Error("Section capacity demand is not open");

    // Lock order: advisory capacity-demand → advisory capacity → row locks.
    // The demand lock serializes allocations across offerings; the offering
    // lock serializes seat claims so two schools cannot both claim the last seats.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`capacity-demand:${demand.demandId}`}))`);
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`capacity:${input.offeringId}`}))`);

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
        weeklyPattern: instructorAvailabilityWindows.weeklyPattern,
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
    const sectionPeriods = await loadSectionPeriods(tx, demand.scheduleTemplateId);
    if (!weeklyPatternCovers(offering.weeklyPattern, sectionPeriods)) {
      throw new Error("Instructor weekly availability does not cover the section schedule");
    }

    const seats = input.seats ?? demand.expectedSeats;
    if (!Number.isInteger(seats) || seats < 1 || seats > demand.expectedSeats) {
      throw new Error("Reserved seats must be a positive integer no greater than section demand");
    }

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
    if (input.expiresAt && (!Number.isFinite(input.expiresAt.getTime()) || input.expiresAt <= now)) {
      throw new Error("Capacity reservation expiry must be in the future");
    }
    const usedByOthers = existingRows
      .filter((row) =>
        row.demandId !== input.demandId &&
        isCurrentCapacityReservation(row, now),
      )
      .reduce((sum, row) => sum + row.seats, 0);

    if (usedByOthers + seats > offering.maxSeats) {
      throw new Error(`Only ${remainingSeats(offering.maxSeats, usedByOthers)} seats remain in this instructional capacity offering`);
    }

    const demandRows = await tx.select({
      offeringId: instructionalCapacityReservations.offeringId,
      seats: instructionalCapacityReservations.seats,
      status: instructionalCapacityReservations.status,
      expiresAt: instructionalCapacityReservations.expiresAt,
    }).from(instructionalCapacityReservations)
      .where(eq(instructionalCapacityReservations.demandId,demand.demandId));
    const usedDemandSeats = demandRows.filter(r=>r.offeringId!==offering.id &&
      isCurrentCapacityReservation(r, now)).reduce((sum,r)=>sum+r.seats,0);
    if(usedDemandSeats+seats>demand.expectedSeats)
      throw new Error("Reservations exceed the section's instructional demand");
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
      const [role] = await tx
        .select({ id: roleAssignments.id })
        .from(roleAssignments)
        .where(and(
          eq(roleAssignments.personId, offering.personId),
          eq(roleAssignments.roleKey, "teacher"),
          activeRoleAssignmentPredicate(),
          inArray(roleAssignments.organizationId, [
            demand.organizationId,
            ...(offering.organizationId ? [offering.organizationId] : []),
          ]),
        ))
        .limit(1);
      if (!role) throw new Error("Instructor has no active teaching authorization");
      await tx
        .insert(sectionTeachers)
        .values({
          sectionId: demand.sectionId,
          personId: offering.personId,
          role: "teacher",
          assignmentSource: "capacity",
        })
        .onConflictDoNothing({
          target: [sectionTeachers.sectionId, sectionTeachers.personId],
        });
    }

    await emitEvent(tx, {
      eventType: EventTypes.InstructionalCapacityReserved,
      aggregateType: "capacity_reservation",
      aggregateId: reservation.id,
      actorPersonId: context.actorPersonId,
      organizationId: demand.organizationId,
      siteId: demand.siteId,
      programId: demand.programId,
      sectionId: demand.sectionId,
      payload: {
        offeringId: offering.id,
        demandId: demand.demandId,
        seats,
        status: input.status ?? "held",
        instructorPersonId: offering.personId,
      },
    });
    await writeAudit(tx, context, {
      action: "capacity.reservation.created",
      entityType: "capacity_reservation",
      entityId: reservation.id,
      scope: {
        programId: demand.programId,
        siteId: demand.siteId,
        organizationId: demand.organizationId,
      },
      after: {
        offeringId: offering.id,
        demandId: demand.demandId,
        sectionId: demand.sectionId,
        seats,
        status: input.status ?? "held",
        instructorPersonId: offering.personId,
      },
    });

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
  await db.transaction(async tx => {
    const [lookup] = await tx.select({
      sectionId: instructionalCapacityReservations.sectionId,
    }).from(instructionalCapacityReservations)
      .where(eq(instructionalCapacityReservations.id, reservationId)).limit(1);
    if (!lookup) throw new Error("Capacity reservation not found");
    await lockSectionStaffingSite(tx, context, lookup.sectionId);
    const [reservation] = await tx.select({
      id:instructionalCapacityReservations.id,demandId:instructionalCapacityReservations.demandId,
      offeringId:instructionalCapacityReservations.offeringId,status:instructionalCapacityReservations.status,
      sectionId:instructionalCapacityReservations.sectionId,personId:instructionalCapacityOfferings.personId,
    }).from(instructionalCapacityReservations)
      .innerJoin(instructionalCapacityOfferings,eq(instructionalCapacityOfferings.id,instructionalCapacityReservations.offeringId))
      .where(eq(instructionalCapacityReservations.id,reservationId)).limit(1).for("update");
    if(!reservation)throw new Error("Capacity reservation not found");
    const demand=await loadDemandContext(tx,reservation.demandId);
    if(!demand)throw new Error("Section capacity demand not found");
    assertDemandScope(context,demand);
    if(reservation.status==="released")return;
    await tx.update(instructionalCapacityReservations).set({status:"released",updatedAt:new Date()})
      .where(eq(instructionalCapacityReservations.id,reservation.id));
    if(reservation.status==="committed"){
      const other=await tx.select({id:instructionalCapacityReservations.id}).from(instructionalCapacityReservations)
        .innerJoin(instructionalCapacityOfferings,eq(instructionalCapacityOfferings.id,instructionalCapacityReservations.offeringId))
        .where(and(eq(instructionalCapacityReservations.sectionId,reservation.sectionId),
          eq(instructionalCapacityOfferings.personId,reservation.personId),
          eq(instructionalCapacityReservations.status,"committed"),
          currentCapacityReservationFilter(new Date()))).limit(1);
      if(!other.length){
        await tx.delete(sectionTeachers).where(and(eq(sectionTeachers.sectionId,reservation.sectionId),
          eq(sectionTeachers.personId,reservation.personId),
          eq(sectionTeachers.assignmentSource,"capacity")));
      }
    }
    await emitEvent(tx, {
      eventType: EventTypes.InstructionalCapacityReleased,
      aggregateType: "capacity_reservation",
      aggregateId: reservation.id,
      actorPersonId: context.actorPersonId,
      organizationId: demand.organizationId,
      siteId: demand.siteId,
      programId: demand.programId,
      sectionId: reservation.sectionId,
      payload: {
        offeringId: reservation.offeringId,
        demandId: reservation.demandId,
        instructorPersonId: reservation.personId,
      },
    });
    await writeAudit(tx, context, {
      action: "capacity.reservation.released",
      entityType: "capacity_reservation",
      entityId: reservation.id,
      scope: {
        programId: demand.programId,
        siteId: demand.siteId,
        organizationId: demand.organizationId,
      },
      before: { status: reservation.status },
      after: { status: "released" },
    });
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
        currentCapacityReservationFilter(now),
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

/**
 * Atomically replace a committed instructor's seat allocation. The old teacher
 * remains assigned until a compatible replacement is committed in the same transaction.
 */
export async function replaceCommittedCapacity(context: CommandContext, input: {
  reservationId: string; replacementOfferingId: string; reason: string;
}) {
  assertCapability(context,"capacity.reserve");
  if(input.reason.trim().length<5)throw new Error("Explain the staffing replacement");
  return db.transaction(async tx=>{
    const [lookup] = await tx.select({
      sectionId: instructionalCapacityReservations.sectionId,
      demandId: instructionalCapacityReservations.demandId,
    }).from(instructionalCapacityReservations)
      .where(eq(instructionalCapacityReservations.id, input.reservationId)).limit(1);
    if (!lookup) throw new Error("Capacity reservation not found");
    await lockSectionStaffingSite(tx, context, lookup.sectionId);
    // Lock order: advisory capacity-demand → advisory capacity → row locks.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`capacity-demand:${lookup.demandId}`}))`);
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`capacity:${input.replacementOfferingId}`}))`);
    const [old]=await tx.select({
      id:instructionalCapacityReservations.id,demandId:instructionalCapacityReservations.demandId,
      sectionId:instructionalCapacityReservations.sectionId,seats:instructionalCapacityReservations.seats,
      status:instructionalCapacityReservations.status,oldOfferingId:instructionalCapacityReservations.offeringId,
      oldPersonId:instructionalCapacityOfferings.personId,
    }).from(instructionalCapacityReservations)
      .innerJoin(instructionalCapacityOfferings,eq(instructionalCapacityOfferings.id,instructionalCapacityReservations.offeringId))
      .where(eq(instructionalCapacityReservations.id,input.reservationId)).limit(1).for("update");
    if(!old||old.status!=="committed")throw new Error("Current instructor does not have a committed reservation");
    if(old.oldOfferingId===input.replacementOfferingId)throw new Error("Choose a different offering");
    const demand=await loadDemandContext(tx,old.demandId);
    if(!demand)throw new Error("Section demand not found");
    assertDemandScope(context,demand);
    const [replacement]=await tx.select({
      id:instructionalCapacityOfferings.id,personId:instructionalCapacityOfferings.personId,
      maxSeats:instructionalCapacityOfferings.maxSeats,status:instructionalCapacityOfferings.status,
      modality:instructionalCapacityOfferings.modality,
      organizationId:instructionalCapacityOfferings.organizationId,siteId:instructionalCapacityOfferings.siteId,
      programId:instructionalCapacityOfferings.programId,jurisdictionId:instructionalCapacityOfferings.jurisdictionId,
      subject:instructorCapabilities.subject,courseTemplateId:instructorCapabilities.courseTemplateId,
      availableFrom:instructorAvailabilityWindows.startsAt,availableUntil:instructorAvailabilityWindows.endsAt,
      pattern:instructorAvailabilityWindows.weeklyPattern,
    }).from(instructionalCapacityOfferings)
      .innerJoin(instructorCapabilities,eq(instructorCapabilities.id,instructionalCapacityOfferings.capabilityId))
      .innerJoin(instructorAvailabilityWindows,eq(instructorAvailabilityWindows.id,instructionalCapacityOfferings.availabilityWindowId))
      .where(and(eq(instructionalCapacityOfferings.id,input.replacementOfferingId),
        eq(instructorCapabilities.active,true),eq(instructorAvailabilityWindows.active,true)))
      .limit(1).for("update");
    if(!replacement||replacement.status!=="open")throw new Error("Replacement offering unavailable");
    if(replacement.personId===old.oldPersonId)throw new Error("Replacement must be a different instructor");
    if(!scopedMatch(replacement,demand)||!modalityMatches(replacement.modality,demand.modality)||
      replacement.availableFrom>demand.startsAt||replacement.availableUntil<demand.endsAt)
      throw new Error("Replacement instructor scope, modality or availability is incompatible");
    if(!(replacement.courseTemplateId===demand.courseTemplateId ||
      (!replacement.courseTemplateId && replacement.subject?.toLowerCase()===demand.courseSubject.toLowerCase())))
      throw new Error("Replacement instructor cannot teach this subject");
    const [role]=await tx.select({id:roleAssignments.id}).from(roleAssignments).where(and(
      eq(roleAssignments.personId,replacement.personId),eq(roleAssignments.roleKey,"teacher"),
      activeRoleAssignmentPredicate(),
      inArray(roleAssignments.organizationId,[demand.organizationId,...(replacement.organizationId?[replacement.organizationId]:[])]))).limit(1);
    if(!role)throw new Error("Replacement instructor has no active teaching authorization");
    if(!weeklyPatternCovers(replacement.pattern,await loadSectionPeriods(tx,demand.scheduleTemplateId)))
      throw new Error("Replacement is unavailable during this class schedule");
    const taken=await tx.select({seats:instructionalCapacityReservations.seats,status:instructionalCapacityReservations.status,
      expiresAt:instructionalCapacityReservations.expiresAt,demandId:instructionalCapacityReservations.demandId})
      .from(instructionalCapacityReservations)
      .where(eq(instructionalCapacityReservations.offeringId,replacement.id));
    const now = new Date();
    const used=taken.filter(row=>row.demandId!==demand.demandId &&
      isCurrentCapacityReservation(row, now)).reduce((sum,row)=>sum+row.seats,0);
    if(used+old.seats>replacement.maxSeats)throw new Error("Replacement has insufficient seats");
    const [existing]=await tx.select({id:instructionalCapacityReservations.id})
      .from(instructionalCapacityReservations)
      .where(and(eq(instructionalCapacityReservations.offeringId,replacement.id),
        eq(instructionalCapacityReservations.demandId,demand.demandId))).limit(1);
    if(existing)throw new Error("A reservation already exists for this replacement and class");
    await tx.insert(instructionalCapacityReservations).values({
      offeringId:replacement.id,demandId:demand.demandId,sectionId:demand.sectionId,seats:old.seats,
      status:"committed",createdByPersonId:context.actorPersonId,
      metadata:{replacedReservationId:old.id,reason:input.reason.trim()},
    });
    await tx.insert(sectionTeachers).values({sectionId:demand.sectionId,personId:replacement.personId,
      role:"teacher",assignmentSource:"capacity"}).onConflictDoNothing();
    await tx.update(instructionalCapacityReservations).set({status:"released",updatedAt:new Date(),
      metadata:{replacedByOfferingId:replacement.id,reason:input.reason.trim()}})
      .where(eq(instructionalCapacityReservations.id,old.id));
    const remaining=await tx.select({id:instructionalCapacityReservations.id})
      .from(instructionalCapacityReservations)
      .innerJoin(instructionalCapacityOfferings,eq(instructionalCapacityOfferings.id,instructionalCapacityReservations.offeringId))
      .where(and(eq(instructionalCapacityReservations.sectionId,demand.sectionId),
        eq(instructionalCapacityOfferings.personId,old.oldPersonId),
        eq(instructionalCapacityReservations.status,"committed"),
        currentCapacityReservationFilter(now))).limit(1);
    if(!remaining.length)await tx.delete(sectionTeachers).where(and(eq(sectionTeachers.sectionId,demand.sectionId),
      eq(sectionTeachers.personId,old.oldPersonId),eq(sectionTeachers.assignmentSource,"capacity")));
    await notify(tx, {
      recipientPersonId:replacement.personId,type:"teaching_assignment",title:"Teaching assignment changed",
      body:"You are now assigned to a section.",resourceType:"section",resourceId:demand.sectionId,
    });
    await writeAudit(tx,context,{
      action:"capacity.instructor.replaced",
      entityType:"section",entityId:demand.sectionId,
      scope:{programId:demand.programId,siteId:demand.siteId,organizationId:demand.organizationId},
      before:{offeringId:old.oldOfferingId,personId:old.oldPersonId},
      after:{offeringId:replacement.id,personId:replacement.personId,reason:input.reason.trim()},
    });
    await emitEvent(tx,{
      eventType:EventTypes.InstructorCapacityReplaced,aggregateType:"section",aggregateId:demand.sectionId,
      actorPersonId:context.actorPersonId,
      organizationId:demand.organizationId,siteId:demand.siteId,programId:demand.programId,sectionId:demand.sectionId,
      payload:{oldPersonId:old.oldPersonId,newPersonId:replacement.personId},
    });
    return {sectionId:demand.sectionId,replacementPersonId:replacement.personId};
  });
}
