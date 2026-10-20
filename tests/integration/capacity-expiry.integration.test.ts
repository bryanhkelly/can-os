import { describe, expect, it, vi } from "vitest";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import type { CommandContext } from "@/domain/command-context";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
const state = vi.hoisted(() => ({ tx: undefined as Transaction | undefined }));
vi.mock("@/db/client", () => ({
  get db() {
    if (!state.tx) throw new Error("Capacity expiry tests must stay in the rollback transaction");
    return state.tx;
  },
}));
function first<T>(rows: T[]): T {
  const row = rows[0];
  if (!row) throw new Error("Missing capacity expiry fixture");
  return row;
}
const integration = process.env.DATABASE_URL ? describe : describe.skip;
integration("instructional capacity expiry", () => {
  it("keeps capacity current and delivery activation retry-safe without reopening completed arrangements", async () => {
    const { db: database } = await vi.importActual<{ db: Database }>("@/db/client");
    const s = await import("@/db/schema");
    const capacity = await import("@/modules/staffing/educational-capacity-service");
    const delivery = await import("@/modules/staffing/delivery-arrangement-service");
    const { evaluateSectionReadiness } = await import("@/modules/programs/section-readiness-service");
    const { getSchoolOperationsCommandCenter } = await import("@/modules/operations/command-center-service");
    const rollback = new Error("rollback-capacity-expiry");
    const suffix = crypto.randomUUID().slice(0, 8);
    const start = new Date("2030-01-01T12:00:00Z");
    const expiry = new Date(start.getTime() + 60_000);
    let personId = "";
    let checked = false;
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(start);
    try {
      await database.transaction(async tx => {
        state.tx = tx;
        const org = first(await tx.insert(s.organizations).values({
          type: "christian_school", name: "Capacity Expiry", slug: `expiry-${suffix}`,
        }).returning());
        const site = first(await tx.insert(s.sites).values({
          organizationId: org.id, name: "Capacity Expiry Site", slug: `expiry-${suffix}`,
        }).returning());
        const jurisdiction = first(await tx.insert(s.jurisdictions).values({
          code: `expiry-${suffix}`, name: "Synthetic capacity jurisdiction",
        }).returning());
        const program = first(await tx.insert(s.programs).values({
          organizationId: org.id, siteId: site.id, jurisdictionId: jurisdiction.id,
          type: "full_school", name: "Capacity Expiry Program", slug: `expiry-${suffix}`,
          gradeRange: { min: "9", max: "12" }, deliveryModel: { liveOnline: true },
          hostOrganizationId: org.id, academicProviderOrganizationId: org.id, creditIssuingOrganizationId: org.id,
        }).returning());
        const teacher = first(await tx.insert(s.people).values({
          legalFirstName: "Synthetic", legalLastName: "CapacityExpiry",
        }).returning());
        personId = teacher.id;
        await tx.insert(s.roleAssignments).values({
          personId: teacher.id, organizationId: org.id, roleKey: "teacher",
        });
        const template = first(await tx.insert(s.courseTemplates).values({
          owningOrganizationId: org.id, code: `expiry-${suffix}`, title: "History", subject: "History",
        }).returning());
        const version = first(await tx.insert(s.courseTemplateVersions).values({
          courseTemplateId: template.id, version: 1, status: "published",
        }).returning());
        const { createAcademicTimeFixture } = await import("./helpers/academic-time");
        const time = await createAcademicTimeFixture({
          organizationId: org.id, siteId: site.id, programId: program.id, suffix,
        });
        const section = first(await tx.insert(s.sections).values({
          programId: program.id, siteId: site.id, courseTemplateVersionId: version.id,
          termId: time.term.id, title: "History", code: `expiry-${suffix}`,
        }).returning());
        const context: CommandContext = {
          actorPersonId: teacher.id, requestId: `capacity-expiry-${suffix}`,
          capabilities: new Set(["capacity.read", "capacity.reserve", "program.launch.start"]),
          scope: { organizationIds: [org.id], siteIds: [site.id], programIds: [program.id], sectionIds: [section.id] },
        };
        const capability = first(await tx.insert(s.instructorCapabilities).values({
          personId: teacher.id, courseTemplateId: template.id, modalities: ["live_online"],
        }).returning());
        const availability = first(await tx.insert(s.instructorAvailabilityWindows).values({
          personId: teacher.id, startsAt: new Date("2027-01-01"), endsAt: new Date("2031-01-01"), timezone: "UTC",
        }).returning());
        const offering = first(await tx.insert(s.instructionalCapacityOfferings).values({
          personId: teacher.id, capabilityId: capability.id, availabilityWindowId: availability.id,
          modality: "live_online", maxSeats: 10,
        }).returning());
        const demand = first(await tx.insert(s.sectionCapacityDemands).values({
          sectionId: section.id, expectedSeats: 10, modality: "live_online",
          startsAt: new Date("2027-08-16"), endsAt: new Date("2027-12-19"),
        }).returning());
        const reserve = (status: "held" | "committed", expiresAt: Date | null) =>
          capacity.reserveInstructionalCapacity(context, { demandId: demand.id, offeringId: offering.id, seats: 10, status, expiresAt });
        const coverage = async (seats: number) => {
          const readiness = await evaluateSectionReadiness(section.id, tx, new Date());
          expect(readiness.metrics.reservedInstructionalSeats).toBe(seats);
          expect(first(readiness.items.filter(item => item.key === "instructional_capacity")).state)
            .toBe(seats === 10 ? "ready" : "blocked");
          const instructor = first(await capacity.getInstructorCapacity(context, teacher.id));
          expect(instructor.reservedSeats).toBe(seats);
          expect(instructor.remainingSeats).toBe(10 - seats);
          const candidates = await capacity.findCapacityCandidates(context, demand.id);
          expect(candidates).toHaveLength(seats === 10 ? 0 : 1);
          if (seats === 0) expect(candidates[0]?.remainingSeats).toBe(10);
        };
        const held = await reserve("held", expiry);
        await coverage(10);
        const arrangementId = await delivery.createDeliveryArrangement(context, {
          sectionId: section.id, academicProviderOrganizationId: org.id,
          capacityReservationId: held.reservationId, modality: "live_online",
        });
        vi.setSystemTime(expiry);
        await coverage(0);
        await expect(delivery.createDeliveryArrangement(context, {
          sectionId: section.id, academicProviderOrganizationId: org.id,
          capacityReservationId: held.reservationId, modality: "live_online", status: "active",
        })).rejects.toThrow("inactive or expired");
        await expect(delivery.activateDeliveryArrangement(context, arrangementId)).rejects.toThrow("expired");
        await expect(reserve("held", expiry)).rejects.toThrow("expiry must be in the future");
        await expect(reserve("committed", new Date("invalid"))).rejects.toThrow("expiry must be in the future");
        const unchanged = first(await tx.select().from(s.instructionalCapacityReservations)
          .where(eq(s.instructionalCapacityReservations.id, held.reservationId)));
        expect(unchanged.status).toBe("held");
        expect(first(await tx.select().from(s.deliveryArrangements)
          .where(eq(s.deliveryArrangements.id, arrangementId))).status).toBe("reserved");
        expect(await tx.select().from(s.sectionTeachers).where(eq(s.sectionTeachers.sectionId, section.id))).toHaveLength(0);
        expect(await tx.select().from(s.auditEvents).where(and(
          eq(s.auditEvents.action, "delivery.arrangement.activated"), eq(s.auditEvents.resourceId, arrangementId),
        ))).toHaveLength(0);
        expect(await tx.select().from(s.domainEvents).where(and(
          eq(s.domainEvents.eventType, "DeliveryArrangementActivated"), eq(s.domainEvents.aggregateId, arrangementId),
        ))).toHaveLength(0);

        const otherSection = first(await tx.insert(s.sections).values({
          programId: program.id, siteId: site.id, courseTemplateVersionId: version.id,
          termId: time.term.id, title: "Other History", code: `expiry-other-${suffix}`,
        }).returning());
        const otherDemand = first(await tx.insert(s.sectionCapacityDemands).values({
          sectionId: otherSection.id, expectedSeats: 10, modality: "live_online",
          startsAt: demand.startsAt, endsAt: demand.endsAt,
        }).returning());
        const otherContext = { ...context, scope: { ...context.scope, sectionIds: [section.id, otherSection.id] } };
        const otherReservation = await capacity.reserveInstructionalCapacity(otherContext, {
          demandId: otherDemand.id, offeringId: offering.id, seats: 10,
        });
        expect(otherReservation.remainingSeats).toBe(0);
        await expect(reserve("held", null)).rejects.toThrow("Only 0 seats remain");
        await capacity.releaseInstructionalCapacity(otherContext, otherReservation.reservationId);

        const alternativeCapability = first(await tx.insert(s.instructorCapabilities).values({
          personId: teacher.id, courseTemplateId: template.id, modalities: ["live_online"],
        }).returning());
        const alternativeOffering = first(await tx.insert(s.instructionalCapacityOfferings).values({
          personId: teacher.id, capabilityId: alternativeCapability.id, availabilityWindowId: availability.id,
          modality: "live_online", maxSeats: 10,
        }).returning());
        const alternative = await capacity.reserveInstructionalCapacity(context, {
          demandId: demand.id, offeringId: alternativeOffering.id, seats: 10,
        });
        expect((await evaluateSectionReadiness(section.id, tx, new Date())).metrics.reservedInstructionalSeats).toBe(10);
        await capacity.releaseInstructionalCapacity(context, alternative.reservationId);
        // Keep later candidate assertions focused on the original offering.
        await tx.update(s.instructorCapabilities).set({ active: false })
          .where(eq(s.instructorCapabilities.id, alternativeCapability.id));

        const committedExpiry = new Date(expiry.getTime() + 60_000);
        await reserve("committed", committedExpiry);
        await coverage(10);
        expect((await getSchoolOperationsCommandCenter(context)).issues.filter(issue => issue.sectionId === section.id && issue.kind === "capacity")).toHaveLength(0);
        vi.setSystemTime(committedExpiry);
        await coverage(0);
        expect((await getSchoolOperationsCommandCenter(context)).issues.filter(issue => issue.sectionId === section.id && issue.kind === "capacity")).toHaveLength(1);
        // Expiry changes planning capacity, not the canonical teacher relationship.
        expect(await tx.select().from(s.sectionTeachers).where(eq(s.sectionTeachers.sectionId, section.id))).toHaveLength(1);
        const renewed = await reserve("held", null);
        expect(renewed.reservationId).toBe(held.reservationId);
        await coverage(10);
        await delivery.activateDeliveryArrangement(context, arrangementId);
        expect(first(await tx.select().from(s.instructionalCapacityReservations)
          .where(eq(s.instructionalCapacityReservations.id, held.reservationId))).status).toBe("committed");
        expect(first(await tx.select().from(s.deliveryArrangements)
          .where(eq(s.deliveryArrangements.id, arrangementId))).status).toBe("active");
        const activationSnapshot = async () => ({
          arrangement: await tx.select().from(s.deliveryArrangements).where(eq(s.deliveryArrangements.id, arrangementId)),
          reservation: await tx.select().from(s.instructionalCapacityReservations).where(eq(s.instructionalCapacityReservations.id, held.reservationId)),
          assignments: await tx.select().from(s.sectionTeachers).where(eq(s.sectionTeachers.sectionId, section.id)),
          audits: await tx.select().from(s.auditEvents).where(and(
            eq(s.auditEvents.action, "delivery.arrangement.activated"), eq(s.auditEvents.resourceId, arrangementId),
          )),
          events: await tx.select().from(s.domainEvents).where(and(
            eq(s.domainEvents.eventType, "DeliveryArrangementActivated"), eq(s.domainEvents.aggregateId, arrangementId),
          )),
        });
        const activated = await activationSnapshot();
        expect(activated.audits).toHaveLength(1);
        expect(activated.events).toHaveLength(1);
        expect(activated.audits[0]?.before).toEqual({ status: "reserved" });
        vi.setSystemTime(new Date(committedExpiry.getTime() + 60_000));
        await delivery.activateDeliveryArrangement(context, arrangementId);
        await delivery.activateDeliveryArrangement(context, arrangementId);
        expect(await activationSnapshot()).toEqual(activated);
        for (const denied of [
          { ...context, capabilities: new Set<string>() },
          { ...context, scope: { ...context.scope, sectionIds: [] } },
          { ...context, scope: { ...context.scope, programIds: [] } },
          { ...context, scope: { ...context.scope, siteIds: [] } },
        ]) {
          await expect(delivery.activateDeliveryArrangement(denied, arrangementId)).rejects.toThrow("Missing required capability or scope");
        }
        expect(await activationSnapshot()).toEqual(activated);
        // An activation retry is not a way to recreate a removed assignment.
        await tx.delete(s.sectionTeachers).where(eq(s.sectionTeachers.sectionId, section.id));
        await delivery.activateDeliveryArrangement(context, arrangementId);
        expect(await tx.select().from(s.sectionTeachers).where(eq(s.sectionTeachers.sectionId, section.id))).toHaveLength(0);

        await tx.update(s.instructionalCapacityReservations).set({ expiresAt: new Date() })
          .where(eq(s.instructionalCapacityReservations.id, held.reservationId));
        const expiredActive = await activationSnapshot();
        await expect(delivery.activateDeliveryArrangement(context, arrangementId)).rejects.toThrow("expired");
        expect(await activationSnapshot()).toEqual(expiredActive);
        await tx.update(s.instructionalCapacityReservations).set({ expiresAt: null })
          .where(eq(s.instructionalCapacityReservations.id, held.reservationId));
        await capacity.releaseInstructionalCapacity(context, held.reservationId);
        await coverage(0);
        const releasedActive = await activationSnapshot();
        await expect(delivery.activateDeliveryArrangement(context, arrangementId)).rejects.toThrow("no longer reserved");
        expect(await activationSnapshot()).toEqual(releasedActive);
        expect((await getSchoolOperationsCommandCenter(context)).issues.filter(issue => issue.sectionId === section.id && issue.kind === "capacity")).toHaveLength(1);
        const journal = await tx.select().from(s.auditEvents).where(and(
          eq(s.auditEvents.resourceId, held.reservationId),
          inArray(s.auditEvents.action, ["capacity.reservation.created", "capacity.reservation.released"]),
        ));
        expect(journal).toHaveLength(4);

        // Non-capacity arrangements share the one-time transition and terminal-state guard.
        for (const status of ["proposed", "reserved", "ready", "active", "completed"] as const) {
          const direct = first(await tx.insert(s.deliveryArrangements).values({
            sectionId: section.id, academicProviderOrganizationId: org.id,
            instructorPersonId: teacher.id, modality: "onsite", status,
          }).returning());
          if (status === "completed") {
            await expect(delivery.activateDeliveryArrangement(context, direct.id)).rejects.toThrow("Completed delivery arrangements");
          } else {
            await delivery.activateDeliveryArrangement(context, direct.id);
            const firstResult = first(await tx.select().from(s.deliveryArrangements).where(eq(s.deliveryArrangements.id, direct.id)));
            vi.setSystemTime(new Date(Date.now() + 60_000));
            await delivery.activateDeliveryArrangement(context, direct.id);
            expect(first(await tx.select().from(s.deliveryArrangements).where(eq(s.deliveryArrangements.id, direct.id)))).toEqual(firstResult);
          }
          const changes = status !== "active" && status !== "completed" ? 1 : 0;
          expect(await tx.select().from(s.auditEvents).where(and(
            eq(s.auditEvents.action, "delivery.arrangement.activated"), eq(s.auditEvents.resourceId, direct.id),
          ))).toHaveLength(changes);
          expect(await tx.select().from(s.domainEvents).where(and(
            eq(s.domainEvents.eventType, "DeliveryArrangementActivated"), eq(s.domainEvents.aggregateId, direct.id),
          ))).toHaveLength(changes);
          if (status === "completed") {
            expect(first(await tx.select().from(s.deliveryArrangements).where(eq(s.deliveryArrangements.id, direct.id)))).toEqual(direct);
          }
        }
        checked = true;
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    } finally {
      vi.useRealTimers();
      state.tx = undefined;
    }
    expect(checked).toBe(true);
    expect((await database.execute(sql`select id from people where id = ${personId}::uuid`)).rows).toHaveLength(0);
  }, 60_000);
});
