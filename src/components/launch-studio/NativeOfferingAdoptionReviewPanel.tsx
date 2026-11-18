import { useState, type FormEvent } from "react";
import { useQuery,useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { WorkspacePanel, MutationFeedback, WorkspaceNotice } from "@/components/workspace";
import { useMutationFeedback } from "@/lib/mutation-feedback";
import { invalidateNativeClassAvailability } from "@/lib/native-class-availability-cache";
import { publisherReleaseAvailableForAdoption } from "@/domain/native-offering-adoption-publication";
import {
  approveNativeOfferingAdoption,getNativeOfferingAdoptionReviewQueue,
} from "@/modules/programs/native-offering-adoption-review.functions";

type Adoption=Awaited<ReturnType<typeof getNativeOfferingAdoptionReviewQueue>>["items"][number];

function AdoptionReview({item}:{item:Adoption}){
  const client=useQueryClient();
  const [evidence,setEvidence]=useState("");
  const [reason,setReason]=useState("");
  const publisherReleaseReady=publisherReleaseAvailableForAdoption(item);
  const feedback=useMutationFeedback(async()=>{
    await Promise.all([
      client.invalidateQueries({queryKey:["native-adoption-review-queue"]},
        {throwOnError:true}),
      invalidateNativeClassAvailability(client),
    ]);
  });
  async function approve(event:FormEvent){
    event.preventDefault();
    if(!publisherReleaseReady||feedback.pending||feedback.refreshFailed)return;
    await feedback.run(()=>approveNativeOfferingAdoption({data:{
      adoptionId:item.adoptionId,evidenceVersionId:evidence.trim(),
      rationale:reason.trim(),
    }}),{
      successMessage:"Adoption approved after independent verification. Operation and Class remain separately gated.",
      commandErrorMessage:"Adoption was not approved. Verify Blueprint provenance, current Site grants and independent deployment readiness.",
      refreshErrorMessage:"Adoption approval was saved, but the review and Class availability views did not refresh. Retry refresh without approving again.",
    });
  }
  return <article className="border border-border bg-card p-4">
    <h3 className="font-semibold">{item.title} · v{item.versionNo}</h3>
    <p className="mt-1 text-sm text-muted-foreground">
      {item.deploymentName} · Offering {item.lifecycle} ·
      Deployment {item.deploymentState} · Operation {item.operationState}
    </p>
    {!publisherReleaseReady&&<WorkspaceNotice tone="attention" className="mt-3">
      The exact publisher Offering is not yet published and active. Independent Course and
      Offering publication must finish before this adoption can be approved. This proposal
      remains visible, but a Blueprint reviewer cannot publish the publisher Offering.
    </WorkspaceNotice>}
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
      <div><Button type="submit" disabled={!publisherReleaseReady||feedback.pending||feedback.refreshFailed||reason.trim().length<10||!evidence.trim()}>
        {feedback.pending?"Checking approval…":"Approve verified adoption"}
      </Button></div>
    </form>
    <MutationFeedback state={feedback} className="mt-3"
      pendingMessage="Verifying independent adoption, exact-version provenance, evidence and current Site authority…"/>
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
