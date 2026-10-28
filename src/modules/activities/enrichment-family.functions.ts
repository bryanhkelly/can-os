import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { guardianRelationshipPredicate } from "@/domain/guardian-relationship";

import { EventTypes } from "@/domain/event-types";
const uuid = z.string().uuid();
const extended = ["summer_enrichment", "summer_program", "after_school_enrichment"] as const;

/** Public CAN-wide catalog uses the same publication and seat policies as sites. */
export const listEnrichmentCatalog = createServerFn({ method: "GET" }).handler(async () => {
  const { readEnrichmentCatalog } = await import("./enrichment-catalog.server");
  return readEnrichmentCatalog();
});

/** All manageable child profiles, including children not in any CAN school enrollment. */
export const getEnrichmentFamily = createServerFn({ method: "GET" }).handler(async () => {
  const { requireActor } = await import("@/modules/identity/actors.server");
  const actor = await requireActor(["guardian"], "enrollment:manage");
  const [{ db }, s] = await Promise.all([import("@/db/client"), import("@/db/schema")]);
  const children = await db.select({
    studentProfileId: s.studentProfiles.id,
    name: s.people.legalFirstName, lastName: s.people.legalLastName,
    gradeLevel: s.studentProfiles.gradeLevel,
  }).from(s.guardianRelationships)
    .innerJoin(s.studentProfiles, eq(s.studentProfiles.personId, s.guardianRelationships.studentPersonId))
    .innerJoin(s.people, eq(s.people.id, s.studentProfiles.personId))
    .where(guardianRelationshipPredicate({
      guardianPersonId: actor.actorPersonId, access: "enrollment",
    }));
  const households = await db.select({ id: s.households.id, name: s.households.displayName })
    .from(s.householdMemberships)
    .innerJoin(s.households, eq(s.households.id, s.householdMemberships.householdId))
    .where(eq(s.householdMemberships.personId, actor.actorPersonId));
  const registrations = children.length ? await db.select({
    id: s.activityRegistrations.id,
    seasonId: s.activityRegistrations.activitySeasonId,
    studentProfileId: s.activityRegistrations.studentProfileId,
    status: s.activityRegistrations.status,
    offeringName: s.activities.name,
    seasonName: s.activitySeasons.name,
    startsOn: s.activitySeasons.startsOn, endsOn: s.activitySeasons.endsOn,
    amountCents: s.financialObligations.amountCents,
    paymentStatus: s.financialObligations.status,
  }).from(s.activityRegistrations)
    .innerJoin(s.activitySeasons, eq(s.activitySeasons.id, s.activityRegistrations.activitySeasonId))
    .innerJoin(s.activities, eq(s.activities.id, s.activitySeasons.activityId))
    .innerJoin(s.programs, eq(s.programs.id, s.activities.programId))
    .leftJoin(s.financialObligations,
      eq(s.financialObligations.id, s.activityRegistrations.financialObligationId))
    .where(and(
      inArray(s.activityRegistrations.studentProfileId, children.map(c => c.studentProfileId)),
      inArray(s.programs.type, extended),
    )) : [];
  return { children, households, registrations };
});

/** Creates an enrichment-only child identity, not an academic admission or enrollment. */
export const addEnrichmentChild = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({
    firstName: z.string().trim().min(1).max(80),
    lastName: z.string().trim().min(1).max(80),
    gradeLevel: z.string().trim().max(20).optional(),
    householdId: uuid.optional(),
  }).strict().parse(value))
  .handler(async ({ data }) => {
    const { requireActor } = await import("@/modules/identity/actors.server");
    const actor = await requireActor(["guardian"], "enrollment:manage");
    const [{ db }, s, { recordAudit }, { emitEvent }] = await Promise.all([
      import("@/db/client"), import("@/db/schema"),
      import("@/modules/identity/actors.server"), import("@/platform/mutation"),
    ]);
    return db.transaction(async tx => {
      const membership = await tx.select({ id: s.householdMemberships.householdId })
        .from(s.householdMemberships)
        .where(eq(s.householdMemberships.personId, actor.actorPersonId));
      if (data.householdId && !membership.some(m => m.id === data.householdId))
        throw new Error("Choose one of your own households");
      let householdId = data.householdId ?? membership[0]?.id;
      if (!householdId) {
        const [household] = await tx.insert(s.households).values({
          displayName: data.lastName + " Household",
        }).returning({ id: s.households.id });
        if (!household) throw new Error("Unable to create household");
        householdId = household.id;
        await tx.insert(s.householdMemberships).values({
          householdId, personId: actor.actorPersonId,
          relationshipLabel: "guardian", isPrimaryContact: true,
        });
      }
      // Prevent obvious accidental duplicate additions under the same guardian.
      const linked = await tx.select({
        studentId: s.studentProfiles.id, firstName: s.people.legalFirstName,
        lastName: s.people.legalLastName,
      }).from(s.guardianRelationships)
        .innerJoin(s.people, eq(s.people.id, s.guardianRelationships.studentPersonId))
        .innerJoin(s.studentProfiles, eq(s.studentProfiles.personId, s.people.id))
        .where(eq(s.guardianRelationships.guardianPersonId, actor.actorPersonId));
      if (linked.some(c => c.firstName.toLowerCase() === data.firstName.toLowerCase() &&
        c.lastName.toLowerCase() === data.lastName.toLowerCase()))
        throw new Error("A child with this name is already linked. Select the existing child.");
      const [person] = await tx.insert(s.people).values({
        legalFirstName: data.firstName, legalLastName: data.lastName,
        metadata: { origin: "guardian_enrichment" },
      }).returning({ id: s.people.id });
      if (!person) throw new Error("Unable to add child");
      const [student] = await tx.insert(s.studentProfiles).values({
        personId: person.id, gradeLevel: data.gradeLevel || null,
        metadata: { origin: "guardian_enrichment", schoolYearEnrolled: false },
      }).returning({ id: s.studentProfiles.id });
      if (!student) throw new Error("Unable to add child profile");
      await tx.insert(s.guardianRelationships).values({
        guardianPersonId: actor.actorPersonId, studentPersonId: person.id,
        relationshipLabel: "guardian", canViewAcademics: false,
        canManageEnrollment: true, canSubmitAttendanceExcuse: false,
        metadata: { origin: "guardian_enrichment" },
      });
      await tx.insert(s.householdMemberships).values({
        householdId, personId: person.id, relationshipLabel: "student",
      });
      await recordAudit(tx, actor, {
        action: "enrichment.child.add", resourceType: "student_profile",
        resourceId: student.id,
        after: { origin: "guardian_enrichment", householdId },
      });
      await emitEvent(tx, {
        eventType: EventTypes.EnrichmentChildProfileCreated,
        aggregateType: "student_profile", aggregateId: student.id,
        actorPersonId: actor.actorPersonId,
        payload: { origin: "guardian_enrichment" },
      });
      return { studentProfileId: student.id, householdId };
    });
  });

/** Reuses the existing locked Activity registration and consent/fee/seat transaction. */
export const registerEnrichmentChild = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({
    seasonId: uuid, studentProfileId: uuid, householdId: uuid,
    selectedPackageIds: z.array(uuid).min(1).max(30).optional(),
    permissionVersion: z.string().min(1).max(80),
    acknowledged: z.literal(true),
  }).strict().parse(value))
  .handler(async ({ data }) => {
    const { requireActor } = await import("@/modules/identity/actors.server");
    const actor = await requireActor(["guardian"], "activity.register");
    const [{ registerForActivity }, { db }, s] = await Promise.all([
      import("./activity-service"), import("@/db/client"), import("@/db/schema"),
    ]);
    const id = await registerForActivity(actor, {
      activitySeasonId: data.seasonId,
      studentProfileId: data.studentProfileId,
      householdId: data.householdId,
      consentVersion: data.permissionVersion,
      selectedPackageIds: data.selectedPackageIds,
      acknowledged: true,
    });
    const [registration] = await db.select({ status: s.activityRegistrations.status })
      .from(s.activityRegistrations).where(eq(s.activityRegistrations.id, id)).limit(1);
    return { registrationId: id, status: registration?.status ?? "pending" };
  });
