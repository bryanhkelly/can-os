import {readScopedSiteGeography} from "@/modules/geography/site-geography-read.server";
import { and, asc, eq, gte, inArray, isNotNull, isNull, lt, lte, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { AccessContext } from "@/domain/access-context";
import { db } from "@/db/client";
import { domainEvents, reportingSourceEventReceipts } from "@/db/schema";
import { loadAuthorizedSiteReportingScope } from "@/modules/insights/site-reporting-source-scope.server";
import { REPORTABLE_EVENT_CATALOG } from "@/domain/reportable-event-catalog";
import { summarizeReportingSourceCoverage } from "@/domain/reporting-source-coverage-policy";
import { reportingProjectionEnabled } from "@/modules/insights/reporting-projection-rollout.server";

/**
 * Shared authorized source-quality query. A single server-side aggregate
 * supports embedded or central Insights without loading source payloads into
 * the browser. This reader is private and never computes learner outcomes.
 */
export type SourceCoverageSelection = {siteId:string;from:string;to:string};
const MAX_PERIOD_MS = 90 * 86_400_000;

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Same-transaction quality proof for a source snapshot or embedded Insights. */
export async function querySiteReportingSourceCoverageInTx(
  tx: Tx, actor: AccessContext, selection: SourceCoverageSelection, asOf: Date,
) {
  if (!reportingProjectionEnabled()) {
    throw new Error("Reporting source projections are not activated");
  }
  const from = new Date(selection.from), to = new Date(selection.to);
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) ||
      !Number.isFinite(asOf.getTime()) ||
      to <= from || to > asOf || to.getTime() - from.getTime() > MAX_PERIOD_MS) {
    throw new Error("Source coverage requires a closed, positive UTC window up to 90 days");
  }
  const site = await loadAuthorizedSiteReportingScope(tx, actor, selection.siteId);

  const scoped = and(
    eq(reportingSourceEventReceipts.organizationId, site.organizationId),
    eq(reportingSourceEventReceipts.siteId, site.id),
    gte(reportingSourceEventReceipts.occurredAt, from),
    lt(reportingSourceEventReceipts.occurredAt, to),
    lte(reportingSourceEventReceipts.recordedAt, asOf),
    lte(reportingSourceEventReceipts.projectedAt, asOf),
  );
  const groupRows = await tx.select({
    eventType: reportingSourceEventReceipts.eventType,
    status: reportingSourceEventReceipts.status,
    count: sql<number>`count(*)::integer`,
  }).from(reportingSourceEventReceipts)
    .where(scoped)
    .groupBy(reportingSourceEventReceipts.eventType, reportingSourceEventReceipts.status)
    .orderBy(asc(reportingSourceEventReceipts.eventType));

  // Missing OR unusably attributed projections are detectable without
  // reading private payloads. A retry/dead-letter receipt can lack validated
  // Site ownership, even while its original outbox event claims this Site.
  // Never let such a receipt hide a quality gap by satisfying the LEFT JOIN.
  const [pending] = await tx.select({
    count: sql<number>`count(*)::integer`,
  }).from(domainEvents).leftJoin(reportingSourceEventReceipts,
    and(eq(reportingSourceEventReceipts.eventId, domainEvents.id),
      eq(reportingSourceEventReceipts.organizationId, site.organizationId),
      eq(reportingSourceEventReceipts.siteId, site.id),
      lte(reportingSourceEventReceipts.projectedAt, asOf)))
    .where(and(
      inArray(domainEvents.eventType, Object.keys(REPORTABLE_EVENT_CATALOG)),
      gte(domainEvents.occurredAt, from), lt(domainEvents.occurredAt, to),
      lte(domainEvents.createdAt, asOf),
      sql`${domainEvents.payload}->>'organizationId' = ${site.organizationId}`,
      sql`${domainEvents.payload}->>'siteId' = ${site.id}`,
      isNull(reportingSourceEventReceipts.eventId),
    ));

  const previous = alias(reportingSourceEventReceipts, "previous_source_receipt");
  const [corrections] = await tx.select({
    count: sql<number>`count(*)::integer`,
  }).from(reportingSourceEventReceipts)
    .leftJoin(previous, eq(reportingSourceEventReceipts.correctionOfEventId, previous.eventId))
    .where(and(
      scoped, eq(reportingSourceEventReceipts.status, "accepted"),
      isNotNull(reportingSourceEventReceipts.correctionOfEventId),
      // A predecessor is resolved only when it is an accepted projection
      // of the SAME canonical source, operating scope, and historical
      // cutoff. A duplicate, late-processed, or differently owned
      // predecessor cannot resolve a point-in-time correction.
      sql`(
        ${previous.eventId} IS NULL
        OR ${previous.status} <> 'accepted'
        OR ${previous.sourceKind} IS DISTINCT FROM ${reportingSourceEventReceipts.sourceKind}
        OR ${previous.sourceId} IS DISTINCT FROM ${reportingSourceEventReceipts.sourceId}
        OR ${previous.organizationId} IS DISTINCT FROM ${reportingSourceEventReceipts.organizationId}
        OR ${previous.siteId} IS DISTINCT FROM ${reportingSourceEventReceipts.siteId}
        OR ${previous.programId} IS DISTINCT FROM ${reportingSourceEventReceipts.programId}
        OR ${previous.recordedAt} > ${asOf}
        OR ${previous.projectedAt} > ${asOf}
        OR ${previous.occurredAt} > ${reportingSourceEventReceipts.occurredAt}
      )`,
    ));

  const result = summarizeReportingSourceCoverage(
    groupRows,
    Number(pending?.count ?? 0),
    Number(corrections?.count ?? 0),
  );
  return {
    siteId: site.id, geography: await readScopedSiteGeography(tx,site,asOf), from: from.toISOString(), to: to.toISOString(), asOf: asOf.toISOString(),
    ...result, outcomeMetricsAvailable: false as const,
    // Even a complete projection stream is NOT proof of full module
    // instrumentation, Person reconciliation, or verified training outcomes.
  };
}

export async function readSiteReportingSourceCoverage(
  actor: AccessContext, selection: SourceCoverageSelection,
) {
  const asOf = new Date();
  return db.transaction(tx =>
    querySiteReportingSourceCoverageInTx(tx, actor, selection, asOf),
    { isolationLevel: "repeatable read", accessMode: "read only" });
}
