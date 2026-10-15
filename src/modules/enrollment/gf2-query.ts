import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  applications,
  guardianRelationships,
  households,
  journeyRequirements,
  journeys,
  people,
  programs,
  studentProfiles,
} from "@/db/schema";
import {
  assertCapability,
  assertProgramScope,
  AuthorizationError,
  type CommandContext,
} from "@/domain/command-context";

export type EnrollmentCase = {
  application: {
    id: string;
    stage: string;
    submittedAt: Date | null;
    decidedAt: Date | null;
    decisionNote: string | null;
  };
  household: {
    id: string;
    displayName: string;
  };
  student: {
    studentProfileId: string;
    personId: string;
    displayName: string;
    gradeLevel: string | null;
  };
  program: {
    id: string;
    name: string;
    type: string;
    status: string;
  };
  journey: {
    id: string;
    status: string;
    requirements: Array<{
      id: string;
      key: string;
      title: string;
      status: string;
      blocking: boolean;
    }>;
  };
};

export async function getEnrollmentCase(
  context: CommandContext,
  applicationId: string,
): Promise<EnrollmentCase> {
  assertCapability(context, "enrollment.read");
  if (!context.actorPersonId) {
    throw new AuthorizationError("enrollment relationship/scope");
  }

  const [record] = await db
    .select({
      applicationId: applications.id,
      applicationStage: applications.stage,
      submittedAt: applications.submittedAt,
      decidedAt: applications.decidedAt,
      decisionNote: applications.decisionNote,
      submittedByPersonId: applications.submittedByPersonId,
      householdId: households.id,
      householdDisplayName: households.displayName,
      studentProfileId: studentProfiles.id,
      studentPersonId: studentProfiles.personId,
      gradeLevel: studentProfiles.gradeLevel,
      preferredName: people.preferredName,
      legalFirstName: people.legalFirstName,
      legalLastName: people.legalLastName,
      programId: programs.id,
      programName: programs.name,
      programType: programs.type,
      programStatus: programs.status,
    })
    .from(applications)
    .innerJoin(households, eq(households.id, applications.householdId))
    .innerJoin(
      studentProfiles,
      eq(studentProfiles.id, applications.studentProfileId),
    )
    .innerJoin(people, eq(people.id, studentProfiles.personId))
    .innerJoin(programs, eq(programs.id, applications.programId))
    .where(eq(applications.id, applicationId))
    .limit(1);

  if (!record) throw new Error("Application not found");

  let allowed = record.submittedByPersonId === context.actorPersonId;

  if (!allowed) {
    const [guardian] = await db
      .select({ id: guardianRelationships.id })
      .from(guardianRelationships)
      .where(
        eq(
          guardianRelationships.guardianPersonId,
          context.actorPersonId,
        ),
      )
      .limit(1);

    if (guardian) allowed = true;
  }

  if (!allowed) {
    assertProgramScope(context, record.programId);
    const scopedPrograms = context.scope.programIds;
    allowed = Boolean(scopedPrograms?.includes(record.programId));
  }

  if (!allowed) {
    throw new AuthorizationError("enrollment relationship/scope");
  }

  const [journey] = await db
    .select({
      id: journeys.id,
      status: journeys.status,
    })
    .from(journeys)
    .where(eq(journeys.participantId, record.applicationId))
    .limit(1);

  if (!journey) {
    throw new Error("Enrollment Journey not found");
  }

  const requirements = await db
    .select({
      id: journeyRequirements.id,
      key: journeyRequirements.key,
      title: journeyRequirements.title,
      status: journeyRequirements.status,
      blocking: journeyRequirements.blocking,
    })
    .from(journeyRequirements)
    .where(eq(journeyRequirements.journeyId, journey.id))
    .orderBy(asc(journeyRequirements.createdAt));

  return {
    application: {
      id: record.applicationId,
      stage: record.applicationStage,
      submittedAt: record.submittedAt,
      decidedAt: record.decidedAt,
      decisionNote: record.decisionNote,
    },
    household: {
      id: record.householdId,
      displayName: record.householdDisplayName,
    },
    student: {
      studentProfileId: record.studentProfileId,
      personId: record.studentPersonId,
      displayName:
        record.preferredName ??
        `${record.legalFirstName} ${record.legalLastName}`,
      gradeLevel: record.gradeLevel,
    },
    program: {
      id: record.programId,
      name: record.programName,
      type: record.programType,
      status: record.programStatus,
    },
    journey: {
      id: journey.id,
      status: journey.status,
      requirements,
    },
  };
}
