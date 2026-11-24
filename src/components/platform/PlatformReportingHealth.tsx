import {useEffect,useState} from "react";
import {Button} from "@/components/ui/button";
import {StatCard,WorkspaceNotice} from "@/components/workspace";
import {getReportingProjectionHealth,replayReportingProjectionBatch} from "@/modules/insights/reporting-projection-health.functions";
type Health=Awaited<ReturnType<typeof getReportingProjectionHealth>>;
export function PlatformReportingHealth(){
 const [health,setHealth]=useState<Health|null>(null);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [message,setMessage]=useState("");
 async function refresh(){
  setBusy(true);setError("");
  try{setHealth(await getReportingProjectionHealth());}catch{setError("Reporting health could not be loaded.");}finally{setBusy(false);}
 }
 useEffect(()=>{void refresh();},[]);
 async function replay(){
  if(busy||!health?.enabled||!health.storageReady)return;
  setBusy(true);setError("");setMessage("");
  try{const result=await replayReportingProjectionBatch({data:{confirmed:true}});
   setHealth(result.health);setMessage("Replayed "+result.result.processed+" source events. Accepted: "+result.result.accepted+"; legacy: "+result.result.legacy+"; retry pending: "+result.result.retryPending+"; dead letters: "+result.result.deadLettered+".");
  }catch{setError("Replay did not complete. Refresh to check durable receipt state.");}
  finally{setBusy(false);}
 }
 return <section className="mt-6 space-y-4 border border-border bg-card p-5" aria-label="Reporting infrastructure">
  <h2 className="font-serif text-xl">Reporting infrastructure</h2>
  <p className="text-sm text-muted-foreground">Operational pipeline health across governed source events. Receipt counts are not participants, outcomes or impact.</p>
  {health&&<><WorkspaceNotice tone="attention">Projection: {health.status.replaceAll("_"," ")}. Storage checks: {health.storageReady?"passed":"unavailable"}. Private snapshots: {health.snapshotsEnabled?"enabled":"disabled"}.</WorkspaceNotice>
  {health.counts&&<div className="grid gap-3 sm:grid-cols-3">
   {([["Eligible source events",health.counts.eligible],["Accepted receipts",health.counts.accepted],["Unprojected",health.counts.missing],["Legacy events",health.counts.legacy],["Retry pending",health.counts.retryPending],["Dead letters",health.counts.deadLetter],["Duplicate deliveries",health.counts.duplicate],["Normalized but missing",health.counts.normalizedMissing],["Due retries",health.counts.dueRetries]] as const).map(([label,value])=><StatCard key={label} label={label} value={value}/>)}
  </div>}
  <p className="text-xs text-muted-foreground">Checked {health.asOf}. {health.oldestMissingAt?"Oldest unprojected event: "+health.oldestMissingAt:""} Full lifecycle coverage is not certified by these counts.</p></>}
  {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
  {message&&<p role="status" className="text-sm">{message}</p>}
  <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={busy} onClick={()=>void refresh()}>Refresh health</Button><Button type="button" disabled={busy||!health?.enabled||!health.storageReady||!health.counts||(health.counts.missing+health.counts.dueRetries===0)} onClick={()=>void replay()}>Replay up to 50 source events</Button></div>
 </section>;
}
