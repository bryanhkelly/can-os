import { and, asc, eq, gte, inArray, isNotNull, isNull, lt, lte, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { AccessContext } from "@/domain/access-context";
import { db } from "@/db/client";
import { domainEvents, programs, reportingSourceEventReceipts, sites } from "@/db/schema";
import { assertWholeSiteReportingScope } from "@/domain/site-setup-scope";
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

export async function readSiteReportingSourceCoverage(
  actor: AccessContext, selection: SourceCoverageSelection,
) {
  if (!reportingProjectionEnabled()) {
    throw new Error("Reporting source projections are not activated");
  }
  const from = new Date(selection.from), to = new Date(selection.to), asOf = new Date();
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) ||
      to <= from || to > asOf || to.getTime() - from.getTime() > MAX_PERIOD_MS) {
    throw new Error("Source coverage requires a closed, positive UTC window up to 90 days");
  }
  return db.transaction(async tx => {
    const [site] = await tx.select({
      id: sites.id, organizationId: sites.organizationId,
    }).from(sites).where(eq(sites.id, selection.siteId)).limit(1);
    const attached = site ? await tx.select({id: programs.id}).from(programs)
      .where(and(eq(programs.siteId, site.id), eq(programs.organizationId, site.organizationId))) : [];
    assertWholeSiteReportingScope(actor, site, attached.map(row => row.id));
    if (!site) throw new Error("Unreachable: Site authorization did not establish a Site");

    const scoped = and(
      eq(reportingSourceEventReceipts.organizationId, site.organizationId),
      eq(reportingSourceEventReceipts.siteId, site.id),
      gte(reportingSourceEventReceipts.occurredAt, from),
      lt(reportingSourceEventReceipts.occurredAt, to),
      lte(reportingSourceEventReceipts.recordedAt, asOf),
    );
    const groupRows = await tx.select({
      eventType: reportingSourceEventReceipts.eventType,
      status: reportingSourceEventReceipts.status,
      count: sql<number>`count(*)::integer`,
    }).from(reportingSourceEventReceipts)
      .where(scoped)
      .groupBy(reportingSourceEventReceipts.eventType, reportingSourceEventReceipts.status)
      .orderBy(asc(reportingSourceEventReceipts.eventType));

    // Missing projections are detectable without reading private payloads.
    const [pending] = await tx.select({
      count: sql<number>`count(*)::integer`,
    }).from(domainEvents).leftJoin(reportingSourceEventReceipts,
      eq(reportingSourceEventReceipts.eventId, domainEvents.id))
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
        // of the SAME canonical source and operating scope. A duplicate,
        // legacy, retry-pending, or different-owner row is not valid lineage.
        sql`(
          ${previous.eventId} IS NULL
          OR ${previous.status} <> 'accepted'
          OR ${previous.sourceKind} IS DISTINCT FROM ${reportingSourceEventReceipts.sourceKind}
          OR ${previous.sourceId} IS DISTINCT FROM ${reportingSourceEventReceipts.sourceId}
          OR ${previous.organizationId} IS DISTINCT FROM ${reportingSourceEventReceipts.organizationId}
          OR ${previous.siteId} IS DISTINCT FROM ${reportingSourceEventReceipts.siteId}
          OR ${previous.occurredAt} > ${reportingSourceEventReceipts.occurredAt}
        )`,
      ));

    const result = summarizeReportingSourceCoverage(
      groupRows,
      Number(pending?.count ?? 0),
      Number(corrections?.count ?? 0),
    );
    return {
      siteId: site.id, from: from.toISOString(), to: to.toISOString(), asOf: asOf.toISOString(),
      ...result, outcomeMetricsAvailable: false as const,
      // Even a complete projection stream is NOT proof of full module
      // instrumentation, Person reconciliation, or verified training outcomes.
    };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}
