import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useRef, useState, type FormEvent } from "react";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";
import { WorkspaceShell, MutationFeedback } from "@/components/workspace";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useMutationFeedback } from "@/lib/mutation-feedback";
import { getProviderContentWorkspace } from "@/modules/learning/provider-content-workspace.functions";
import { decideRecordedInstructionReview, publishRecordedInstruction } from "@/modules/learning/instructional-tracks.functions";

export const Route = createFileRoute("/canonical/content-reviews")({
  loader: () => safeLoader(() => getProviderContentWorkspace())(),
  component: ContentReviewerHome,
});

type Queue = Awaited<ReturnType<typeof getProviderContentWorkspace>>;
type Track = Queue["tracks"][number];
const requiredKinds=["academic","rights","accessibility","coverage","safeguarding"] as const;
type ReviewKind=typeof requiredKinds[number];

function ContentReviewerHome() {
  const outcome=Route.useLoaderData();
  if(!outcome.ok) return <LoaderFailure eyebrow="Independent content review" title="Instructional content reviews" outcome={outcome}/>;
  if(outcome.data.role!=="academic_content_reviewer")return <WorkspaceShell title="Reviewer access required">
    <p role="alert">Switch to your independently verified academic content reviewer membership. Author and reviewer powers are never combined by this page.</p>
  </WorkspaceShell>;
  const {courses,tracks,assignmentsLimited}=outcome.data;
  return <WorkspaceShell width="wide" eyebrow="CAN OS · Independent publication review"
    title="Instructional content reviews"
    subtitle="Review exact submitted track manifests for courses under your verified review appointment. Every category requires an independent decision and appropriate evidence before publication.">
    {assignmentsLimited && <p role="alert" className="mt-5 border border-warning p-4 text-sm">Review inventory reached the safety limit. Work through a narrower verified course assignment before treating this queue as complete.</p>}
    <div className="mt-6 grid gap-4">
      {tracks.map(track => <ReviewEditor key={track.id} track={track}
        courseName={courses.find(course=>course.id===track.courseId)?.title??"Assigned Course"}/>)}
      {!tracks.length && <p role="status" className="border border-border bg-card p-5 text-sm">There are no submitted track versions available under your current independent review appointments.</p>}
    </div>
  </WorkspaceShell>;
}

function ReviewEditor({track,courseName}:{track:Track;courseName:string}) {
  const router=useRouter();
  const mutation=useMutationFeedback(()=>router.invalidate());
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
      <span className="border border-border px-3 py-1 text-xs font-semibold">{isPublished?"Published":"Submitted · pending review"}</span>
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
