import { createHmac, randomBytes } from "node:crypto";
import { and, desc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  calendarEvents,
  communicationThreads,
  interestEventEmailDeliveries,
  interestEventRegistrations,
  interestEvents,
  programPublications,
  programs,
  publicAdmissionsInterests,
  sites,
  sitePublications,
} from "@/db/schema";
import type { AccessContext } from "@/domain/access-context";
import { normalizeAccessEmail } from "@/domain/access-tokens";
import {
  assertCapability,
  assertOrganizationScope,
  assertProgramScope,
  assertSiteScope,
  AuthorizationError,
} from "@/domain/command-context";
import { DomainError } from "@/domain/errors";
import { familyInvitationBatchMetadataSchema, isFamilyInvitationExpired } from "@/domain/family-invitations";
import {
  interestEventFollowUpTime,
  interestEventRegistrationEmailSchedule,
} from "@/domain/interest-event-delivery";
import { hasRegistrarAuthority } from "@/domain/school-roles";
import {
  interestEventCreateInput,
  interestEventAttendanceInput,
  interestEventInvitationRsvpLink,
  interestEventRegistrationInput,
  interestEventRegistrationMessage,
  interestEventRsvpLink,
  type InterestEventCreateInput,
  type InterestEventRegistrationInput,
} from "@/domain/interest-events";
import { EventTypes } from "@/domain/event-types";
import { createProjectionIfAbsent } from "@/platform/calendar/projection";
import { emitEvent, writeAudit } from "@/platform/mutation";
import { readPublishedSiteCatalog } from "@/modules/sites/site-public-catalog.server";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Reader = Pick<typeof db, "select">;

function assertInterestEventManager(context: AccessContext): void {
  assertCapability(context, "program.read");
  assertCapability(context, "calendar.event.create");
  if (!hasRegistrarAuthority(context.role) || !context.actorPersonId) {
    throw new AuthorizationError("school interest event management");
  }
}

function accessTokenDigest(eventId: string, token: string): string {
  const pepper = process.env.CAN_ACCESS_TOKEN_PEPPER;
  if (!pepper || pepper.length < 32) throw new Error("Interest event security is unavailable");
  return createHmac("sha256", pepper).update(eventId).update(":").update(token).digest("hex");
}

function configuredPublicOrigin(): string {
  const value = process.env.CAN_ACCESS_PUBLIC_ORIGIN;
  if (!value) throw new Error("Interest event response host is not configured");
  const origin = new URL(value);
  if (origin.protocol !== "https:" || origin.pathname !== "/" || origin.search || origin.hash) {
    throw new Error("Interest event response requires a secure platform origin");
  }
  return origin.origin;
}

function unavailableEvent(): never {
  throw new DomainError("UNAVAILABLE", "This event is not available");
}

async function loadEvent(reader: Reader, eventId: string) {
  const [event] = await reader.select({
    id: interestEvents.id,
    organizationId: interestEvents.organizationId,
    siteId: interestEvents.siteId,
    programId: interestEvents.programId,
    title: interestEvents.title,
    description: interestEvents.description,
    kind: interestEvents.kind,
    location: interestEvents.location,
    visibility: interestEvents.visibility,
    status: interestEvents.status,
    invitationTokenDigest: interestEvents.invitationTokenDigest,
    programName: programs.name,
    programStatus: programs.status,
    siteName: sites.name,
    siteSlug: sites.slug,
    startsAt: calendarEvents.startsAt,
    endsAt: calendarEvents.endsAt,
    timezone: calendarEvents.timezone,
  }).from(interestEvents)
    .innerJoin(programs, eq(programs.id, interestEvents.programId))
    .innerJoin(sites, eq(sites.id, interestEvents.siteId))
    .innerJoin(calendarEvents, and(
      eq(calendarEvents.sourceType, "interest_event"),
      eq(calendarEvents.sourceId, interestEvents.id),
    ))
    .where(eq(interestEvents.id, eventId)).limit(1);
  return event;
}

async function assertFamilyInvitationEventAccess(
  reader: Reader,
  event: { siteId: string; programId: string },
  invitationBatchId: string,
  invitationRecipientKey: string,
  email?: string,
): Promise<{ firstName: string; lastName: string; email: string }> {
  const [batch] = await reader.select({
    programId: communicationThreads.contextId,
    metadata: communicationThreads.metadata,
    createdAt: communicationThreads.createdAt,
  }).from(communicationThreads).where(and(
    eq(communicationThreads.id, invitationBatchId),
    eq(communicationThreads.contextType, "program"),
  )).limit(1);
  const metadata = familyInvitationBatchMetadataSchema.safeParse(batch?.metadata);
  const recipient = metadata.success
    ? metadata.data.recipients.find(item => item.key === invitationRecipientKey)
    : undefined;
  if (!batch?.programId || !metadata.success ||
    metadata.data.destination !== "preopening_interest" ||
    metadata.data.siteId !== event.siteId || batch.programId !== event.programId ||
    isFamilyInvitationExpired(batch.createdAt) ||
    !recipient || (email && normalizeAccessEmail(recipient.email) !== normalizeAccessEmail(email))) {
    unavailableEvent();
  }
  return recipient;
}

async function assertProgramPublic(siteSlug: string, programId: string): Promise<void> {
  if (process.env.CAN_PUBLIC_SITE_HOSTING_ENABLED !== "true") unavailableEvent();
  const catalog = await readPublishedSiteCatalog(siteSlug);
  if (!catalog?.academicPrograms?.some(program => program.programId === programId)) {
    unavailableEvent();
  }
}

async function assertPublicPublicationLocked(tx: Tx, event: {
  siteId: string;
  programId: string;
  siteSlug: string;
}): Promise<void> {
  const [publication] = await tx.select({
    slug: sitePublications.slug,
    status: sitePublications.status,
    publishedAt: sitePublications.publishedAt,
  }).from(sitePublications).where(eq(sitePublications.siteId, event.siteId))
    .for("share").limit(1);
  if (!publication || publication.slug !== event.siteSlug ||
    publication.status !== "published" || !publication.publishedAt) {
    unavailableEvent();
  }
  const [programPublication] = await tx.select({
    status: programPublications.status,
    publishedAt: programPublications.publishedAt,
  }).from(programPublications).where(and(
    eq(programPublications.siteId, event.siteId),
    eq(programPublications.programId, event.programId),
  )).for("share").limit(1);
  if (programPublication?.status !== "published" || !programPublication.publishedAt) {
    unavailableEvent();
  }
  await assertProgramPublic(publication.slug, event.programId);
}

export async function listInterestEvents(
  context: AccessContext,
): Promise<{
  programs: { id: string; name: string; siteId: string; timezone: string }[];
  events: {
    id: string; programId: string; programName: string; siteName: string;
    title: string; description: string; kind: string; location: string;
    visibility: string; startsAt: string; endsAt: string; timezone: string;
    rsvpUrl?: string;
    registrations: {
      id: string; firstName: string; lastName: string; email: string; status: string;
      attendanceStatus: "attended" | "no_show" | null; attendanceMarkedAt: string | null;
    }[];
  }[];
}> {
  assertInterestEventManager(context);
  const organizationIds = context.scope.organizationIds ?? [];
  const programIds = context.scope.programIds ?? [];
  if (!organizationIds.length || !programIds.length) return { programs: [], events: [] };

  const programRows = await db.select({
    id: programs.id,
    name: programs.name,
    siteId: sites.id,
    timezone: sites.timezone,
    organizationId: programs.organizationId,
  }).from(programs).innerJoin(sites, eq(sites.id, programs.siteId))
    .where(and(
      inArray(programs.organizationId, organizationIds),
      inArray(programs.id, programIds),
      ...(context.scope.siteIds?.length ? [inArray(programs.siteId, context.scope.siteIds)] : []),
    ));
  for (const program of programRows) {
    assertOrganizationScope(context, program.organizationId);
    assertSiteScope(context, program.siteId);
    assertProgramScope(context, program.id);
  }
  if (!programRows.length) return { programs: [], events: [] };

  const rows = await db.select({
    id: interestEvents.id,
    programId: interestEvents.programId,
    programName: programs.name,
    siteName: sites.name,
    title: interestEvents.title,
    description: interestEvents.description,
    kind: interestEvents.kind,
    location: interestEvents.location,
    visibility: interestEvents.visibility,
    startsAt: calendarEvents.startsAt,
    endsAt: calendarEvents.endsAt,
    timezone: calendarEvents.timezone,
  }).from(interestEvents)
    .innerJoin(programs, eq(programs.id, interestEvents.programId))
    .innerJoin(sites, eq(sites.id, interestEvents.siteId))
    .innerJoin(calendarEvents, and(
      eq(calendarEvents.sourceType, "interest_event"),
      eq(calendarEvents.sourceId, interestEvents.id),
    ))
    .where(inArray(interestEvents.programId, programRows.map(row => row.id)))
    .orderBy(desc(calendarEvents.startsAt)).limit(100);

  const eventIds = rows.map(row => row.id);
  const registrationRows = eventIds.length ? await db.select({
    id: interestEventRegistrations.id,
    eventId: interestEventRegistrations.eventId,
    status: interestEventRegistrations.status,
    attendanceStatus: interestEventRegistrations.attendanceStatus,
    attendanceMarkedAt: interestEventRegistrations.attendanceMarkedAt,
    firstName: publicAdmissionsInterests.contactFirstName,
    lastName: publicAdmissionsInterests.contactLastName,
    email: publicAdmissionsInterests.contactEmail,
  }).from(interestEventRegistrations)
    .innerJoin(publicAdmissionsInterests, eq(publicAdmissionsInterests.id, interestEventRegistrations.publicInterestId))
    .where(inArray(interestEventRegistrations.eventId, eventIds)) : [];
  const registrationsByEvent = new Map<string, typeof registrationRows>();
  for (const registration of registrationRows) {
    const list = registrationsByEvent.get(registration.eventId) ?? [];
    list.push(registration);
    registrationsByEvent.set(registration.eventId, list);
  }

  return {
    programs: programRows.map(({ id, name, siteId, timezone }) => ({ id, name, siteId, timezone })),
    events: rows.map(row => ({
      ...row,
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt?.toISOString() ?? "",
      ...(row.visibility === "public" && process.env.CAN_PUBLIC_SITE_HOSTING_ENABLED === "true"
        ? { rsvpUrl: interestEventRsvpLink(configuredPublicOrigin(), row.id) }
        : {}),
      registrations: (registrationsByEvent.get(row.id) ?? []).map(registration => ({
        ...registration,
        attendanceMarkedAt: registration.attendanceMarkedAt?.toISOString() ?? null,
      })),
    })),
  };
}

export async function createInterestEvent(
  context: AccessContext,
  input: InterestEventCreateInput,
): Promise<{ eventId: string; created: boolean; rsvpUrl?: string }> {
  assertInterestEventManager(context);
  const data = interestEventCreateInput.parse(input);
  const startsAt = new Date(data.startsAt);
  const endsAt = new Date(data.endsAt);
  if (startsAt <= new Date()) throw new Error("Interest events must start in the future");
  if (data.visibility === "public") await assertProgramPublic(
    (await db.select({ slug: sites.slug }).from(programs)
      .innerJoin(sites, eq(sites.id, programs.siteId))
      .where(eq(programs.id, data.programId)).limit(1))[0]?.slug ?? "",
    data.programId,
  );
  const invitationToken = data.visibility === "invitation_only" ? randomBytes(32).toString("base64url") : null;
  const origin = configuredPublicOrigin();

  return db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"interest-event-request:" + data.requestId}))`);
    const [existing] = await tx.select({
      id: interestEvents.id,
      programId: interestEvents.programId,
      title: interestEvents.title,
      visibility: interestEvents.visibility,
      description: interestEvents.description,
      kind: interestEvents.kind,
      location: interestEvents.location,
      startsAt: calendarEvents.startsAt,
      endsAt: calendarEvents.endsAt,
      timezone: calendarEvents.timezone,
    }).from(interestEvents).innerJoin(calendarEvents, and(
      eq(calendarEvents.sourceType, "interest_event"),
      eq(calendarEvents.sourceId, interestEvents.id),
    )).where(eq(interestEvents.requestId, data.requestId)).limit(1);
    if (existing) {
      if (existing.programId !== data.programId || existing.title !== data.title ||
        existing.description !== data.description || existing.kind !== data.kind ||
        existing.location !== data.location || existing.visibility !== data.visibility ||
        existing.startsAt.getTime() !== startsAt.getTime() ||
        existing.endsAt?.getTime() !== endsAt.getTime() ||
        existing.timezone !== data.timezone) {
        throw new DomainError("CONFLICT", "This event request was already used with different content");
      }
      return { eventId: existing.id, created: false };
    }

    const [program] = await tx.select({
      id: programs.id,
      organizationId: programs.organizationId,
      siteId: programs.siteId,
      siteOrganizationId: sites.organizationId,
      siteTimezone: sites.timezone,
      siteSlug: sites.slug,
    }).from(programs).innerJoin(sites, eq(sites.id, programs.siteId))
      .where(eq(programs.id, data.programId)).for("share", { of: [programs, sites] }).limit(1);
    if (!program || !program.siteId || program.organizationId !== program.siteOrganizationId) unavailableEvent();
    assertOrganizationScope(context, program.organizationId);
    assertSiteScope(context, program.siteId);
    assertProgramScope(context, program.id);
    if (data.visibility === "public") await assertPublicPublicationLocked(tx, {
      siteId: program.siteId,
      programId: program.id,
      siteSlug: program.siteSlug,
    });

    const eventId = crypto.randomUUID();
    const [created] = await tx.insert(interestEvents).values({
      id: eventId,
      requestId: data.requestId,
      organizationId: program.organizationId,
      siteId: program.siteId,
      programId: program.id,
      title: data.title,
      description: data.description,
      kind: data.kind,
      location: data.location,
      visibility: data.visibility,
      status: "published",
      invitationTokenDigest: invitationToken ? accessTokenDigest(eventId, invitationToken) : null,
      createdByPersonId: context.actorPersonId!,
    }).returning({ id: interestEvents.id });
    if (!created) throw new Error("Unable to create interest event");

    const projection = await createProjectionIfAbsent(tx, {
      type: "interest_event",
      title: data.title,
      description: data.description,
      startsAt,
      endsAt,
      timezone: program.siteTimezone,
      scope: { organizationId: program.organizationId, siteId: program.siteId, programId: program.id },
      sourceType: "interest_event",
      sourceId: created.id,
      metadata: { kind: data.kind, visibility: data.visibility },
      createdByPersonId: context.actorPersonId,
    });
    await emitEvent(tx, {
      eventType: EventTypes.InterestEventCreated,
      aggregateType: "interest_event",
      aggregateId: created.id,
      actorPersonId: context.actorPersonId,
      organizationId: program.organizationId,
      siteId: program.siteId,
      programId: program.id,
      payload: { calendarEventId: projection.id, kind: data.kind, visibility: data.visibility },
    });
    await writeAudit(tx, context, {
      action: "interest_event.create",
      entityType: "interest_event",
      entityId: created.id,
      scope: { organizationId: program.organizationId, siteId: program.siteId, programId: program.id },
      after: { title: data.title, kind: data.kind, visibility: data.visibility, startsAt: data.startsAt },
    });
    return {
      eventId: created.id,
      created: true,
      rsvpUrl: interestEventRsvpLink(origin, created.id, invitationToken ?? undefined),
    };
  });
}

export async function rotateInterestEventInvitationLink(
  context: AccessContext,
  eventId: string,
): Promise<{ rsvpUrl: string }> {
  assertInterestEventManager(context);
  const token = randomBytes(32).toString("base64url");
  const origin = configuredPublicOrigin();
  return db.transaction(async tx => {
    const [event] = await tx.select({
      id: interestEvents.id,
      organizationId: interestEvents.organizationId,
      siteId: interestEvents.siteId,
      programId: interestEvents.programId,
      visibility: interestEvents.visibility,
    }).from(interestEvents).where(eq(interestEvents.id, eventId)).for("update").limit(1);
    if (!event || event.visibility !== "invitation_only") unavailableEvent();
    assertOrganizationScope(context, event.organizationId);
    assertSiteScope(context, event.siteId);
    assertProgramScope(context, event.programId);
    await tx.update(interestEvents).set({
      invitationTokenDigest: accessTokenDigest(event.id, token),
      updatedAt: new Date(),
    }).where(eq(interestEvents.id, event.id));
    await writeAudit(tx, context, {
      action: "interest_event.invitation_link.rotate",
      entityType: "interest_event",
      entityId: event.id,
      scope: { organizationId: event.organizationId, siteId: event.siteId, programId: event.programId },
      after: { rotated: true },
    });
    return { rsvpUrl: interestEventRsvpLink(origin, event.id, token) };
  });
}

export async function readInterestEventForRsvp(
  eventId: string,
  accessToken: string,
  invitation?: { batchId: string; recipientKey: string },
) {
  const event = await loadEvent(db, eventId);
  if (!event || event.status !== "published" || event.startsAt <= new Date()) unavailableEvent();
  let invitedFamily: { firstName: string; lastName: string; email: string } | null = null;
  if (event.visibility === "invitation_only") {
    const expected = event.invitationTokenDigest;
    const hasEventToken = Boolean(expected && accessToken && accessTokenDigest(event.id, accessToken) === expected);
    if (!hasEventToken) {
      if (!invitation) unavailableEvent();
      invitedFamily = await assertFamilyInvitationEventAccess(db, event, invitation.batchId, invitation.recipientKey);
    }
  } else if (event.visibility === "public") {
    await assertProgramPublic(event.siteSlug, event.programId);
  } else unavailableEvent();
  return {
    id: event.id,
    siteName: event.siteName,
    programName: event.programName,
    programStatus: event.programStatus,
    title: event.title,
    description: event.description,
    kind: event.kind,
    location: event.location,
    visibility: event.visibility,
    siteSlug: event.siteSlug,
    startsAt: event.startsAt.toISOString(),
    endsAt: event.endsAt?.toISOString() ?? null,
    timezone: event.timezone,
    invitedFamily,
  };
}

export async function registerInterestEvent(
  input: InterestEventRegistrationInput,
): Promise<{ created: boolean }> {
  const data = interestEventRegistrationInput.parse(input);
  if (data.website.trim()) return { created: false };
  const pepper = process.env.CAN_ACCESS_TOKEN_PEPPER;
  if (!pepper || pepper.length < 32) throw new Error("Interest event security is unavailable");

  return db.transaction(async tx => {
    const [event] = await tx.select({
      id: interestEvents.id,
      organizationId: interestEvents.organizationId,
      siteId: interestEvents.siteId,
      programId: interestEvents.programId,
      title: interestEvents.title,
      visibility: interestEvents.visibility,
      status: interestEvents.status,
      invitationTokenDigest: interestEvents.invitationTokenDigest,
      siteSlug: sites.slug,
      programStatus: programs.status,
      startsAt: calendarEvents.startsAt,
      endsAt: calendarEvents.endsAt,
    }).from(interestEvents)
      .innerJoin(programs, eq(programs.id, interestEvents.programId))
      .innerJoin(sites, eq(sites.id, interestEvents.siteId))
      .innerJoin(calendarEvents, and(
        eq(calendarEvents.sourceType, "interest_event"),
        eq(calendarEvents.sourceId, interestEvents.id),
      ))
      .where(eq(interestEvents.id, data.eventId)).for("update", { of: interestEvents }).limit(1);
    if (!event || event.status !== "published" || event.startsAt <= new Date()) unavailableEvent();
    if (event.visibility === "invitation_only") {
      const hasEventToken = Boolean(event.invitationTokenDigest && data.accessToken &&
        accessTokenDigest(event.id, data.accessToken) === event.invitationTokenDigest);
      if (!hasEventToken) {
        if (!data.invitationBatchId || !data.invitationRecipientKey) unavailableEvent();
        await assertFamilyInvitationEventAccess(
          tx, event, data.invitationBatchId, data.invitationRecipientKey, data.email,
        );
      }
    } else if (event.visibility === "public") {
      await assertPublicPublicationLocked(tx, {
        siteId: event.siteId, programId: event.programId, siteSlug: event.siteSlug,
      });
    } else unavailableEvent();

    const [priorRequest] = await tx.select({
      id: interestEventRegistrations.id,
      eventId: interestEventRegistrations.eventId,
    }).from(interestEventRegistrations)
      .where(eq(interestEventRegistrations.requestId, data.requestId)).limit(1);
    if (priorRequest) {
      if (priorRequest.eventId !== event.id) {
        throw new DomainError("CONFLICT", "This RSVP request was already used");
      }
      return { created: false };
    }

    const emailDigest = createHmac("sha256", pepper)
      .update(event.siteId).update(":").update(event.programId)
      .update(":").update(data.email).digest("hex");
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${emailDigest}))`);
    const [priorRegistration] = await tx.select({
      id: interestEventRegistrations.id,
    }).from(interestEventRegistrations)
      .innerJoin(publicAdmissionsInterests,
        eq(publicAdmissionsInterests.id, interestEventRegistrations.publicInterestId))
      .where(and(
        eq(interestEventRegistrations.eventId, event.id),
        eq(publicAdmissionsInterests.emailDigest, emailDigest),
      )).limit(1);
    if (priorRegistration) return { created: false };

    const [existingInterest] = await tx.select({
      id: publicAdmissionsInterests.id,
    }).from(publicAdmissionsInterests).where(and(
      eq(publicAdmissionsInterests.programId, event.programId),
      eq(publicAdmissionsInterests.emailDigest, emailDigest),
      inArray(publicAdmissionsInterests.status, ["new", "contacted"]),
    )).orderBy(desc(publicAdmissionsInterests.createdAt)).limit(1);
    let publicInterestId = existingInterest?.id;
    if (!publicInterestId) {
      const [interest] = await tx.insert(publicAdmissionsInterests).values({
        requestId: data.requestId,
        siteId: event.siteId,
        programId: event.programId,
        contactFirstName: data.firstName,
        contactLastName: data.lastName,
        contactEmail: data.email,
        emailDigest,
        message: interestEventRegistrationMessage(event.title),
        contactConsentAt: new Date(),
        source: "interest_event",
        status: "new",
      }).returning({ id: publicAdmissionsInterests.id });
      if (!interest) throw new Error("Unable to record event interest");
      publicInterestId = interest.id;
    }
    const [registration] = await tx.insert(interestEventRegistrations).values({
      requestId: data.requestId,
      eventId: event.id,
      publicInterestId,
      status: "registered",
    }).returning({ id: interestEventRegistrations.id });
    if (!registration) throw new Error("Unable to save event RSVP");

    const now = new Date();
    const emailSchedule = interestEventRegistrationEmailSchedule(event.startsAt, now);
    await tx.insert(interestEventEmailDeliveries).values(emailSchedule.map(delivery => ({
      registrationId: registration.id,
      kind: delivery.kind,
      deliverAt: delivery.deliverAt,
    }))).onConflictDoNothing({ target: [
      interestEventEmailDeliveries.registrationId,
      interestEventEmailDeliveries.kind,
    ] });

    await emitEvent(tx, {
      eventType: EventTypes.InterestEventRegistrationCreated,
      aggregateType: "interest_event_registration",
      aggregateId: registration.id,
      organizationId: event.organizationId,
      siteId: event.siteId,
      programId: event.programId,
      payload: { eventId: event.id, publicInterestId, emailDeliveriesQueued: emailSchedule.map(item => item.kind) },
    });
    await writeAudit(tx, {
      action: "interest_event.registration.create",
      resourceType: "interest_event_registration",
      resourceId: registration.id,
      actorPersonId: null,
      scope: { organizationId: event.organizationId, siteId: event.siteId, programId: event.programId },
      after: { eventId: event.id, publicInterestId, status: "registered" },
    });
    return { created: true };
  });
}

export async function recordInterestEventAttendance(
  context: AccessContext,
  input: unknown,
): Promise<{ created: boolean; attendanceStatus: "attended" | "no_show" }> {
  assertInterestEventManager(context);
  const data = interestEventAttendanceInput.parse(input);
  return db.transaction(async tx => {
    const [record] = await tx.select({
      registrationId: interestEventRegistrations.id,
      attendanceStatus: interestEventRegistrations.attendanceStatus,
      organizationId: interestEvents.organizationId,
      siteId: interestEvents.siteId,
      programId: interestEvents.programId,
      eventId: interestEvents.id,
      eventStatus: interestEvents.status,
      startsAt: calendarEvents.startsAt,
      endsAt: calendarEvents.endsAt,
    }).from(interestEventRegistrations)
      .innerJoin(interestEvents, eq(interestEvents.id, interestEventRegistrations.eventId))
      .innerJoin(calendarEvents, and(
        eq(calendarEvents.sourceType, "interest_event"),
        eq(calendarEvents.sourceId, interestEvents.id),
      ))
      .where(eq(interestEventRegistrations.id, data.registrationId))
      .for("update", { of: interestEventRegistrations }).limit(1);
    if (!record || record.eventStatus !== "published") unavailableEvent();
    assertOrganizationScope(context, record.organizationId);
    assertSiteScope(context, record.siteId);
    assertProgramScope(context, record.programId);
    if (record.attendanceStatus) {
      if (record.attendanceStatus === data.attendanceStatus) {
        return { created: false, attendanceStatus: record.attendanceStatus };
      }
      throw new DomainError("CONFLICT", "Attendance was already recorded differently");
    }
    const now = new Date();
    if (data.attendanceStatus === "attended" && now < record.startsAt) {
      throw new DomainError("VALIDATION_FAILED", "Check-in opens when the event starts");
    }
    if (data.attendanceStatus === "no_show" && now < (record.endsAt ?? record.startsAt)) {
      throw new DomainError("VALIDATION_FAILED", "No-show can be recorded after the event ends");
    }
    await tx.update(interestEventRegistrations).set({
      attendanceStatus: data.attendanceStatus,
      attendanceMarkedAt: now,
      attendanceMarkedByPersonId: context.actorPersonId!,
      updatedAt: now,
    }).where(and(
      eq(interestEventRegistrations.id, record.registrationId),
      isNull(interestEventRegistrations.attendanceStatus),
    ));
    const followUpKind = data.attendanceStatus === "attended" ? "follow_up_attended" : "follow_up_no_show";
    const deliverAt = interestEventFollowUpTime(record.endsAt, now);
    await tx.insert(interestEventEmailDeliveries).values({
      registrationId: record.registrationId,
      kind: followUpKind,
      deliverAt,
    }).onConflictDoNothing({ target: [
      interestEventEmailDeliveries.registrationId,
      interestEventEmailDeliveries.kind,
    ] });
    await emitEvent(tx, {
      eventType: EventTypes.InterestEventAttendanceRecorded,
      aggregateType: "interest_event_registration",
      aggregateId: record.registrationId,
      actorPersonId: context.actorPersonId,
      organizationId: record.organizationId,
      siteId: record.siteId,
      programId: record.programId,
      payload: { eventId: record.eventId, attendanceStatus: data.attendanceStatus },
    });
    await writeAudit(tx, context, {
      action: "interest_event.attendance.record",
      entityType: "interest_event_registration",
      entityId: record.registrationId,
      scope: { organizationId: record.organizationId, siteId: record.siteId, programId: record.programId },
      after: { attendanceStatus: data.attendanceStatus, attendanceMarkedAt: now.toISOString() },
    });
    return { created: true, attendanceStatus: data.attendanceStatus };
  });
}

export async function listPublicInterestEventsForInvitation(batchId: string, recipientKey: string) {
  const [batch] = await db.select({
    programId: communicationThreads.contextId,
    metadata: communicationThreads.metadata,
    createdAt: communicationThreads.createdAt,
  }).from(communicationThreads).where(and(
    eq(communicationThreads.id, batchId),
    eq(communicationThreads.contextType, "program"),
  )).limit(1);
  if (!batch?.programId) return [];
  const metadata = familyInvitationBatchMetadataSchema.safeParse(batch.metadata);
  if (!metadata.success || metadata.data.destination !== "preopening_interest" ||
    isFamilyInvitationExpired(batch.createdAt) ||
    !metadata.data.recipients.some(recipient => recipient.key === recipientKey)) return [];
  const [program] = await db.select({ siteId: programs.siteId, siteSlug: sites.slug })
    .from(programs).innerJoin(sites, eq(sites.id, programs.siteId))
    .where(eq(programs.id, batch.programId)).limit(1);
  if (!program || program.siteId !== metadata.data.siteId) return [];
  let publicProgramListed = false;
  if (process.env.CAN_PUBLIC_SITE_HOSTING_ENABLED === "true") {
    const catalog = await readPublishedSiteCatalog(program.siteSlug);
    publicProgramListed = Boolean(catalog?.academicPrograms?.some(item => item.programId === batch.programId));
  }
  const events = await db.select({
    id: interestEvents.id,
    title: interestEvents.title,
    startsAt: calendarEvents.startsAt,
    endsAt: calendarEvents.endsAt,
    timezone: calendarEvents.timezone,
    visibility: interestEvents.visibility,
  }).from(interestEvents).innerJoin(calendarEvents, and(
    eq(calendarEvents.sourceType, "interest_event"),
    eq(calendarEvents.sourceId, interestEvents.id),
  )).where(and(
    eq(interestEvents.programId, batch.programId),
    inArray(interestEvents.visibility, ["public", "invitation_only"]),
    eq(interestEvents.status, "published"),
    gt(calendarEvents.startsAt, new Date()),
  )).orderBy(calendarEvents.startsAt).limit(5);
  return events.filter(event => event.startsAt > new Date() &&
    (event.visibility === "invitation_only" || publicProgramListed)).map(event => ({
    id: event.id,
    title: event.title,
    startsAt: event.startsAt.toISOString(),
    timezone: event.timezone,
    rsvpUrl: event.visibility === "invitation_only"
      ? interestEventInvitationRsvpLink(configuredPublicOrigin(), event.id, batchId, recipientKey)
      : interestEventRsvpLink(configuredPublicOrigin(), event.id),
  }));
}
