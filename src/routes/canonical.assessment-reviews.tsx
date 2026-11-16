import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { WorkspaceShell } from "@/components/workspace";
import { Button } from "@/components/ui/button";
import { normalizeClientError } from "@/lib/client-error";
import {
  listCanonicalObjectiveApprovalQueue,readCanonicalObjectiveApproval,
  recordCanonicalObjectiveReview,
} from "@/modules/classes/canonical-objective-approval.functions";
import { objectiveReviewRequirements } from "@/domain/canonical-objective-review";

export const Route=createFileRoute("/canonical/assessment-reviews")({
  component:CanonicalAssessmentReviewerPage,
});

function latestState(rows:{kind:string;decision:string;order:number}[],
 kind:string){
  return rows.filter(r=>r.kind===kind)
    .sort((a,b)=>b.order-a.order)[0]?.decision??"Not reviewed";
}
function CanonicalAssessmentReviewerPage(){
  const qc=useQueryClient();
  const [selected,setSelected]=useState("");
  const [target,setTarget]=useState<"item"|"assessment"|"form">("item");
  const [itemVersionId,setItemVersionId]=useState("");
  const [kind,setKind]=useState<"academic"|"rights"|"accessibility"|"independent">("academic");
  const [decision,setDecision]=useState<"approved"|"rejected">("approved");
  const [rationale,setRationale]=useState("");
  const [ack,setAck]=useState(false);
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState("");
  const [error,setError]=useState("");
  const queue=useQuery({
    queryKey:["canonical-assessment-approval-queue","review"],
    queryFn:()=>listCanonicalObjectiveApprovalQueue({data:{mode:"review"}}),
    retry:false,
  });
  const detail=useQuery({
    queryKey:["canonical-assessment-approval","review",selected],
    queryFn:()=>readCanonicalObjectiveApproval({data:{
      mode:"review",assessmentVersionId:selected,
    }}),
    enabled:!!selected,retry:false,gcTime:0,staleTime:0,
    refetchOnMount:"always",refetchOnWindowFocus:"always",
  });
  // A reviewer-only correct-answer preview must never use cached data while
  // revalidating authorization or after a failed request.
  const data=detail.isSuccess&&!detail.isFetching?detail.data:undefined;
  const question=data?.items.find(x=>x.id===itemVersionId);
  const requiredKinds=objectiveReviewRequirements[target];
  const currentReviews=data?(target==="assessment"?data.reviews.assessment:
    target==="form"?data.reviews.form:
      data.reviews.items.filter(x=>x.itemVersionId===itemVersionId)):[];
  async function submit(){
    if(!data||busy||!ack||rationale.trim().length<20||
       (target==="item"&&!question))return;
    setBusy(true);setError("");setNotice("");
    try{
      await recordCanonicalObjectiveReview({data:{
        assessmentVersionId:selected,target,
        ...(target==="item"?{itemVersionId}:{}),
        kind,decision,rationale:rationale.trim(),
      }});
      setNotice("Independent canonical review recorded. Updated approval history is shown below.");
      setRationale("");setAck(false);
      await qc.invalidateQueries({
        queryKey:["canonical-assessment-approval","review",selected],
      });
    }catch(cause){
      setError(normalizeClientError(cause,
        "Cannot record independent review. Verify publisher permissions, draft state and reviewer independence.").message);
    }finally{setBusy(false);}
  }
  return <WorkspaceShell width="wide" eyebrow="CAN OS · Governed publishing"
    title="Independent assessment review"
    subtitle="Review publisher-owned questions, answer correctness, rights and accessibility before an authorized publication decision."
    actions={<Link to="/canonical/assessment-publications"
      className="text-sm font-semibold underline underline-offset-4">
      Publication queue
    </Link>}>
    <section className="mt-5 border border-border bg-card p-5">
      <h2 className="font-serif text-xl">Review authority</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        The reviewer is granted a distinct Organization-specific PostgreSQL
        role and cannot review content they authored. All decisions are
        append-only. Reviewer access to correct answers is temporary and
        restricted to this authenticated workspace. It does not grant
        publication, result grading, or learner access.
      </p>
      {queue.isPending&&<p role="status" className="mt-3 text-sm">
        Checking independent-review permissions…
      </p>}
      {queue.isError&&<p role="alert" className="mt-3 text-sm text-destructive">
        Independent review is unavailable in this environment or to your
        current authorized role.
      </p>}
      {queue.data&&<>
        <label htmlFor="assessment-review-version" className="mt-4 block text-sm font-semibold">
          Publisher assessment draft
        </label>
        <select id="assessment-review-version" value={selected}
          onChange={e=>{setSelected(e.target.value);setItemVersionId("");setNotice("");setError("");}}
          className="mt-2 min-h-11 w-full border border-border bg-background px-3 text-sm">
          <option value="">Select a draft for independent review</option>
          {queue.data.versions.map(v=><option value={v.assessmentVersionId}
            key={v.assessmentVersionId}>
            {v.title} · {v.questionCount} questions
          </option>)}
        </select>
        {queue.data.versions.length===0&&<p className="mt-3 text-sm text-muted-foreground">
          No draft objective assessments are awaiting review.
        </p>}
      </>}
    </section>
    {selected&&detail.isPending&&<p role="status" className="mt-5 text-sm">
      Loading reviewer-only question evidence…
    </p>}
    {selected&&detail.isError&&<p role="alert" className="mt-5 text-sm text-destructive">
      Draft questions or sealed correct answers could not be verified.
      Reviews are disabled.
    </p>}
    {data&&<section className="mt-5 border border-border bg-card p-5"
      aria-label="Assessment review content">
      <h2 className="font-serif text-2xl">{data.title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {data.assessmentKey} · Draft assessment · {data.items.length} questions
      </p>
      <ol className="mt-4 space-y-4">
        {data.items.map((q,index)=><li key={q.id} className="border border-border p-4">
          <p className="font-semibold">{index+1}. {q.prompt}</p>
          <ul className="mt-3 space-y-2 text-sm">
            {q.options.map(choice=><li key={choice.id}
              className="flex items-start justify-between gap-4">
              <span>{choice.text}</span>
              {choice.correct===true&&<span className="text-xs font-semibold">
                Publisher-designated correct answer
              </span>}
            </li>)}
          </ul>
          <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-muted-foreground">
            {objectiveReviewRequirements.item.map(k=><p key={k}>
              {k}: {latestState(data.reviews.items.filter(r=>r.itemVersionId===q.id),k)}
            </p>)}
          </div>
          <button type="button" className="mt-3 text-sm font-semibold underline"
            onClick={()=>{setTarget("item");setKind("academic");setItemVersionId(q.id);}}>
            Review this question
          </button>
        </li>)}
      </ol>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="border border-border p-3">
          <p className="font-semibold">Assessment version approvals</p>
          {objectiveReviewRequirements.assessment.map(k=><p
            key={k} className="mt-1 text-xs">
            {k}: {latestState(data.reviews.assessment,k)}
          </p>)}
        </div>
        <div className="border border-border p-3">
          <p className="font-semibold">Form approvals</p>
          {objectiveReviewRequirements.form.map(k=><p key={k} className="mt-1 text-xs">
            {k}: {latestState(data.reviews.form,k)}
          </p>)}
        </div>
      </div>
      <div className="mt-6 border-t border-border pt-5" aria-label="Record independent assessment review">
        <h3 className="font-serif text-xl">Record an independent decision</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Each question, assessment version, and form requires its own
          independent approvals. The most recent decision controls.
          Publication is a separate privilege.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-semibold">
            Review target
            <select className="mt-1 min-h-11 w-full border border-border bg-background px-3"
              value={target} disabled={busy}
              onChange={e=>{setTarget(e.target.value as typeof target);setKind("academic");}}>
              <option value="item">Individual question</option>
              <option value="assessment">Assessment version</option>
              <option value="form">Question form</option>
            </select>
          </label>
          {target==="item"&&<label className="text-sm font-semibold">
            Question
            <select className="mt-1 min-h-11 w-full border border-border bg-background px-3"
              value={itemVersionId} disabled={busy}
              onChange={e=>setItemVersionId(e.target.value)}>
              <option value="">Choose a question</option>
              {data.items.map((item,index)=><option key={item.id} value={item.id}>
                Question {index+1}
              </option>)}
            </select>
          </label>}
          <label className="text-sm font-semibold">
            Review domain
            <select className="mt-1 min-h-11 w-full border border-border bg-background px-3"
              value={kind} disabled={busy}
              onChange={e=>setKind(e.target.value as typeof kind)}>
              {requiredKinds.map(k=><option key={k} value={k}>{k}</option>)}
            </select>
          </label>
          <label className="text-sm font-semibold">
            Decision
            <select className="mt-1 min-h-11 w-full border border-border bg-background px-3"
              value={decision} disabled={busy}
              onChange={e=>setDecision(e.target.value as typeof decision)}>
              <option value="approved">Approve</option>
              <option value="rejected">Reject</option>
            </select>
          </label>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          Current {kind} decision: {latestState(currentReviews,kind)}
        </p>
        <label className="mt-4 block text-sm font-semibold" htmlFor="assessment-review-reason">
          Evidence-based review rationale
        </label>
        <textarea id="assessment-review-reason" value={rationale}
          rows={4} minLength={20} maxLength={1500} disabled={busy}
          onChange={e=>setRationale(e.target.value)}
          className="mt-2 w-full border border-border bg-background p-3 text-sm"
          placeholder="Describe the content checks, answer correctness, rights and accessibility evidence reviewed."/>
        <label className="mt-3 flex items-start gap-3 text-sm">
          <input type="checkbox" checked={ack} disabled={busy}
            onChange={e=>setAck(e.target.checked)} className="mt-1"/>
          I personally performed this independent review. The decision will
          be attributed to my verified Person and recorded in the audit log.
        </label>
        {notice&&<p role="status" className="mt-3 text-sm">{notice}</p>}
        {error&&<p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
        <Button type="button" className="mt-4" disabled={busy||!ack||
          rationale.trim().length<20||(target==="item"&&!itemVersionId)}
          onClick={()=>void submit()}>
          {busy?"Recording…":"Record independent review"}
        </Button>
      </div>
    </section>}
  </WorkspaceShell>;
}
