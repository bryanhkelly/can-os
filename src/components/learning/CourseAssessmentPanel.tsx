import {useAssessmentWorkspaceScope} from "@/lib/api/use-assessment-workspace-scope";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { QueryState, WorkspaceNotice } from "@/components/workspace";
import { LearningQuestionnaire } from "./LearningQuestionnaire";
import {
  beginNoncreditKnowledgeCheckAttempt, getNoncreditKnowledgeCheck,
  submitNoncreditKnowledgeCheckAnswers,
  saveNoncreditKnowledgeCheckAnswer,
} from "@/lib/api/browser-assessments-outcomes";

type KnowledgeCheck = Awaited<ReturnType<typeof getNoncreditKnowledgeCheck>>;

/** Reused within the existing recorded classroom, not a separate portal. */
export function CourseAssessmentPanel({courseAttemptId,phase="final",onAssessmentCompleted,context="noncredit"}:{
  courseAttemptId:string;phase?:"baseline"|"final";onAssessmentCompleted?:()=>void;
  context?:"noncredit"|"class";
}) {
  const scope=useAssessmentWorkspaceScope();
  if(!scope)return <WorkspaceNotice>Verified workspace membership is required.</WorkspaceNotice>;
  return <KnowledgeCheckSession key={JSON.stringify([scope,courseAttemptId,phase])}
    courseAttemptId={courseAttemptId} phase={phase} context={context}
    onAssessmentCompleted={onAssessmentCompleted}/>;
}
function KnowledgeCheckSession({courseAttemptId,phase,onAssessmentCompleted,context}:{
  courseAttemptId:string;phase:"baseline"|"final";onAssessmentCompleted?:()=>void;
  context:"noncredit"|"class";
}) {
  const [check,setCheck]=useState<KnowledgeCheck|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [draftStatus,setDraftStatus]=useState<"idle"|"saving"|"saved"|"failed">("idle");
  const draftQueue=useRef<Promise<void>>(Promise.resolve());
  const mounted=useRef(false);
  const starting=useRef(false);
  const load=useCallback(async()=>{
    const next=await getNoncreditKnowledgeCheck(courseAttemptId,phase);
    if(mounted.current){setCheck(next);setError("");}
  },[courseAttemptId,phase]);
  useEffect(()=>{
    let active=true;
    mounted.current=true;
    const controller=new AbortController();
    setCheck(null);setError("");setDraftStatus("idle");
    void getNoncreditKnowledgeCheck(courseAttemptId,phase,controller.signal)
      .then(next=>{if(active)setCheck(next);})
      .catch(()=>{if(active)setError("Knowledge-check availability could not be verified.");});
    return ()=>{active=false;mounted.current=false;controller.abort();};
  },[courseAttemptId,phase]);

  async function begin() {
    if(starting.current||!mounted.current)return;
    starting.current=true;
    setBusy(true);setError("");
    try {
      await beginNoncreditKnowledgeCheckAttempt({courseAttemptId,phase,requestId:crypto.randomUUID()});
      if(mounted.current)await load();
    }catch {
      setError("Unable to start this knowledge check. Check your participation or attempt limit.");
    }finally {starting.current=false;if(mounted.current)setBusy(false);}
  }

  function saveDraft(attemptId:string,questionId:string,optionIds:string[]) {
    setDraftStatus("saving");
    // Serialize edits for an attempt; canonical answer revisions persist across sessions.
    draftQueue.current=draftQueue.current.catch(()=>undefined).then(async()=>{
      if(!mounted.current)return;
      await saveNoncreditKnowledgeCheckAnswer({courseAttemptId,phase,attemptId,questionId,optionIds,requestId:crypto.randomUUID()});
      if(mounted.current)setDraftStatus("saved");
    }).catch(()=>{if(mounted.current)setDraftStatus("failed");});
  }

  if(error&&!check)return <WorkspaceNotice tone="danger">
    <p>{error} No answers or attempts were changed.</p>
    <Button type="button" size="sm" variant="outline" className="mt-3" disabled={busy}
      loading={busy} onClick={()=>void (async()=>{
        if(busy)return;
        setBusy(true);setError("");
        try{await load();}
        catch{setError("Knowledge-check availability could not be verified.");}
        finally{setBusy(false);}
      })()}>Retry knowledge check</Button>
  </WorkspaceNotice>;
  if(!check)return <QueryState loading="Loading knowledge check…"/>;
  return <section aria-label={phase==="baseline"?"Before-course diagnostic":context==="class"?"Class knowledge check":"Noncredit knowledge check"} className="space-y-4">
    <div>
      <h3 className="font-serif text-xl font-semibold">
        {phase==="baseline"?"Before-course knowledge check":"After-course knowledge check"}
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">
        {phase==="baseline"
          ?"This optional diagnostic records your starting understanding before the final check."
          :"Check your understanding after learning. Neither check is a school grade or academic credit."}
      </p>
    </div>
    {error&&<WorkspaceNotice tone="danger">{error}</WorkspaceNotice>}
    <p className="text-xs text-muted-foreground">
      {check.attemptNo>0?`Attempt ${check.attemptNo} of ${check.attemptLimit}`:
        `${check.attemptLimit} attempts available`}
      {check.remainingAttempts>0?` · ${check.remainingAttempts} future attempt(s) available`:
        " · No further attempts available"}.
    </p>
    {check.state==="not_started"&&check.canStart&&check.remainingAttempts>0&&
      <Button onClick={()=>void begin()} disabled={busy} loading={busy} loadingLabel="Starting…">
        Start knowledge check
      </Button>}
    {check.state==="not_started"&&!check.canStart&&
      <WorkspaceNotice>This knowledge check is not currently open.</WorkspaceNotice>}
    {check.state==="in_progress"&&check.attemptId&&
      <LearningQuestionnaire key={check.attemptId} title="Course knowledge questions"
        questions={check.questions} submitLabel="Submit knowledge check"
        initialAnswers={check.draftAnswers}
        onDraftChange={(questionId,answer)=>{
          saveDraft(check.attemptId!,questionId,answer?.optionIds??[]);
        }}
        onSubmit={async answers=>{
          setError("");
          await draftQueue.current;
          if(!mounted.current)throw new Error("Assessment workspace closed");
          await submitNoncreditKnowledgeCheckAnswers({courseAttemptId,phase,attemptId:check.attemptId!,
              requestId:crypto.randomUUID(),
              answers:answers.map(answer=>({
                questionId:answer.questionId,optionIds:answer.optionIds??[],
              })),
          });
          if(mounted.current){await load();if(mounted.current)onAssessmentCompleted?.();}
        }}/>}
    {check.state==="in_progress"&&<p className="text-xs text-muted-foreground" role="status">
      {draftStatus==="saving"?"Saving answers...":
       draftStatus==="saved"?"Your answers are saved and can be resumed on another device.":
       draftStatus==="failed"?"An answer could not be saved. You may retry the selection or submit your check.":
       check.draftAnswers.length>0?"Saved responses restored.":"Answers save as you select them."}
    </p>}
    {check.state==="expired"&&<WorkspaceNotice tone="attention">This timed knowledge check expired before submission.</WorkspaceNotice>}
    {check.state==="scored"&&<WorkspaceNotice>Your answers were submitted and automatically scored. Your {context==="class"?"Class":"noncredit"} result is awaiting independent provider confirmation.</WorkspaceNotice>}
    {check.state==="submitted"&&<WorkspaceNotice>Your knowledge check was submitted. Processing is in progress.</WorkspaceNotice>}
    {check.state==="finalized"&&<WorkspaceNotice tone="success">
      <p className="font-semibold">Knowledge check result confirmed</p>
      <p className="mt-2">
        {check.score?.pointsEarned??0} of {check.score?.pointsPossible??0} points
        {phase==="baseline"?" · Baseline recorded":
          check.score?.outcome==="pass"?" · Knowledge check met the published threshold":
          check.score?.outcome==="fail"?" · Additional learning recommended":""}.
      </p>
      <p className="mt-2 text-muted-foreground">
        A confirmed knowledge-check result is separate from Course completion, academic grades, credentials and credit.
      </p>
      {check.canStart&&check.remainingAttempts>0&&<Button className="mt-3" variant="outline"
        disabled={busy} loading={busy} loadingLabel="Starting…" onClick={()=>void begin()}>
        Retake knowledge check
      </Button>}
    </WorkspaceNotice>}
    {(check.state==="voided"||check.state==="expired")&&check.canStart&&check.remainingAttempts>0&&
      <Button variant="outline" disabled={busy} loading={busy} loadingLabel="Starting…" onClick={()=>void begin()}>
        Start another allowed attempt
      </Button>}
    {check.state==="closed"&&<WorkspaceNotice>The knowledge-check submission window is closed. Saved responses remain in your attempt history.</WorkspaceNotice>}
    {check.state==="voided"&&<WorkspaceNotice tone="attention">This knowledge-check attempt is unavailable.</WorkspaceNotice>}
  </section>;
}
