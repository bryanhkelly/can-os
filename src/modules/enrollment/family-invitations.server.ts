import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  applications,
  communicationMessages,
  communicationParticipants,
  communicationThreads,
  domainEvents,
  programs,
  sites,
  publicAdmissionsInterests,
  publicFamilyStartRequests,
} from "@/db/schema";
import type { AccessContext } from "@/domain/access-context";
import {
  assertCapability,
  assertOrganizationScope,
  assertProgramScope,
  assertSiteScope,
  AuthorizationError,
} from "@/domain/command-context";
import { EventTypes } from "@/domain/event-types";
import {
  dedupeFamilyInvitationContacts,
  assertPreopeningFamilyInterestDestination,
  FAMILY_INVITATION_BATCH_KIND,
  familyInvitationBatchMetadataSchema,
  familyInvitationRetryMatches,
  parseFamilyInvitationRecipients,
  processFamilyInvitationRecipients,
  type FamilyInvitationBatchMetadata,
  type FamilyInvitationRecipientUpdate,
  type FamilyInvitationSendInput,
  type FamilyInvitationWorkspace,
} from "@/domain/family-invitations";
import { sendAccessLinkViaResend } from "@/modules/identity/resend-access-mail.server";
import { sendNotificationEmail } from "@/modules/communication/notification-email.server";
import {
  requestPublicFamilyStart,
} from "./public-family-start.server";
import { requestInvitedFamilyStart, resolvePrivateFamilyStartDestination } from "./private-family-start.server";
import { emitEvent, writeAudit } from "@/platform/mutation";

function assertFamilyInvitationRegistrar(context: AccessContext, programId?: string): void {
  assertCapability(context, "program.read");
  assertCapability(context, "communication.send");
  if (context.role !== "registrar" || !context.actorPersonId) {
    throw new AuthorizationError("registrar family outreach workspace");
  }
  if (programId) assertProgramScope(context, programId);
}

/** Outreach before authorization is informational only: never create a guardian or Application. */
async function resolvePreopeningInterestDestination(tx: Pick<typeof db, "select">, programId: string) {
  const [school] = await tx.select({
    programId: programs.id, programName: programs.name,
    organizationId: programs.organizationId, programOrganizationId: programs.organizationId, programSiteId: programs.siteId,
    siteId: sites.id, siteOrganizationId: sites.organizationId,
    slug: sites.slug, type: programs.type, status: programs.status,
  }).from(programs).innerJoin(sites, eq(sites.id, programs.siteId))
    .where(eq(programs.id, programId)).limit(1);
  if (!school) throw new Error("School is not eligible for pre-opening family interest outreach");
  assertPreopeningFamilyInterestDestination(school);
  return { programId: school.programId, programName: school.programName,
    organizationId: school.organizationId, siteId: school.siteId, slug: school.slug };
}

function contactProjection(recipient: {
  firstName: string;
  lastName: string;
  email: string;
}) {
  return {
    firstName: recipient.firstName,
    lastName: recipient.lastName,
    email: recipient.email,
  };
}

export async function sendFamilyInvitationBatch(
  context: AccessContext,
  data: FamilyInvitationSendInput,
) {
  assertFamilyInvitationRegistrar(context, data.programId);
  const parsed = parseFamilyInvitationRecipients(data.rawContacts);
  if (!parsed.contacts.length) throw new Error("No valid recipients to invite");

  return db.transaction(async tx => {
    // Serializes cross-batch dedupe until the canonical recipient requests exist.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"family-invitation:" + data.programId}))`);
    const destination = data.purpose === "interest"
      ? await resolvePreopeningInterestDestination(tx, data.programId)
      : await resolvePrivateFamilyStartDestination(tx, data.programId);
    assertOrganizationScope(context, destination.organizationId);
    assertSiteScope(context, destination.siteId);
    assertProgramScope(context, destination.programId);

    const [existing] = await tx.select({
      id: communicationThreads.id,
      subject: communicationThreads.subject,
      metadata: communicationThreads.metadata,
    }).from(communicationThreads).where(and(
      eq(communicationThreads.contextType, "program"),
      eq(communicationThreads.contextId, data.programId),
      eq(communicationThreads.createdByPersonId, context.actorPersonId!),
      sql`${communicationThreads.metadata}->>'kind' = ${FAMILY_INVITATION_BATCH_KIND}`,
      sql`${communicationThreads.metadata}->>'batchRequestId' = ${data.requestId}`,
    )).for("update").limit(1);

    if (existing) {
      const metadata = familyInvitationBatchMetadataSchema.parse(existing.metadata);
      if (existing.subject !== data.subject || !familyInvitationRetryMatches(
        metadata, data.subject, data.introduction, parsed.contacts.map(contactProjection), data.purpose,
      )) {
        throw new Error("This invitation request was already used with different content");
      }
      return {
        batchId: existing.id,
        created: false,
        recipientCount: metadata.recipients.length,
        skippedExisting: 0,
      };
    }

    const previousBatches = await tx.select({ metadata: communicationThreads.metadata })
      .from(communicationThreads).where(and(
        eq(communicationThreads.contextType, "program"),
        eq(communicationThreads.contextId, data.programId),
        sql`${communicationThreads.metadata}->>'kind' = ${FAMILY_INVITATION_BATCH_KIND}`,
      ));
    const existingEmails = new Set<string>();
    for (const batch of previousBatches) {
      const metadata = familyInvitationBatchMetadataSchema.parse(batch.metadata);
      if ((metadata.destination === "preopening_interest" ? "interest" : "application") === data.purpose) {
        for (const recipient of metadata.recipients) existingEmails.add(recipient.email);
      }
    }

    const priorStarts = data.purpose === "application"
      ? await tx.select({ email: publicFamilyStartRequests.emailNormalized })
          .from(publicFamilyStartRequests).where(and(
            eq(publicFamilyStartRequests.programId, data.programId),
            inArray(publicFamilyStartRequests.emailNormalized, parsed.contacts.map(contact => contact.email)),
          )) : [];
    for (const start of priorStarts) existingEmails.add(start.email);

    const contacts = dedupeFamilyInvitationContacts(parsed.contacts, existingEmails);
    const skippedExisting = parsed.contacts.length - contacts.length;
    if (!contacts.length) {
      throw new Error("Every valid recipient already has an invitation or application response");
    }

    const now = new Date();
    const metadata: FamilyInvitationBatchMetadata = {
      kind: FAMILY_INVITATION_BATCH_KIND,
      version: 1,
      batchRequestId: data.requestId,
      siteSlug: destination.slug,
      destination: data.purpose === "interest" ? "preopening_interest" : "private_platform",
      siteId: destination.siteId,
      introduction: data.introduction,
      status: "queued",
      recipients: contacts.map(contact => ({
        ...contactProjection(contact),
        key: crypto.randomUUID(),
        status: "queued",
        attempts: 0,
      })),
    };
    const [thread] = await tx.insert(communicationThreads).values({
      subject: data.subject,
      contextType: "program",
      contextId: data.programId,
      createdByPersonId: context.actorPersonId!,
      metadata,
      lastMessageAt: now,
    }).returning({ id: communicationThreads.id });
    if (!thread) throw new Error("Unable to save family invitation batch");

    await tx.insert(communicationParticipants).values({
      threadId: thread.id,
      participantType: "person",
      participantId: context.actorPersonId!,
    });
    await tx.insert(communicationMessages).values({
      threadId: thread.id,
      senderPersonId: context.actorPersonId!,
      body: data.introduction,
      sentAt: now,
      metadata: { kind: "family_invitation" },
    });

    await emitEvent(tx, {
      eventType: EventTypes.FamilyInvitationBatchRequested,
      aggregateType: "communication_thread",
      aggregateId: thread.id,
      actorPersonId: context.actorPersonId,
      organizationId: destination.organizationId,
      siteId: destination.siteId,
      programId: destination.programId,
      payload: { recipientCount: contacts.length, purpose: data.purpose },
    });
    await writeAudit(tx, context, {
      action: "family.invitation_batch.queue",
      entityType: "communication_thread",
      entityId: thread.id,
      scope: {
        organizationId: destination.organizationId,
        siteId: destination.siteId,
        programId: destination.programId,
      },
      after: {
        status: "queued",
        recipientCount: contacts.length,
        purpose: data.purpose,
        duplicateRecipientCount: parsed.duplicates + skippedExisting,
      },
    });
    return { batchId: thread.id, created: true, recipientCount: contacts.length, skippedExisting };
  });
}

/**
 * Registrar-initiated retry after the outbox exhausted automatic retries.
 * Emits a fresh batch-requested event for the same aggregate; the existing
 * consumer re-attempts only recipients not yet accepted by the provider, so
 * an accepted family is never emailed again. The consumer re-resolves the
 * published destination and operating authorization at send time, so a retry
 * cannot reopen a closed school. No delivery is claimed: acceptance by the
 * provider is not inbox delivery.
 */
export async function requestFamilyInvitationRetry(
  context: AccessContext,
  batchId: string,
): Promise<{ batchId: string; retried: number }> {
  assertFamilyInvitationRegistrar(context);
  return db.transaction(async tx => {
    const [thread] = await tx.select({
      id: communicationThreads.id,
      contextId: communicationThreads.contextId,
      metadata: communicationThreads.metadata,
    }).from(communicationThreads).where(and(
      eq(communicationThreads.id, batchId),
      eq(communicationThreads.contextType, "program"),
      sql`${communicationThreads.metadata}->>'kind' = ${FAMILY_INVITATION_BATCH_KIND}`,
    )).for("update").limit(1);
    if (!thread?.contextId) throw new Error("Family invitation batch unavailable");

    const [program] = await tx.select({
      organizationId: programs.organizationId,
      siteId: programs.siteId,
    }).from(programs).where(eq(programs.id, thread.contextId)).limit(1);
    if (!program) throw new Error("Family invitation batch unavailable");
    assertOrganizationScope(context, program.organizationId);
    assertSiteScope(context, program.siteId);
    assertProgramScope(context, thread.contextId);

    const metadata = familyInvitationBatchMetadataSchema.parse(thread.metadata);
    // Retry must not revive pre-opening marketing after the school opens or
    // release a formal application when current institutional authority is gone.
    if (metadata.destination === "preopening_interest") {
      await resolvePreopeningInterestDestination(tx, thread.contextId);
    } else if (metadata.destination === "private_platform") {
      await resolvePrivateFamilyStartDestination(tx, thread.contextId);
    }
    const failed = metadata.recipients.filter(recipient => recipient.status === "failed");
    if (!failed.length) return { batchId, retried: 0 };

    // The row lock above serializes concurrent clicks: the loser re-reads and
    // sees the winner's pending event instead of stacking a duplicate send.
    const [inFlight] = await tx.select({ id: domainEvents.id }).from(domainEvents).where(and(
      eq(domainEvents.aggregateType, "communication_thread"),
      eq(domainEvents.aggregateId, thread.id),
      eq(domainEvents.eventType, EventTypes.FamilyInvitationBatchRequested),
      inArray(domainEvents.status, ["pending", "processing"]),
    )).limit(1);
    if (inFlight) throw new Error("A retry is already being processed for this batch");

    await emitEvent(tx, {
      eventType: EventTypes.FamilyInvitationBatchRequested,
      aggregateType: "communication_thread",
      aggregateId: thread.id,
      actorPersonId: context.actorPersonId,
      organizationId: program.organizationId,
      siteId: program.siteId,
      programId: thread.contextId,
      payload: { recipientCount: failed.length, retry: true },
    });
    await writeAudit(tx, context, {
      action: "family.invitation_batch.retry",
      entityType: "communication_thread",
      entityId: thread.id,
      scope: {
        organizationId: program.organizationId,
        siteId: program.siteId,
        programId: thread.contextId,
      },
      after: { retriedRecipients: failed.length },
    });
    return { batchId, retried: failed.length };
  });
}

export async function listFamilyInvitationWorkspace(
  context: AccessContext,
): Promise<FamilyInvitationWorkspace> {
  assertFamilyInvitationRegistrar(context);
  const programIds = context.scope.programIds;
  const organizationIds = context.scope.organizationIds ?? [];
  if (!organizationIds.length || (programIds && !programIds.length)) return { programs: [], batches: [] };

  const candidates = await db.select({
    id: programs.id,
    name: programs.name,
    status: programs.status,
    organizationId: programs.organizationId,
    siteId: programs.siteId,
  }).from(programs).where(and(inArray(programs.organizationId, organizationIds),
    ...(programIds ? [inArray(programs.id, programIds)] : []),
    ...(context.scope.siteIds?.length ? [inArray(programs.siteId, context.scope.siteIds)] : [])));
  const scopedPrograms = [];
  const eligible = [];
  for (const candidate of candidates) {
    try {
      assertOrganizationScope(context, candidate.organizationId);
      assertSiteScope(context, candidate.siteId);
      scopedPrograms.push(candidate);
      if (!["draft", "launching", "ready", "active"].includes(candidate.status)) continue;
      if (candidate.status === "active") {
        const destination = await resolvePrivateFamilyStartDestination(db, candidate.id);
        eligible.push({ ...destination, purpose: "application" as const });
      } else {
        const destination = await resolvePreopeningInterestDestination(db, candidate.id);
        eligible.push({ ...destination, purpose: "interest" as const });
      }
    } catch (error) {
      if (error instanceof AuthorizationError ||
        (error instanceof Error && ["School applications not open",
          "School is not eligible for pre-opening family interest outreach"].includes(error.message))) continue;
      throw error;
    }
  }
  if (!scopedPrograms.length) return { programs: [], batches: [] };

  // Sending requires current academic admissions authority; history remains visible.
  const scopedProgramIds = scopedPrograms.map(program => program.id);
  const batchRows = await db.select({
    id: communicationThreads.id,
    subject: communicationThreads.subject,
    contextId: communicationThreads.contextId,
    metadata: communicationThreads.metadata,
    createdAt: communicationThreads.createdAt,
  }).from(communicationThreads).where(and(
    eq(communicationThreads.contextType, "program"),
    inArray(communicationThreads.contextId, scopedProgramIds),
    sql`${communicationThreads.metadata}->>'kind' = ${FAMILY_INVITATION_BATCH_KIND}`,
  )).orderBy(desc(communicationThreads.createdAt)).limit(20);

  const parsedBatches = batchRows.map(row => ({
    ...row,
    programId: row.contextId!,
    metadata: familyInvitationBatchMetadataSchema.parse(row.metadata),
  }));
  const emails = [...new Set(parsedBatches.flatMap(batch =>
    batch.metadata.recipients.map(recipient => recipient.email)))];
  const starts = emails.length ? await db.select({
    programId: publicFamilyStartRequests.programId,
    email: publicFamilyStartRequests.emailNormalized,
    consumedAt: publicFamilyStartRequests.consumedAt,
  }).from(publicFamilyStartRequests).where(and(
    inArray(publicFamilyStartRequests.programId, scopedProgramIds),
    inArray(publicFamilyStartRequests.emailNormalized, emails),
  )) : [];

  const batchIds = parsedBatches.map(batch => batch.id);
  const interests = batchIds.length ? await db.select({
    batchId: publicAdmissionsInterests.invitationBatchId,
    recipientKey: publicAdmissionsInterests.invitationRecipientKey,
    id: publicAdmissionsInterests.id,
    source: publicAdmissionsInterests.source,
    status: publicAdmissionsInterests.status,
    requestedAt: publicAdmissionsInterests.createdAt,
    consentedAt: publicAdmissionsInterests.contactConsentAt,
    contactedAt: publicAdmissionsInterests.contactedAt,
    applicationId: publicAdmissionsInterests.applicationId,
    applicationStage: applications.stage,
    applicationSubmittedAt: applications.submittedAt,
    verifiedEmailAt: publicFamilyStartRequests.consumedAt,
  }).from(publicAdmissionsInterests)
    .leftJoin(publicFamilyStartRequests,
      eq(publicFamilyStartRequests.id, publicAdmissionsInterests.familyStartRequestId))
    .leftJoin(applications, eq(applications.id, publicAdmissionsInterests.applicationId))
    .where(inArray(publicAdmissionsInterests.invitationBatchId, batchIds)) : [];
  const interestsByRecipient = new Map<string, (typeof interests)[number]>(interests.map(interest =>
    [`${interest.batchId}:${interest.recipientKey}`, interest]));

  const events = batchIds.length ? await db.select({
    aggregateId: domainEvents.aggregateId,
    status: domainEvents.status,
    occurredAt: domainEvents.occurredAt,
  }).from(domainEvents).where(and(
    eq(domainEvents.aggregateType, "communication_thread"),
    eq(domainEvents.eventType, EventTypes.FamilyInvitationBatchRequested),
    inArray(domainEvents.aggregateId, batchIds),
  )).orderBy(desc(domainEvents.occurredAt)) : [];
  const latestEvent = new Map<string, typeof events[number]>();
  for (const event of events) if (!latestEvent.has(event.aggregateId)) latestEvent.set(event.aggregateId, event);

  const programsById = new Map(scopedPrograms.map(program => [program.id, program]));
  return {
    programs: eligible.map(program => ({
      id: program.programId,
      name: program.programName,
      siteId: program.siteId,
      publishedSiteUrl: "",
      privateApplicationUrl: program.purpose === "application"
        ? `/guardian/apply?programId=${encodeURIComponent(program.programId)}` : undefined,
      purpose: program.purpose,
    })),
    batches: parsedBatches.map(batch => {
      const programName = programsById.get(batch.programId)?.name ?? "Program";
      return {
        id: batch.id,
        programId: batch.programId,
        siteId: programsById.get(batch.programId)?.siteId ?? null,
        programName,
        subject: batch.subject,
        introduction: batch.metadata.introduction,
        createdAt: batch.createdAt.toISOString(),
        status: batch.metadata.status,
        purpose: batch.metadata.destination === "preopening_interest" ? "interest" as const : "application" as const,
        outboxStatus: latestEvent.get(batch.id)?.status ?? null,
        recipients: batch.metadata.recipients.map(recipient => {
          const responses = batch.metadata.destination === "preopening_interest" ? [] : starts.filter(start => start.programId === batch.programId &&
            start.email === recipient.email && start.consumedAt);
          const respondedAt = responses.reduce<Date | null>((latest, start) =>
            !latest || (start.consumedAt && start.consumedAt > latest) ? start.consumedAt : latest, null);
          const interest = interestsByRecipient.get(`${batch.id}:${recipient.key}`);
          return {
            firstName: recipient.firstName,
            lastName: recipient.lastName,
            email: recipient.email,
            status: respondedAt ? "responded" as const :
              recipient.status === "accepted" ? "provider_accepted" as const :
                recipient.status === "failed" ? "retrying" as const : "queued" as const,
            attempts: recipient.attempts,
            respondedAt: respondedAt?.toISOString() ?? null,
            interest: interest ? {
              id: interest.id,
              source: interest.source,
              status: interest.status,
              requestedAt: interest.requestedAt.toISOString(),
              consentedAt: interest.consentedAt?.toISOString() ?? null,
              contactedAt: interest.contactedAt?.toISOString() ?? null,
              verifiedEmailAt: interest.verifiedEmailAt?.toISOString() ?? null,
              applicationId: interest.applicationId,
              applicationStage: interest.applicationStage,
              applicationSubmittedAt: interest.applicationSubmittedAt?.toISOString() ?? null,
            } : null,
          };
        }),
      };
    }),
  };
}

async function persistRecipientResult(
  threadId: string,
  domainEventId: string,
  recipientKey: string,
  update: FamilyInvitationRecipientUpdate,
): Promise<void> {
  await db.transaction(async tx => {
    const [thread] = await tx.select({
      contextId: communicationThreads.contextId,
      metadata: communicationThreads.metadata,
    }).from(communicationThreads).where(eq(communicationThreads.id, threadId))
      .for("update").limit(1);
    if (!thread?.contextId) throw new Error("Family invitation batch unavailable");
    const metadata = familyInvitationBatchMetadataSchema.parse(thread.metadata);
    const currentRecipient = metadata.recipients.find(recipient => recipient.key === recipientKey);
    if (!currentRecipient) throw new Error("Family invitation recipient unavailable");
    // A stale worker must not overwrite or duplicate evidence for an accepted recipient.
    if (currentRecipient.status === "accepted") return;
    const attempts = Math.max(currentRecipient.attempts, update.attempts);
    const recipients = metadata.recipients.map(recipient => {
      if (recipient.key !== recipientKey) return recipient;
      return {
        ...recipient,
        status: update.status,
        attempts,
        requestId: update.requestId ?? recipient.requestId,
        lastError: update.lastError,
        updatedAt: new Date().toISOString(),
      };
    });
    const nextMetadata: FamilyInvitationBatchMetadata = {
      ...metadata,
      status: update.status === "failed" ? "retrying" : "queued",
      recipients,
    };
    await tx.update(communicationThreads).set({
      metadata: nextMetadata,
      updatedAt: new Date(),
    }).where(eq(communicationThreads.id, threadId));
    await writeAudit(tx, {
      action: "family.invitation_recipient.status",
      resourceType: "communication_thread",
      resourceId: threadId,
      actorPersonId: null,
      scope: { programId: thread.contextId },
      after: { recipientKey, status: update.status, attempts },
      context: { domainEventId },
    });
    await emitEvent(tx, {
      eventType: EventTypes.FamilyInvitationRecipientStatusChanged,
      aggregateType: "communication_thread",
      aggregateId: threadId,
      programId: thread.contextId,
      payload: { recipientKey, status: update.status, attempts },
    });
  });
}

/** Recheck school state at delivery, not just when the batch was queued.
 * No login token, Application or self-asserted family consent is created. */
async function sendPreopeningFamilyInterestEmail(programId: string, batchId: string,
  recipient: FamilyInvitationBatchMetadata["recipients"][number],
  subject: string, metadata: FamilyInvitationBatchMetadata) {
  const school = await resolvePreopeningInterestDestination(db, programId);
  if (metadata.siteId !== school.siteId) throw new AuthorizationError("original pre-opening Site");
  const configuredOrigin = process.env.CAN_ACCESS_PUBLIC_ORIGIN;
  if (!configuredOrigin) throw new Error("Family interest response host is not configured");
  const origin = new URL(configuredOrigin);
  if (origin.protocol !== "https:" || origin.pathname !== "/" || origin.search || origin.hash)
    throw new Error("Family interest response requires a secure platform origin");
  const responseUrl = new URL("/family/interest", origin);
  responseUrl.searchParams.set("invitationBatchId", batchId);
  responseUrl.searchParams.set("invitationRecipientKey", recipient.key);
  const accepted = await sendNotificationEmail({
    to: recipient.email,
    subject,
    text: `${metadata.introduction}\n\n${school.programName} is preparing to open. The school has not yet received opening authorization. This notice is not a school application, enrollment offer or confirmation of academic services.\n\nIf you would like updates from the school, you can request them here: ${responseUrl.toString()}\n\nOnly an adult who wants follow-up should submit the form. No child details are requested; receiving this email alone does not opt you in.`,
  }, `${batchId}:${recipient.key}`);
  if (!accepted) throw new Error("Pre-opening family email was not accepted by the provider");
  return { requestId: recipient.key, created: true };
}

/** Domain-outbox consumer. Provider calls are deliberately outside transactions. */
export async function handleFamilyInvitationBatch(eventId: string): Promise<void> {
  const [event] = await db.select({
    aggregateId: domainEvents.aggregateId,
    aggregateType: domainEvents.aggregateType,
    eventType: domainEvents.eventType,
  }).from(domainEvents).where(eq(domainEvents.id, eventId)).limit(1);
  if (!event || event.eventType !== EventTypes.FamilyInvitationBatchRequested ||
    event.aggregateType !== "communication_thread") return;

  const [thread] = await db.select({
    id: communicationThreads.id,
    subject: communicationThreads.subject,
    contextId: communicationThreads.contextId,
    metadata: communicationThreads.metadata,
  }).from(communicationThreads).where(eq(communicationThreads.id, event.aggregateId)).limit(1);
  if (!thread?.contextId) throw new Error("Family invitation batch unavailable");
  const metadata = familyInvitationBatchMetadataSchema.parse(thread.metadata);

  const failures = await processFamilyInvitationRecipients(
    metadata.recipients,
    recipient => metadata.destination === "preopening_interest"
      ? sendPreopeningFamilyInterestEmail(thread.contextId!, thread.id, recipient, thread.subject, metadata)
      : metadata.destination === "private_platform"
      ? requestInvitedFamilyStart(thread.id, recipient.key, sendAccessLinkViaResend, {
        idempotencyKey: `${thread.id}:${recipient.key}`,
        subject: thread.subject,
        introduction: metadata.introduction,
      })
      : requestPublicFamilyStart(metadata.siteSlug, {
      requestId: recipient.key,
      programId: thread.contextId!,
      firstName: recipient.firstName || "Family",
      lastName: recipient.lastName || "Applicant",
      email: recipient.email,
      contactConsent: "yes",
      website: "",
    }, sendAccessLinkViaResend, {
      idempotencyKey: `${thread.id}:${recipient.key}`,
      subject: thread.subject,
      introduction: metadata.introduction,
    }),
    (recipientKey, update) => persistRecipientResult(thread.id, eventId, recipientKey, update),
  );
  if (failures) throw new Error("One or more family invitation emails require an outbox retry");

  await db.transaction(async tx => {
    const [current] = await tx.select({
      contextId: communicationThreads.contextId,
      metadata: communicationThreads.metadata,
    }).from(communicationThreads).where(eq(communicationThreads.id, thread.id))
      .for("update").limit(1);
    if (!current?.contextId) throw new Error("Family invitation batch unavailable");
    const currentMetadata = familyInvitationBatchMetadataSchema.parse(current.metadata);
    if (currentMetadata.recipients.some(recipient => recipient.status !== "accepted")) {
      throw new Error("Family invitation batch is not complete");
    }
    await tx.update(communicationThreads).set({
      metadata: { ...currentMetadata, status: "complete" as const },
      updatedAt: new Date(),
    }).where(eq(communicationThreads.id, thread.id));
    await writeAudit(tx, {
      action: "family.invitation_batch.complete",
      resourceType: "communication_thread",
      resourceId: thread.id,
      actorPersonId: null,
      scope: { programId: current.contextId },
      after: { status: "provider_accepted", recipientCount: currentMetadata.recipients.length },
      context: { domainEventId: eventId },
    });
    await emitEvent(tx, {
      eventType: EventTypes.FamilyInvitationBatchCompleted,
      aggregateType: "communication_thread",
      aggregateId: thread.id,
      programId: current.contextId,
      payload: { status: "provider_accepted", recipientCount: currentMetadata.recipients.length },
    });
  });
}
