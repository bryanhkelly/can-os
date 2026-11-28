import {createHash} from "node:crypto";
import {asc,eq} from "drizzle-orm";
import {z} from "zod";
import {db} from "@/db/client";
import {reportingSourceEventReceipts,reportingSourceSnapshotEvents,reportingSourceSnapshots} from "@/db/schema";
import {canonicalReportingSnapshotManifest} from "@/domain/reporting-snapshot-manifest";
import {getCommandContext} from "@/modules/identity/command-context.server";
import {loadAuthorizedSiteReportingScope} from "./site-reporting-source-scope.server";
import {AuthorizationError} from "@/domain/command-context";
import {parseCommandInput} from "@/domain/command-input";
const MAX_SOURCES=2000;
const readInput=z.object({snapshotId:z.string().uuid()}).strict();
export function snapshotManifestDigest(manifest:Parameters<typeof canonicalReportingSnapshotManifest>[0]):string{
 return createHash("sha256").update(canonicalReportingSnapshotManifest(manifest)).digest("hex");
}
/** One transport-neutral reader; current scope and source integrity are revalidated. */
export async function readReportingSourceSnapshot(request:Request,raw:unknown){
 const data=parseCommandInput(readInput,raw);
 const actor=await getCommandContext(request);
    return db.transaction(async tx=>{
      const [record]=await tx.select().from(reportingSourceSnapshots)
        .where(eq(reportingSourceSnapshots.id,data.snapshotId)).limit(1);
      // Fail closed on missing or unauthorized snapshot.
      if(!record) throw new AuthorizationError("authorized snapshot scope");
      const site=await loadAuthorizedSiteReportingScope(tx,actor,record.siteId);
      if(site.organizationId!==record.organizationId) {
        throw new AuthorizationError("authorized snapshot scope");
      }
      const members=await tx.select({
        eventId:reportingSourceSnapshotEvents.eventId,
        payloadFingerprint:reportingSourceSnapshotEvents.payloadFingerprint,
        sourceVersion:reportingSourceSnapshotEvents.sourceVersion,
        currentFingerprint:reportingSourceEventReceipts.payloadFingerprint,
        currentVersion:reportingSourceEventReceipts.sourceVersion,
        currentStatus:reportingSourceEventReceipts.status,
      }).from(reportingSourceSnapshotEvents)
        .innerJoin(reportingSourceEventReceipts,
          eq(reportingSourceSnapshotEvents.eventId,reportingSourceEventReceipts.eventId))
        .where(eq(reportingSourceSnapshotEvents.snapshotId,record.id))
        .orderBy(asc(reportingSourceSnapshotEvents.eventId))
        .limit(MAX_SOURCES+1);
      if(members.length!==record.sourceCount || members.length>MAX_SOURCES ||
         members.some(m=>m.currentStatus!=="accepted" ||
           m.currentFingerprint!==m.payloadFingerprint ||
           m.currentVersion!==m.sourceVersion)) {
        throw new Error("Snapshot source manifest no longer reconciles");
      }
      const digest=snapshotManifestDigest({
        schemaVersion:1, organizationId:record.organizationId, siteId:record.siteId,
        from:record.periodStart.toISOString(),to:record.periodEnd.toISOString(),
        asOf:record.asOf.toISOString(),
        sources:members.map(m=>({eventId:m.eventId,
          payloadFingerprint:m.payloadFingerprint,sourceVersion:m.sourceVersion})),
      });
      if(digest!==record.manifestDigest)throw new Error("Snapshot integrity verification failed");
      return {
        snapshotId:record.id,siteId:site.id,
        from:record.periodStart.toISOString(),to:record.periodEnd.toISOString(),
        asOf:record.asOf.toISOString(),sourceCount:record.sourceCount,
        manifestDigest:digest,status:"private_source_snapshot" as const,
        lifecycleCompletenessVerified:false as const,
      };
    },{isolationLevel:"repeatable read",accessMode:"read only"});

}
