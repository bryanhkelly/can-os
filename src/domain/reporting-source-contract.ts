import { z } from "zod";

/**
 * Source-linked reporting contract v1.
 *
 * This is an attribution envelope, NOT another event ledger, attendance record,
 * completion decision, publication approval, or access grant. The authenticated
 * server provides identities from existing operational authorities.
 */
export const REPORTING_SOURCE_CONTRACT_VERSION = "1.0.0" as const;
const uuid = z.string().uuid();
const key = z.string().regex(/^[a-z][a-z0-9_.-]{1,95}$/);
const revision = z.string().trim().min(1).max(128);
const dateTime = z.string().datetime({ offset: true });

export const reportingDimensionsSchema = z.object({
  organizationId: uuid,
  siteId: uuid.nullable().optional(),
  programId: uuid.nullable().optional(),
  solutionId: uuid.nullable().optional(),
  offeringId: uuid.nullable().optional(),
  courseVersionId: uuid.nullable().optional(),
  classId: uuid.nullable().optional(),
  sessionId: uuid.nullable().optional(),
  initiativeId: uuid.nullable().optional(),
  fundingAgreementId: uuid.nullable().optional(),
}).strict();
export type ReportingDimensions = z.infer<typeof reportingDimensionsSchema>;

export const reportingSourceInputSchema = z.object({
  eventType: z.string().regex(/^[A-Za-z][A-Za-z0-9_.]{1,119}$/),
  source: z.object({
    kind: key,
    id: uuid,
    version: revision,
  }).strict(),
  /** Source mutation timestamp, not an activity's scheduled start time. */
  occurredAt: dateTime,
  dimensions: reportingDimensionsSchema,
  evidenceClass: z.enum(["operational_record", "engagement_observation"]),
  /** Event-specific payload schema version; omitted means original v1. */
  eventSchemaVersion: z.number().int().nonnegative().optional(),
  /** Corrections refer to an actual earlier authoritative event, if known. */
  correctsEventId: uuid.nullable().optional(),
}).strict();
export type ReportingSourceInput = z.input<typeof reportingSourceInputSchema>;

/** Idempotent consumer key for one source revision and event type. */
export function reportingSourceDedupKey(input: ReportingSourceInput): string {
  const validated = reportingSourceInputSchema.parse(input);
  const { source, eventType } = validated;
  return [eventType, source.kind, source.id, source.version].join(":");
}

/**
 * Never include names, emails, raw survey answers or financial details.
 * The referenced canonical record retains its own authorization and lifecycle.
 */
export function buildReportingSourceEnvelope(input: ReportingSourceInput) {
  const data = reportingSourceInputSchema.parse(input);
  return {
    contractVersion: REPORTING_SOURCE_CONTRACT_VERSION,
    source: data.source,
    occurredAt: new Date(data.occurredAt).toISOString(),
    dimensions: data.dimensions,
    evidenceClass: data.evidenceClass,
    ...(data.eventSchemaVersion === undefined ? {} :
      { eventSchemaVersion: data.eventSchemaVersion }),
    correctsEventId: data.correctsEventId ?? null,
    dedupKey: reportingSourceDedupKey(data),
  };
}
