import { and, eq } from "drizzle-orm";
import type { db } from "@/db/client";
import {
  journeyDefinitions,
  journeyRequirements,
  journeys,
} from "@/db/schema";
import { enrollmentFormSchema, type EnrollmentForm } from "@/domain/enrollment-form";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Any handle that can write the Journey tables: the db client or a transaction. */
export type JourneyWriter = Pick<Transaction, "select" | "insert">;

export type JourneyRequirementDefinition = {
  key: string;
  title: string;
  blocking?: boolean;
  /** Owner persona label; only "can" and "third_party" change the initial status. */
  owner?: string;
  enrollmentForm?: EnrollmentForm;
  /** Instructions for evidence required by this canonical Journey requirement. */
  evidenceInstructions?: string;
  /** Requires an authorized review workflow rather than school self-attestation. */
  evidenceReviewRequired?: boolean;
};

export type JourneyDefinitionConfiguration = {
  requirements?: JourneyRequirementDefinition[];
};

export type InitialRequirementStatus =
  | "needs_you"
  | "needs_can"
  | "waiting_third_party";

/** Initial requirement status derived from the definition's owner label. */
export function initialRequirementStatus(
  owner: string | undefined,
): InitialRequirementStatus {
  if (owner === "can") return "needs_can";
  if (owner === "third_party") return "waiting_third_party";
  return "needs_you";
}

/** Build the journey_requirements rows for a new Journey. Pure; no db access. */
export function materializeJourneyRequirements(
  journeyId: string,
  configuration: JourneyDefinitionConfiguration,
): Array<{
  journeyId: string;
  key: string;
  title: string;
  blocking: boolean;
  status: InitialRequirementStatus;
  metadata?: { enrollmentForm?: EnrollmentForm; evidenceInstructions?: string; evidenceReviewRequired?: boolean };
}> {
  return (configuration.requirements ?? []).map((requirement) => ({
    journeyId,
    key: requirement.key,
    title: requirement.title,
    blocking: requirement.blocking ?? false,
    status: initialRequirementStatus(requirement.owner),
    ...((requirement.enrollmentForm === undefined && !requirement.evidenceInstructions?.trim() && !requirement.evidenceReviewRequired) ? {} :
      { metadata: {
        ...(requirement.enrollmentForm === undefined ? {} : { enrollmentForm: enrollmentFormSchema.parse(requirement.enrollmentForm) }),
        ...(requirement.evidenceInstructions?.trim() ? { evidenceInstructions: requirement.evidenceInstructions.trim() } : {}),
        ...(requirement.evidenceReviewRequired ? { evidenceReviewRequired: true } : {}),
      } }),
  }));
}

/**
 * Instantiate a Journey from the earliest-created active definition matching
 * `definitionKey`, materializing its requirements. Throws when no active
 * definition exists. Domain events and audit entries stay with the caller.
 */
export async function instantiateJourneyFromDefinition(
  tx: JourneyWriter,
  input: {
    definitionKey: string;
    subjectType: string;
    subjectId: string;
    organizationId?: string | null;
    siteId?: string | null;
    programId?: string | null;
    ownerPersonId?: string | null;
    /** Label used in the defensive insert-failure error (e.g. "Enrollment"). */
    insertErrorLabel?: string;
  },
): Promise<{ journeyId: string; requirementCount: number }> {
  const [definition] = await tx
    .select()
    .from(journeyDefinitions)
    .where(
      and(
        eq(journeyDefinitions.key, input.definitionKey),
        eq(journeyDefinitions.active, true),
      ),
    )
    .orderBy(journeyDefinitions.createdAt)
    .limit(1);

  if (!definition) {
    throw new Error(`Journey definition not found: ${input.definitionKey}`);
  }
  const configuration = definition.configuration as JourneyDefinitionConfiguration;
  if (configuration.requirements?.some(requirement => requirement.enrollmentForm !== undefined) &&
      definition.owningOrganizationId && definition.owningOrganizationId !== input.organizationId)
    throw new Error("Journey definition belongs to another organization.");

  const [journey] = await tx
    .insert(journeys)
    .values({
      type: definition.key,
      status: "in_progress",
      participantType: input.subjectType,
      participantId: input.subjectId,
      organizationId: input.organizationId,
      siteId: input.siteId,
      programId: input.programId,
      ownerPersonId: input.ownerPersonId,
      journeyDefinitionId: definition.id,
      definitionVersion: definition.version,
      startedAt: new Date(),
    })
    .returning({ id: journeys.id });

  if (!journey) {
    throw new Error(
      input.insertErrorLabel
        ? `Failed to create ${input.insertErrorLabel} Journey`
        : "Failed to create Journey",
    );
  }

  const rows = materializeJourneyRequirements(
    journey.id,
    configuration,
  );

  if (rows.length > 0) {
    await tx.insert(journeyRequirements).values(rows);
  }

  return { journeyId: journey.id, requirementCount: rows.length };
}
