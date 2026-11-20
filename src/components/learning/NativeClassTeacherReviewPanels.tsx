import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { normalizeClientError } from "@/lib/client-error";
import {
  getNativeClassTeacherHomework, getNativeClassTeacherAssessments,
  returnNativeClassHomeworkForRevision,
} from "@/modules/classes/native-class-teacher-homework.functions";
import { Button } from "@/components/ui/button";

/** Read-only native Class teacher queue. Official grading is a separate
 * verified-grader workflow, not a state change to synthetic homework. */
export function NativeClassTeacherHomeworkPanel({classId}:{classId:string}){
  const client=useQueryClient();
  const [feedback,setFeedback]=useState<Record<string,string>>({});
  const [busy,setBusy]=useState<string|null>(null);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const returnForRevision=async(submissionId:string)=>{
    if(busy)return;
    const comment=feedback[submissionId]?.trim()??"";
    if(comment.length<10)return;
    setBusy(submissionId);setError("");setNotice("");
    try{
      await returnNativeClassHomeworkForRevision({
        data:{classId,submissionId,feedback:comment},
      });
      setNotice("Homework returned for revision. The original student response remains saved.");
      await Promise.all([
        client.invalidateQueries({queryKey:["native-class-teacher-homework",classId]}),
        client.invalidateQueries({queryKey:["native-class-homework"]}),
      ]);
    }catch(failure){
      setError(normalizeClientError(failure,
        "Unable to return this submission. Check your current teacher assignment.").message);
    }finally{setBusy(null);}
  };
  const queue=useQuery({
    queryKey:["native-class-teacher-homework",classId],
    queryFn:()=>getNativeClassTeacherHomework({data:{classId}}),
    retry:false,
  });
  return <section aria-label="Class homework review" className="space-y-4 border border-border bg-card p-5">
    <div>
      <h2 className="font-serif text-2xl">Student homework</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Submissions from learners actively enrolled in your exact Class.
        Returned and graded labels may represent synthetic practice states,
        not signed grading decisions.
      </p>
    </div>
    {queue.isPending&&<p role="status" className="text-sm">Checking your teaching assignment…</p>}
    {queue.isError&&<p role="alert" className="text-sm">
      This Class review queue is unavailable under your current teacher grant.
    </p>}
    {queue.data&&<>
      <p className="text-xs text-muted-foreground">{queue.data.notice}</p>
      {queue.data.items.length===0&&
        <p className="text-sm">No submitted, returned or graded homework is available for this Class.</p>}
      <ul className="divide-y divide-border">
        {queue.data.items.map(item=><li key={item.id} className="py-4 text-sm space-y-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="font-semibold">{item.assignmentTitle}</h3>
              <p className="text-xs text-muted-foreground">{item.studentName}</p>
            </div>
            <span className="text-xs font-semibold capitalize">{item.status}</span>
          </div>
          {item.responseText&&<p className="whitespace-pre-wrap rounded-sm bg-muted p-3">
            {item.responseText}
          </p>}
          {item.demoFeedback&&<p className="text-xs text-muted-foreground">
            Simulated feedback: {item.demoFeedback}
          </p>}
          {item.status==="submitted"&&<div className="space-y-2 border-t border-border pt-3">
            <label htmlFor={"revision-"+item.id} className="block text-sm font-medium">
              Request a revision (synthetic, not an official grade)
            </label>
            <Textarea id={"revision-"+item.id} rows={3}
              value={feedback[item.id]??""} maxLength={2000}
              disabled={busy!==null}
              onChange={event=>setFeedback(prev=>({...prev,[item.id]:event.target.value}))}
              placeholder="Give the learner a concrete suggestion for revising the submitted response."/>
            <Button size="sm" type="button" variant="outline"
              disabled={busy!==null||(feedback[item.id]?.trim().length??0)<10}
              onClick={()=>void returnForRevision(item.id)}>
              {busy===item.id?"Returning…":"Return for revision"}
            </Button>
          </div>}
          {item.submittedAt&&<p className="text-xs text-muted-foreground">
            Submitted {new Date(item.submittedAt).toLocaleString()}
          </p>}
        </li>)}
      </ul>
      {queue.data.partial&&<p className="text-xs">Only the most recent 100 records are shown.</p>}
      {notice&&<p role="status" className="text-sm">{notice}</p>}
      {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button type="button" variant="outline" size="sm" disabled={queue.isFetching}
        onClick={()=>void queue.refetch()}>Refresh submissions</Button>
    </>}
  </section>;
}

export function NativeClassTeacherAssessmentPanel({classId}:{classId:string}){
  const readiness=useQuery({
    queryKey:["native-class-teacher-assessments",classId],
    queryFn:()=>getNativeClassTeacherAssessments({data:{classId}}),
    retry:false,
  });
  return <section aria-label="Class knowledge-check readiness" className="space-y-4 border border-border bg-card p-5">
    <h2 className="font-serif text-2xl">Knowledge checks</h2>
    <p className="text-sm text-muted-foreground">
      Read-only assessment publication status for your assigned Class.
      Draft forms cannot be given to learners. Only separately authorized
      publisher and provider review workflows may publish or open them.
    </p>
    {readiness.isPending&&<p role="status" className="text-sm">Checking Course assessment status…</p>}
    {readiness.isError&&<p role="alert" className="text-sm">
      Assessment readiness is unavailable under this teacher assignment.
    </p>}
    {readiness.data&&<>
      {readiness.data.items.length===0&&<p className="text-sm">
        This Course has no configured knowledge-check administrations.
      </p>}
      <ul className="divide-y divide-border">
        {readiness.data.items.map(item=><li key={item.key} className="py-3 text-sm">
          <p className="font-semibold">{item.key}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Assessment: {item.assessmentStatus} · Form: {item.formStatus} · Administration: {item.administrationStatus}
          </p>
          <p className="mt-1 text-xs">
            {item.ready?"Published administration. Learners still require individual access grants.":
              "Awaiting independent review, publication or authorized opening."}
          </p>
        </li>)}
      </ul>
      {readiness.data.partial&&<p className="text-xs">Additional entries require pagination.</p>}
    </>}
  </section>;
}
