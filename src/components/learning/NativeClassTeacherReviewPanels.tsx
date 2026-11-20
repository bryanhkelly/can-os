import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { getNativeClassTeacherHomework, getNativeClassTeacherAssessments,
  returnNativeClassPracticeFeedback, getNativeClassTeacherDraftPractice } from
  "@/modules/classes/native-class-teacher-homework.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { normalizeClientError } from "@/lib/client-error";

/** Read-only native Class teacher queue. Official grading is a separate
 * verified-grader workflow, not a state change to synthetic homework. */
export function NativeClassTeacherHomeworkPanel({classId}:{classId:string}){
  const client=useQueryClient();
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
        classId,submissionId,feedback:(feedback[submissionId]??item?.demoFeedback??"").trim(),practiceScore,
      }});
      setNotice("Practice feedback returned to the learner. No official grade was issued.");
      await client.invalidateQueries({queryKey:["native-class-teacher-homework",classId]});
    }catch(failure){setError(normalizeClientError(failure,"Unable to return practice feedback.").message);}
    finally{setBusy(null);}
  }
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
          {item.submittedAt&&<p className="text-xs text-muted-foreground">
            Submitted {new Date(item.submittedAt).toLocaleString()}
          </p>}
          {item.practiceScore!==null&&<p className="text-xs text-muted-foreground">
            Practice score: {item.practiceScore} / {item.practiceScoreMax??10}. Not an official grade.
          </p>}
          {queue.data.canReturnPracticeFeedback&&item.isSyntheticPractice&&<div className="space-y-3 border-t border-border pt-3">
            <label className="block space-y-1">
              <span className="text-xs font-semibold">Return practice feedback</span>
              <Textarea rows={3} maxLength={3000} value={feedback[item.id]??item.demoFeedback??""}
                onChange={event=>setFeedback(previous=>({...previous,[item.id]:event.target.value}))}
                aria-label={"Practice feedback for "+item.studentName+" on "+item.assignmentTitle}/>
            </label>
            <label className="block max-w-28 space-y-1">
              <span className="text-xs font-semibold">Practice score / 10</span>
              <Input type="number" min={0} max={10} step={1}
                value={scores[item.id]??(item.practiceScore===null?"":String(item.practiceScore))}
                onChange={event=>setScores(previous=>({...previous,[item.id]:event.target.value}))}/>
            </label>
            <Button type="button" size="sm" disabled={!!busy||
              (feedback[item.id]??item.demoFeedback??"").trim().length<3||
              (scores[item.id]!==undefined&&scores[item.id]!==""&&
                (!Number.isInteger(Number(scores[item.id]))||Number(scores[item.id])<0||Number(scores[item.id])>10))}
              onClick={()=>void returnFeedback(item.id)}>
              {busy===item.id?"Returning…":"Return practice feedback"}
            </Button>
          </div>}
        </li>)}
      </ul>
      {notice&&<p role="status" className="text-sm">{notice}</p>}
      {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
      {queue.data.partial&&<p className="text-xs">Only the most recent 100 records are shown.</p>}
      <Button type="button" variant="outline" size="sm" disabled={queue.isFetching}
        onClick={()=>void queue.refetch()}>Refresh submissions</Button>
    </>}
  </section>;
}

export function NativeClassTeacherAssessmentPanel({classId}:{classId:string}){
  const practice=useQuery({
    queryKey:["native-class-teacher-draft-practice",classId],
    queryFn:()=>getNativeClassTeacherDraftPractice({data:{classId}}),
    retry:false,
  });
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
    {practice.data?.items.length ? <section className="mt-5 space-y-3 border-t border-border pt-5"
      aria-label="Synthetic learner practice responses">
      <h3 className="font-semibold">Student draft practice responses</h3>
      <p className="text-xs text-muted-foreground">
        Private synthetic practice only. These are not published exams, official grades,
        or credit-bearing results.
      </p>
      {practice.data.items.map(item=><details key={item.id} className="border border-border p-3">
        <summary className="cursor-pointer text-sm font-medium">
          {item.studentName} · {new Date(item.recordedAt).toLocaleString()}
        </summary>
        <ol className="mt-3 space-y-3">
          {item.answers.map((answer,index)=><li key={index} className="text-sm">
            <p className="font-medium">{answer.prompt}</p>
            <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{answer.answer}</p>
          </li>)}
        </ol>
      </details>)}
      {practice.data.partial&&<p className="text-xs text-muted-foreground">
        Showing the latest 50 practice attempts.
      </p>}
    </section> : null}
  </section>;
}
