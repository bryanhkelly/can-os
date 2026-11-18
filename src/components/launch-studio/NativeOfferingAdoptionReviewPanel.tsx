import { useState, type FormEvent } from "react";
import { useQuery,useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { WorkspacePanel } from "@/components/workspace";
import { normalizeClientError } from "@/lib/client-error";
import {
  approveNativeOfferingAdoption,getNativeOfferingAdoptionReviewQueue,
} from "@/modules/programs/native-offering-adoption-review.functions";

type Adoption=Awaited<ReturnType<typeof getNativeOfferingAdoptionReviewQueue>>["items"][number];

function AdoptionReview({item}:{item:Adoption}){
  const client=useQueryClient();
  const [evidence,setEvidence]=useState("");
  const [reason,setReason]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  async function approve(event:FormEvent){
    event.preventDefault();setError("");setNotice("");setBusy(true);
    try{
      await approveNativeOfferingAdoption({data:{
        adoptionId:item.adoptionId,evidenceVersionId:evidence.trim(),
        rationale:reason.trim(),
      }});
      setNotice("Adoption approved after independent verification. Operation and Class remain separately gated.");
      await client.invalidateQueries({queryKey:["native-adoption-review-queue"]});
    }catch(cause){
      setError(normalizeClientError(cause,
        "Adoption was not approved. Verify Blueprint provenance, current Site grants and independent deployment readiness.").message);
    }finally{setBusy(false)}
  }
  return <article className="border border-border bg-card p-4">
    <h3 className="font-semibold">{item.title} · v{item.versionNo}</h3>
    <p className="mt-1 text-sm text-muted-foreground">
      {item.deploymentName} · Offering {item.lifecycle} ·
      Deployment {item.deploymentState} · Operation {item.operationState}
    </p>
    <p className="mt-2 text-sm">
      Approval requires an independently reviewed exact-version Blueprint execution,
      approved operator relationship, active authorized Sites, verified operating,
      delivery and registration readiness, and evidence of independent review.
    </p>
    <form className="mt-3 grid gap-3" onSubmit={event=>void approve(event)}>
      <Field label="Independent adoption review rationale">
        <Textarea required rows={3} minLength={10} maxLength={2000}
          value={reason} onChange={event=>setReason(event.target.value)}/>
      </Field>
      <Field label="Verified adoption evidence version UUID">
        <Input required value={evidence} onChange={event=>setEvidence(event.target.value)}/>
      </Field>
      <div><Button type="submit" disabled={busy||reason.trim().length<10||!evidence.trim()}>
        {busy?"Checking approval…":"Approve verified adoption"}
      </Button></div>
    </form>
    {error&&<p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
    {notice&&<p role="status" className="mt-3 text-sm">{notice}</p>}
  </article>;
}

export function NativeOfferingAdoptionReviewPanel(){
  const queue=useQuery({
    queryKey:["native-adoption-review-queue"],
    queryFn:()=>getNativeOfferingAdoptionReviewQueue(),retry:false,
  });
  return <WorkspacePanel className="mt-6" title="Native Offering adoption review"
    description="Review a proposed local adoption separately from publisher publication and Class activation.">
    {queue.isPending&&<p role="status">Checking current Organization-wide adoption reviewer access…</p>}
    {queue.isError&&<p role="alert">
      Adoption review is unavailable under this independent reviewer appointment.
    </p>}
    {queue.data?.limited&&<p role="alert">
      Results are limited. Narrow the review scope before relying on completeness.
    </p>}
    {queue.isSuccess&&queue.data.items.length===0&&<p role="status">
      No proposed native Offering adoptions are available under current operating Organization grants.
    </p>}
    <div className="mt-4 grid gap-3">
      {queue.data?.items.map(item=><AdoptionReview key={item.adoptionId} item={item}/>)}
    </div>
  </WorkspacePanel>;
}
