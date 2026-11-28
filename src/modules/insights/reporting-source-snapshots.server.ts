import { randomUUID } from "node:crypto";
import { and, asc, eq, gte, lt, lte } from "drizzle-orm";
import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { db } from "@/db/client";
import {
  reportingSourceEventReceipts,
  reportingSourceSnapshotEvents,
  reportingSourceSnapshots,
} from "@/db/schema";
import {readReportingSourceSnapshot,snapshotManifestDigest} from "./reporting-source-snapshot-read.server";
import { writeAudit } from "@/platform/mutation";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { loadAuthorizedSiteReportingScope } from "@/modules/insights/site-reporting-source-scope.server";
import { reportingSnapshotsEnabled } from "@/modules/insights/reporting-projection-rollout.server";
import { querySiteReportingSourceCoverageInTx } from "@/modules/insights/site-reporting-source-query.server";
import { assertSnapshotSourceReadiness } from "@/domain/reporting-snapshot-readiness";

const MAX_SOURCES = 2_000;
const MAX_PERIOD = 90 * 86_400_000;
const createInput = z.object({
  siteId: z.string().uuid(),
  from: z.string().datetime({offset:true}),
  to: z.string().datetime({offset:true}),
}).strict();
const readInput = z.object({snapshotId:z.string().uuid()}).strict();


/**
 * A private evidence manifest freezes the EXACT accepted source revisions.
 * It does not claim complete instrumentation, verified participant outcomes
 * or permission to publish any report.
 */
export const createReportingSourceSnapshot = createServerFn({method:"POST"})
  .validator((input:unknown) => createInput.parse(input))
  .handler(async ({data}) => {
    setResponseHeader("Cache-Control","private, no-store");
    if (!reportingSnapshotsEnabled()) {
      throw new Error("Reporting snapshot creation is temporarily paused for maintenance");
    }
    const actor = await getCommandContext(getRequest());
    const from=new Date(data.from), to=new Date(data.to), asOf=new Date();
    if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) ||
        to<=from || to>asOf || to.getTime()-from.getTime()>MAX_PERIOD) {
      throw new Error("Snapshot requires a closed positive period within 90 days");
    }
    if (!actor.actorPersonId) throw new Error("Authenticated snapshot author required");
    return db.transaction(async tx => {
      const site=await loadAuthorizedSiteReportingScope(tx,actor,data.siteId,
        "snapshot_write");
      const coverage=await querySiteReportingSourceCoverageInTx(tx,actor,{
        siteId:site.id,from:data.from,to:data.to,
      },asOf);
      assertSnapshotSourceReadiness(coverage);
      const rows=await tx.select({
        eventId:reportingSourceEventReceipts.eventId,
        payloadFingerprint:reportingSourceEventReceipts.payloadFingerprint,
        sourceVersion:reportingSourceEventReceipts.sourceVersion,
      }).from(reportingSourceEventReceipts)
        .where(and(
          eq(reportingSourceEventReceipts.organizationId,site.organizationId),
          eq(reportingSourceEventReceipts.siteId,site.id),
          eq(reportingSourceEventReceipts.status,"accepted"),
          gte(reportingSourceEventReceipts.occurredAt,from),
          lt(reportingSourceEventReceipts.occurredAt,to),
          lte(reportingSourceEventReceipts.recordedAt,asOf),
          lte(reportingSourceEventReceipts.projectedAt,asOf),
        )).orderBy(asc(reportingSourceEventReceipts.eventId))
        .limit(MAX_SOURCES+1);
      if (!rows.length) {
        throw new Error("Cannot snapshot an empty source set as evidence");
      }
      if (rows.length>MAX_SOURCES) {
        throw new Error("Source snapshot exceeds the bounded interactive limit");
      }
      if (coverage.observedEvents!==rows.length) {
        throw new Error("Source snapshot membership does not reconcile with coverage");
      }
      const sources=rows.map(row=>{
        if (!row.payloadFingerprint || !row.sourceVersion) {
          throw new Error("Accepted reporting receipt has incomplete source identity");
        }
        return {eventId:row.eventId,
          payloadFingerprint:row.payloadFingerprint,
          sourceVersion:row.sourceVersion};
      });
      const manifest={
        schemaVersion:1 as const,
        organizationId:site.organizationId,siteId:site.id,
        from:from.toISOString(),to:to.toISOString(),asOf:asOf.toISOString(),
        sources,
      };
      const manifestDigest=snapshotManifestDigest(manifest);
      const snapshotId=randomUUID();
      await tx.insert(reportingSourceSnapshots).values({
        id:snapshotId, organizationId:site.organizationId,siteId:site.id,
        periodStart:from,periodEnd:to,asOf,createdByPersonId:actor.actorPersonId!,
        sourceCount:sources.length,manifestDigest,
      });
      await tx.insert(reportingSourceSnapshotEvents).values(sources.map(source=>({
        snapshotId,eventId:source.eventId,
        payloadFingerprint:source.payloadFingerprint,sourceVersion:source.sourceVersion,
      })));
      await writeAudit(tx,actor,{
        action:"reporting.source_snapshot.created",
        entityType:"reporting_source_snapshot",entityId:snapshotId,
        scope:{organizationId:site.organizationId,siteId:site.id},
        after:{sourceCount:sources.length,manifestDigest,
          schemaVersion:1,asOf:asOf.toISOString()},
      });
      return {
        snapshotId,siteId:site.id,manifestDigest,
        sourceCount:sources.length,
        status:"private_source_snapshot" as const,
        lifecycleCompletenessVerified:false as const,
      };
    },{isolationLevel:"repeatable read"});
  });

/**
 * Revalidates current Site-wide scope and source membership each time.
 * A source ID is never returned to the browser by this endpoint.
 */
export const getReportingSourceSnapshot = createServerFn({method:"GET"})
 .validator((input:unknown)=>readInput.parse(input))
 .handler(async ({data})=>{
   setResponseHeader("Cache-Control","private, no-store");
   return readReportingSourceSnapshot(getRequest(),data);
 });
