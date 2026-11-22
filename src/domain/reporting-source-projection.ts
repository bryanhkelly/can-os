import { z } from "zod";
import { canonicalJson } from "@/lib/canonical-json";
import {
  REPORTING_SOURCE_CONTRACT_VERSION, reportingSourceInputSchema,
  buildReportingSourceEnvelope,
} from "@/domain/reporting-source-contract";
import { validateReportableEvent, REPORTABLE_EVENT_CATALOG, type ReportableEventType,
  type ReportableSourceKind } from "@/domain/reportable-event-catalog";
import type { ReportingScopeProof } from "@/domain/participation-rollups";

/**
 * A pure, deterministic, authorized projection of EXISTING domain_events.
 * Only counts observed source lifecycle facts. It never synthesizes
 * participants, attendance, completion, campaign reach or impact.
 *
 * Persisted reporting read models must implement the same key and collision
 * rules in their upserts. No source record is modified here.
 */
const uuid = z.string().uuid();
const iso = z.string().datetime({ offset: true });
const envelopeSchema = z.object({
  contractVersion: z.literal(REPORTING_SOURCE_CONTRACT_VERSION),
  source: reportingSourceInputSchema.shape.source,
  occurredAt: iso,
  dimensions: reportingSourceInputSchema.shape.dimensions,
  evidenceClass: reportingSourceInputSchema.shape.evidenceClass,
  correctsEventId: uuid.nullable(),
  dedupKey: z.string().min(1).max(512),
}).strict();
export const outboxReportingEventSchema = z.object({
  id: uuid,
  eventType: z.string(),
  aggregateType: z.string(),
  aggregateId: uuid,
  occurredAt: z.union([iso, z.date()]),
  payload: z.record(z.string(), z.unknown()),
}).strict();

export type OutboxReportingEvent = z.input<typeof outboxReportingEventSchema>;

/** Stable signature for deduplication and independently persisted replay. */
export function reportingEventSignature(raw: OutboxReportingEvent): string {
  const event = outboxReportingEventSchema.parse(raw);
  return canonicalJson({
    eventType: event.eventType, aggregateType: event.aggregateType,
    aggregateId: event.aggregateId,
    occurredAt: new Date(event.occurredAt).toISOString(),
    payload: event.payload,
  });
}

export type ProjectedSourceEvent = {
  eventId: string;
  dedupKey: string;
  eventType: ReportableEventType;
  sourceKind: ReportableSourceKind;
  sourceId: string;
  sourceVersion: string;
  occurredAt: string;
  organizationId: string;
  siteId: string;
  programId: string | null;
  correctionOfEventId: string | null;
};

/** A verified operator grant is mandatory. Attribution is NOT authorization. */
export function projectAuthorizedSourceEvents(
  rows: readonly OutboxReportingEvent[],
  proof: ReportingScopeProof,
  window: { from: string; to: string; asOf: string },
): {
  events: ProjectedSourceEvent[];
  observedCounts: Partial<Record<ReportableEventType, number>>;
  coverage: { status: "normalized" | "legacy_detected" | "unresolved_corrections";
    legacyEvents: number; duplicateDeliveries: number;
    unresolvedCorrectionReferences: number; lifecycleCompletenessVerified: false };
} {
  if (!proof.verifiedOrganizationIds.size || !proof.verifiedSiteIds.size) {
    throw new Error("Verified Organization and Site grants required");
  }
  const from = Date.parse(window.from), to = Date.parse(window.to), asOf = Date.parse(window.asOf);
  if (![from, to, asOf].every(Number.isFinite) || from >= to || to > asOf) {
    throw new Error("Invalid reporting period or source cutoff");
  }
  const keys = new Map<string, string>();
  const eventIds = new Map<string, string>();
  const projected: ProjectedSourceEvent[] = [];
  let legacyEvents = 0, duplicateDeliveries = 0;
  for (const raw of rows) {
    const event = outboxReportingEventSchema.parse(raw);
    const at = new Date(event.occurredAt).getTime();
    if (!Number.isFinite(at)) throw new Error("Invalid reporting event timestamp");
    if (at < from || at >= to) continue;
    if (at > asOf) throw new Error("Future source event outside cutoff");
    if (!Object.hasOwn(REPORTABLE_EVENT_CATALOG, event.eventType)) {
      throw new Error("Unexpected reporting event type in selected source stream");
    }
    // Check current authority even for historic events that predate the
    // reporting envelope. A legacy event must not bypass Site authorization.
    const rowOrganization = event.payload.organizationId;
    const rowSite = event.payload.siteId;
    if (typeof rowOrganization !== "string" || typeof rowSite !== "string" ||
        !proof.verifiedOrganizationIds.has(rowOrganization) ||
        !proof.verifiedSiteIds.has(rowSite)) {
      throw new Error("Out-of-scope or unattributed source event cannot be reported");
    }
    const reporting = event.payload.reporting;
    // Old operational records remain evidence, but they cannot be counted
    // as normalized events until backfilled and reconciled.
    if (reporting === undefined || reporting === null) {
      legacyEvents++;
      continue;
    }
    const meta = envelopeSchema.parse(reporting);
    const normalized = buildReportingSourceEnvelope({
      eventType: event.eventType,
      source: meta.source,
      occurredAt: meta.occurredAt,
      dimensions: meta.dimensions,
      evidenceClass: meta.evidenceClass,
      correctsEventId: meta.correctsEventId,
    });
    if (canonicalJson(meta) !== canonicalJson(normalized) ||
        meta.occurredAt !== new Date(event.occurredAt).toISOString()) {
      throw new Error("Reporting envelope fails canonical reconciliation");
    }
    // Even if the event payload is tampered with, reader scope never broadens.
    const org = meta.dimensions.organizationId, site = meta.dimensions.siteId;
    if (!proof.verifiedOrganizationIds.has(org) ||
        !site || !proof.verifiedSiteIds.has(site)) {
      throw new Error("Reporting source is outside the verified operating scope");
    }
    if (event.payload.organizationId !== org ||
        event.payload.siteId !== site ||
        (meta.dimensions.programId !== undefined &&
         meta.dimensions.programId !== null &&
         event.payload.programId !== meta.dimensions.programId)) {
      throw new Error("Outbox top-level attribution and source metadata disagree");
    }
    const { reporting: _reporting, organizationId: _org,
      siteId: _site, programId: _program, ...body } = event.payload;
    validateReportableEvent({
      eventType: event.eventType,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      source: meta.source,
      dimensions: meta.dimensions,
      evidenceClass: meta.evidenceClass,
      payload: body,
    });
    const signature = reportingEventSignature(event);
    const priorById = eventIds.get(event.id);
    if (priorById !== undefined) {
      if (priorById !== signature) throw new Error("Conflicting replay for same event ID");
      duplicateDeliveries++;
      continue;
    }
    const priorByKey = keys.get(meta.dedupKey);
    if (priorByKey !== undefined) {
      if (priorByKey !== signature) throw new Error("Conflicting source revisions in reporting events");
      duplicateDeliveries++;
      eventIds.set(event.id, signature);
      continue;
    }
    keys.set(meta.dedupKey, signature);
    eventIds.set(event.id, signature);
    projected.push({
      eventId: event.id, dedupKey: meta.dedupKey,
      eventType: event.eventType as ReportableEventType,
      sourceKind: meta.source.kind as ReportableSourceKind, sourceId: meta.source.id,
      sourceVersion: meta.source.version, occurredAt: meta.occurredAt,
      organizationId: org, siteId: site,
      programId: meta.dimensions.programId ?? null,
      correctionOfEventId: meta.correctsEventId,
    });
  }
  // A correction may legitimately refer to a prior reporting period. Never
  // fabricate that missing history. Surface unresolved links as an evidence
  // quality gap until the historical source has been loaded and reconciled.
  let unresolvedCorrectionReferences = 0;
  const byEventId = new Map(projected.map(item => [item.eventId, item]));
  for (const item of projected) {
    const previousId = item.correctionOfEventId;
    if (!previousId) continue;
    if (previousId === item.eventId) {
      throw new Error("A reporting event cannot correct itself");
    }
    const previous = byEventId.get(previousId);
    if (!previous) {
      unresolvedCorrectionReferences++;
      continue;
    }
    if (previous.sourceKind !== item.sourceKind ||
        previous.sourceId !== item.sourceId ||
        previous.organizationId !== item.organizationId ||
        previous.siteId !== item.siteId ||
        previous.occurredAt > item.occurredAt) {
      throw new Error("Correction lineage conflicts with the authoritative source");
    }
  }
  projected.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) ||
    a.dedupKey.localeCompare(b.dedupKey));
  const observedCounts: Partial<Record<ReportableEventType, number>> = {};
  for (const item of projected) {
    observedCounts[item.eventType] = (observedCounts[item.eventType] ?? 0) + 1;
  }
  return { events: projected, observedCounts,
    coverage: { status: legacyEvents ? "legacy_detected" :
        unresolvedCorrectionReferences ? "unresolved_corrections" : "normalized",
      legacyEvents, duplicateDeliveries, unresolvedCorrectionReferences,
      lifecycleCompletenessVerified: false } };
}
