import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  applications,
  auditEvents,
  domainEvents,
  enrollments,
  guardianRelationships,
  householdMemberships,
  households,
  journeyDefinitions,
  journeyRequirements,
  journeys,
  people,
  programs,
  studentProfiles,
} from "@/db/schema";
import {
  assertCapability,
  assertProgramScope,
  type CommandContext,
} from "@/domain/command-context";
import { EventTypes } from "@/domain/event-types";

type EnrollmentRequirementDefinition = {
  key: string;
  title: string;
  blocking?: boolean;
  owner?: "family" | "can" | "third_party";
};

type EnrollmentJourneyConfiguration = {
  requirements?: EnrollmentRequirementDefinition[];
};

export async function startFamilyApplication(
  context: CommandContext,
  input: {
    programId: string;
    idempotencyKey: string;
    householdId?: string;
    householdDisplayName?: string;
    student: {
      legalFirstName: string;
      legalLastName: string;
      preferredName?: string;
      gradeLevel?: string;
    };
    guardianRelationshipLabel?: string;
    journeyDefinitionKey?: string;
  },
): Promise<{
  applicationId: string;
  householdId: string;
  studentProfileId: string;
  journeyId: string;
}> {
  assertCapability(context, "enrollment.apply");
  if (!context.actorPersonId) throw new Error("Guardian identity is required");
  const actorPersonId = context.actorPersonId;

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({
        applicationId: applications.id,
        householdId: applications.householdId,
        studentProfileId: applications.studentProfileId,
      })
      .from(applications)
      .where(eq(applications.idempotencyKey, input.idempotencyKey))
      .limit(1);

    if (existing) {
      const [existingJourney] = await tx
        .select({ id: journeys.id })
        .from(journeys)
        .where(
          and(
            eq(journeys.participantType, "application"),
            eq(journeys.participantId, existing.applicationId),
          ),
        )
        .limit(1);

      if (!existingJourney) {
        throw new Error("Existing application is missing its enrollment Journey");
      }

      return {
        applicationId: existing.applicationId,
        householdId: existing.householdId,
        studentProfileId: existing.studentProfileId,
        journeyId: existingJourney.id,
      };
    }

    const [program] = await tx
      .select({ id: programs.id, organizationId: programs.organizationId })
      .from(programs)
      .where(eq(programs.id, input.programId))
      .limit(1);

    if (!program) throw new Error("Program not found");
    assertProgramScope(context, input.programId);

    let householdId = input.householdId;

    if (householdId) {
      const [membership] = await tx
        .select({ id: householdMemberships.id })
        .from(householdMemberships)
        .where(
          and(
            eq(householdMemberships.householdId, householdId),
            eq(householdMemberships.personId, actorPersonId),
          ),
        )
        .limit(1);

      if (!membership) {
        throw new Error("Guardian is not a member of the supplied Household");
      }
    } else {
      const [household] = await tx
        .insert(households)
        .values({
          displayName:
            input.householdDisplayName ??
            `${input.student.legalLastName} Household`,
        })
        .returning({ id: households.id });

      if (!household) throw new Error("Failed to create Household");
      householdId = household.id;

      await tx.insert(householdMemberships).values({
        householdId,
        personId: actorPersonId,
        relationshipLabel: "guardian",
        isPrimaryContact: true,
      });
    }

    const [studentPerson] = await tx
      .insert(people)
      .values({
        legalFirstName: input.student.legalFirstName,
        legalLastName: input.student.legalLastName,
        preferredName: input.student.preferredName,
      })
      .returning({ id: people.id });

    if (!studentPerson) throw new Error("Failed to create Student Person");

    await tx.insert(householdMemberships).values({
      householdId,
      personId: studentPerson.id,
      relationshipLabel: "student",
      isPrimaryContact: false,
    });

    await tx.insert(guardianRelationships).values({
      guardianPersonId: actorPersonId,
      studentPersonId: studentPerson.id,
      relationshipLabel: input.guardianRelationshipLabel ?? "parent",
    });

    const [studentProfile] = await tx
      .insert(studentProfiles)
      .values({
        personId: studentPerson.id,
        gradeLevel: input.student.gradeLevel,
      })
      .returning({ id: studentProfiles.id });

    if (!studentProfile) throw new Error("Failed to create StudentProfile");

    const [application] = await tx
      .insert(applications)
      .values({
        householdId,
        studentProfileId: studentProfile.id,
        programId: input.programId,
        stage: "application",
        idempotencyKey: input.idempotencyKey,
        submittedByPersonId: actorPersonId,
        submittedAt: new Date(),
      })
      .returning({ id: applications.id });

    if (!application) throw new Error("Failed to create Application");

    const definitionKey = input.journeyDefinitionKey ?? "family-enrollment";

    const [definition] = await tx
      .select()
      .from(journeyDefinitions)
      .where(
        and(
          eq(journeyDefinitions.key, definitionKey),
          eq(journeyDefinitions.active, true),
        ),
      )
      .orderBy(journeyDefinitions.createdAt)
      .limit(1);

    if (!definition) {
      throw new Error(`Journey definition not found: ${definitionKey}`);
    }

    const [journey] = await tx
      .insert(journeys)
      .values({
        type: definition.key,
        status: "in_progress",
        participantType: "application",
        participantId: application.id,
        organizationId: program.organizationId,
        programId: input.programId,
        ownerPersonId: actorPersonId,
        journeyDefinitionId: definition.id,
        definitionVersion: definition.version,
        startedAt: new Date(),
      })
      .returning({ id: journeys.id });

    if (!journey) throw new Error("Failed to create Enrollment Journey");

    const config =
      definition.configuration as EnrollmentJourneyConfiguration;
    const requirementDefinitions = config.requirements ?? [];

    if (requirementDefinitions.length > 0) {
      await tx.insert(journeyRequirements).values(
        requirementDefinitions.map((requirement) => ({
          journeyId: journey.id,
          key: requirement.key,
          title: requirement.title,
          blocking: requirement.blocking ?? false,
          status:
            requirement.owner === "can"
              ? ("needs_can" as const)
              : requirement.owner === "third_party"
                ? ("waiting_third_party" as const)
                : ("needs_you" as const),
        })),
      );
    }

    await tx.insert(domainEvents).values({
      eventType: EventTypes.ApplicationStarted,
      aggregateType: "application",
      aggregateId: application.id,
      actorPersonId: actorPersonId,
      payload: {
        householdId,
        studentProfileId: studentProfile.id,
        programId: input.programId,
        journeyId: journey.id,
      },
    });

    await tx.insert(auditEvents).values({
      actorPersonId: actorPersonId,
      action: "application.start",
      resourceType: "application",
      resourceId: application.id,
      scope: {
        organizationId: program.organizationId,
        programId: input.programId,
      },
      after: {
        stage: "application",
        householdId,
        studentProfileId: studentProfile.id,
      },
      context: {
        requestId: context.requestId ?? null,
        idempotencyKey: input.idempotencyKey,
      },
    });

    return {
      applicationId: application.id,
      householdId,
      studentProfileId: studentProfile.id,
      journeyId: journey.id,
    };
  });
}

export async function acceptApplication(
  context: CommandContext,
  applicationId: string,
  decisionNote?: string,
): Promise<void> {
  assertCapability(context, "enrollment.decide");

  await db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(applications)
      .where(eq(applications.id, applicationId))
      .limit(1);

    if (!current) throw new Error("Application not found");
    assertProgramScope(context, current.programId);
    if (current.stage === "accepted") return;

    const decidedAt = new Date();

    await tx
      .update(applications)
      .set({
        stage: "accepted",
        decidedAt,
        decisionNote,
        updatedAt: decidedAt,
      })
      .where(eq(applications.id, applicationId));

    await tx.insert(domainEvents).values({
      eventType: EventTypes.ApplicationAccepted,
      aggregateType: "application",
      aggregateId: applicationId,
      actorPersonId: context.actorPersonId,
      payload: {
        studentProfileId: current.studentProfileId,
        programId: current.programId,
      },
    });

    await tx.insert(auditEvents).values({
      actorPersonId: context.actorPersonId,
      action: "application.accept",
      resourceType: "application",
      resourceId: applicationId,
      scope: { programId: current.programId },
      before: { stage: current.stage },
      after: { stage: "accepted" },
      context: {
        requestId: context.requestId ?? null,
        decisionNote: decisionNote ?? null,
      },
    });
  });
}

export { completeJourneyRequirement } from "@/modules/journeys/complete-requirement";

export async function activateEnrollmentFromApplication(
  context: CommandContext,
  applicationId: string,
  schoolYearId: string,
): Promise<string> {
  assertCapability(context, "enrollment.activate");

  return db.transaction(async (tx) => {
    const [application] = await tx
      .select()
      .from(applications)
      .where(eq(applications.id, applicationId))
      .limit(1);

    if (!application) throw new Error("Application not found");
    assertProgramScope(context, application.programId);
    if (application.stage !== "accepted") {
      throw new Error("Application must be accepted before activation");
    }

    const [journey] = await tx
      .select()
      .from(journeys)
      .where(
        and(
          eq(journeys.participantType, "application"),
          eq(journeys.participantId, applicationId),
        ),
      )
      .limit(1);

    if (!journey || journey.status !== "ready") {
      throw new Error("Enrollment Journey must be ready before activation");
    }

    const [existing] = await tx
      .select({ id: enrollments.id })
      .from(enrollments)
      .where(
        and(
          eq(enrollments.studentProfileId, application.studentProfileId),
          eq(enrollments.kind, "program"),
          eq(enrollments.programId, application.programId),
          eq(enrollments.schoolYearId, schoolYearId),
          eq(enrollments.status, "active"),
        ),
      )
      .limit(1);

    if (existing) return existing.id;

    const [enrollment] = await tx
      .insert(enrollments)
      .values({
        studentProfileId: application.studentProfileId,
        kind: "program",
        status: "active",
        organizationId: (
          await tx
            .select({ organizationId: programs.organizationId })
            .from(programs)
            .where(eq(programs.id, application.programId))
            .limit(1)
        )[0]!.organizationId,
        programId: application.programId,
        schoolYearId,
        startedAt: new Date(),
      })
      .returning({ id: enrollments.id });

    if (!enrollment) throw new Error("Failed to activate Enrollment");

    const activatedAt = new Date();

    await tx
      .update(journeys)
      .set({
        status: "active",
        completedAt: activatedAt,
        updatedAt: activatedAt,
      })
      .where(eq(journeys.id, journey.id));

    await tx.insert(domainEvents).values({
      eventType: EventTypes.EnrollmentActivated,
      aggregateType: "enrollment",
      aggregateId: enrollment.id,
      actorPersonId: context.actorPersonId,
      payload: {
        applicationId,
        studentProfileId: application.studentProfileId,
        programId: application.programId,
        schoolYearId,
      },
    });

    await tx.insert(auditEvents).values({
      actorPersonId: context.actorPersonId,
      action: "enrollment.activate",
      resourceType: "enrollment",
      resourceId: enrollment.id,
      scope: { programId: application.programId },
      after: {
        status: "active",
        kind: "program",
        schoolYearId,
      },
      context: {
        requestId: context.requestId ?? null,
        applicationId,
        journeyId: journey.id,
      },
    });

    return enrollment.id;
  });
}
