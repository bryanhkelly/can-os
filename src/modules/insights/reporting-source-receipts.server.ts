import { createHash } from "node:crypto";
import { and, asc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  domainEvents, programs, reportingSourceEventReceipts, sites,
} from "@/db/schema";
import { REPORTABLE_EVENT_CATALOG } from "@/domain/reportable-event-catalog";
import { projectAuthorizedSourceEvents, reportingEventSignature } from "@/domain/reporting-source-projection";
import { determineSourceReceiptDisposition } from "@/domain/reporting-source-receipt-policy";
import { reportingProjectionFailureState,
  reportingProjectionRetryDelayMs } from "@/domain/reporting-source-retry-policy";
import { assertReportingSourceOwnership } from "@/modules/insights/reporting-source-ownership.server";
import { assertReportingCorrectionLineage } from "@/domain/reporting-correction-lineage";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type ReceiptInsert = typeof reportingSourceEventReceipts.$inferInsert;

/** Replace a retry-pending diagnostic with its verified final receipt. */
async function saveVerifiedReceipt(
  tx: Tx,
  row: ReceiptInsert,
  retryPending: boolean,
): Promise<void> {
  if (retryPending) {
    await tx.update(reportingSourceEventReceipts).set({
      ...row, nextAttemptAt: null, projectedAt: new Date(),
    }).where(eq(reportingSourceEventReceipts.eventId, row.eventId));
  } else {
    await tx.insert(reportingSourceEventReceipts).values(row);
  }
}

const FIRST_RECORDED_TIME = "0001-01-01T00:00:00.000Z";
const LAST_RECORDED_TIME = "9999-12-31T23:59:59.999Z";

/**
 * Project ONE canonical outbox receipt in the same DB transaction as its
 * receipt state. It is safe to invoke from the live worker, a retry, or
 * historical replay. The outbox remains the authoritative evidence.
 *
 * The caller is an internal worker, not a reporting reader. Site and Program
 * identity are independently cross-checked against current canonical rows.
 * No network affiliation or client-supplied reporting scope is consulted.
 */
export async function persistReportingSourceReceipt(eventId: string): Promise<
  "accepted" | "duplicate" | "legacy" | "dead_letter"
> {
  return db.transaction(async (tx: Tx) => {
    // Serialize concurrent worker/replay attempts for this source event.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${eventId}, 0))`);
    const [event] = await tx.select().from(domainEvents)
      .where(eq(domainEvents.id, eventId)).limit(1);
    if (!event) throw new Error("Canonical domain event does not exist");
    if (!Object.hasOwn(REPORTABLE_EVENT_CATALOG, event.eventType)) {
      throw new Error("Domain event is not registered for reporting");
    }

    const [priorEvent] = await tx.select()
      .from(reportingSourceEventReceipts)
      .where(eq(reportingSourceEventReceipts.eventId, event.id)).limit(1);
    if (priorEvent && priorEvent.status !== "retry_pending") {
      // Committed receipts are immutable. Only retry-pending diagnostics may
      // be replaced after the original source is successfully revalidated.
      return priorEvent.status;
    }

    const org = typeof event.payload.organizationId === "string"
      ? event.payload.organizationId : null;
    const siteId = typeof event.payload.siteId === "string"
      ? event.payload.siteId : null;
    const programId = typeof event.payload.programId === "string"
      ? event.payload.programId : null;
    const meta = event.payload.reporting;

    // Pre-instrumentation events are recorded as legacy coverage gaps, not
    // silently upgraded into complete or verified reporting observations.
    if (meta == null) {
      const [site] = org && siteId ? await tx.select({ id: sites.id })
        .from(sites).where(and(eq(sites.id, siteId), eq(sites.organizationId, org)))
        .limit(1) : [];
      if (org && siteId && !site) {
        throw new Error("Legacy event has inconsistent Site and Organization");
      }
      await saveVerifiedReceipt(tx, {
        eventId: event.id,
        eventType: event.eventType,
        status: "legacy",
        organizationId: site ? org : null,
        siteId: site ? siteId : null,
        occurredAt: event.occurredAt,
        recordedAt: event.createdAt,
      }, priorEvent?.status === "retry_pending");
      return "legacy";
    }

    // A reportable envelope MUST belong to an existing Site and operator.
    if (!org || !siteId) throw new Error("Reportable source missing Organization or Site");
    const [site] = await tx.select({ id: sites.id }).from(sites)
      .where(and(eq(sites.id, siteId), eq(sites.organizationId, org))).limit(1);
    if (!site) throw new Error("Reporting Site and operating Organization disagree");
    if (programId) {
      const [program] = await tx.select({ id: programs.id }).from(programs)
        .where(and(eq(programs.id, programId),
          eq(programs.siteId, siteId), eq(programs.organizationId, org))).limit(1);
      if (!program) throw new Error("Reporting Program does not belong to the operating Site");
    }

    // The pure projection validates contract versions, exact event payloads,
    // source IDs, authoritative occurrence time and canonical attribution.
    const projected = projectAuthorizedSourceEvents([{
      id: event.id, eventType: event.eventType,
      aggregateType: event.aggregateType, aggregateId: event.aggregateId,
      occurredAt: event.occurredAt, payload: event.payload,
    }], {
      verifiedOrganizationIds: new Set([org]),
      verifiedSiteIds: new Set([siteId]),
    }, {
      from: FIRST_RECORDED_TIME, to: LAST_RECORDED_TIME,
      asOf: LAST_RECORDED_TIME,
    });
    const source = projected.events[0];
    // A correction may reference a source event from an earlier period.
    // The one-row validator cannot see that history, and it must not reject
    // a valid correction merely because its predecessor is outside the batch.
    if (!source || projected.coverage.status === "legacy_detected") {
      throw new Error("Source event failed normalized evidence verification");
    }
    if (source.correctionOfEventId) {
      const [priorSource] = await tx.select({
        aggregateId: domainEvents.aggregateId,
        aggregateType: domainEvents.aggregateType,
        occurredAt: domainEvents.occurredAt,
        payload: domainEvents.payload,
      }).from(domainEvents)
        .where(eq(domainEvents.id, source.correctionOfEventId)).limit(1);
      assertReportingCorrectionLineage({
        aggregateId: event.aggregateId,
        aggregateType: event.aggregateType,
        occurredAt: event.occurredAt,
        sourceKind: source.sourceKind,
        sourceId: source.sourceId,
        scope: {
          organizationId: source.organizationId,
          siteId: source.siteId,
          programId: source.programId,
        },
      }, priorSource ?? null);
    }

    await assertReportingSourceOwnership(tx, {
      eventType: source.eventType,
      sourceKind: source.sourceKind,
      sourceId: source.sourceId,
      scope: {
        organizationId: source.organizationId, siteId: source.siteId,
        programId: source.programId,
      },
    });

    const fingerprint = createHash("sha256")
      .update(reportingEventSignature({
        id: event.id, eventType: event.eventType,
        aggregateType: event.aggregateType, aggregateId: event.aggregateId,
        occurredAt: event.occurredAt, payload: event.payload,
      })).digest("hex");
    // The second advisory lock is per source revision across distinct events.
    // Combined with the partial unique index, it makes replay deterministic.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${source.dedupKey}, 1))`);
    const [canonical] = await tx.select({
      payloadFingerprint: reportingSourceEventReceipts.payloadFingerprint,
    }).from(reportingSourceEventReceipts).where(and(
      eq(reportingSourceEventReceipts.dedupKey, source.dedupKey),
      eq(reportingSourceEventReceipts.status, "accepted"),
    )).limit(1);
    const status = determineSourceReceiptDisposition(
      canonical ? { payloadFingerprint: canonical.payloadFingerprint ?? "" } : null,
      { payloadFingerprint: fingerprint },
    );
    await saveVerifiedReceipt(tx, {
      eventId: event.id, eventType: event.eventType, status,
      sourceKind: source.sourceKind,
      sourceId: source.sourceId,
      sourceVersion: source.sourceVersion,
      dedupKey: source.dedupKey, payloadFingerprint: fingerprint,
      organizationId: source.organizationId, siteId: source.siteId,
      programId: source.programId,
      correctionOfEventId: source.correctionOfEventId,
      occurredAt: event.occurredAt, recordedAt: event.createdAt,
    }, priorEvent?.status === "retry_pending");
    return status;
  });
}

/**
 * Record a fixed-category diagnostic so one invalid historical event does
 * not permanently stall replay behind it. It remains visible in quality
 * reporting and is retried with bounded backoff; source content is unchanged.
 */
export async function markReportingSourceRetryPending(
  eventId: string, now = new Date(),
): Promise<"retry_pending" | "dead_letter" | "already_final"> {
  return db.transaction(async (tx: Tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${eventId}, 0))`);
    const [event] = await tx.select().from(domainEvents)
      .where(eq(domainEvents.id,eventId)).limit(1);
    if (!event) throw new Error("Cannot retry a missing canonical domain event");
    const [prior] = await tx.select().from(reportingSourceEventReceipts)
      .where(eq(reportingSourceEventReceipts.eventId,eventId)).limit(1);
    if (prior && prior.status !== "retry_pending") return "already_final";
    const org = typeof event.payload.organizationId === "string"
      ? event.payload.organizationId : null;
    const siteId = typeof event.payload.siteId === "string"
      ? event.payload.siteId : null;
    const [site] = org && siteId ? await tx.select({id:sites.id}).from(sites)
      .where(and(eq(sites.id,siteId),eq(sites.organizationId,org))).limit(1) : [];
    const attempts=(prior?.attempts ?? 0)+1;
    const status = reportingProjectionFailureState(attempts);
    const row: ReceiptInsert = {
      eventId:event.id, eventType:event.eventType,
      status, occurredAt:event.occurredAt, recordedAt:event.createdAt,
      organizationId:site ? org : null, siteId:site ? siteId : null,
      attempts, nextAttemptAt:status === "retry_pending"
        ? new Date(now.getTime()+reportingProjectionRetryDelayMs(attempts))
        : null,
    };
    if (prior) {
      await tx.update(reportingSourceEventReceipts).set(row)
        .where(eq(reportingSourceEventReceipts.eventId,eventId));
    } else {
      await tx.insert(reportingSourceEventReceipts).values(row);
    }
    return status;
  });
}

/**
 * Event status does NOT determine reporting eligibility. Replays include
 * previously "processed" domain events because their earlier handler may
 * have been a pass-through and never built a reporting projection.
 *
 * Select only events without receipts; duplicates and legacy events also get
 * receipts, so they do not become infinite replay loops.
 */
export async function replayReportingSourceReceipts(limit = 50): Promise<{
  processed: number; accepted: number; duplicate: number; legacy: number;
  retryPending: number; deadLettered: number;
}> {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200) {
    throw new Error("Reporting replay batch must be between 1 and 200");
  }
  const missing = await db.select({ id: domainEvents.id })
    .from(domainEvents)
    .leftJoin(reportingSourceEventReceipts,
      eq(reportingSourceEventReceipts.eventId, domainEvents.id))
    .where(and(
      inArray(domainEvents.eventType, Object.keys(REPORTABLE_EVENT_CATALOG)),
      or(
        isNull(reportingSourceEventReceipts.eventId),
        and(eq(reportingSourceEventReceipts.status, "retry_pending"),
          lte(reportingSourceEventReceipts.nextAttemptAt, new Date())),
      ),
    ))
    .orderBy(asc(domainEvents.createdAt), asc(domainEvents.id))
    .limit(limit);
  let accepted = 0, duplicate = 0, legacy = 0, retryPending = 0, deadLettered = 0;
  for (const record of missing) {
    try {
      const result = await persistReportingSourceReceipt(record.id);
      if (result === "accepted") accepted++;
      else if (result === "duplicate") duplicate++;
      else if (result === "dead_letter") deadLettered++;
      else legacy++;
    } catch {
      // No raw exception, source payload or personal record enters retry logs.
      const result = await markReportingSourceRetryPending(record.id);
      if (result === "dead_letter") deadLettered++;
      else if (result === "retry_pending") retryPending++;
    }
  }
  return { processed: missing.length, accepted, duplicate, legacy, retryPending, deadLettered };
}
