import {sql} from "drizzle-orm";
import {db} from "@/db/client";

/** Explicit opt-in: do not delete historical security evidence without approval.
 * RUN ONCE per day even when the Netlify maintenance job executes every 5 minutes.
 * The lease and pruning are a single transaction to avoid multiple workers racing.
 */
export async function runSessionDeviceRetention(
 enabled=process.env.CAN_SESSION_DEVICE_RETENTION_ENABLED==="1",
):Promise<boolean>{
 if(!enabled)return false;
 return db.transaction(async tx=>{
  const lease=await tx.execute(sql`
   INSERT INTO public.session_device_retention_state(task_key,last_run_at)
   VALUES ('security_metadata',now())
   ON CONFLICT(task_key) DO UPDATE SET last_run_at=EXCLUDED.last_run_at
   WHERE session_device_retention_state.last_run_at < now()-interval '24 hours'
   RETURNING task_key
  `);
  if(!lease.rows?.length)return false;
  // Raw network addresses are short-lived and not retained in learning telemetry.
  await tx.execute(sql`
   UPDATE public.access_sessions
   SET ip_address=NULL,network_observed_at=NULL
   WHERE network_observed_at < now()-interval '30 days'
  `);
  await tx.execute(sql`
   UPDATE education_v30.canonical_sessions
   SET ip_address=NULL,network_observed_at=NULL
   WHERE network_observed_at < now()-interval '30 days'
  `);
  await tx.execute(sql`
   DELETE FROM public.access_session_signals
   WHERE occurred_at < now()-interval '90 days'
  `);
  return true;
 });
}
