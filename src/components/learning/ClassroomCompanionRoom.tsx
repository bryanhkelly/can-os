import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { accessClientInstance } from "@/domain/session-client";
import {
  getClassroomLearnerActivities, recordClassroomPresence,
  submitClassroomResponse,
} from "@/modules/learning/classroom-evidence.functions";

export function ClassroomCompanionRoom({courseAttemptId,facilitatedSessionId}:{
  courseAttemptId:string;facilitatedSessionId:string;
}) {
  const queryClient=useQueryClient();
  const [answers,setAnswers]=useState<Record<string,string>>({});
  const [busy,setBusy]=useState("");
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const instance=useRef<string>("");
  const retryIds=useRef<Record<string,string>>({});
  const state=useQuery({
    queryKey:["classroom-activities",facilitatedSessionId,courseAttemptId],
    queryFn:()=>getClassroomLearnerActivities({data:{courseAttemptId,facilitatedSessionId}}),
    refetchInterval:8000,retry:false,staleTime:0,gcTime:0,
  });
  useEffect(()=>{
    instance.current=accessClientInstance();
    const send=(eventKind:"joined"|"heartbeat"|"away")=>{
      if(!instance.current)return;
      void recordClassroomPresence({data:{
        courseAttemptId,facilitatedSessionId,clientInstanceId:instance.current,
        clientEventId:crypto.randomUUID(),eventKind,
      }}).catch(()=>{/* Observational evidence failure never grants attendance. */});
    };
    send("joined");
    const timer=window.setInterval(()=>{
      if(document.visibilityState==="visible")send("heartbeat");
    },45000);
    const visibility=()=>send(document.visibilityState==="visible"?"heartbeat":"away");
    document.addEventListener("visibilitychange",visibility);
    return ()=>{window.clearInterval(timer);document.removeEventListener("visibilitychange",visibility);};
  },[courseAttemptId,facilitatedSessionId]);

  async function submit(activity:{id:string;answerType:"single_choice"|"text";choices:string[]}){
    if(busy)return;
    const answer=answers[activity.id]??"";
    if(!answer.trim())return;
    const key=activity.id;
    const clientSubmissionId=retryIds.current[key]??crypto.randomUUID();
    retryIds.current[key]=clientSubmissionId;
    setBusy(key);setError("");setNotice("");
    try{
      await submitClassroomResponse({data:{
        facilitatedSessionId,courseAttemptId,activityReleaseId:activity.id,
        clientInstanceId:instance.current||accessClientInstance(),
        clientSubmissionId,
        answerChoice:activity.answerType==="single_choice"?Number(answer):null,
        answerText:activity.answerType==="text"?answer.trim():null,
      }});
      delete retryIds.current[key];
      setNotice("Response saved. This is formative work, not a graded submission.");
      await queryClient.invalidateQueries({queryKey:["classroom-activities",facilitatedSessionId,courseAttemptId]});
    }catch{setError("Response was not confirmed. You may retry without creating a duplicate.");}
    finally{setBusy("");}
  }

  return <section className="mt-5 space-y-4" aria-label="Classroom activities">
    <h3 className="font-serif text-xl font-semibold">Activities from your facilitator</h3>
    {state.isPending&&<p role="status">Checking released activities…</p>}
    {state.isError&&<p role="alert">Activities are temporarily unavailable. Your room connection may have ended.</p>}
    {state.isSuccess&&state.data.activities.length===0&&
      <p className="border border-border p-4 text-sm">Waiting for the facilitator to release an activity.</p>}
    {state.data?.truncated&&<p role="status" className="text-xs text-muted-foreground">
      This room has more activity history than is displayed. Earlier submissions remain saved.
    </p>}
    {state.data?.activities.map(activity=><article key={activity.id} className="border border-border bg-card p-4">
      <p className="font-medium">{activity.prompt}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {activity.closed?"Closed":"Open for responses"} · {activity.responded?"Response saved":"Not yet answered"}
      </p>
      {!activity.closed&&!activity.responded&&<form className="mt-3 space-y-2"
        onSubmit={e=>{e.preventDefault();void submit(activity);}}>
        {activity.answerType==="single_choice"?
          <fieldset className="space-y-2">
            <legend className="sr-only">{activity.prompt}</legend>
            {activity.choices.map((choice,i)=><label key={i}
              className="flex items-center gap-2 border border-border p-3 text-sm">
              <input type="radio" name={"answer-"+activity.id} value={String(i)}
                checked={answers[activity.id]===String(i)}
                onChange={()=>setAnswers(prev=>({...prev,[activity.id]:String(i)}))}/>
              {choice}
            </label>)}
          </fieldset>
          :<label className="block text-sm">
            Your response
            <textarea maxLength={1000} value={answers[activity.id]??""}
              onChange={e=>setAnswers(prev=>({...prev,[activity.id]:e.target.value}))}
              className="mt-1 w-full border border-border bg-background p-3" rows={3}/>
          </label>}
        <Button disabled={!!busy||!(answers[activity.id]??"").trim()}>
          {busy===activity.id?"Saving…":"Submit response"}
        </Button>
      </form>}
    </article>)}
    {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
    {notice&&<p role="status" className="text-sm">{notice}</p>}
    <p className="text-xs text-muted-foreground">
      Responses are formative practice and remain attached to your own Course attempt.\n      Device heartbeats are client observations. They do not establish verified attendance,
      video viewing, assessment completion or course credit.
    </p>
  </section>;
}
