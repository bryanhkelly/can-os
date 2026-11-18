import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { WorkspacePanel } from "@/components/workspace";
import { normalizeClientError } from "@/lib/client-error";
import {
  getNativeOfferingReleaseReviewQueue, decideNativeOfferingRelease,
  publishNativeOfferingCourses, publishNativeOfferingVersion,
} from "@/modules/learning/native-offering-release.functions";

type Item=Awaited<ReturnType<typeof getNativeOfferingReleaseReviewQueue>>["items"][number];
const categories=["academic","rights","accessibility","coverage","safety"] as const;

function ReleaseReview({item}:{item:Item}){
  const client=useQueryClient();
  const [category,setCategory]=useState<(typeof categories)[number]>("academic");
  const [decision,setDecision]=useState<"rejected"|"approved">("rejected");
  const [evidence,setEvidence]=useState("");
  const [reason,setReason]=useState("");
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState("");
  const [error,setError]=useState("");
  const fullyApproved=categories.every(kind=>item.reviews.some(review=>
    review.kind===kind&&review.decision==="approved"));
  async function run(action:()=>Promise<unknown>,message:string){
    setBusy(true);setNotice("");setError("");
    try{
      await action();
      setNotice(message);
      await client.invalidateQueries({queryKey:["native-offering-release-review-queue"]});
    }catch(cause){
      setError(normalizeClientError(cause,"Release action was not accepted.").message);
    }finally{setBusy(false)}
  }
  function submit(event:FormEvent){
    event.preventDefault();
    if(!item.current||item.status!=="draft"||busy)return;
    void run(()=>decideNativeOfferingRelease({data:{
      offeringVersionId:item.offeringVersionId,manifestId:item.id,
      expectedHash:item.manifestHash,reviewKind:category,decision,
      evidenceVersionId:evidence.trim()||null,rationale:reason.trim(),
    }}),"Independent review decision recorded.");
  }
  const release={offeringVersionId:item.offeringVersionId,
    manifestId:item.id,expectedHash:item.manifestHash};
  return <article className="border border-border bg-card p-4">
    <h3 className="font-semibold">{item.offeringTitle}</h3>
    <p className="mt-1 text-sm text-muted-foreground">
      {item.courseCount} Course(s) · {item.manifestHash.slice(0,12)} ·
      {" "}{item.offeringPublished?"Offering published":item.allCoursesPublished?
        "Courses published, Offering pending":"Course publication pending"}
    </p>
    {!item.current&&<p role="alert" className="mt-3 text-sm text-destructive">
      Content changed after submission. The publisher must submit a new version for review.
    </p>}
    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
      {categories.map(kind=><div key={kind} className="border border-border p-2 text-xs">
        <strong className="capitalize">{kind}</strong>
        <p className="mt-1 text-muted-foreground">
          {item.reviews.find(r=>r.kind===kind)?.decision??"Not reviewed"}
        </p>
      </div>)}
    </div>
    {item.status==="draft"&&!item.offeringPublished&&<form className="mt-4 grid gap-3 sm:grid-cols-2"
      onSubmit={submit}>
      <Field label="Review category"><Select value={category}
        onChange={event=>setCategory(event.target.value as typeof category)}>
        {categories.map(kind=><option key={kind} value={kind}>{kind}</option>)}
      </Select></Field>
      <Field label="Decision"><Select value={decision}
        onChange={event=>setDecision(event.target.value as typeof decision)}>
        <option value="rejected">Changes required</option>
        <option value="approved">Approve with evidence</option>
      </Select></Field>
      <Field label="Independent rationale" className="sm:col-span-2">
        <Textarea rows={2} required minLength={10} maxLength={2000}
          value={reason} onChange={event=>setReason(event.target.value)}/>
      </Field>
      <Field label={category==="rights"?"Verified rights evidence UUID":"Verified review evidence UUID"}
        className="sm:col-span-2">
        <Input value={evidence} required={decision==="approved"}
          onChange={event=>setEvidence(event.target.value)}/>
      </Field>
      <Button type="submit" disabled={!item.current||busy||reason.trim().length<10||
        decision==="approved"&&!evidence.trim()}>Record decision</Button>
    </form>}
    <div className="mt-4 flex flex-wrap gap-3">
      {!item.allCoursesPublished&&<Button variant="outline" type="button"
        disabled={!item.current||!fullyApproved||busy}
        onClick={()=>void run(()=>publishNativeOfferingCourses({data:release}),
          "Approved native Course versions published.")}>Publish reviewed Courses</Button>}
      {!item.offeringPublished&&<Button variant="outline" type="button"
        disabled={!item.current||!fullyApproved||!item.allCoursesPublished||busy}
        onClick={()=>void run(()=>publishNativeOfferingVersion({data:release}),
          "Offering published. Local adoption still requires independent approval.")}>
        Publish reviewed Offering</Button>}
    </div>
    {!fullyApproved&&<p className="mt-3 text-xs text-muted-foreground">
      Publication requires the latest independent academic, rights, accessibility,
      coverage and safety approvals with current verified evidence for this exact manifest.
    </p>}
    {notice&&<p role="status" className="mt-3 text-sm">{notice}</p>}
    {error&&<p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
  </article>;
}

export function NativeOfferingReleaseReviewPanel(){
  const queue=useQuery({queryKey:["native-offering-release-review-queue"],
    queryFn:()=>getNativeOfferingReleaseReviewQueue(),retry:false});
  return <WorkspacePanel title="Native Course and Offering release"
    className="mt-6"
    description="Exact-version publisher review, without a parallel curriculum publisher or local adoption shortcut.">
    {queue.isPending&&<p role="status">Checking independently verified Course review appointments…</p>}
    {queue.isError&&<p role="alert">The native Course review queue is unavailable for this account.</p>}
    {queue.data?.limited&&<p role="alert">Review results are limited. Do not assume this queue is complete.</p>}
    {queue.isSuccess&&queue.data.items.length===0&&<p role="status">
      No submitted native Offering manifests are available under current reviewer appointments.
    </p>}
    <div className="mt-4 grid gap-4">
      {queue.data?.items.map(item=><ReleaseReview item={item} key={item.id}/>)}
    </div>
  </WorkspacePanel>;
}
