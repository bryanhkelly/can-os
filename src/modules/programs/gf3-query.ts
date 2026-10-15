import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  calendarEvents,
  journeyRequirements,
  journeys,
  organizations,
  programs,
  sites,
} from "@/db/schema";
import {
  assertCapability,
  assertOrganizationScope,
  assertProgramScope,
  assertSiteScope,
  type CommandContext,
} from "@/domain/command-context";

export async function getProgramLaunchCase(
  context: CommandContext,
  programId: string,
) {
  assertCapability(context, "program.read");

  const [program] = await db
    .select({
      id: programs.id,
      name: programs.name,
      type: programs.type,
      status: programs.status,
      gradeRange: programs.gradeRange,
      deliveryModel: programs.deliveryModel,
      organizationId: programs.organizationId,
      hostOrganizationId: programs.hostOrganizationId,
      academicProviderOrganizationId: programs.academicProviderOrganizationId,
      creditIssuingOrganizationId: programs.creditIssuingOrganizationId,
      siteId: programs.siteId,
      hostName: organizations.name,
      siteName: sites.name,
      timezone: sites.timezone,
    })
    .from(programs)
    .innerJoin(organizations, eq(organizations.id, programs.hostOrganizationId))
    .leftJoin(sites, eq(sites.id, programs.siteId))
    .where(eq(programs.id, programId))
    .limit(1);

  if (!program) throw new Error("Program not found");

  assertProgramScope(context, program.id);
  assertOrganizationScope(context, program.organizationId);
  assertSiteScope(context, program.siteId);

  const [journey] = await db
    .select({ id: journeys.id, status: journeys.status })
    .from(journeys)
    .where(
      and(
        eq(journeys.participantType, "program"),
        eq(journeys.participantId, program.id),
      ),
    )
    .limit(1);

  const requirements = journey
    ? await db
        .select({
          id: journeyRequirements.id,
          key: journeyRequirements.key,
          title: journeyRequirements.title,
          status: journeyRequirements.status,
          blocking: journeyRequirements.blocking,
        })
        .from(journeyRequirements)
        .where(eq(journeyRequirements.journeyId, journey.id))
        .orderBy(asc(journeyRequirements.createdAt))
    : [];

  const orientation = (
    await db
      .select({
        id: calendarEvents.id,
        title: calendarEvents.title,
        startsAt: calendarEvents.startsAt,
        endsAt: calendarEvents.endsAt,
        timezone: calendarEvents.timezone,
      })
      .from(calendarEvents)
      .where(eq(calendarEvents.programId, program.id))
      .orderBy(asc(calendarEvents.startsAt))
  ).find((event) => event.title.toLowerCase().includes("orientation")) ?? null;

  return {
    program,
    journey: journey ? { ...journey, requirements } : null,
    orientation,
  };
}
