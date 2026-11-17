import {useState} from "react";
import {useQuery,useQueryClient} from "@tanstack/react-query";
import {Button} from "@/components/ui/button";
import {Field} from "@/components/ui/field";
import {Textarea} from "@/components/ui/textarea";
import {DeliveryReceiptFacts} from "@/components/communication/DeliveryReceiptFacts";
import {EmptyState, StatusBadge, WorkspaceNotice} from "@/components/workspace";
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
   <Button type="button" size="sm" variant="outline" loading={history.isFetching} disabled={history.isFetching}
     onClick={()=>void history.refetch()}>Refresh delivery status</Button>
  </div>
  {notice&&<WorkspaceNotice tone={error?"attention":"success"} className="mt-3">
    <p>{notice}</p>
    {error&&<p className="mt-1">{error}</p>}
  </WorkspaceNotice>}
  {error&&!notice&&<WorkspaceNotice tone="danger" className="mt-3">{error}</WorkspaceNotice>}
  {history.isPending&&<p role="status" className="mt-4 text-sm">Loading invitation receipts…</p>}
  {history.isError&&<WorkspaceNotice tone="danger" className="mt-4">
   Delivery status is unavailable. Check your current provider and Site authorization.
  </WorkspaceNotice>
  {history.data&&<div className="mt-4 divide-y divide-border border border-border">
   {history.data.items.map(row=><article key={row.id} className="p-3 text-sm">
    <div className="flex flex-wrap items-center justify-between gap-3">
     <StatusBadge tone={row.retryable?"attention":"neutral"}>{row.label}</StatusBadge>
    </div>
    <DeliveryReceiptFacts receipt={row} className="mt-3 gap-2"/>
    {row.retryable&&<>
     {retryCandidate===row.id?<div className="mt-3 space-y-2">
       <Field label="Why is another delivery attempt appropriate?" required>
        <Textarea rows={2} maxLength={500} value={reason}
         onChange={event=>setReason(event.target.value)}/>
       </Field>
       <p className="text-xs text-muted-foreground">
        The worker will recheck the live invitation and account before emailing.
       </p>
       <div className="flex gap-2">
        <Button type="button" size="sm" disabled={busy!==null||reason.trim().length<15}
         onClick={()=>void retry(row.id)} loading={busy===row.id}>{busy===row.id?"Queuing…":"Queue retry"}</Button>
        <Button type="button" size="sm" variant="outline" disabled={busy!==null}
         onClick={()=>{setRetryCandidate(null);setReason("");}}>Cancel</Button>
       </div>
      </div>:<Button type="button" size="sm" variant="outline" className="mt-3"
       disabled={busy!==null} onClick={()=>{setRetryCandidate(row.id);setReason("");}}>
       Review retry
      </Button>}
    </>}
   </article>)}
   {!history.data.items.length&&<EmptyState title="No email receipts for this release."/>}
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
