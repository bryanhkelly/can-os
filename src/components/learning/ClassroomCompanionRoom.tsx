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
  const [online,setOnline]=useState(true);
  const instance=useRef<string>("");
  const retryIds=useRef<Record<string,string>>({});
  const state=useQuery({
    queryKey:["classroom-activities",facilitatedSessionId,courseAttemptId],
    queryFn:()=>getClassroomLearnerActivities({data:{courseAttemptId,facilitatedSessionId}}),
    refetchInterval:online?8000:false,refetchOnReconnect:true,
    retry:false,staleTime:0,gcTime:0,
  });
  useEffect(()=>{
    // Browser connectivity is advisory, never permission. A transient
    // failure must not discard the form answer or rotate the retry identity.
    const reconnect=()=>{
      setOnline(navigator.onLine);
      if(navigator.onLine)void queryClient.invalidateQueries({
        queryKey:["classroom-activities",facilitatedSessionId,courseAttemptId],
      });
    };
    reconnect();
    window.addEventListener("online",reconnect);
    window.addEventListener("offline",reconnect);
    return ()=>{
      window.removeEventListener("online",reconnect);
      window.removeEventListener("offline",reconnect);
    };
  },[queryClient,facilitatedSessionId,courseAttemptId]);
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
    if(!online){
      setError("You're offline. Your answer is still in this form. Reconnect before submitting.");
      return;
    }
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
    }catch{
      setError("Response was not confirmed. Keep this page open and retry after reconnecting. Your retry ID is preserved to prevent duplicates.");
    }
    finally{setBusy("");}
  }

  return <section className="mt-5 space-y-4" aria-label="Classroom activities">
    <h3 className="font-serif text-xl font-semibold">Activities from your facilitator</h3>
    {!online&&<p role="status" aria-live="polite"
      className="border border-border bg-muted/30 p-3 text-sm">
      Connection unavailable. You can continue drafting in this open page.
      Responses will NOT be sent or counted until you reconnect and submit.
    </p>}
    {state.isPending&&<p role="status">Checking released activities…</p>}
    {state.isError&&<p role="alert">Activities are temporarily unavailable. Your room connection may have ended.</p>}
    {state.isSuccess&&state.data.activities.length===0&&
      <p className="border border-border p-4 text-sm">Waiting for the facilitator to release an activity.</p>}
    {state.isSuccess&&state.data?.truncated&&<p role="status" className="text-xs text-muted-foreground">
      This room has more activity history than is displayed. Earlier submissions remain saved.
    </p>}
    {state.isSuccess&&state.data?.activities.map(activity=><article key={activity.id} className="border border-border bg-card p-4">
      <p className="font-medium">{activity.prompt}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {activity.closed?"Closed":"Open for responses"} · {activity.responded?"Response saved":"Not yet answered"}
      </p>
      {!activity.closed&&!activity.responded&&<form className="mt-3 space-y-2"
        aria-busy={busy===activity.id}
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
        <Button disabled={!online||!!busy||!(answers[activity.id]??"").trim()}>
          {busy===activity.id?"Saving…":"Submit response"}
        </Button>
      </form>}
    </article>)}
    {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
    {notice&&<p role="status" className="text-sm">{notice}</p>}
    <p className="text-xs text-muted-foreground">
      Responses are formative practice and remain attached to your own Course attempt.
      Device heartbeats are client observations. They do not establish verified attendance,
      video viewing, assessment completion or course credit.
    </p>
  </section>;
}
