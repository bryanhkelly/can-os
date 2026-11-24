import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/ui/field";
import { ActionFooter, QueryState, WorkspaceNotice } from "@/components/workspace";
import { getClassroomAttendanceRoster } from "@/modules/learning/classroom-attendance.functions";
import { getClassroomHostActivity } from "@/modules/learning/classroom-evidence.functions";
import { recordClassroomAssistedActivity } from "@/modules/learning/classroom-assisted-activity.functions";

type Method="paper"|"shared_device"|"verbal";
export function ClassroomAssistedActivityPanel({facilitatedSessionId}:{
  facilitatedSessionId:string;
}){
  const roster=useQuery({
    queryKey:["classroom-attendance",facilitatedSessionId],
    queryFn:()=>getClassroomAttendanceRoster({data:{facilitatedSessionId}}),
    retry:false,refetchInterval:30_000,
  });
  const releases=useQuery({
    queryKey:["classroom-host-activities",facilitatedSessionId],
    queryFn:()=>getClassroomHostActivity({data:{facilitatedSessionId}}),
    retry:false,refetchInterval:15_000,
  });
  const [learner,setLearner]=useState("");
  const [releaseId,setReleaseId]=useState("");
  const [method,setMethod]=useState<Method>("paper");
  const [answer,setAnswer]=useState("");
  const [evidenceNote,setEvidenceNote]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [success,setSuccess]=useState("");
  const requests=useRef<Record<string,string>>({});
  const activity=releases.isSuccess?releases.data.releases.find(
    item=>item.id===releaseId):undefined;
  const chosen=roster.isSuccess?roster.data.members.find(
    item=>item.courseAttemptId===learner):undefined;
  async function save(){
    if(!activity||!chosen||busy)return;
    const answerChoice=activity.answerType==="single_choice"?Number(answer):null;
    const answerText=activity.answerType==="text"?answer.trim():null;
    if(!answer.trim() || (answerChoice!==null &&
      (!Number.isInteger(answerChoice)||answerChoice<0||
      answerChoice>=activity.choices.length)) || evidenceNote.trim().length<15){
      setError("Select a released activity, provide its answer, and describe how you directly collected the evidence.");
      return;
    }
    const key=[facilitatedSessionId,activity.id,learner,method,answer,evidenceNote].join(":");
    const requestId=requests.current[key]??crypto.randomUUID();
    requests.current[key]=requestId;
    setBusy(true);setError("");setSuccess("");
    try{
      await recordClassroomAssistedActivity({data:{
        facilitatedSessionId,activityReleaseId:activity.id,
        courseAttemptId:learner,requestId,method,
        answerChoice,answerText,evidenceNote:evidenceNote.trim(),
      }});
      delete requests.current[key];
      setAnswer("");setEvidenceNote("");
      setSuccess("Facilitator-attributed practice was saved. The learner's own submissions, grades and attendance were not changed.");
    }catch{
      setError("Assisted evidence was not saved. Verify the Course, Site, question and correction window before retrying.");
    }finally{setBusy(false);}
  }
  return <section className="mt-4 border border-border bg-card p-4"
    aria-label="No-device and shared-device formative practice">
    <h4 className="font-serif text-lg font-semibold">Paper and shared-device practice</h4>
    <p className="mt-2 text-xs text-muted-foreground">
      For a learner who responded on paper, verbally or using a shared device,
      record the facilitator's observation separately. This is not a claim that
      the learner personally submitted a digital response, and never creates
      academic grades or completion.
    </p>
    <QueryState error={(roster.isError||releases.isError)&&"Current room or registered learner authority could not be verified."}
      loading={!(roster.isError||releases.isError)&&(roster.isPending||releases.isPending)&&"Checking the Course roster and released activities…"}
      onRetry={()=>{void roster.refetch();void releases.refetch();}} retrying={roster.isFetching||releases.isFetching}/>
    {roster.isSuccess&&releases.isSuccess&&<div className="mt-4 grid gap-3 sm:grid-cols-2">
      <Field label="Registered learner">
        <Select className="mt-2"
          value={learner} onChange={e=>setLearner(e.target.value)}>
          <option value="">Choose a learner</option>
          {roster.data.members.map(x=><option key={x.courseAttemptId}
            value={x.courseAttemptId}>
            {x.displayName}{x.pairedDevice?"":" (no device)"}
          </option>)}
        </Select>
      </Field>
      <Field label="Released classroom activity">
        <Select className="mt-2"
          value={releaseId} onChange={e=>{setReleaseId(e.target.value);setAnswer("");}}>
          <option value="">Choose a question</option>
          {releases.data.releases.map(x=><option key={x.id} value={x.id}>
            {x.prompt.slice(0,80)}{x.closed?" (closed)":""}
          </option>)}
        </Select>
      </Field>
      <Field label="Evidence source">
        <Select className="mt-2"
          value={method} onChange={e=>setMethod(e.target.value as Method)}>
          <option value="paper">Paper response</option>
          <option value="shared_device">Shared device</option>
          <option value="verbal">Verbal response</option>
        </Select>
      </Field>
      {activity?.answerType==="single_choice"?<Field label="Recorded choice">
        <Select className="mt-2"
          value={answer} onChange={e=>setAnswer(e.target.value)}>
          <option value="">Select reported choice</option>
          {activity.choices.map((choice,i)=><option key={i} value={i}>{choice}</option>)}
        </Select>
      </Field>:<Field label="Recorded short response">
        <Textarea rows={2} maxLength={1000} value={answer}
          onChange={e=>setAnswer(e.target.value)}
          className="mt-2"/>
      </Field>}
      <Field label="Required collection note (15–500 characters)" className="sm:col-span-2">
        <Textarea rows={2} minLength={15} maxLength={500} value={evidenceNote}
          onChange={e=>setEvidenceNote(e.target.value)}
          placeholder="Collected this answer directly from the learner on a printed response sheet…"
          className="mt-2"/>
      </Field>
      <ActionFooter layout="inline" className="sm:col-span-2 mt-0">
        <Button type="button" size="sm" disabled={busy||!chosen||!activity||
          !answer.trim()||evidenceNote.trim().length<15||!roster.data.attestationsOpen}
          loading={busy} loadingLabel="Saving…" onClick={()=>void save()}>Record assisted practice</Button>
      </ActionFooter>
    </div>}
    {error&&<WorkspaceNotice tone="danger" className="mt-3">{error}</WorkspaceNotice>}
    {success&&<WorkspaceNotice tone="success" className="mt-3">{success}</WorkspaceNotice>}
  </section>;
}
