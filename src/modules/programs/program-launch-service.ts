import { db } from "@/db/client";
import { resolveProgramCreditMode, isExtendedLearningType, type ProgramType, type ProgramCreditMode } from "@/domain/program-offerings";
import {
journeys,
activities,
activitySeasons,
calendarEvents,
journeyRequirements,
organizations,
programs,
schoolYears,
sections,
sectionTeachers,
sites,
terms
} from "@/db/schema";
import { lockAttendanceConfigurationAtSite } from "@/domain/attendance-configuration-lock";
import {
assertCapability,
assertOrganizationScope,
assertProgramScope,
assertSiteScope,
type CommandContext,
} from "@/domain/command-context";
import { EventTypes } from "@/domain/event-types";
import { instantiateJourneyFromDefinition } from "@/modules/journeys/instantiate";
import { emitEvent,writeAudit } from "@/platform/mutation";
import { createProjectionIfAbsent } from "@/platform/calendar/projection";
import { and,eq,inArray,isNull,or } from "drizzle-orm";
import { evaluateSectionReadiness } from "./section-readiness-service";
import { lockLaunchTeacherClaims } from "@/modules/staffing/launch-staffing.server";
import { assertOpeningOperator,createOpeningHandoff,listOpeningHandoffs } from "./opening-handoff.server";
import { listExtendedSessionStaff } from "@/modules/activities/extended-learning-sessions.server";

export async function startProgramLaunch(
  context: CommandContext,
  input: {
    hostOrganizationId: string;
    siteId?: string;
    jurisdictionId: string;
    type: ProgramType;
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
    creditIssuingOrganizationId?: string;
    creditMode?: ProgramCreditMode;
    accreditationAuthorityOrganizationId?: string;
    journeyDefinitionKey?: string;
  },
): Promise<{ programId: string; journeyId: string }> {
  assertCapability(context, "program.launch.start");
  const creditMode = resolveProgramCreditMode(input);

  return db.transaction(async (tx) => {
    const [host] = await tx
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.id, input.hostOrganizationId))
      .limit(1);

    if (!host) throw new Error("Host Organization not found");
    assertOrganizationScope(context, input.hostOrganizationId);

    if (input.siteId) {
      const [site] = await tx
        .select({ organizationId: sites.organizationId })
        .from(sites)
        .where(eq(sites.id, input.siteId))
        .limit(1);

      if (!site) throw new Error("Site not found");
      assertSiteScope(context, input.siteId);
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
        creditIssuingOrganizationId: creditMode === "credit_bearing" ? input.creditIssuingOrganizationId : null,
        metadata: { creditMode },
        accreditationAuthorityOrganizationId:
          input.accreditationAuthorityOrganizationId,
      })
      .returning({ id: programs.id });

    if (!program) throw new Error("Failed to create Program");

    const definitionKey = input.journeyDefinitionKey ?? "program-launch";

    const { journeyId } = await instantiateJourneyFromDefinition(tx, {
      definitionKey,
      subjectType: "program",
      subjectId: program.id,
      organizationId: input.hostOrganizationId,
      siteId: input.siteId,
      programId: program.id,
      ownerPersonId: context.actorPersonId,
      insertErrorLabel: "Launch",
    });

    // Reuse the same Journey, but do not present traditional teacher/Section
    // provisioning as a requirement for a noncredit camp or after-school club.
    if (isExtendedLearningType(input.type) && creditMode === "non_credit") {
      await tx.update(journeyRequirements).set({
        key: "enrichment-session-readiness",
        title: "Dated enrichment sessions and onsite facilitators ready",
        updatedAt: new Date(),
      }).where(and(
        eq(journeyRequirements.journeyId, journeyId),
        eq(journeyRequirements.key, "teacher-readiness"),
      ));
    }

    await emitEvent(tx, {
      eventType: EventTypes.ProgramLaunchStarted,
      aggregateType: "program",
      aggregateId: program.id,
      actorPersonId: context.actorPersonId,
      payload: {
        hostOrganizationId: input.hostOrganizationId,
        siteId: input.siteId ?? null,
        programType: input.type,
        creditMode,
        journeyId,
      },
    });

    await writeAudit(tx, context, {
      action: "program.launch.start",
      entityType: "program",
      entityId: program.id,
      scope: {
        organizationId: input.hostOrganizationId,
        siteId: input.siteId ?? null,
        programId: program.id,
      },
      after: {
        status: "launching",
        type: input.type,
        creditMode,
        academicProviderOrganizationId: input.academicProviderOrganizationId,
        creditIssuingOrganizationId: creditMode === "credit_bearing" ? input.creditIssuingOrganizationId : null,
      },
    });

    return { programId: program.id, journeyId };
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
    assertProgramScope(context, input.programId);

    const projection = await createProjectionIfAbsent(tx, {
      type: "orientation",
      title: input.title ?? "CAN Program Orientation",
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      timezone: input.timezone,
      scope: {
        organizationId: program.organizationId,
        siteId: program.siteId,
        programId: program.id,
      },
      sourceType: "program_orientation",
      sourceId: program.id,
      createdByPersonId: context.actorPersonId,
    });
    if (!projection.created) return projection.id;

    await emitEvent(tx, {
      eventType: EventTypes.CalendarEventCreated,
      aggregateType: "calendar_event",
      aggregateId: projection.id,
      actorPersonId: context.actorPersonId,
      organizationId: program.organizationId,
      siteId: program.siteId,
      programId: program.id,
      payload: {
        programId: program.id,
        type: "orientation",
      },
    });
    await writeAudit(tx, context, {
      action: "program.orientation.schedule",
      entityType: "calendar_event",
      entityId: projection.id,
      scope: {
        organizationId: program.organizationId,
        siteId: program.siteId,
        programId: program.id,
      },
      after: {
        title: input.title ?? "CAN Program Orientation",
        startsAt: input.startsAt.toISOString(),
        endsAt: input.endsAt?.toISOString() ?? null,
        timezone: input.timezone,
      },
      contextExtras: { sourceType: "program_orientation" },
    });

    return projection.id;
  });
}

export async function activateProgram(
  context: CommandContext,
  programId: string,
  handoff?: { recipientPersonId: string },
): Promise<void> {
  assertCapability(context, "program.activate");

  await db.transaction(async (tx) => {
    const [program] = await tx
      .select()
      .from(programs)
      .where(eq(programs.id, programId))
      .limit(1);

    if (!program) throw new Error("Program not found");
    assertProgramScope(context, programId);
    if (!context.scope.organizationIds?.includes(program.organizationId))
      throw new Error("Program activation requires the verified organization grant");
    if (program.siteId) {
      assertSiteScope(context, program.siteId);
      await lockAttendanceConfigurationAtSite(tx, program.siteId);
    }
    const [current] = await tx.select({ status: programs.status })
      .from(programs).where(eq(programs.id, programId)).limit(1);
    if (current?.status === "active") {
      const existing=await listOpeningHandoffs([programId],tx);
      if(handoff&&existing.length&&existing[0]?.ownerPersonId!==handoff.recipientPersonId)
        throw new Error("Program already opened with a different handoff recipient");
      return;
    }

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

    // A checked-off Journey alone does not establish instructional readiness.
    // Prevent activation of an onsite school without its academic timetable.
    if(program.deliveryModel.onsite && !program.siteId)
      throw new Error("Onsite program requires a host site before activation");
    const staffingEvidence:{sectionId:string;evidence:Record<string,unknown>}[]=[];
    const openingSectionIds:string[]=[];
    const noncreditExtended = isExtendedLearningType(program.type) &&
      program.creditIssuingOrganizationId === null;
    if (noncreditExtended) {
      if (!program.siteId) throw new Error("Noncredit enrichment requires a hosting site");
      const seasons = await tx.select({ id: activitySeasons.id }).from(activitySeasons)
        .innerJoin(activities, eq(activities.id, activitySeasons.activityId))
        .where(and(
          eq(activities.programId, program.id),
          eq(activities.siteId, program.siteId),
          inArray(activitySeasons.status, ["draft", "registration"]),
        ));
      if (!seasons.length)
        throw new Error("Plan an enrichment offering season before activating");
      const meetings = await tx.select({ metadata: calendarEvents.metadata })
        .from(calendarEvents).where(and(
          eq(calendarEvents.sourceType, "activity_season"),
          eq(calendarEvents.type, "extended_learning_session"),
          eq(calendarEvents.organizationId, program.organizationId),
          eq(calendarEvents.siteId, program.siteId),
          eq(calendarEvents.programId, program.id),
          inArray(calendarEvents.sourceId, seasons.map(row => row.id)),
        ));
      if (!meetings.length)
        throw new Error("Schedule dated enrichment sessions before activation");
      const currentStaff = await listExtendedSessionStaff(program.organizationId, program.siteId, tx);
      const staffIds = new Set(currentStaff.map(person => person.personId));
      if (meetings.some(event => {
        const detail = event.metadata.extendedLearningSession;
        const assigned = detail && typeof detail === "object" &&
          "facilitatorPersonId" in detail ? detail.facilitatorPersonId : null;
        return typeof assigned !== "string" || !staffIds.has(assigned) ||
          event.metadata.cancelled === true;
      })) throw new Error("Assign verified active onsite facilitators to all enrichment sessions");
    }
    if(program.siteId && !noncreditExtended){
      const activeYears=await tx.select({id:schoolYears.id})
       .from(schoolYears).where(and(eq(schoolYears.siteId,program.siteId),
        eq(schoolYears.organizationId,program.organizationId),
        eq(schoolYears.status,"active"),
        or(isNull(schoolYears.programId),eq(schoolYears.programId,program.id))));
      if(!activeYears.length)throw new Error(
        "Activate a school year in School-Year Studio before activating this program");
      const academicTerms=await tx.select({id:terms.id}).from(terms)
       .where(inArray(terms.schoolYearId,activeYears.map(y=>y.id)));
      const sectionRows=academicTerms.length?await tx.select({id:sections.id})
       .from(sections).where(and(eq(sections.programId,program.id),
        eq(sections.active,true),inArray(sections.termId,academicTerms.map(t=>t.id)))):[];
      if(!sectionRows.length)throw new Error(
        "Provision at least one section in the active school year before launch");
      const assignedTeachers=await tx.select({personId:sectionTeachers.personId}).from(sectionTeachers)
        .where(inArray(sectionTeachers.sectionId,sectionRows.map(section=>section.id)));
      await lockLaunchTeacherClaims(tx,[...new Set(assignedTeachers.map(teacher=>teacher.personId))]);
      for (const section of sectionRows) {
        openingSectionIds.push(section.id);
        const readiness=await evaluateSectionReadiness(section.id,tx,new Date(),"launch");
        const blockers=readiness.items.filter(item=>item.state==="blocked");
        if(blockers.length)throw new Error(
          "Section is not ready: "+blockers.map(item=>item.message).join(" "));
        const staffing=readiness.items.find(item=>item.key==="launch_staffing");
        if(staffing?.evidence)staffingEvidence.push({sectionId:section.id,evidence:staffing.evidence});
      }
    }
    if(program.siteId){
      if(!handoff?.recipientPersonId)throw new Error("Select a named receiving site operator before opening");
      await assertOpeningOperator(program,handoff.recipientPersonId,tx);
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

    const handoffActionId=program.siteId&&handoff?await createOpeningHandoff(tx,context,{
      program,recipientPersonId:handoff.recipientPersonId,journeyId:journey.id,
      openedAt:activatedAt,sectionIds:openingSectionIds,
    }):null;
    await emitEvent(tx, {
      eventType: EventTypes.ProgramActivated,
      aggregateType: "program",
      aggregateId: programId,
      actorPersonId: context.actorPersonId,
      payload: {
        organizationId: program.organizationId,
        siteId: program.siteId,
        type: program.type,
        handoffActionId,
      },
    });

    await writeAudit(tx, {
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
      after: { status: "active", staffing:staffingEvidence,handoffActionId },
      context: {
        requestId: context.requestId ?? null,
        journeyId: journey.id,
      },
    });
  });
}
