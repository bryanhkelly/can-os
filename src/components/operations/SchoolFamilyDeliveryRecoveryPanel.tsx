import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  getSchoolFamilyDeliveryAttempts, retrySchoolFamilyDelivery,
} from "@/modules/communication/school-family-delivery-operations.functions";
import { normalizeClientError } from "@/lib/client-error";

/**
 * Authorized source-owned receipts. The retry command never sends mail from
 * the browser; it requeues the original receipt and original idempotency key.
 */
export function SchoolFamilyDeliveryRecoveryPanel(){
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
          client.invalidateQueries({queryKey:["operations-outbox-health"]}),
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
      <Button variant="outline" size="sm" type="button" disabled={results.isFetching}
        onClick={()=>void results.refetch()}>Refresh</Button>
    </div>
    {notice&&<p role="status" className="mt-3 border p-3 text-sm">{notice}</p>}
    {error&&<p role="alert" className="mt-3 border border-destructive p-3 text-sm">{error}</p>}
    {results.isPending&&<p role="status" className="mt-3 text-sm">Loading delivery receipts…</p>}
    {results.isError&&<p role="alert" className="mt-3 text-sm">
      Delivery history is unavailable for your current Site and Organization scope.
    </p>}
    {results.data&&<>
      {results.data.items.length===0&&<p className="mt-3 text-sm text-muted-foreground">
        No delivery receipts in this view.
      </p>}
      <div className="mt-3 divide-y border">
        {results.data.items.map(r=><article key={r.id} className="p-3 text-sm">
          <div className="flex flex-wrap justify-between gap-3">
            <div>
              <p className="font-semibold">{r.channel==="sms"?"SMS":"Email"} · {r.state.replaceAll("_"," ")}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Attempted {r.attempts} time{r.attempts===1?"":"s"} · {new Date(r.createdAt).toLocaleString()}
              </p>
              <p className="mt-1 break-all text-xs text-muted-foreground">Receipt: {r.id}</p>
              {r.nextAttemptAt&&<p className="text-xs text-muted-foreground">
                Next attempt: {new Date(r.nextAttemptAt).toLocaleString()}
              </p>}
            </div>
            {r.canRetry&&<Button variant="outline" size="sm" type="button"
              disabled={!!busy} onClick={()=>{setCandidate(r.id);setReason("");setError("");}}>
              Recover
            </Button>}
          </div>
          {candidate===r.id&&<div className="mt-3 border p-3">
            <label className="block text-xs font-medium" htmlFor="school-family-retry-reason">
              Recovery reason (15 to 500 characters)
            </label>
            <textarea id="school-family-retry-reason" value={reason} maxLength={500}
              onChange={e=>setReason(e.target.value)}
              className="mt-2 min-h-20 w-full border bg-background p-2 text-sm"
              placeholder="Explain why this terminal failure should be retried."/>
            <div className="mt-2 flex gap-2">
              <Button size="sm" type="button" disabled={!!busy||reason.trim().length<15}
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
