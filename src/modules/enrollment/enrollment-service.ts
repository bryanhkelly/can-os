import { db } from "@/db/client";
import {
admissionSeatPools,
applications,
enrollments,
guardianRelationships,
householdMemberships,
households,
journeys,
journeyRequirements,
people,
programs,
schoolYears,
studentProfiles
} from "@/db/schema";
import { assertApplicationAcceptance,assertApplicationRetryOwnership } from "@/domain/admissions-transitions";
import { lockAttendanceConfigurationAtSite } from "@/domain/attendance-configuration-lock";
import {
assertCapability,
assertProgramScope,
AuthorizationError,
type CommandContext,
} from "@/domain/command-context";
import { EventTypes } from "@/domain/event-types";
import { assertEnrollmentFormApproved, enrollmentJourneyDefinitionKey } from "@/domain/enrollment-form";
import { lockAdmissionsApplication } from "@/domain/admissions-application-lock";
import { assertApplicationOffersAllowed } from "@/domain/admissions-policy";
import { instantiateJourneyFromDefinition } from "@/modules/journeys/instantiate";
import { requireChurchHostedOperatingServices } from "@/modules/programs/program-site-authorization.server";
import { emitEvent,writeAudit } from "@/platform/mutation";
import { and,eq } from "drizzle-orm";

/** Enrollment commands must never interpret an absent program grant as global access. */
function requireEnrollmentProgramScope(context:CommandContext,programId:string):void {
  if (!context.scope.programIds?.includes(programId)) throw new AuthorizationError(`program scope: ${programId}`);
  assertProgramScope(context,programId);
}

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
    /** Only the verified guardian-facing server command may set this. */
    parentSelfService?: true;
  },
): Promise<{
  applicationId: string;
  householdId: string;
  studentProfileId: string;
  journeyId: string;
}> {
  assertCapability(context, "enrollment.apply");
  // Check current program authorization even on an idempotency retry. A prior
  // submission does not preserve access after the guardian grant is revoked.
  if (!context.scope.programIds?.includes(input.programId)) {
    throw new AuthorizationError(`program scope: ${input.programId}`);
  }
  if (!context.actorPersonId) throw new Error("Guardian identity is required");
  const actorPersonId = context.actorPersonId;

  return db.transaction(async (tx) => {
    if (input.parentSelfService) {
      const [opening] = await tx.select({status:programs.status,organizationId:programs.organizationId,
        siteId:programs.siteId}).from(programs).where(eq(programs.id,input.programId)).for("share").limit(1);
      if (!opening || opening.status !== "active" || !opening.siteId ||
          !context.scope.organizationIds?.includes(opening.organizationId) ||
          !context.scope.siteIds?.includes(opening.siteId))
        throw new AuthorizationError("active school and authorized family application scope");
      await requireChurchHostedOperatingServices(tx,input.programId,["admissions","school_of_record"]);
    }
    const [existing] = await tx
      .select({
        applicationId: applications.id,
        householdId: applications.householdId,
        studentProfileId: applications.studentProfileId,
        submittedByPersonId: applications.submittedByPersonId,
        programId: applications.programId,
      })
      .from(applications)
      .where(eq(applications.idempotencyKey, input.idempotencyKey))
      .limit(1);

    if (existing) {
      assertApplicationRetryOwnership(existing,actorPersonId,input.programId);
      // Ownership of an old submission is not sufficient if household access was revoked.
      const [activeMembership] = await tx.select({id:householdMemberships.id}).from(householdMemberships)
        .where(and(eq(householdMemberships.householdId,existing.householdId),eq(householdMemberships.personId,actorPersonId))).limit(1);
      if (!activeMembership) throw new Error("Guardian is no longer a member of the Application Household");
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
      .select({ id: programs.id, organizationId: programs.organizationId, metadata: programs.metadata })
      .from(programs)
      .where(eq(programs.id, input.programId))
      .limit(1);

    if (!program) throw new Error("Program not found");
    requireEnrollmentProgramScope(context, input.programId);

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
      ...(input.parentSelfService ? {canViewAcademics:false,canManageEnrollment:false,
        canSubmitAttendanceExcuse:false,
        metadata:{verification:"pending",source:"authenticated_guardian_application"}} : {}),
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

    const definitionKey = enrollmentJourneyDefinitionKey(program.metadata, input.journeyDefinitionKey);

    const { journeyId } = await instantiateJourneyFromDefinition(tx, {
      definitionKey,
      subjectType: "application",
      subjectId: application.id,
      organizationId: program.organizationId,
      programId: input.programId,
      ownerPersonId: actorPersonId,
      insertErrorLabel: "Enrollment",
    });

    await emitEvent(tx, {
      eventType: EventTypes.ApplicationStarted,
      aggregateType: "application",
      aggregateId: application.id,
      actorPersonId: actorPersonId,
      payload: {
        householdId,
        studentProfileId: studentProfile.id,
        programId: input.programId,
        journeyId,
      },
    });

    await writeAudit(tx, context, {
      action: "application.start",
      entityType: "application",
      entityId: application.id,
      scope: {
        organizationId: program.organizationId,
        programId: input.programId,
      },
      after: {
        stage: "application",
        householdId,
        studentProfileId: studentProfile.id,
      },
      contextExtras: { idempotencyKey: input.idempotencyKey },
    });

    return {
      applicationId: application.id,
      householdId,
      studentProfileId: studentProfile.id,
      journeyId,
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
    await lockAdmissionsApplication(tx, applicationId);
    const [current] = await tx
      .select()
      .from(applications)
      .where(eq(applications.id, applicationId))
      .for("update")
      .limit(1);

    if (!current) throw new Error("Application not found");
    requireEnrollmentProgramScope(context, current.programId);
    // Admission acceptance under CAN's school-of-record authority requires
    // live, independently verified church/CAN services; an inquiry does not.
    await requireChurchHostedOperatingServices(tx,current.programId,[
      "admissions","school_of_record",
    ]);
    assertApplicationOffersAllowed(current);
    if (current.stage === "accepted") return;
    assertApplicationAcceptance(current.stage);

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

    await emitEvent(tx, {
      eventType: EventTypes.ApplicationAccepted,
      aggregateType: "application",
      aggregateId: applicationId,
      actorPersonId: context.actorPersonId,
      payload: {
        studentProfileId: current.studentProfileId,
        programId: current.programId,
      },
    });

    await writeAudit(tx, {
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
    await lockAdmissionsApplication(tx, applicationId);
    const [application] = await tx
      .select()
      .from(applications)
      .where(eq(applications.id, applicationId))
      .for("update")
      .limit(1);

    if (!application) throw new Error("Application not found");
    requireEnrollmentProgramScope(context, application.programId);
    await requireChurchHostedOperatingServices(tx,application.programId,[
      "admissions","school_of_record",
    ]);
    assertApplicationOffersAllowed(application);
    if (application.stage !== "accepted") {
      throw new Error("Application must be accepted before activation");
    }
    // Fail closed: the legacy activation path does not reserve seats or validate
    // accepted offers atomically. Configured pools require the forthcoming
    // transactional offer-to-enrollment service.
    const [seatPool] = await tx.select({ id: admissionSeatPools.id })
      .from(admissionSeatPools)
      .where(and(eq(admissionSeatPools.programId, application.programId),
        eq(admissionSeatPools.schoolYearId, schoolYearId)))
      .limit(1);
    if (seatPool) {
      throw new Error("Enrollment activation requires the seat-pool transaction workflow");
    }

    const [programForYear] = await tx.select({
      id: programs.id,
      organizationId: programs.organizationId,
      siteId: programs.siteId,
    }).from(programs).where(eq(programs.id, application.programId)).limit(1);
    const [schoolYear] = await tx.select({
      id: schoolYears.id,
      organizationId: schoolYears.organizationId,
      siteId: schoolYears.siteId,
      programId: schoolYears.programId,
    }).from(schoolYears).where(eq(schoolYears.id, schoolYearId)).limit(1);
    // GF23 establishes the Site's effective academic year. It may be shared
    // by multiple Programs at that Site, or explicitly program-scoped.
    // Site-less virtual programs require an explicitly program-scoped year.
    if (!programForYear || !schoolYear ||
        schoolYear.organizationId !== programForYear.organizationId) {
      throw new Error("School year must belong to the application's program or its host site");
    }
    const yearMatchesProgram = programForYear.siteId === null
      ? schoolYear.programId === application.programId
      : schoolYear.siteId === programForYear.siteId &&
        (schoolYear.programId === null || schoolYear.programId === application.programId);
    if (!yearMatchesProgram) {
      throw new Error("School year must belong to the application's program or its host site");
    }
    // Enrollment adds a new onsite roster member. Serialize with the
    // same site configuration lock that attendance marking holds.
    if (programForYear.siteId) {
      await lockAttendanceConfigurationAtSite(tx, programForYear.siteId);
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
      .for("update")
      .limit(1);

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

    if (!journey || journey.status !== "ready") {
      throw new Error("Enrollment Journey must be ready before activation");
    }
    const blockingRequirements = await tx.select({
      status: journeyRequirements.status, metadata: journeyRequirements.metadata, evidence: journeyRequirements.evidence,
    }).from(journeyRequirements).where(and(eq(journeyRequirements.journeyId, journey.id), eq(journeyRequirements.blocking, true)));
    if (blockingRequirements.some(requirement => requirement.status !== "complete"))
      throw new Error("Blocking enrollment requirements remain.");
    for (const requirement of blockingRequirements)
      assertEnrollmentFormApproved(requirement.metadata, requirement.evidence);

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

    await writeAudit(tx, {
      actorPersonId: context.actorPersonId,
      action: "journey.activate",
      resourceType: "journey",
      resourceId: journey.id,
      scope: { programId: application.programId },
      before: { status: journey.status },
      after: { status: "active" },
      context: {
        requestId: context.requestId ?? null,
        applicationId,
        enrollmentId: enrollment.id,
      },
    });

    await emitEvent(tx, {
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

    await writeAudit(tx, {
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
