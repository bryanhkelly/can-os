import {
  buildReportingSourceEnvelope, type ReportingSourceInput,
} from "@/domain/reporting-source-contract";
import {
  validateReportableEvent, type ReportableEventInput,
} from "@/domain/reportable-event-catalog";
import { emitEvent, type MutationTx } from "@/platform/mutation";

/**
 * Only entry point for source-linked events. Reuses public.domain_events,
 * the canonical transactional outbox, the existing worker and subscriptions.
 * The original operational record remains authoritative.
 *
 * The outbox is at-least-once. Deduplication is performed by consumers on
 * event ID and source revision, never by pretending an emitted key is a
 * database uniqueness constraint.
 */
export async function emitReportableEvent(
  tx: MutationTx,
  event: ReportableEventInput,
): Promise<string> {
  if (!Number.isFinite(event.occurredAt.getTime())) {
    throw new Error("Authoritative reporting event time required");
  }
  const payload = validateReportableEvent(event);
  const reporting = buildReportingSourceEnvelope({
    eventType: event.eventType,
    source: event.source,
    dimensions: event.dimensions,
    evidenceClass: event.evidenceClass,
    occurredAt: event.occurredAt.toISOString(),
    correctsEventId: event.correctsEventId ?? null,
  });
  return emitEvent(tx, {
    eventType: event.eventType,
    aggregateType: event.aggregateType,
    aggregateId: event.aggregateId,
    actorPersonId: event.actorPersonId ?? null,
    occurredAt: event.occurredAt,
    organizationId: reporting.dimensions.organizationId,
    siteId: reporting.dimensions.siteId ?? null,
    programId: reporting.dimensions.programId ?? null,
    payload: { ...payload, reporting },
  });
}
