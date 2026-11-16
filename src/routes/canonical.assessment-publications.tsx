import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { WorkspaceShell } from "@/components/workspace";
import { Button } from "@/components/ui/button";
import { normalizeClientError } from "@/lib/client-error";
import {
  listCanonicalObjectiveApprovalQueue,readCanonicalObjectiveApproval,
  publishCanonicalObjectiveAssessment,
} from "@/modules/classes/canonical-objective-approval.functions";
import { objectiveApprovalGate } from "@/domain/canonical-objective-review";

export const Route=createFileRoute("/canonical/assessment-publications")({
  component:ObjectiveAssessmentPublications,
});
function ObjectiveAssessmentPublications(){
  const qc=useQueryClient();
  const [selected,setSelected]=useState("");
  const [confirmed,setConfirmed]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const queue=useQuery({
    queryKey:["canonical-assessment-approval-queue","publish"],
    queryFn:()=>listCanonicalObjectiveApprovalQueue({data:{mode:"publish"}}),
    retry:false,
  });
  const details=useQuery({
    queryKey:["canonical-assessment-approval","publish",selected],
    queryFn:()=>readCanonicalObjectiveApproval({data:{
      mode:"publish",assessmentVersionId:selected,
    }}),
    enabled:!!selected,retry:false,
  });
  const data=details.data;
  const gate=data?objectiveApprovalGate({
    items:data.items.map(item=>({id:item.id,authorPersonId:item.authorPersonId})),
    assessmentReviews:data.reviews.assessment,
    formReviews:data.reviews.form,
    itemReviews:data.reviews.items,
  }):null;
  const itemGates=gate?.items??[];
  const assessmentReady=gate?.assessmentReady??false;
  const formReady=gate?.formReady??false;
  const ready=Boolean(data&&gate?.ready&&data.lifecycle==="draft"&&
    data.formLifecycle==="draft");
  async function publish(){
    if(!ready||!confirmed||busy||!data)return;
    setBusy(true);setNotice("");setError("");
    try{
      await publishCanonicalObjectiveAssessment({data:{
        assessmentVersionId:data.assessmentVersionId,
      }});
      setNotice("The assessment items, version and form were published atomically. Local Class administrations and individual learner grants remain separately authorized.");
      setConfirmed(false);setSelected("");
      await qc.invalidateQueries({queryKey:["canonical-assessment-approval-queue"]});
      await qc.invalidateQueries({queryKey:["publisher-course-activity-options"]});
    }catch(cause){
      setError(normalizeClientError(cause,
        "The canonical publication gate rejected the request. Review independent decisions and publisher authority.").message);
    }finally{setBusy(false);}
  }
  return <WorkspaceShell width="wide" eyebrow="CAN OS · Governed publishing"
    title="Publish assessments"
    subtitle="Publish immutable, independently approved Course assessments without enrolling learners or activating local Classes."
    actions={<Link to="/canonical/assessment-reviews"
      className="text-sm font-semibold underline underline-offset-4">
      Independent reviews
    </Link>}>
    <section className="mt-5 border border-border bg-card p-5">
      <h2 className="font-serif text-xl">Publisher authority</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Publishing requires the separate, organization-bound assessment
        publisher database role. All questions, the assessment version and
        its form require current independent academic, rights and accessibility
        approval. The assessment version additionally requires independent
        review. This action publishes no enrollment, grade or credential.
      </p>
      {queue.isPending&&<p role="status" className="mt-3 text-sm">
        Checking canonical publisher role and draft inventory…
      </p>}
      {queue.isError&&<p role="alert" className="mt-3 text-sm text-destructive">
        Publication is disabled, or your current role has no authorized
        publisher permission.
      </p>}
      {queue.data&&<>
        <label htmlFor="assessment-publication-version" className="mt-4 block text-sm font-semibold">
          Approved candidate
        </label>
        <select id="assessment-publication-version" value={selected}
          onChange={e=>{setSelected(e.target.value);setConfirmed(false);setError("");setNotice("");}}
          className="mt-2 min-h-11 w-full border border-border bg-background px-3 text-sm">
          <option value="">Select an assessment draft</option>
          {queue.data.versions.map(x=><option key={x.assessmentVersionId}
            value={x.assessmentVersionId}>{x.title} · {x.questionCount} questions</option>)}
        </select>
        {queue.data.versions.length===0&&<p className="mt-3 text-sm text-muted-foreground">
          No draft assessments in the current publisher's organization.
        </p>}
      </>}
    </section>
    {selected&&details.isPending&&<p role="status" className="mt-4 text-sm">
      Checking the latest canonical decisions…
    </p>}
    {selected&&details.isError&&<p role="alert" className="mt-4 text-sm text-destructive">
      The publication decision cannot be evaluated. No publishing is possible.
    </p>}
    {data&&<section className="mt-5 border border-border bg-card p-5">
      <h2 className="font-serif text-2xl">{data.title}</h2>
      <p className="mt-2 break-all font-mono text-xs text-muted-foreground">
        {data.assessmentVersionId}
      </p>
      <div className="mt-5 divide-y divide-border border border-border">
        <div className="flex items-start justify-between gap-4 p-4 text-sm">
          <div>
            <p className="font-semibold">Individual question approvals</p>
            <p className="mt-1 text-muted-foreground">
              Academic, rights and accessibility for each of {itemGates.length} questions
            </p>
          </div>
          <span className="shrink-0 font-semibold">
            {itemGates.filter(x=>x.ready).length}/{itemGates.length} approved
          </span>
        </div>
        <div className="flex items-start justify-between gap-4 p-4 text-sm">
          <p className="font-semibold">Assessment version approvals</p>
          <span className="shrink-0 font-semibold">
            {assessmentReady?"Approved":"Incomplete"}
          </span>
        </div>
        <div className="flex items-start justify-between gap-4 p-4 text-sm">
          <p className="font-semibold">Assessment form approvals</p>
          <span className="shrink-0 font-semibold">
            {formReady?"Approved":"Incomplete"}
          </span>
        </div>
      </div>
      {!ready&&<p className="mt-4 text-sm text-muted-foreground">
        Publication is disabled until all independent reviews are current.
        A rejection or newer incomplete decision blocks release. See the
        independent review workspace to complete the missing decisions.
      </p>}
      <label className="mt-5 flex items-start gap-3 border-t border-border pt-4 text-sm">
        <input type="checkbox" checked={confirmed} disabled={!ready||busy}
          onChange={e=>setConfirmed(e.target.checked)} className="mt-1"/>
        I understand that publishing makes canonical content immutable.
        It does not activate a local Class or permit self-awarded completion.
      </label>
      <Button type="button" className="mt-4" disabled={!ready||!confirmed||busy}
        onClick={()=>void publish()}>
        {busy?"Publishing approved versions…":"Publish approved assessment"}
      </Button>
    </section>}
    {notice&&<p role="status" className="mt-4 border border-border p-3 text-sm">{notice}</p>}
    {error&&<p role="alert" className="mt-4 border border-border p-3 text-sm text-destructive">{error}</p>}
  </WorkspaceShell>;
}
