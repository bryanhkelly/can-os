import {
  buildReportingSourceEnvelope,
} from "@/domain/reporting-source-contract";
import {
  REPORTABLE_EVENT_CATALOG, validateReportableEvent,
  type ReportableEventInput, type ReportableEventType,
} from "@/domain/reportable-event-catalog";
import type { ReportingDimensions } from "@/domain/reporting-source-contract";
import type { z } from "zod";
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
    eventSchemaVersion: REPORTABLE_EVENT_CATALOG[event.eventType].schemaVersion,
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

/**
 * Preferred module API. The catalog owns aggregate/source kind and evidence
 * classification once. Callers provide only their authoritative source ID,
 * revision, actor/scope and allowlisted event-specific business fields.
 */
export type ReportableChangeInput = {
  [T in ReportableEventType]: {
    eventType: T;
    sourceId: string;
    sourceVersion: string;
    actorPersonId?: string | null;
    occurredAt: Date;
    dimensions: ReportingDimensions;
    correctsEventId?: string | null;
    payload: z.input<(typeof REPORTABLE_EVENT_CATALOG)[T]["payload"]>;
  };
}[ReportableEventType];

export async function emitReportableChange(
  tx: MutationTx, input: ReportableChangeInput,
): Promise<string> {
  const spec = REPORTABLE_EVENT_CATALOG[input.eventType];
  // The single cast is justified by lookup correlation in the discriminated
  // catalog. emitReportableEvent validates the full runtime contract.
  return emitReportableEvent(tx, {
    eventType: input.eventType,
    aggregateType: spec.aggregateType,
    aggregateId: input.sourceId,
    actorPersonId: input.actorPersonId ?? null,
    source: { kind: spec.sourceKind, id: input.sourceId, version: input.sourceVersion },
    dimensions: input.dimensions,
    evidenceClass: "operational_record",
    occurredAt: input.occurredAt,
    correctsEventId: input.correctsEventId ?? null,
    payload: input.payload,
  } as ReportableEventInput);
}
