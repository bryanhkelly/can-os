import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { getNativeClassTeacherGradebook } from "@/modules/classes/native-class-gradebook.functions";
import { HistoricalClassWork } from "./HistoricalClassWork";
import { SubmissionRevisionHistory } from "./SubmissionRevisionHistory";
import { getNativeClassTeacherHomework, getNativeClassTeacherMissingWork, getNativeClassTeacherOpenFollowUps, createNativeClassMissingWorkFollowUp, getNativeClassTeacherHomeworkHistory, getNativeClassTeacherHistoricalWork, getNativeClassTeacherAssessments,
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
        client.invalidateQueries({queryKey:["native-class-gradebook",classId]}),
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
  return <div className="space-y-4"><NativeClassGradebook classId={classId}/><NativeClassMissingWork classId={classId}/><section aria-label="Class homework review" className="space-y-4 border border-border bg-card p-5">
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

function NativeClassGradebook({classId}:{classId:string}){
  const [offset,setOffset]=useState(0);
  const gradebook=useQuery({queryKey:["native-class-gradebook",classId,offset],
    queryFn:()=>getNativeClassTeacherGradebook({data:{classId,offset}}),retry:false});
  return <section aria-label="Official Class grading decisions" className="space-y-4 border border-border bg-card p-5">
    <h2 className="font-serif text-2xl">Class gradebook</h2>
    <p className="text-sm text-muted-foreground">Recorded official decisions only. Practice scores are not official grades. This staff view is not a student grade release or a grading appointment.</p>
    <QueryState loading={gradebook.isPending&&"Loading Class gradebook…"}
      error={gradebook.isError&&"Gradebook unavailable under your current appointment."}
      onRetry={()=>void gradebook.refetch()} retrying={gradebook.isFetching}/>
    {gradebook.data&&<>
      {gradebook.data.items.length===0&&<EmptyState title="No current Class assignment records on this page."/>}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead><tr className="border-b border-border"><th scope="col" className="p-2">Learner</th><th scope="col" className="p-2">Assignment</th><th scope="col" className="p-2">Work</th><th scope="col" className="p-2">Official decision</th><th scope="col" className="p-2">Recorded score / policy</th></tr></thead>
          <tbody>{gradebook.data.items.map(item=><tr key={item.classEnrollmentId+":"+item.assignmentId} className="border-b border-border">
            <td className="p-2">{item.studentName}</td><td className="p-2">{item.assignmentTitle}</td>
            <td className="p-2">{item.submissionStatus.replaceAll("_"," ")}</td>
            <td className="p-2">{item.integrityIssue?"Reconciliation required":item.practiceOnly?"Practice only":item.officialDecision??"No decision"}</td>
            <td className="p-2">{item.officialScore??"—"}{item.policyKey&&<p className="text-xs text-muted-foreground">{item.policyKey}</p>}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <div className="flex items-center gap-2">
        <Button type="button" size="sm" variant="outline" disabled={offset===0||gradebook.isFetching} onClick={()=>setOffset(n=>Math.max(0,n-100))}>Previous</Button>
        <span className="text-xs text-muted-foreground">Page {offset/100+1}</span>
        <Button type="button" size="sm" variant="outline" disabled={gradebook.data.nextOffset===null||gradebook.isFetching} onClick={()=>setOffset(n=>n+100)}>Next</Button>
      </div>
    </>}
  </section>;
}

function NativeClassMissingWork({classId}:{classId:string}){
  const client=useQueryClient();
  const [offset,setOffset]=useState(0);
  const [followUpOffset,setFollowUpOffset]=useState(0);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const followUps=useQuery({queryKey:["native-class-open-follow-ups",classId,followUpOffset],
    queryFn:()=>getNativeClassTeacherOpenFollowUps({data:{classId,offset:followUpOffset}}),retry:false});
  async function createFollowUp(classEnrollmentId:string,assignmentId:string){
    if(busy)return;
    setBusy(true);setNotice("");setError("");
    try{
      const result=await createNativeClassMissingWorkFollowUp({data:{classId,classEnrollmentId,assignmentId}});
      setNotice(result.assignedToAnotherTeacher?"Another teacher already owns this follow-up.":result.created?"Follow-up created.":"Your follow-up is already open.");
      await Promise.all([client.invalidateQueries({queryKey:["native-class-teacher-missing-work",classId]}),
        client.invalidateQueries({queryKey:["native-class-open-follow-ups",classId]})]);
    }catch(failure){setError(normalizeClientError(failure,"Unable to create or refresh follow-up.").message);}
    finally{setBusy(false);}
  }
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
    {notice&&<WorkspaceNotice tone="success">{notice}</WorkspaceNotice>}
    {error&&<WorkspaceNotice tone="danger">{error}</WorkspaceNotice>}
    {queue.data&&<>
      {queue.data.items.length===0&&<EmptyState title="No overdue work on this page."/>}
      <ul className="divide-y divide-border">
        {queue.data.items.map(item=><li key={`${item.classEnrollmentId}:${item.assignmentId}`} className="py-3 text-sm">
          <p className="font-semibold">{item.studentName} · {item.assignmentTitle}</p>
          <p className="text-xs text-muted-foreground">Due {new Date(item.dueAt).toLocaleDateString()} · {item.status.replaceAll("_"," ")}</p>
          {item.followUpActionId?<Link to="/actions/$actionId" params={{actionId:item.followUpActionId}} className="mt-2 inline-block font-semibold underline">Open follow-up</Link>:
            item.assignedToAnotherTeacher?<p className="mt-2 text-xs text-muted-foreground">Already assigned to another teacher</p>:
            <Button type="button" size="sm" variant="outline" className="mt-2" disabled={busy} onClick={()=>void createFollowUp(item.classEnrollmentId,item.assignmentId)}>Create follow-up</Button>}
        </li>)}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" disabled={offset===0||queue.isFetching} onClick={()=>setOffset(value=>Math.max(0,value-100))}>Previous</Button>
        <span className="text-xs text-muted-foreground">Page {offset/100+1}</span>
        <Button type="button" variant="outline" size="sm" disabled={queue.data.nextOffset===null||queue.isFetching} onClick={()=>setOffset(value=>value+100)}>Next</Button>
      </div>
    </>}
    <div className="space-y-3 border-t border-border pt-4">
      <h3 className="font-semibold">My open follow-ups</h3>
      <QueryState loading={followUps.isPending&&"Loading assigned follow-ups…"}
        error={followUps.isError&&"Unable to load assigned follow-ups."}
        onRetry={()=>void followUps.refetch()} retrying={followUps.isFetching}/>
      {followUps.data&&<>
        {followUps.data.items.length===0&&<EmptyState title="No assigned open follow-ups on this page."/>}
        <ul className="divide-y divide-border">
          {followUps.data.items.map(item=><li key={item.actionId} className="py-3 text-sm">
            <Link to="/actions/$actionId" params={{actionId:item.actionId}} className="font-semibold underline">{item.studentName} · {item.assignmentTitle}</Link>
            <p className="text-xs text-muted-foreground">{item.status.replaceAll("_"," ")}</p>
          </li>)}
        </ul>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" disabled={followUpOffset===0||followUps.isFetching} onClick={()=>setFollowUpOffset(value=>Math.max(0,value-100))}>Previous</Button>
          <span className="text-xs text-muted-foreground">Page {followUpOffset/100+1}</span>
          <Button type="button" variant="outline" size="sm" disabled={followUps.data.nextOffset===null||followUps.isFetching} onClick={()=>setFollowUpOffset(value=>value+100)}>Next</Button>
        </div>
      </>}
    </div>
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
