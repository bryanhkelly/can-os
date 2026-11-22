import {
  buildReportingSourceEnvelope, type ReportingDimensions,
  type ReportingSourceInput,
} from "@/domain/reporting-source-contract";
import { emitEvent, type MutationTx } from "@/platform/mutation";

type Source = ReportingSourceInput["source"];
type EvidenceClass = ReportingSourceInput["evidenceClass"];

/**
 * Reusable adapter to the EXISTING transactional public.domain_events outbox.
 * It never saves its own reporting table and never grants a reporting reader
 * access to a record. Call only after current server-side scope validation.
 */
export async function emitReportableEvent(tx: MutationTx, event: {
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  actorPersonId?: string | null;
  source: Source;
  dimensions: ReportingDimensions;
  evidenceClass: EvidenceClass;
  occurredAt: Date;
  correctsEventId?: string | null;
  payload?: Record<string, unknown>;
}): Promise<string> {
  if (!Number.isFinite(event.occurredAt.getTime())) {
    throw new Error("Authoritative reporting event time required");
  }
  // The underlying writer merges explicit payload keys after scope IDs.
  // Reject overriding trusted scope or report source metadata by payload.
  const reserved = ["reporting", "organizationId", "siteId", "programId"];
  if (reserved.some(name => Object.hasOwn(event.payload ?? {}, name))) {
    throw new Error("Event payload cannot override reporting attribution");
  }
  if (event.aggregateId !== event.source.id) {
    throw new Error("Reportable event must reference its authoritative aggregate");
  }
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
    payload: { ...event.payload, reporting },
  });
}
