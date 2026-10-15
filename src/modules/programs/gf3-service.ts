import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  auditEvents,
  calendarEvents,
  domainEvents,
  journeyDefinitions,
  journeyRequirements,
  journeys,
  organizations,
  programs,
  sites,
} from "@/db/schema";
import {
  assertCapability,
  type CommandContext,
} from "@/domain/command-context";
import { EventTypes } from "@/domain/event-types";

type LaunchRequirementDefinition = {
  key: string;
  title: string;
  blocking?: boolean;
  owner?: "partner" | "can" | "third_party";
};

type LaunchJourneyConfiguration = {
  requirements?: LaunchRequirementDefinition[];
};

export async function startProgramLaunch(
  context: CommandContext,
  input: {
    hostOrganizationId: string;
    siteId?: string;
    jurisdictionId: string;
    type:
      | "church_hosted_academy"
      | "high_school_extension"
      | "full_school"
      | "microschool"
      | "hybrid_program"
      | "homeschool_cohort"
      | "summer_enrichment";
    name: string;
    slug: string;
    gradeRange: { min: string; max: string };
    deliveryModel: {
      onsite?: boolean;
      asynchronous?: boolean;
      liveOnline?: boolean;
      onsiteDaysPerWeek?: number;
    };
    academicProviderOrganizationId: string;
    creditIssuingOrganizationId: string;
    accreditationAuthorityOrganizationId?: string;
    journeyDefinitionKey?: string;
  },
): Promise<{ programId: string; journeyId: string }> {
  assertCapability(context, "program.launch.start");

  return db.transaction(async (tx) => {
    const [host] = await tx
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.id, input.hostOrganizationId))
      .limit(1);

    if (!host) throw new Error("Host Organization not found");

    if (input.siteId) {
      const [site] = await tx
        .select({ organizationId: sites.organizationId })
        .from(sites)
        .where(eq(sites.id, input.siteId))
        .limit(1);

      if (!site) throw new Error("Site not found");
      if (site.organizationId !== input.hostOrganizationId) {
        throw new Error("Site must belong to the host Organization");
      }
    }

    const [program] = await tx
      .insert(programs)
      .values({
        organizationId: input.hostOrganizationId,
        siteId: input.siteId,
        jurisdictionId: input.jurisdictionId,
        type: input.type,
        status: "launching",
        name: input.name,
        slug: input.slug,
        gradeRange: input.gradeRange,
        deliveryModel: input.deliveryModel,
        hostOrganizationId: input.hostOrganizationId,
        academicProviderOrganizationId: input.academicProviderOrganizationId,
        creditIssuingOrganizationId: input.creditIssuingOrganizationId,
        accreditationAuthorityOrganizationId:
          input.accreditationAuthorityOrganizationId,
      })
      .returning({ id: programs.id });

    if (!program) throw new Error("Failed to create Program");

    const definitionKey = input.journeyDefinitionKey ?? "program-launch";

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
        participantType: "program",
        participantId: program.id,
        organizationId: input.hostOrganizationId,
        siteId: input.siteId,
        programId: program.id,
        ownerPersonId: context.actorPersonId,
        definitionVersion: definition.version,
        startedAt: new Date(),
      })
      .returning({ id: journeys.id });

    if (!journey) throw new Error("Failed to create Launch Journey");

    const config = definition.configuration as LaunchJourneyConfiguration;
    const requirements = config.requirements ?? [];

    if (requirements.length > 0) {
      await tx.insert(journeyRequirements).values(
        requirements.map((requirement) => ({
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
      eventType: EventTypes.ProgramLaunchStarted,
      aggregateType: "program",
      aggregateId: program.id,
      actorPersonId: context.actorPersonId,
      payload: {
        hostOrganizationId: input.hostOrganizationId,
        siteId: input.siteId ?? null,
        programType: input.type,
        journeyId: journey.id,
      },
    });

    await tx.insert(auditEvents).values({
      actorPersonId: context.actorPersonId,
      action: "program.launch.start",
      resourceType: "program",
      resourceId: program.id,
      scope: {
        organizationId: input.hostOrganizationId,
        siteId: input.siteId ?? null,
        programId: program.id,
      },
      after: {
        status: "launching",
        type: input.type,
        academicProviderOrganizationId: input.academicProviderOrganizationId,
        creditIssuingOrganizationId: input.creditIssuingOrganizationId,
      },
      context: { requestId: context.requestId ?? null },
    });

    return { programId: program.id, journeyId: journey.id };
  });
}

export async function createProgramOrientation(
  context: CommandContext,
  input: {
    programId: string;
    title?: string;
    startsAt: Date;
    endsAt?: Date;
    timezone: string;
  },
): Promise<string> {
  assertCapability(context, "calendar.event.create");

  return db.transaction(async (tx) => {
    const [program] = await tx
      .select({
        id: programs.id,
        organizationId: programs.organizationId,
        siteId: programs.siteId,
      })
      .from(programs)
      .where(eq(programs.id, input.programId))
      .limit(1);

    if (!program) throw new Error("Program not found");

    const [existing] = await tx
      .select({ id: calendarEvents.id })
      .from(calendarEvents)
      .where(
        and(
          eq(calendarEvents.sourceType, "program_orientation"),
          eq(calendarEvents.sourceId, input.programId),
        ),
      )
      .limit(1);

    if (existing) return existing.id;

    const [event] = await tx
      .insert(calendarEvents)
      .values({
        type: "orientation",
        title: input.title ?? "CAN Program Orientation",
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        timezone: input.timezone,
        organizationId: program.organizationId,
        siteId: program.siteId,
        programId: program.id,
        sourceType: "program_orientation",
        sourceId: program.id,
        createdByPersonId: context.actorPersonId,
      })
      .returning({ id: calendarEvents.id });

    if (!event) throw new Error("Failed to create orientation event");

    await tx.insert(domainEvents).values({
      eventType: EventTypes.CalendarEventCreated,
      aggregateType: "calendar_event",
      aggregateId: event.id,
      actorPersonId: context.actorPersonId,
      payload: {
        programId: program.id,
        type: "orientation",
      },
    });

    return event.id;
  });
}

export async function activateProgram(
  context: CommandContext,
  programId: string,
): Promise<void> {
  assertCapability(context, "program.activate");

  await db.transaction(async (tx) => {
    const [program] = await tx
      .select()
      .from(programs)
      .where(eq(programs.id, programId))
      .limit(1);

    if (!program) throw new Error("Program not found");
    if (program.status === "active") return;

    const [journey] = await tx
      .select()
      .from(journeys)
      .where(
        and(
          eq(journeys.participantType, "program"),
          eq(journeys.participantId, programId),
        ),
      )
      .limit(1);

    if (!journey || journey.status !== "ready") {
      throw new Error("Launch Journey must be ready before Program activation");
    }

    const activatedAt = new Date();

    await tx
      .update(programs)
      .set({ status: "active", updatedAt: activatedAt })
      .where(eq(programs.id, programId));

    await tx
      .update(journeys)
      .set({
        status: "active",
        completedAt: activatedAt,
        updatedAt: activatedAt,
      })
      .where(eq(journeys.id, journey.id));

    await tx.insert(domainEvents).values({
      eventType: EventTypes.ProgramActivated,
      aggregateType: "program",
      aggregateId: programId,
      actorPersonId: context.actorPersonId,
      payload: {
        organizationId: program.organizationId,
        siteId: program.siteId,
        type: program.type,
      },
    });

    await tx.insert(auditEvents).values({
      actorPersonId: context.actorPersonId,
      action: "program.activate",
      resourceType: "program",
      resourceId: programId,
      scope: {
        organizationId: program.organizationId,
        siteId: program.siteId,
        programId,
      },
      before: { status: program.status },
      after: { status: "active" },
      context: {
        requestId: context.requestId ?? null,
        journeyId: journey.id,
      },
    });
  });
}
