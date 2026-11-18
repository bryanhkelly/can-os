import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { DeliveryReceiptFacts } from "@/components/communication/DeliveryReceiptFacts";
import { EmptyState, StatusBadge, WorkspaceNotice } from "@/components/workspace";
import {
  getSchoolFamilyDeliveryAttempts, retrySchoolFamilyDelivery,
} from "@/modules/communication/school-family-delivery-operations.functions";
import { normalizeClientError } from "@/lib/client-error";

/**
 * Authorized source-owned receipts. The retry command never sends mail from
 * the browser; it requeues the original receipt and original idempotency key.
 */
export function SchoolFamilyDeliveryRecoveryPanel({onRecovered}:{onRecovered?:()=>void|Promise<void>}={}){
  const client=useQueryClient();
  const [cursor,setCursor]=useState<string|undefined>();
  const [previous,setPrevious]=useState<Array<string|undefined>>([]);
  const [candidate,setCandidate]=useState<string|null>(null);
  const [reason,setReason]=useState("");
  const [busy,setBusy]=useState<string|null>(null);
  const [notice,setNotice]=useState("");
  const [error,setError]=useState("");
  const results=useQuery({
    queryKey:["school-family-delivery-receipts",cursor],
    queryFn:()=>getSchoolFamilyDeliveryAttempts({data:{...(cursor?{cursor}:{})}}),
    retry:false,staleTime:10_000,
  });
  async function queueRetry(id:string){
    if(busy||reason.trim().length<15)return;
    setBusy(id);setNotice("");setError("");
    try{
      const result=await retrySchoolFamilyDelivery({data:{deliveryId:id,reason:reason.trim()}});
      setCandidate(null);setReason("");setNotice(result.note);
      try{
        await Promise.all([
          client.invalidateQueries({queryKey:["school-family-delivery-receipts"]}),
          Promise.resolve(onRecovered?.()),
        ]);
      }catch{
        setError("Retry queued, but status refresh failed. Refresh before taking another action.");
      }
    }catch(cause){
      setError(normalizeClientError(cause,"Unable to queue delivery recovery.").message);
    }finally{setBusy(null);}
  }
  return <section aria-label="School-family delivery recovery" className="mt-6 border-t pt-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 className="font-semibold">School-family delivery history</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Scoped receipts only. Provider acceptance is not proof of delivery.
          Only terminal failed receipts may be requeued, and every recovery is audited.
        </p>
      </div>
      <Button variant="outline" size="sm" type="button" loading={results.isFetching} disabled={results.isFetching}
        onClick={()=>void results.refetch()}>Refresh</Button>
    </div>
    {notice&&<WorkspaceNotice tone={error?"attention":"success"} className="mt-3">
      <p>{notice}</p>
      {error&&<p className="mt-1">{error}</p>}
    </WorkspaceNotice>}
    {error&&!notice&&<WorkspaceNotice tone="danger" className="mt-3">{error}</WorkspaceNotice>}
    {results.isPending&&<p role="status" className="mt-3 text-sm">Loading delivery receipts…</p>}
    {results.isError&&<WorkspaceNotice tone="danger" className="mt-3">
      Delivery history is unavailable for your current Site and Organization scope.
    </WorkspaceNotice>}
    {results.data&&<>
      {results.data.items.length===0&&<EmptyState title="No delivery receipts in this view." className="mt-3"/>}
      <div className="mt-3 divide-y border">
        {results.data.items.map(r=><article key={r.id} className="p-3 text-sm">
          <div className="flex flex-wrap justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">{r.channel==="sms"?"SMS":"Email"}</p>
              <StatusBadge tone={r.state==="requires_provider_reconciliation"?"attention"
                :r.state==="failed"||r.state==="provider_failed"||r.state==="complained"?"danger"
                  :r.state==="provider_accepted"?"info":"neutral"}>
                {r.state.replaceAll("_"," ")}
              </StatusBadge>
              <DeliveryReceiptFacts receipt={r} className="mt-3 gap-2"/>
              {r.state==="requires_provider_reconciliation"&&<p className="mt-2 text-xs text-muted-foreground">
                SMS transport outcome is uncertain. Automated and manual retries
                are disabled to prevent duplicate messages. Reconcile with the
                messaging provider before taking further action.
              </p>}

            </div>
            {r.canRetry&&<Button variant="outline" size="sm" type="button"
              disabled={!!busy} onClick={()=>{setCandidate(r.id);setReason("");setError("");}}>
              Recover
            </Button>}
          </div>
          {candidate===r.id&&<div className="mt-3 border p-3">
            <Field label="Recovery reason (15 to 500 characters)" required>
              <Textarea value={reason} maxLength={500}
                onChange={e=>setReason(e.target.value)}
                placeholder="Explain why this terminal failure should be retried."/>
            </Field>
            <div className="mt-2 flex gap-2">
              <Button size="sm" type="button" loading={busy===r.id} disabled={!!busy||reason.trim().length<15}
                onClick={()=>void queueRetry(r.id)}>
                {busy===r.id?"Queueing…":"Queue safe retry"}
              </Button>
              <Button variant="outline" size="sm" type="button" disabled={!!busy}
                onClick={()=>{setCandidate(null);setReason("");}}>Cancel</Button>
            </div>
          </div>}
        </article>)}
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <Button variant="outline" size="sm" type="button"
          disabled={previous.length===0||results.isFetching}
          onClick={()=>{setCursor(previous[previous.length-1]);setPrevious(list=>list.slice(0,-1));}}>
          Previous
        </Button>
        <span className="text-xs text-muted-foreground">Page {previous.length+1}</span>
        <Button variant="outline" size="sm" type="button"
          disabled={!results.data.nextCursor||results.isFetching}
          onClick={()=>{setPrevious(list=>[...list,cursor]);setCursor(results.data!.nextCursor!);}}>
          Next
        </Button>
      </div>
    </>}
  </section>;
}
