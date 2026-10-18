import { and, eq, sql } from "drizzle-orm";
import { calendarEventParticipants, calendarEvents } from "@/db/schema";

export type ProjectionTx = Parameters<Parameters<typeof import("@/db/client").db.transaction>[0]>[0];

export type ProjectionScope = {
  organizationId?: string | null;
  siteId?: string | null;
  programId?: string | null;
  sectionId?: string | null;
};

export type ProjectionParticipant = {
  personId: string;
  role?: string | null;
};

/**
 * Metadata key distinguishing multiple projections that share one
 * (sourceType, sourceId) — e.g. several practice/game events for a single
 * activity season. When set, idempotency is per (source, instanceKey).
 */
export const PROJECTION_INSTANCE_KEY = "projectionInstance";

export type ProjectionSource = {
  sourceType: string;
  sourceId: string;
  instanceKey?: string;
};

export type PublishProjectionInput = ProjectionSource & {
  type: string;
  title: string;
  description?: string | null;
  startsAt: Date;
  endsAt?: Date | null;
  timezone: string;
  scope?: ProjectionScope;
  metadata?: Record<string, unknown>;
  createdByPersonId?: string | null;
  participants?: ReadonlyArray<ProjectionParticipant>;
};

async function findProjectionEvent(
  tx: ProjectionTx,
  source: ProjectionSource,
): Promise<{ id: string; metadata: Record<string, unknown> } | undefined> {
  // The schema permits multiple events per source. Serialize all projection
  // writers for that source without imposing a blanket uniqueness constraint.
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`calendar-projection:${source.sourceType}:${source.sourceId}`}))`);
  const conditions = [
    eq(calendarEvents.sourceType, source.sourceType),
    eq(calendarEvents.sourceId, source.sourceId),
  ];
  if (source.instanceKey !== undefined) {
    conditions.push(
      sql`${calendarEvents.metadata} ->> ${PROJECTION_INSTANCE_KEY} = ${source.instanceKey}`,
    );
  }
  const rows = await tx
    .select({ id: calendarEvents.id, metadata: calendarEvents.metadata })
    .from(calendarEvents)
    .where(and(...conditions))
    .limit(2);
  if (rows.length > 1) throw new Error("Calendar projection identity is ambiguous");
  return rows[0];
}

function validateTimes(startsAt: Date, endsAt?: Date | null): void {
  if (!Number.isFinite(startsAt.getTime()) ||
    (endsAt != null && (!Number.isFinite(endsAt.getTime()) || endsAt <= startsAt))) {
    throw new Error("Calendar projection requires a valid start and a later end");
  }
}

async function syncParticipantsForEvent(
  tx: ProjectionTx,
  eventId: string,
  participants: ReadonlyArray<ProjectionParticipant>,
): Promise<void> {
  const desired = new Map<string, string | null>();
  for (const participant of participants) {
    desired.set(participant.personId, participant.role ?? null);
  }

  const existing = await tx
    .select({
      id: calendarEventParticipants.id,
      participantId: calendarEventParticipants.participantId,
      role: calendarEventParticipants.role,
    })
    .from(calendarEventParticipants)
    .where(
      and(
        eq(calendarEventParticipants.calendarEventId, eventId),
        eq(calendarEventParticipants.participantType, "person"),
      ),
    );

  for (const row of existing) {
    const participantId = row.participantId;
    if (!desired.has(participantId)) {
      await tx
        .delete(calendarEventParticipants)
        .where(eq(calendarEventParticipants.id, row.id));
      continue;
    }
    const role = desired.get(participantId) ?? null;
    if (row.role !== role) {
      await tx
        .update(calendarEventParticipants)
        .set({ role, updatedAt: new Date() })
        .where(eq(calendarEventParticipants.id, row.id));
    }
    desired.delete(participantId);
  }

  if (desired.size === 0) return;
  await tx.insert(calendarEventParticipants).values(
    Array.from(desired, ([personId, role]) => ({
      calendarEventId: eventId,
      participantType: "person",
      participantId: personId,
      role,
    })),
  );
}

/**
 * Publish (or idempotently republish) the calendar projection for a domain
 * source. The first publish inserts the calendar event plus any participant
 * rows; a repeat publish for the same (sourceType, sourceId[, instanceKey])
 * updates the existing event in place and reconciles participants instead of
 * duplicating rows. Returns the calendar event id.
 */
export async function publishProjection(
  tx: ProjectionTx,
  input: PublishProjectionInput,
): Promise<string> {
  validateTimes(input.startsAt, input.endsAt);
  const metadata: Record<string, unknown> = { ...(input.metadata ?? {}) };
  if (input.instanceKey !== undefined) {
    metadata[PROJECTION_INSTANCE_KEY] = input.instanceKey;
  }

  const existing = await findProjectionEvent(tx, input);

  if (existing) {
    await tx
      .update(calendarEvents)
      .set({
        type: input.type,
        title: input.title,
        description: input.description ?? null,
        startsAt: input.startsAt,
        endsAt: input.endsAt ?? null,
        timezone: input.timezone,
        organizationId: input.scope?.organizationId ?? null,
        siteId: input.scope?.siteId ?? null,
        programId: input.scope?.programId ?? null,
        sectionId: input.scope?.sectionId ?? null,
        // Merge over the stored metadata so flags set by the calendar module
        // itself (e.g. `cancelled`) survive a republish.
        metadata: { ...existing.metadata, ...metadata },
        updatedAt: new Date(),
      })
      .where(eq(calendarEvents.id, existing.id));
    if (input.participants) {
      await syncParticipantsForEvent(tx, existing.id, input.participants);
    }
    return existing.id;
  }

  const rows = await tx
    .insert(calendarEvents)
    .values({
      type: input.type,
      title: input.title,
      description: input.description ?? null,
      startsAt: input.startsAt,
      endsAt: input.endsAt ?? null,
      timezone: input.timezone,
      organizationId: input.scope?.organizationId ?? null,
      siteId: input.scope?.siteId ?? null,
      programId: input.scope?.programId ?? null,
      sectionId: input.scope?.sectionId ?? null,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      createdByPersonId: input.createdByPersonId ?? null,
      metadata,
    })
    .returning({ id: calendarEvents.id });

  const id = rows[0]?.id;
  if (typeof id !== "string") {
    throw new Error("Failed to publish calendar projection");
  }
  if (input.participants) {
    await syncParticipantsForEvent(tx, id, input.participants);
  }
  return id;
}

/**
 * Move the projection for a source to new times. Returns the calendar event
 * id when a projection exists, or `false` when none does — the caller decides
 * whether that is an error or a fallback `publishProjection`.
 */
export async function rescheduleProjection(
  tx: ProjectionTx,
  input: ProjectionSource & { startsAt: Date; endsAt: Date | null },
): Promise<string | false> {
  validateTimes(input.startsAt, input.endsAt);
  const existing = await findProjectionEvent(tx, input);
  if (!existing) return false;
  await tx
    .update(calendarEvents)
    .set({
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      updatedAt: new Date(),
    })
    .where(eq(calendarEvents.id, existing.id));
  return existing.id;
}

/**
 * Mark the source's projection as cancelled. `calendar_events` has no status
 * column today — the read surface treats `metadata.cancelled === true` as
 * the cancellation flag (see modules/calendar), so the projection follows the
 * same convention. Returns `false` when no projection exists.
 */
export async function cancelProjection(
  tx: ProjectionTx,
  input: ProjectionSource & { reason?: string },
): Promise<boolean> {
  const existing = await findProjectionEvent(tx, input);
  if (!existing) return false;
  await tx
    .update(calendarEvents)
    .set({
      metadata: {
        ...existing.metadata,
        cancelled: true,
        cancelledAt: new Date().toISOString(),
        ...(input.reason ? { cancelReason: input.reason } : {}),
      },
      updatedAt: new Date(),
    })
    .where(eq(calendarEvents.id, existing.id));
  return true;
}

/**
 * Reconcile the projection's person participants with the desired set:
 * insert missing, remove stale, and update changed roles in place (keeping
 * each row's responseStatus). Returns `false` when no projection exists.
 */
export async function syncParticipants(
  tx: ProjectionTx,
  input: ProjectionSource & {
    participants: ReadonlyArray<ProjectionParticipant>;
  },
): Promise<boolean> {
  const existing = await findProjectionEvent(tx, input);
  if (!existing) return false;
  await syncParticipantsForEvent(tx, existing.id, input.participants);
  return true;
}
