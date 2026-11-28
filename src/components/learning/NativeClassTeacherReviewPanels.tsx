import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { HistoricalClassWork } from "./HistoricalClassWork";
import { SubmissionRevisionHistory } from "./SubmissionRevisionHistory";
import { getNativeClassTeacherHomework, getNativeClassTeacherMissingWork, getNativeClassTeacherHomeworkHistory, getNativeClassTeacherHistoricalWork, getNativeClassTeacherAssessments,
  returnNativeClassPracticeFeedback } from
  "@/modules/classes/native-class-teacher-homework.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { EmptyState, QueryState, StatusBadge, WorkspaceNotice } from "@/components/workspace";
import { normalizeClientError } from "@/lib/client-error";

/** Read-only native Class teacher queue. Official grading is a separate
 * verified-grader workflow, not a practice feedback mutation. */
export function NativeClassTeacherHomeworkPanel({classId}:{classId:string}){
  return <NativeClassTeacherWork key={classId} classId={classId}/>;
}

function NativeClassTeacherWork({classId}:{classId:string}){
  const client=useQueryClient();
  const [offset,setOffset]=useState(0);
  const [feedback,setFeedback]=useState<Record<string,string>>({});
  const [scores,setScores]=useState<Record<string,string>>({});
  const [busy,setBusy]=useState<string|null>(null);
  const [notice,setNotice]=useState("");
  const [error,setError]=useState("");
  async function returnFeedback(submissionId:string){
    if(busy)return;
    setBusy(submissionId);setNotice("");setError("");
    const item=queue.data?.items.find(entry=>entry.id===submissionId);
    const raw=(scores[submissionId]??(item?.practiceScore===null?"":String(item?.practiceScore??""))).trim();
    const practiceScore=raw?Number(raw):null;
    try{
      await returnNativeClassPracticeFeedback({data:{
        classId,submissionId,feedback:(feedback[submissionId]??item?.teacherFeedback??"").trim(),practiceScore,
      }});
      setNotice("Practice feedback returned to the learner. No official grade was issued.");
      await Promise.all([
        client.invalidateQueries({queryKey:["native-class-teacher-homework",classId]}),
        client.invalidateQueries({queryKey:["native-class-teacher-missing-work",classId]}),
        client.invalidateQueries({queryKey:["native-teacher-homework-history",classId,submissionId]}),
      ]);
    }catch(failure){setError(normalizeClientError(failure,"Unable to return practice feedback.").message);}
    finally{setBusy(null);}
  }
  const queue=useQuery({
    queryKey:["native-class-teacher-homework",classId,offset],
    queryFn:()=>getNativeClassTeacherHomework({data:{classId,offset}}),
    retry:false,
  });
  return <div className="space-y-4"><NativeClassMissingWork classId={classId}/><section aria-label="Class homework review" className="space-y-4 border border-border bg-card p-5">
    <div>
      <h2 className="font-serif text-2xl">Student homework</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Submissions from learners actively enrolled in your exact Class.
        Returned practice feedback is separate from official grading decisions,
        not signed grading decisions.
      </p>
    </div>
    <QueryState loading={queue.isPending&&"Checking your teaching assignment…"}
      error={queue.isError&&"This Class review queue is unavailable under your current teacher grant."}
      onRetry={()=>void queue.refetch()} retrying={queue.isFetching}/>
    {queue.data&&<>
      <p className="text-xs text-muted-foreground">{queue.data.notice}</p>
      <HistoricalClassWork key={classId} queryScope={["teacher-historical-class-work",classId]} loadPage={beforeId=>getNativeClassTeacherHistoricalWork({data:{classId,beforeId}})}/>
      {queue.data.items.length===0&&
        <EmptyState title="No submitted, returned or graded homework is available for this Class."/>}
      <ul className="divide-y divide-border">
        {queue.data.items.map(item=><li key={item.id} className="py-4 text-sm space-y-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="font-semibold">{item.assignmentTitle}</h3>
              <p className="text-xs text-muted-foreground">{item.studentName}</p>
            </div>
            <StatusBadge>{item.status}</StatusBadge>
          </div>
          {item.responseText&&<p className="whitespace-pre-wrap bg-muted p-3">
            {item.responseText}
          </p>}
          {item.teacherFeedback&&<p className="text-xs text-muted-foreground">
            Practice feedback: {item.teacherFeedback}
          </p>}
          {item.submittedAt&&<p className="text-xs text-muted-foreground">
            Submitted {new Date(item.submittedAt).toLocaleString()}
          </p>}
          {item.practiceScore!==null&&<p className="text-xs text-muted-foreground">
            Practice score: {item.practiceScore} / {item.practiceScoreMax??10}. Not an official grade.
          </p>}
          <SubmissionRevisionHistory queryScope={["native-teacher-homework-history",classId,item.id]}
            loadPage={beforeRevision=>getNativeClassTeacherHomeworkHistory({data:{classId,submissionId:item.id,beforeRevision}})}/>
          {queue.data.canReturnPracticeFeedback&&item.isPracticeSubmission&&["submitted","returned"].includes(item.status)&&<div className="space-y-3 border-t border-border pt-3">
            <Field label={<>Return practice feedback<span className="sr-only"> for {item.studentName} on {item.assignmentTitle}</span></>}>
              <Textarea rows={3} maxLength={3000} value={feedback[item.id]??item.teacherFeedback??""}
                onChange={event=>setFeedback(previous=>({...previous,[item.id]:event.target.value}))}/>
            </Field>
            <Field className="max-w-40" label={<>Practice score / 10<span className="sr-only"> for {item.studentName} on {item.assignmentTitle}</span></>}>
              <Input type="number" min={0} max={10} step={1}
                value={scores[item.id]??(item.practiceScore===null?"":String(item.practiceScore))}
                onChange={event=>setScores(previous=>({...previous,[item.id]:event.target.value}))}/>
            </Field>
            <Button type="button" size="sm" disabled={!!busy||
              (feedback[item.id]??item.teacherFeedback??"").trim().length<3||
              (scores[item.id]!==undefined&&scores[item.id]!==""&&
                (!Number.isInteger(Number(scores[item.id]))||Number(scores[item.id])<0||Number(scores[item.id])>10))}
              loading={busy===item.id} loadingLabel="Returning…" onClick={()=>void returnFeedback(item.id)}>
              Return practice feedback
            </Button>
          </div>}
        </li>)}
      </ul>
      {notice&&<WorkspaceNotice tone="success">{notice}</WorkspaceNotice>}
      {error&&<WorkspaceNotice tone="danger">{error}</WorkspaceNotice>}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" disabled={offset===0||queue.isFetching} onClick={()=>setOffset(value=>Math.max(0,value-100))}>Previous</Button>
        <span className="text-xs text-muted-foreground">Page {offset/100+1}</span>
        <Button type="button" variant="outline" size="sm" disabled={queue.data.nextOffset===null||queue.isFetching} onClick={()=>setOffset(value=>value+100)}>Next</Button>
      </div>
      <Button type="button" variant="outline" size="sm" disabled={queue.isFetching}
        onClick={()=>void queue.refetch()}>Refresh submissions</Button>
    </>}
  </section></div>;
}

function NativeClassMissingWork({classId}:{classId:string}){
  const [offset,setOffset]=useState(0);
  const queue=useQuery({
    queryKey:["native-class-teacher-missing-work",classId,offset],
    queryFn:()=>getNativeClassTeacherMissingWork({data:{classId,offset}}),retry:false,
  });
  return <section aria-label="Class missing work" className="space-y-4 border border-border bg-card p-5">
    <h2 className="font-serif text-2xl">Missing work</h2>
    <p className="text-sm text-muted-foreground">Past-due assignments that have not been submitted or have been returned for revision, for currently enrolled learners.</p>
    <QueryState loading={queue.isPending&&"Checking current Class assignments…"}
      error={queue.isError&&"Missing work is unavailable under your current teaching appointment."}
      onRetry={()=>void queue.refetch()} retrying={queue.isFetching}/>
    {queue.data&&<>
      {queue.data.items.length===0&&<EmptyState title="No overdue work on this page."/>}
      <ul className="divide-y divide-border">
        {queue.data.items.map(item=><li key={`${item.classEnrollmentId}:${item.assignmentId}`} className="py-3 text-sm">
          <p className="font-semibold">{item.studentName} · {item.assignmentTitle}</p>
          <p className="text-xs text-muted-foreground">Due {new Date(item.dueAt).toLocaleDateString()} · {item.status.replaceAll("_"," ")}</p>
        </li>)}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" disabled={offset===0||queue.isFetching} onClick={()=>setOffset(value=>Math.max(0,value-100))}>Previous</Button>
        <span className="text-xs text-muted-foreground">Page {offset/100+1}</span>
        <Button type="button" variant="outline" size="sm" disabled={queue.data.nextOffset===null||queue.isFetching} onClick={()=>setOffset(value=>value+100)}>Next</Button>
      </div>
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
    <QueryState loading={readiness.isPending&&"Checking Course assessment status…"}
      error={readiness.isError&&"Assessment readiness is unavailable under this teacher assignment."}
      onRetry={()=>void readiness.refetch()} retrying={readiness.isFetching}/>
    {readiness.data&&<>
      {readiness.data.items.length===0&&<EmptyState title="This Course has no configured knowledge-check administrations."/>}
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
