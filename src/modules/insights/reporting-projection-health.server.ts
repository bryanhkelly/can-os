import {sql} from "drizzle-orm";
import {db} from "@/db/client";
import {REPORTABLE_EVENT_CATALOG} from "@/domain/reportable-event-catalog";
import {assessProjectionHealth,type ProjectionHealthCounts} from "@/domain/reporting-projection-health";
import {reportingProjectionEnabled,reportingSnapshotsEnabled} from "./reporting-projection-rollout.server";

/** Operational health only. Never returns tenant/source identifiers, event
 * payloads, personal information, or grants access to impact evidence.
 * Explicitly distinguishes missing storage, disabled rollout and backlog. */
export async function readReportingProjectionHealth(){
 const enabled=reportingProjectionEnabled(),snapshotsEnabled=reportingSnapshotsEnabled();
 const asOf=new Date().toISOString();
 const unavailable=()=>({asOf,enabled,snapshotsEnabled,storageReady:false,counts:null,status:"unavailable" as const,oldestMissingAt:null});
 try{
  return await db.transaction(async tx=>{
   const readiness=await tx.execute(sql`
    SELECT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='public' AND c.relname='reporting_source_event_receipts'
     AND c.relrowsecurity AND c.relforcerowsecurity
     AND has_table_privilege(current_user,c.oid,'SELECT')
     AND has_table_privilege(current_user,c.oid,'INSERT')
     AND has_table_privilege(current_user,c.oid,'UPDATE')
     AND EXISTS(SELECT 1 FROM pg_trigger t WHERE t.tgrelid=c.oid AND t.tgname='guard_reporting_source_receipt_mutation' AND t.tgenabled IN ('O','A'))
     AND NOT EXISTS(SELECT 1 FROM pg_roles r WHERE r.rolname IN ('anonymous','authenticated')
      AND (has_table_privilege(r.rolname,c.oid,'SELECT') OR has_table_privilege(r.rolname,c.oid,'INSERT') OR has_table_privilege(r.rolname,c.oid,'UPDATE') OR has_table_privilege(r.rolname,c.oid,'DELETE')))
     ) AS ready`);
   if(readiness.rows[0]?.ready!==true)return unavailable();
   const types=sql.join(Object.keys(REPORTABLE_EVENT_CATALOG).map(type=>sql`${type}`),sql`,`);
   const result=await tx.execute(sql`
    SELECT count(*)::int eligible,
     count(*) FILTER(WHERE r.status='accepted')::int accepted,
     count(*) FILTER(WHERE r.status='duplicate')::int duplicate,
     count(*) FILTER(WHERE r.status='legacy')::int legacy,
     count(*) FILTER(WHERE r.status='retry_pending')::int AS "retryPending",
     count(*) FILTER(WHERE r.status='dead_letter')::int AS "deadLetter",
     count(*) FILTER(WHERE r.event_id IS NULL)::int missing,
     count(*) FILTER(WHERE r.event_id IS NULL AND e.payload ? 'reporting')::int AS "normalizedMissing",
     count(*) FILTER(WHERE r.status='retry_pending' AND r.next_attempt_at<=${asOf}::timestamptz)::int AS "dueRetries",
     min(e.created_at) FILTER(WHERE r.event_id IS NULL)::text AS "oldestMissingAt"
    FROM public.domain_events e LEFT JOIN public.reporting_source_event_receipts r ON r.event_id=e.id
    WHERE e.event_type IN (${types})`);
   const row=result.rows[0] as unknown as (ProjectionHealthCounts&{oldestMissingAt:string|null})|undefined;
   if(!row)return unavailable();
   const {oldestMissingAt,...counts}=row;
   return {asOf,enabled,snapshotsEnabled,storageReady:true,counts,status:assessProjectionHealth({enabled,storageReady:true,counts}),oldestMissingAt};
  },{isolationLevel:"repeatable read",accessMode:"read only"});
 }catch{
  // Storage or role unavailable. Never print DB exceptions or source payloads.
  return unavailable();
 }
}
