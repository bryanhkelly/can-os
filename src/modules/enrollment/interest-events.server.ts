import { createHmac, randomBytes } from "node:crypto";
import { and, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  calendarEvents,
  interestEventRegistrations,
  interestEvents,
  programPublications,
  programs,
  publicAdmissionsInterests,
  sites,
  sitePublications,
} from "@/db/schema";
import type { AccessContext } from "@/domain/access-context";
import {
  assertCapability,
  assertOrganizationScope,
  assertProgramScope,
  assertSiteScope,
  AuthorizationError,
} from "@/domain/command-context";
import { DomainError } from "@/domain/errors";
import { hasRegistrarAuthority } from "@/domain/school-roles";
import {
  interestEventCreateInput,
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
    registrations: { id: string; firstName: string; lastName: string; email: string; status: string }[];
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
      registrations: registrationsByEvent.get(row.id) ?? [],
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

export async function readInterestEventForRsvp(eventId: string, accessToken: string) {
  const event = await loadEvent(db, eventId);
  if (!event || event.status !== "published" || event.startsAt <= new Date()) unavailableEvent();
  if (event.visibility === "invitation_only") {
    const expected = event.invitationTokenDigest;
    if (!expected || !accessToken || accessTokenDigest(event.id, accessToken) !== expected) unavailableEvent();
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
      if (!event.invitationTokenDigest || !data.accessToken ||
        accessTokenDigest(event.id, data.accessToken) !== event.invitationTokenDigest) unavailableEvent();
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

    await emitEvent(tx, {
      eventType: EventTypes.InterestEventRegistrationCreated,
      aggregateType: "interest_event_registration",
      aggregateId: registration.id,
      organizationId: event.organizationId,
      siteId: event.siteId,
      programId: event.programId,
      payload: { eventId: event.id, publicInterestId },
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

export async function listPublicInterestEventsForInvitation(batchId: string, recipientKey: string) {
  if (process.env.CAN_PUBLIC_SITE_HOSTING_ENABLED !== "true") return [];
  const { communicationThreads } = await import("@/db/schema");
  const [batch] = await db.select({
    programId: communicationThreads.contextId,
    metadata: communicationThreads.metadata,
  }).from(communicationThreads).where(and(
    eq(communicationThreads.id, batchId),
    eq(communicationThreads.contextType, "program"),
  )).limit(1);
  if (!batch?.programId) return [];
  const metadata = (await import("@/domain/family-invitations"))
    .familyInvitationBatchMetadataSchema.safeParse(batch.metadata);
  if (!metadata.success || metadata.data.destination !== "preopening_interest" ||
    !metadata.data.recipients.some(recipient => recipient.key === recipientKey)) return [];
  const events = await db.select({
    id: interestEvents.id,
    title: interestEvents.title,
    startsAt: calendarEvents.startsAt,
    endsAt: calendarEvents.endsAt,
    timezone: calendarEvents.timezone,
  }).from(interestEvents).innerJoin(calendarEvents, and(
    eq(calendarEvents.sourceType, "interest_event"),
    eq(calendarEvents.sourceId, interestEvents.id),
  )).where(and(
    eq(interestEvents.programId, batch.programId),
    eq(interestEvents.visibility, "public"),
    eq(interestEvents.status, "published"),
    gt(calendarEvents.startsAt, new Date()),
  )).orderBy(calendarEvents.startsAt).limit(5);
  const [site] = await db.select({ slug: sites.slug }).from(interestEvents)
    .innerJoin(sites, eq(sites.id, interestEvents.siteId))
    .where(eq(interestEvents.programId, batch.programId)).limit(1);
  if (!site) return [];
  const catalog = await readPublishedSiteCatalog(site.slug);
  if (!catalog?.academicPrograms?.some(program => program.programId === batch.programId)) return [];
  return events.filter(event => event.startsAt > new Date()).map(event => ({
    id: event.id,
    title: event.title,
    startsAt: event.startsAt.toISOString(),
    timezone: event.timezone,
    rsvpUrl: interestEventRsvpLink(configuredPublicOrigin(), event.id),
  }));
}
