import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Radio } from "@/components/ui/choice";
import { Label } from "@/components/ui/label";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { accessClientInstance } from "@/domain/session-client";
import { classroomPendingKey, readPendingClassroomResponse, writePendingClassroomResponse, clearPendingClassroomResponse } from "@/domain/classroom-response-recovery";
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
  // Freeze the original payload whenever the server outcome is unknown.
  // A replay must be byte-for-byte identical, even if the prompt closes.
  const pendingAnswers=useRef<Record<string,string>>({});
  const [recoveries,setRecoveries]=useState(0);
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
    // Only restore matching tab/device identities; no enrollment authority is inferred.
    setRecoveries(value=>value+1);
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

  useEffect(()=>{
    if(!state.isSuccess)return;
    const recovered:Record<string,string>={};
    for(const activity of state.data.activities){
      const key=classroomPendingKey(courseAttemptId,facilitatedSessionId,activity.id);
      if(activity.responded){clearPendingClassroomResponse(window.sessionStorage,key);continue;}
      if(retryIds.current[activity.id])continue;
      const stored=readPendingClassroomResponse(window.sessionStorage,key);
      if(stored && stored.clientInstanceId===instance.current){
        retryIds.current[activity.id]=stored.clientSubmissionId;
        pendingAnswers.current[activity.id]=stored.answer;
        recovered[activity.id]=stored.answer;
      } else if(stored) {
        // A new tab/session identity cannot reuse the original retry token.
        clearPendingClassroomResponse(window.sessionStorage,key);
      }
    }
    if(Object.keys(recovered).length)setAnswers(previous=>({...previous,...recovered}));
  },[state.isSuccess,state.data,courseAttemptId,facilitatedSessionId,recoveries]);

  async function submit(activity:{id:string;answerType:"single_choice"|"text";choices:string[]}){
    if(busy)return;
    if(!online){
      setError("You're offline. Your answer is still in this form. Reconnect before submitting.");
      return;
    }
    const answer=pendingAnswers.current[activity.id]??answers[activity.id]??"";
    if(!answer.trim())return;
    const key=activity.id;
    const clientSubmissionId=retryIds.current[key]??crypto.randomUUID();
    retryIds.current[key]=clientSubmissionId;
    pendingAnswers.current[key]=answer;
    setError("");setNotice("");
    const storageKey=classroomPendingKey(courseAttemptId,facilitatedSessionId,key);
    const clientInstanceId=instance.current||accessClientInstance();
    if(!writePendingClassroomResponse(window.sessionStorage,storageKey,{
      clientSubmissionId,clientInstanceId,answer,savedAt:Date.now(),
    }))setNotice("Your browser cannot retain an interrupted answer after reload. Keep this tab open.");
    setBusy(key);
    try{
      await submitClassroomResponse({data:{
        facilitatedSessionId,courseAttemptId,activityReleaseId:activity.id,
        clientInstanceId,
        clientSubmissionId,
        answerChoice:activity.answerType==="single_choice"?Number(answer):null,
        answerText:activity.answerType==="text"?answer.trim():null,
      }});
      delete retryIds.current[key];
      delete pendingAnswers.current[key];
      clearPendingClassroomResponse(window.sessionStorage,storageKey);
      setNotice("Response saved. This is formative work, not a graded submission.");
      // Refresh is best-effort: a refresh outage must not turn a confirmed
      // server write into a misleading failed-submission message.
      void queryClient.invalidateQueries({queryKey:["classroom-activities",facilitatedSessionId,courseAttemptId]})
        .catch(()=>{});
    }catch{
      setError("Response not confirmed. Retry the identical answer. Closed questions can only confirm a previously saved response.");
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
      {!activity.responded&&(!activity.closed||!!retryIds.current[activity.id])&&<form className="mt-3 space-y-2"
        aria-busy={busy===activity.id}
        onSubmit={e=>{e.preventDefault();void submit(activity);}}>
        {activity.closed&&<p role="status" className="text-sm">This question is closed. Retry will only confirm an identical response previously received by the server; it cannot submit a new answer.</p>}
        {activity.answerType==="single_choice"?
          <fieldset className="space-y-2">
            <legend className="sr-only">{activity.prompt}</legend>
            {activity.choices.map((choice,i)=><Label key={i}
              className="flex items-center gap-2 border border-border p-3 text-sm">
              <Radio name={"answer-"+activity.id} value={String(i)}
                checked={answers[activity.id]===String(i)}
                disabled={activity.closed||!!retryIds.current[activity.id]}
                onChange={()=>setAnswers(prev=>({...prev,[activity.id]:String(i)}))}/>
              {choice}
            </Label>)}
          </fieldset>
          :<Field label="Your response">
            <Textarea maxLength={1000} value={answers[activity.id]??""}
              disabled={activity.closed||!!retryIds.current[activity.id]}
              onChange={e=>setAnswers(prev=>({...prev,[activity.id]:e.target.value}))}
              className="mt-1" rows={3}/>
          </Field>}
        <Button disabled={!online||!!busy||!(answers[activity.id]??"").trim()}>
          {busy===activity.id?"Saving…":activity.closed?"Confirm previous submission":"Submit response"}
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
