import { useEffect, useRef } from "react";
import {
  recordCanonicalLearningEvent, setCanonicalLearningSessionState,
  startCanonicalLearningSession,
} from "@/modules/learning/canonical-learning-activity.functions";

type EvidenceKind = "lesson_opened" | "lesson_resumed" | "engaged_interval";
function send(
  courseAttemptId: string, learningSessionId: string, lessonId: string,
  kind: EvidenceKind, durationMs?: number,
) {
  const event = {
    clientEventId: crypto.randomUUID(), kind, lessonId, resourceId: null,
    occurredAt: new Date().toISOString(),
    ...(kind === "engaged_interval" ? { durationMs, pageVisible: true, windowFocused: true } : {}),
  };
  return recordCanonicalLearningEvent({data:{courseAttemptId,learningSessionId,event}});
}

/** Non-blocking evidence instrument. Does not certify watching, attendance, mastery or credit. */
export function CanonicalLearningTracker({ courseAttemptId, lessonId }: {
  courseAttemptId:string; lessonId:string|null;
}) {
  const session = useRef<string|null>(null);
  const currentLesson = useRef<string|null>(lessonId);
  const lastInteraction = useRef(Date.now());
  const needsResume = useRef(false);
  useEffect(()=>{
    let closed=false;
    session.current=null;
    void startCanonicalLearningSession({data:{courseAttemptId,clientInstanceId:crypto.randomUUID()}}).then(async result=>{
      if(closed){
        await setCanonicalLearningSessionState({data:{
          courseAttemptId,learningSessionId:result.learningSessionId,action:"end",
        }}).catch(()=>{});
        return;
      }
      session.current=result.learningSessionId;
      lastInteraction.current=Date.now();
      if(currentLesson.current && document.visibilityState==="visible"){
        void send(courseAttemptId,result.learningSessionId,currentLesson.current,"lesson_opened").catch(()=>{});
      }
    }).catch(()=>{/* Telemetry outage must not block instruction. */});
    const onHidden=()=>{
      if(document.visibilityState==="visible"){
        onFocus();
        return;
      }
      needsResume.current=true;
      lastInteraction.current=Date.now();
      const active=session.current;
      if(active) void setCanonicalLearningSessionState({data:{
        courseAttemptId,learningSessionId:active,action:"pause",
      }}).catch(()=>{});
    };
    const onFocus=()=>{
      const active=session.current;
      if(!active || document.visibilityState!=="visible" || !document.hasFocus())return;
      void setCanonicalLearningSessionState({data:{
        courseAttemptId,learningSessionId:active,action:"resume",
      }}).catch(()=>{});
    };
    const onActivity=(event:Event)=>{
      const active=session.current, lesson=currentLesson.current, target=event.target;
      if(!active || !lesson || !event.isTrusted || !(target instanceof Element) ||
        !target.closest("[data-learning-content]") ||
        document.visibilityState!=="visible" || !document.hasFocus())return;
      const now=Date.now();
      if(needsResume.current){
        needsResume.current=false;lastInteraction.current=now;
        void send(courseAttemptId,active,lesson,"lesson_resumed").catch(()=>{});
        return;
      }
      if(now-lastInteraction.current<30_000)return;
      const elapsed=Math.min(now-lastInteraction.current,60_000);
      lastInteraction.current=now;
      void send(courseAttemptId,active,lesson,"engaged_interval",elapsed).catch(()=>{});
    };
    document.addEventListener("visibilitychange",onHidden);
    window.addEventListener("blur",onHidden);
    window.addEventListener("focus",onFocus);
    document.addEventListener("pointerdown",onActivity,{passive:true});
    document.addEventListener("keydown",onActivity);
    return ()=>{
      closed=true;
      document.removeEventListener("visibilitychange",onHidden);
      window.removeEventListener("blur",onHidden);
      window.removeEventListener("focus",onFocus);
      document.removeEventListener("pointerdown",onActivity);
      document.removeEventListener("keydown",onActivity);
      const active=session.current;session.current=null;
      if(active)void setCanonicalLearningSessionState({data:{
        courseAttemptId,learningSessionId:active,action:"end",
      }}).catch(()=>{});
    };
  },[courseAttemptId]);
  useEffect(()=>{
    currentLesson.current=lessonId;
    const active=session.current;
    if(active && lessonId && document.visibilityState==="visible"){
      lastInteraction.current=Date.now();
      void send(courseAttemptId,active,lessonId,"lesson_opened").catch(()=>{});
    }
  },[courseAttemptId,lessonId]);
  return null;
}
