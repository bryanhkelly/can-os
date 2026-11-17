import {useState} from "react";
import {useQuery,useQueryClient} from "@tanstack/react-query";
import {Button} from "@/components/ui/button";
import {normalizeClientError} from "@/lib/client-error";
import {
  getNoncreditDeliveryAttempts,retryNoncreditDelivery,
} from "@/modules/enrollment/noncredit-delivery-operations.functions";

/** Provider-scoped outbound receipt history, not an enrollment status screen.
 * Retry only requeues the same outbox receipt. The existing worker performs
 * the actual send and checks that the invitation is still valid.
 */
export function NoncreditDeliveryRecoveryPanel({releaseId}:{releaseId:string}){
 const client=useQueryClient();
 const [cursor,setCursor]=useState<string|undefined>(undefined);
 const [pages,setPages]=useState<Array<string|undefined>>([]);
 const [busy,setBusy]=useState<string|null>(null);
 const [reason,setReason]=useState("");
 const [retryCandidate,setRetryCandidate]=useState<string|null>(null);
 const [notice,setNotice]=useState("");
 const [error,setError]=useState("");
 const history=useQuery({
  queryKey:["noncredit-delivery-attempts",releaseId,cursor],
  queryFn:()=>getNoncreditDeliveryAttempts({data:{releaseId,...(cursor?{cursor}:{})}}),
  retry:false,staleTime:10_000,
 });
 async function retry(deliveryId:string){
  if(busy||reason.trim().length<15)return;
  setBusy(deliveryId);setError("");setNotice("");
  try{
   const result=await retryNoncreditDelivery({data:{
    releaseId,deliveryId,reason:reason.trim(),
   }});
   // Command success is only a queued receipt, not provider acceptance.
   setNotice(result.note);
   setRetryCandidate(null);setReason("");
   try{
    await Promise.all([
     client.invalidateQueries({queryKey:["noncredit-delivery-attempts",releaseId]}),
     client.invalidateQueries({queryKey:["noncredit-cohort-ops",releaseId]}),
    ]);
   }catch{
    setError("Retry was queued, but status could not refresh. Refresh this panel; do not resubmit blindly.");
   }
  }catch(cause){
   setError(normalizeClientError(cause,"Unable to queue a safe retry.").message);
  }finally{setBusy(null);}
 }
 return <section className="mt-5 border-t border-border pt-5" aria-label="Invitation delivery recovery">
  <div className="flex flex-wrap items-start justify-between gap-3">
   <div>
    <h3 className="text-base font-semibold">Invitation delivery & recovery</h3>
    <p className="mt-2 text-xs leading-6 text-muted-foreground">
     Original email outbox receipts for this exact release. Provider acceptance
     does not prove recipient delivery, enrollment or attendance. Expired
     invitations and accepted receipts cannot be resent here.
    </p>
   </div>
   <Button type="button" size="sm" variant="outline" disabled={history.isFetching}
     onClick={()=>void history.refetch()}>Refresh delivery status</Button>
  </div>
  {notice&&<p role="status" className="mt-3 border border-border p-3 text-sm">{notice}</p>}
  {error&&<p role="alert" className="mt-3 border border-destructive p-3 text-sm">{error}</p>}
  {history.isPending&&<p role="status" className="mt-4 text-sm">Loading invitation receipts…</p>}
  {history.isError&&<p role="alert" className="mt-4 text-sm">
   Delivery status is unavailable. Check your current provider and Site authorization.
  </p>}
  {history.data&&<div className="mt-4 divide-y divide-border border border-border">
   {history.data.items.map(row=><article key={row.id} className="p-3 text-sm">
    <div className="flex flex-wrap items-center justify-between gap-3">
     <span className="font-semibold">{row.label}</span>
     <span className="text-xs text-muted-foreground">
      Queued {new Date(row.createdAt).toLocaleString()}
     </span>
    </div>
    <p className="mt-1 text-xs text-muted-foreground">
     Attempts: {row.attempts} · Receipt: {row.id}
     {row.acceptedAt?" · Provider accepted "+new Date(row.acceptedAt).toLocaleString():""}
     {row.nextAttemptAt?" · Scheduled "+new Date(row.nextAttemptAt).toLocaleString():""}
    </p>
    {row.retryable&&<>
     {retryCandidate===row.id?<div className="mt-3 space-y-2">
       <label className="block text-xs font-semibold">Why is another delivery attempt appropriate?
        <textarea rows={2} maxLength={500} value={reason}
         onChange={event=>setReason(event.target.value)}
         className="mt-2 w-full border border-border bg-background p-2 text-sm"/>
       </label>
       <p className="text-xs text-muted-foreground">
        The worker will recheck the live invitation and account before emailing.
       </p>
       <div className="flex gap-2">
        <Button type="button" size="sm" disabled={busy!==null||reason.trim().length<15}
         onClick={()=>void retry(row.id)}>{busy===row.id?"Queuing…":"Queue retry"}</Button>
        <Button type="button" size="sm" variant="outline" disabled={busy!==null}
         onClick={()=>{setRetryCandidate(null);setReason("");}}>Cancel</Button>
       </div>
      </div>:<Button type="button" size="sm" variant="outline" className="mt-3"
       disabled={busy!==null} onClick={()=>{setRetryCandidate(row.id);setReason("");}}>
       Review retry
      </Button>}
    </>}
   </article>)}
   {!history.data.items.length&&<p className="p-4 text-sm text-muted-foreground">
    No email receipts for this release.
   </p>}
  </div>}
  <div className="mt-3 flex gap-3">
   {pages.length>0&&<Button type="button" variant="outline" size="sm"
    onClick={()=>{setCursor(pages[pages.length-1]);setPages(current=>current.slice(0,-1));}}>
    Newer receipts</Button>}
   {history.data?.nextCursor&&<Button type="button" variant="outline" size="sm"
    onClick={()=>{setPages(current=>[...current,cursor]);setCursor(history.data!.nextCursor!);}}>
    Older receipts</Button>}
  </div>
 </section>;
}
