import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { WorkspaceShell } from "@/components/workspace";
import {
  closeNoncreditSelfEnrollment,getNoncreditEnrollmentPublisher,
  publishNoncreditSelfEnrollment,
} from "@/modules/enrollment/noncredit-enrollment-publication.functions";
import { normalizeClientError } from "@/lib/client-error";
import { NoncreditReleaseOperations } from "@/components/enrollment/NoncreditReleaseOperations";

export const Route=createFileRoute("/programs/noncredit/enrollment")({
  component:NoncreditPublicationPage,
});
type Publisher=Awaited<ReturnType<typeof getNoncreditEnrollmentPublisher>>;
type Candidate=Publisher["candidates"][number];
function candidateKey(candidate:Candidate){
  return [candidate.deploymentId,candidate.adoptionId,
    candidate.trainingVersionId,candidate.courseVersionId].join(":");
}

/** Actual provider enrollment release, not the Capability Lab prototype. */
function NoncreditPublicationPage(){
  const client=useQueryClient();
  const query=useQuery({queryKey:["noncredit-publisher-releases"],
    queryFn:()=>getNoncreditEnrollmentPublisher(),retry:false,staleTime:15_000});
  const [choice,setChoice]=useState("");
  const [deliveryMode,setDeliveryMode]=useState<"independent"|"facilitated">("independent");
  const [siteId,setSiteId]=useState("");
  const [opensAt,setOpensAt]=useState("");
  const [closesAt,setClosesAt]=useState("");
  const [maxParticipants,setMaxParticipants]=useState("");
  const [consentVersion,setConsentVersion]=useState("");
  const [consentText,setConsentText]=useState("");
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [created,setCreated]=useState("");
  const [managedRelease,setManagedRelease]=useState<string|null>(null);
  const selected=query.data?.candidates.find(item=>candidateKey(item)===choice);
  const valid=selected&&opensAt&&closesAt&&maxParticipants&&consentVersion.trim().length>=3&&
    consentText.trim().length>=25&&(deliveryMode==="independent"||siteId);
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(!selected||!valid||busy)return;
    setBusy(true);setMessage("");setCreated("");
    try{
      const result=await publishNoncreditSelfEnrollment({data:{
        deploymentId:selected.deploymentId,adoptionId:selected.adoptionId,
        trainingVersionId:selected.trainingVersionId,courseVersionId:selected.courseVersionId,
        deliveryMode,siteId:deliveryMode==="facilitated"?siteId:null,
        opensAt:new Date(opensAt).toISOString(),closesAt:new Date(closesAt).toISOString(),
        maxParticipants:Number(maxParticipants),consentVersion:consentVersion.trim(),
        consentText:consentText.trim(),
      }});
      setCreated(result.releaseId);
      setMessage("Enrollment release published. It will appear to learners only inside its published registration window.");
      await client.invalidateQueries({queryKey:["noncredit-publisher-releases"]});
      await client.invalidateQueries({queryKey:["noncredit-open-releases"]});
    }catch(error){setMessage(normalizeClientError(error,
      "Unable to publish. Check provider authority, course release, capacity and the current approved adoption.").message);}
    finally{setBusy(false);}
  }
  async function close(releaseId:string){
    if(busy)return;
    setBusy(true);setMessage("");
    try{
      await closeNoncreditSelfEnrollment({data:{releaseId}});
      setMessage("Enrollment closed. Existing course records remain separate from this registration window.");
      await client.invalidateQueries({queryKey:["noncredit-publisher-releases"]});
      await client.invalidateQueries({queryKey:["noncredit-open-releases"]});
    }catch(error){setMessage(normalizeClientError(error,"Unable to close this enrollment release.").message);}
    finally{setBusy(false);}
  }
  return <WorkspaceShell eyebrow="Program operations" title="Noncredit enrollment"
    width="wide" subtitle="Publish authorized enrollment windows for an approved training and delivery. Each learner registers themselves with their own verified CAN identity.">
    {query.isPending&&<p role="status" className="mt-6 border border-border bg-card p-5 text-sm">Loading your provider-scoped training and deployment authority…</p>}
    {query.isError&&<p role="alert" className="mt-6 border border-border bg-card p-5 text-sm">
      Provider enrollment access is unavailable. A current canonical Site administrator or registrar session is required.
      <button type="button" className="ml-2 font-semibold text-primary underline" onClick={()=>void query.refetch()}>Retry</button>
    </p>}
    {query.data&&<div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(15rem,.8fr)]">
      <section className="border border-border bg-card p-5">
        <h2 className="font-serif text-2xl">Publish enrollment</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          A published training, active operating organization, approved current adoption,
          published Course, approved completion policy and your verified operator role are all required.
          Enrollment terms are versioned and immutable after publication.
        </p>
        {query.data.candidates.length===0&&<p role="status" className="mt-5 border border-border bg-muted/30 p-4 text-sm">
          No eligible training/adoption combination is available in your current operator and Site scope.
          Finalize the curriculum, completion policy and deployment approval first.
        </p>}
        {query.data.candidates.length>0&&<form onSubmit={event=>void submit(event)} className="mt-5 space-y-5">
          <div>
            <label htmlFor="nc-candidate" className="block text-sm font-semibold">Approved training / deployment</label>
            <select id="nc-candidate" required value={choice}
              onChange={event=>{setChoice(event.target.value);setSiteId("");}}
              className="mt-2 min-h-11 w-full border border-border bg-background px-3 text-sm">
              <option value="">Choose an approved program release</option>
              {query.data.candidates.map(item=><option key={candidateKey(item)} value={candidateKey(item)}>
                {item.trainingTitle} · {item.deploymentName} · {item.providerName}
              </option>)}
            </select>
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold">Delivery mode</legend>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2"><input type="radio" name="nc-delivery"
                checked={deliveryMode==="independent"} onChange={()=>{setDeliveryMode("independent");setSiteId("");}}/>
                Independent / online
              </label>
              <label className="flex items-center gap-2"><input type="radio" name="nc-delivery"
                checked={deliveryMode==="facilitated"} onChange={()=>setDeliveryMode("facilitated")}/>
                Facilitated at a Site
              </label>
            </div>
          </fieldset>
          {deliveryMode==="facilitated"&&<div>
            <label htmlFor="nc-site" className="block text-sm font-semibold">Authorized hosting Site</label>
            <select id="nc-site" required value={siteId} onChange={event=>setSiteId(event.target.value)}
              className="mt-2 min-h-11 w-full border border-border bg-background px-3 text-sm">
              <option value="">Choose a deployment Site</option>
              {selected?.siteOptions.map(site=><option key={site.id} value={site.id}>{site.name}</option>)}
            </select>
            {!selected?.siteOptions.length&&<p className="mt-2 text-xs text-muted-foreground">
              This deployment has no currently authorized hosting Site in your scope.
            </p>}
          </div>}
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-semibold">Registration opens
              <input type="datetime-local" required value={opensAt} onChange={event=>setOpensAt(event.target.value)}
                className="mt-2 min-h-11 w-full border border-border bg-background px-3 text-sm"/>
            </label>
            <label className="block text-sm font-semibold">Registration closes
              <input type="datetime-local" required value={closesAt} onChange={event=>setClosesAt(event.target.value)}
                className="mt-2 min-h-11 w-full border border-border bg-background px-3 text-sm"/>
            </label>
          </div>
          <label className="block text-sm font-semibold">Maximum registrations
            <input type="number" min={1} max={1000000} step={1} required value={maxParticipants}
              onChange={event=>setMaxParticipants(event.target.value)}
              className="mt-2 min-h-11 w-full border border-border bg-background px-3 text-sm"/>
          </label>
          <label className="block text-sm font-semibold">Participation terms version
            <input type="text" required minLength={3} maxLength={80} value={consentVersion}
              onChange={event=>setConsentVersion(event.target.value)} placeholder="e.g. training-policy-v1"
              className="mt-2 min-h-11 w-full border border-border bg-background px-3 text-sm"/>
          </label>
          <label className="block text-sm font-semibold">Approved terms shown to each participant
            <textarea required minLength={25} maxLength={4000} rows={7} value={consentText}
              onChange={event=>setConsentText(event.target.value)}
              className="mt-2 w-full border border-border bg-background px-3 py-3 text-sm"
              placeholder="Provide the actual approved enrollment, participation and data-use terms for this training. Do not include unapproved claims."/>
          </label>
          <p className="text-xs leading-6 text-muted-foreground">
            Publication is immediate when the window is open. You can close a release, but changing
            its terms, delivery, course or capacity requires a new release.
          </p>
          <Button type="submit" disabled={!valid||busy}>{busy?"Publishing…":"Publish self-enrollment"}</Button>
        </form>}
        {message&&<p role="status" className="mt-4 border border-border bg-muted/20 p-4 text-sm">{message}</p>}
        {created&&<Link to="/learn/enroll" search={{release:created}}
          className="mt-4 inline-block text-sm font-semibold text-primary underline underline-offset-4">View learner registration</Link>}
      </section>
      <section className="border border-border bg-card p-5 self-start">
        <h2 className="font-serif text-2xl">Published releases</h2>
        <p className="mt-2 text-sm text-muted-foreground">Current enrollment windows for your operating organization.</p>
        <div className="mt-4 divide-y divide-border">
          {query.data.published.map(row=><div key={row.id} className="space-y-2 py-4 first:pt-0">
            <p className="text-sm font-semibold">{row.title}</p>
            <p className="text-xs text-muted-foreground">
              {row.deliveryMode==="facilitated"?"Facilitated":"Independent"} · {row.status} · capacity {row.maxParticipants}
            </p>
            <p className="text-xs text-muted-foreground">
              {new Date(row.opensAt).toLocaleDateString()} to {new Date(row.closesAt).toLocaleDateString()}
            </p>
            <div className="flex flex-wrap gap-3">
              <Link to="/learn/enroll" search={{release:row.id}}
                className="text-xs font-semibold text-primary underline underline-offset-4">Learner link</Link>
              <button type="button" className="text-xs font-semibold text-primary underline underline-offset-4"
                onClick={()=>setManagedRelease(id=>id===row.id?null:row.id)}>
                {managedRelease===row.id?"Hide roster":"Roster & sessions"}
              </button>
              {row.status==="published"&&<button type="button" disabled={busy}
                onClick={()=>void close(row.id)}
                className="text-xs font-semibold text-destructive underline underline-offset-4">Close registration</button>}
            </div>
          </div>)}
          {!query.data.published.length&&<p className="py-4 text-sm text-muted-foreground">Nothing has been published yet.</p>}
        </div>
      </section>
    </div>}
    {managedRelease&&<NoncreditReleaseOperations key={managedRelease} releaseId={managedRelease}/>}
  </WorkspaceShell>;
}
