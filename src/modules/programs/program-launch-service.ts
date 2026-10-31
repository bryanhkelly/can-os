import { matchesProgramLaunchReplay } from "@/domain/program-launch-replay";
import { isLaunchOpeningDate, launchOpeningDate } from "@/domain/launch-opening-date";
import { db } from "@/db/client";
import { assertChurchHostedProviderIntent, assertChurchHostedActivationAuthorization } from "@/domain/church-hosted-provider";
import { resolveProgramCreditMode, isExtendedLearningType, type ProgramType, type ProgramCreditMode } from "@/domain/program-offerings";
import {
journeys,
journeyDefinitions,
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
import { and,eq,inArray,isNull,or,sql } from "drizzle-orm";
import { evaluateSectionReadiness } from "./section-readiness-service";
import { lockLaunchTeacherClaims } from "@/modules/staffing/launch-staffing.server";
import { assertOpeningOperator,createOpeningHandoff,listOpeningHandoffs } from "./opening-handoff.server";
import { listExtendedSessionStaff } from "@/modules/activities/extended-learning-sessions.server";
import { requireCurrentProgramSiteAuthorization } from "./program-site-authorization.server";
import { ensureExistingSitePublicationDraftForLaunch } from "@/modules/sites/site-public-provisioning.server";

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
    targetOpeningDate?: string;
  },
): Promise<{
  programId: string;
  journeyId: string;
  publicSiteDraft: {
    siteId: string; slug: string; host: string;
    status: "draft" | "published"; created: boolean;
  } | null;
}> {
  assertCapability(context, "program.launch.start");
  if (input.targetOpeningDate !== undefined && !isLaunchOpeningDate(input.targetOpeningDate))
    throw new Error("Target opening date must be a valid calendar date");
  const creditMode = resolveProgramCreditMode(input);

  return db.transaction(async (tx) => {
    const [host] = await tx
      .select({ id: organizations.id, type: organizations.type })
      .from(organizations)
      .where(eq(organizations.id, input.hostOrganizationId))
      .limit(1);

    if (!host) throw new Error("Host Organization not found");
    assertOrganizationScope(context, input.hostOrganizationId);
    // The host and academic institution can be independent organizations.
    // Never trust client-supplied provider IDs without checking the actual entities.
    const [academicProvider] = await tx.select({ id: organizations.id, type: organizations.type })
      .from(organizations).where(eq(organizations.id, input.academicProviderOrganizationId)).limit(1);
    const [creditIssuer] = input.creditIssuingOrganizationId
      ? await tx.select({ id: organizations.id, type: organizations.type })
          .from(organizations).where(eq(organizations.id, input.creditIssuingOrganizationId)).limit(1)
      : [];
    if (!academicProvider) throw new Error("Academic provider Organization not found");
    if (creditMode === "credit_bearing" && !creditIssuer) throw new Error("Credit issuer Organization not found");
    assertChurchHostedProviderIntent({
      programType: input.type,
      hostOrganizationId: host.id, hostOrganizationType: host.type,
      academicProviderOrganizationId: academicProvider.id,
      academicProviderOrganizationType: academicProvider.type,
      creditIssuingOrganizationId: creditIssuer?.id ?? null,
      creditMode,
    });

    let launchSite: { id: string; organizationId: string; slug: string } | null = null;
    if (input.siteId) {
      const [site] = await tx
        .select({ id: sites.id, organizationId: sites.organizationId, slug: sites.slug })
        .from(sites)
        .where(eq(sites.id, input.siteId))
        .limit(1);

      if (!site) throw new Error("Site not found");
      assertSiteScope(context, input.siteId);
      if (site.organizationId !== input.hostOrganizationId) {
        throw new Error("Site must belong to the host Organization");
      }
      launchSite = site;
    }

    // Serialize identical create attempts before the unique slug insert. A
    // retry must reuse its canonical Program/Journey and emit no second start.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"program-launch:" + input.hostOrganizationId + ":" + input.slug}))`);
    const [existing] = await tx.select().from(programs).where(and(
      eq(programs.organizationId, input.hostOrganizationId), eq(programs.slug, input.slug),
    )).for("update").limit(1);
    if (existing) {
      assertProgramScope(context, existing.id);
      if (existing.siteId) assertSiteScope(context, existing.siteId);
      const matches = matchesProgramLaunchReplay({
        ...existing,
        creditMode: typeof existing.metadata.creditMode === "string"
          ? existing.metadata.creditMode : existing.creditIssuingOrganizationId ? "credit_bearing" : "non_credit",
        targetOpeningDate: launchOpeningDate(existing.metadata),
      }, {
        ...input, creditMode,
        creditIssuingOrganizationId: creditMode === "credit_bearing" ? input.creditIssuingOrganizationId : null,
      });
      if (!matches || !["draft", "launching", "ready", "active"].includes(existing.status))
        throw new Error("This Program slug is already in use. Resume the existing launch or choose a different slug.");
      const savedJourneys = await tx.select({
        id: journeys.id, programId: journeys.programId, siteId: journeys.siteId,
        organizationId: journeys.organizationId,
      }).from(journeys).innerJoin(journeyDefinitions,
        eq(journeyDefinitions.id, journeys.journeyDefinitionId)).where(and(
        eq(journeys.participantType, "program"), eq(journeys.participantId, existing.id),
        eq(journeyDefinitions.key, input.journeyDefinitionKey ?? "program-launch"),
      )).limit(2);
      const savedJourney = savedJourneys[0];
      if (savedJourneys.length !== 1 || !savedJourney || savedJourney.programId !== existing.id ||
          savedJourney.organizationId !== existing.organizationId || savedJourney.siteId !== existing.siteId)
        throw new Error("The existing Program needs its canonical launch Journey reviewed. No duplicate launch was created.");
      const draft = launchSite
        ? await ensureExistingSitePublicationDraftForLaunch(tx, context, launchSite) : null;
      return { programId: existing.id, journeyId: savedJourney.id,
        publicSiteDraft: draft && launchSite ? { siteId: launchSite.id, ...draft } : null };
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
        metadata: { creditMode, ...(input.targetOpeningDate ? { targetOpeningDate: input.targetOpeningDate } : {}) },
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
        ...(input.targetOpeningDate ? { targetOpeningDate: input.targetOpeningDate } : {}),
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
        ...(input.targetOpeningDate ? { targetOpeningDate: input.targetOpeningDate } : {}),
        type: input.type,
        creditMode,
        academicProviderOrganizationId: input.academicProviderOrganizationId,
        creditIssuingOrganizationId: creditMode === "credit_bearing" ? input.creditIssuingOrganizationId : null,
      },
    });

    // Close the pre-existing-Site gap: a real Program launch creates (or
    // reuses) its Site's PRIVATE website address in this same transaction.
    // There is no change to Site/Program publication, admissions readiness,
    // publisher grants or DNS. Site-less Programs have no website to reserve.
    const draft = launchSite
      ? await ensureExistingSitePublicationDraftForLaunch(tx, context, launchSite)
      : null;
    return {
      programId: program.id, journeyId,
      publicSiteDraft: draft && launchSite ? { siteId: launchSite.id, ...draft } : null,
    };
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
    assertOrganizationScope(context, program.organizationId);
    assertSiteScope(context, program.siteId);

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
    // Resolve the caller's verified program/organization/site scope BEFORE any
    // institutional-policy result, so unrelated actors cannot discover whether
    // another organization's school has been approved to open.
    assertProgramScope(context, programId);
    if (!context.scope.organizationIds?.includes(program.organizationId))
      throw new Error("Program activation requires the verified organization grant");
    if (program.siteId) assertSiteScope(context, program.siteId);
    // Resolve host identity from the database, not user-submitted program type
    // or metadata. Church-owned sites cannot switch program type to evade the
    // independently approved CAN institutional services agreement.
    const hostOrganizationId = program.hostOrganizationId ?? program.organizationId;
    const [hostOrganization] = await tx.select({ type: organizations.type })
      .from(organizations).where(eq(organizations.id, hostOrganizationId)).limit(1);
    if (!hostOrganization) throw new Error("Program host organization not found");
    const crossOrganizationChurch = hostOrganization.type === "church" &&
      program.academicProviderOrganizationId !== hostOrganizationId;
    const operatingAuthorizationId = crossOrganizationChurch
      ? await requireCurrentProgramSiteAuthorization(tx, program.id,
          ["academic_instruction", "onsite_supervision",
            ...(program.creditIssuingOrganizationId ? ["school_of_record", "credit_issuance"] as const : [])])
      : null;
    assertChurchHostedActivationAuthorization({
      programType: program.type,
      hostOrganizationId,
      hostOrganizationType: hostOrganization.type,
      academicProviderOrganizationId: program.academicProviderOrganizationId,
      verifiedProgramSiteAuthorizationId: operatingAuthorizationId,
    });
    if (program.siteId) {
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
    // Operating agreement and staffed academic Sections alone are not legal
    // permission to open an independent church-hosted CAN school for minors.
    // The institution must separately authorize the most recent school
    // configuration using independently verified safety/legal/facility evidence.
    // Same-organization and non-church Programs keep their existing path.
    if(crossOrganizationChurch && program.deliveryModel.onsite){
      const {requireCurrentChurchSchoolOpening}=await import(
        "@/modules/operations/school-opening.server");
      await requireCurrentChurchSchoolOpening(tx,programId,new Date(),{
        allowPendingActivation:true,
      });
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


