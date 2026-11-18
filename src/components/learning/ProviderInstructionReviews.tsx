import { useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useRef, useState, type FormEvent } from "react";
import { WorkspaceShell, MutationFeedback, WorkspaceNotice, EmptyState, StatusBadge } from "@/components/workspace";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useMutationFeedback } from "@/lib/mutation-feedback";
import { getProviderContentWorkspace } from "@/modules/learning/provider-content-workspace.functions";
import { decideRecordedInstructionReview, publishRecordedInstruction } from "@/modules/learning/instructional-tracks.functions";
import { NativeOfferingReleaseReviewPanel } from "@/components/learning/NativeOfferingReleaseReviewPanel";

type Queue = Awaited<ReturnType<typeof getProviderContentWorkspace>>;
type Track = Queue["tracks"][number];
const requiredKinds=["academic","rights","accessibility","coverage","safeguarding"] as const;
type ReviewKind=typeof requiredKinds[number];

export function ProviderInstructionReviews({navigation}:{navigation?:ReactNode}){
  const queue=useQuery({
    queryKey:["provider-content-review-queue"],
    queryFn:()=>getProviderContentWorkspace(),retry:false,
  });
  if(queue.isPending)return <WorkspaceShell title="Instructional content reviews"><p role="status">Checking current review appointments…</p></WorkspaceShell>;
  if(queue.isError||!queue.data)return <WorkspaceShell title="Content review unavailable">
    <WorkspaceNotice tone="danger">Review inventory cannot be verified for this account. No publisher authority is inferred.</WorkspaceNotice>
  </WorkspaceShell>;
  if(queue.data.role!=="academic_content_reviewer")return <WorkspaceShell title="Reviewer access required">
    <WorkspaceNotice tone="attention">Use your independently verified academic content reviewer membership. Author and reviewer powers are never combined by this page.</WorkspaceNotice>
  </WorkspaceShell>;
  const {courses,tracks,assignmentsLimited}=queue.data;
  return <WorkspaceShell width="wide" eyebrow="CAN OS · Independent publication review"
    title="Instructional content reviews"
    subtitle="Review exact submitted track manifests for courses under your verified review appointment. Every category requires an independent decision and appropriate evidence before publication.">
    {navigation}
    {assignmentsLimited&&<WorkspaceNotice tone="attention" className="mt-5">
      Review inventory reached the safety limit. Narrow the verified Course assignment scope before treating this queue as complete.
    </WorkspaceNotice>}
    {!courses.length&&<EmptyState className="mt-5"
      title="No independently verified Course review appointments"
      description="An Organization reviewer membership alone does not authorize decisions. Your specific Course needs an active professional reviewer appointment and independently verified evidence."
    />}
    <div className="mt-6 grid gap-4">
      {tracks.map(track => <ReviewEditor key={track.id} track={track}
        courseName={courses.find(course=>course.id===track.courseId)?.title??"Assigned Course"}/>)}
      {!tracks.length&&<EmptyState
        title="No submitted recorded-instructor tracks"
        description="There are no eligible submitted track versions under your current independently verified Course appointments. Native Course and Offering releases appear in the separate review section below."
      />}
    </div>
    <NativeOfferingReleaseReviewPanel/>
  </WorkspaceShell>;
}

function ReviewEditor({track,courseName}:{track:Track;courseName:string}) {
  const router=useRouter();
  const client=useQueryClient();
  const mutation=useMutationFeedback(async()=>{
    await Promise.all([router.invalidate(),client.invalidateQueries({queryKey:["provider-content-review-queue"]})]);
  });
  const pendingRequestId=useRef<string|null>(null);
  const [reviewKind,setReviewKind]=useState<ReviewKind>("academic");
  const [decision,setDecision]=useState<"approved"|"changes_requested"|"rejected">("approved");
  const [rationale,setRationale]=useState("");
  const [evidenceVersionId,setEvidenceVersionId]=useState("");
  const [invalid,setInvalid]=useState("");
  const approved=requiredKinds.every(kind=>track.reviews.some(review=>review.kind===kind&&review.decision==="approved"));
  const isPublished=track.lifecycle==="published";
  function requestId(){const id=pendingRequestId.current??crypto.randomUUID();pendingRequestId.current=id;return id;}
  async function submit(event:FormEvent){
    event.preventDefault();setInvalid("");
    if(mutation.pending||mutation.refreshFailed||isPublished||!track.submissionManifestHash)return;
    if(rationale.trim().length<10){setInvalid("Provide at least 10 characters explaining your independent decision.");return;}
    if(reviewKind==="rights"&&!evidenceVersionId.trim()){setInvalid("Rights review requires a current verified rights evidence version ID.");return;}
    const outcome=await mutation.run(()=>decideRecordedInstructionReview({data:{
      requestId:requestId(),trackVersionId:track.id,expectedRevision:track.submissionManifestHash!,
      reviewKind,decision,rationale:rationale.trim(),evidenceVersionId:evidenceVersionId.trim()||null,
    }}),{
      successMessage:"Independent content review recorded for the submitted manifest.",
      commandErrorMessage:"Review was not accepted. Verify current appointment, evidence and exact manifest.",
      refreshErrorMessage:"Review recorded, but the current queue could not be refreshed.",
    });
    if(outcome.status==="saved"||outcome.status==="refresh-failed"){
      pendingRequestId.current=null;setRationale("");setEvidenceVersionId("");
    }
  }
  async function publish(){
    if(!approved||mutation.pending||mutation.refreshFailed||!track.submissionManifestHash||isPublished)return;
    const outcome=await mutation.run(()=>publishRecordedInstruction({data:{
      requestId:requestId(),trackVersionId:track.id,expectedRevision:track.submissionManifestHash!,
    }}),{
      successMessage:"Instructional track published after independent review.",
      commandErrorMessage:"Publication blocked. All current independent approvals and content rights are required.",
      refreshErrorMessage:"Publication response received, but the queue could not be refreshed.",
    });
    if(outcome.status==="saved"||outcome.status==="refresh-failed")pendingRequestId.current=null;
  }
  return <article className="border border-border bg-card p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="font-serif text-xl">{track.title} · v{track.versionNo}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{courseName} · {track.trackKind}</p></div>
      <StatusBadge tone={isPublished?"success":"attention"}>
        {isPublished?"Published":"Submitted · pending review"}
      </StatusBadge>
    </div>
    <div className="mt-4 grid gap-2 sm:grid-cols-5" aria-label="Independent review categories">
      {requiredKinds.map(kind=><div key={kind} className="border border-border p-3 text-xs">
        <p className="font-semibold capitalize">{kind}</p><p className="mt-1 text-muted-foreground">
          {track.reviews.find(item=>item.kind===kind)?.decision.replaceAll("_"," ")??"Not reviewed"}
        </p>
      </div>)}
    </div>
    {!isPublished && <form className="mt-5 border-t border-border pt-5" onSubmit={event=>void submit(event)}>
      <h3 className="font-semibold">Record independent decision</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="Review category"><Select value={reviewKind} onChange={event=>{pendingRequestId.current=null;setReviewKind(event.target.value as ReviewKind);}}>
          {requiredKinds.map(kind=><option key={kind} value={kind}>{kind}</option>)}
        </Select></Field>
        <Field label="Decision"><Select value={decision} onChange={event=>{pendingRequestId.current=null;setDecision(event.target.value as typeof decision);}}>
          <option value="approved">Approved</option><option value="changes_requested">Changes requested</option><option value="rejected">Rejected</option>
        </Select></Field>
        <Field label="Rationale" className="sm:col-span-2"><Textarea rows={3} minLength={10} maxLength={2000} required value={rationale} onChange={event=>{pendingRequestId.current=null;setRationale(event.target.value);}}/></Field>
        {reviewKind==="rights" && <Field label="Verified rights evidence version ID" required className="sm:col-span-2">
          <Input required value={evidenceVersionId} onChange={event=>{pendingRequestId.current=null;setEvidenceVersionId(event.target.value);}}
            placeholder="Verified evidence UUID"/>
        </Field>}
      </div>
      {invalid&&<p role="alert" className="mt-3 border border-destructive p-3 text-sm">{invalid}</p>}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={mutation.pending||mutation.refreshFailed||rationale.trim().length<10}>Record decision</Button>
        <Button type="button" variant="outline" disabled={!approved||mutation.pending||mutation.refreshFailed}
          onClick={()=>void publish()}>Publish fully approved track</Button>
      </div>
      {!approved&&<p className="mt-2 text-xs text-muted-foreground">Publication remains blocked until the latest academic, rights, accessibility, coverage and safeguarding decisions all approve this exact manifest. Review alone never grants learner delivery rights.</p>}
      <MutationFeedback className="mt-3" state={mutation} pendingMessage="Recording independent content decision…"/>
    </form>}
    {isPublished && <p className="mt-4 text-sm text-muted-foreground">Published versions are immutable. Withdrawal follows a separate controlled policy and must not be inferred from this review queue.</p>}
  </article>;
}
