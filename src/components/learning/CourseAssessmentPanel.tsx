import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { LearningQuestionnaire } from "./LearningQuestionnaire";
import {
  beginNoncreditKnowledgeCheckAttempt, getNoncreditKnowledgeCheck,
  submitNoncreditKnowledgeCheckAnswers,
  saveNoncreditKnowledgeCheckAnswer,
} from "@/modules/learning/noncredit-assessment.functions";

type KnowledgeCheck = Awaited<ReturnType<typeof getNoncreditKnowledgeCheck>>;

/** Reused within the existing recorded classroom, not a separate portal. */
export function CourseAssessmentPanel({courseAttemptId,onAssessmentCompleted}:{
  courseAttemptId:string;onAssessmentCompleted?:()=>void;
}) {
  return <KnowledgeCheckSession key={courseAttemptId} courseAttemptId={courseAttemptId}
    onAssessmentCompleted={onAssessmentCompleted}/>;
}
function KnowledgeCheckSession({courseAttemptId,onAssessmentCompleted}:{
  courseAttemptId:string;onAssessmentCompleted?:()=>void;
}) {
  const [check,setCheck]=useState<KnowledgeCheck|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [draftStatus,setDraftStatus]=useState<"idle"|"saving"|"saved"|"failed">("idle");
  const draftQueue=useRef<Promise<void>>(Promise.resolve());
  const load=useCallback(async()=>{
    const next=await getNoncreditKnowledgeCheck({data:{courseAttemptId}});
    setCheck(next);
  },[courseAttemptId]);
  useEffect(()=>{
    let active=true;
    setCheck(null);setError("");setDraftStatus("idle");
    void getNoncreditKnowledgeCheck({data:{courseAttemptId}})
      .then(next=>{if(active)setCheck(next);})
      .catch(()=>{if(active)setError("No knowledge check is available for this course.");});
    return ()=>{active=false;};
  },[courseAttemptId]);

  async function begin() {
    if(busy)return;
    setBusy(true);setError("");
    try {
      await beginNoncreditKnowledgeCheckAttempt({
        data:{courseAttemptId,requestId:crypto.randomUUID()},
      });
      await load();
    }catch {
      setError("Unable to start this knowledge check. Check your participation or attempt limit.");
    }finally {setBusy(false);}
  }

  function saveDraft(attemptId:string,questionId:string,optionIds:string[]) {
    setDraftStatus("saving");
    // Serialize edits for an attempt; canonical answer revisions persist across sessions.
    draftQueue.current=draftQueue.current.catch(()=>undefined).then(async()=>{
      await saveNoncreditKnowledgeCheckAnswer({
        data:{courseAttemptId,attemptId,questionId,optionIds,requestId:crypto.randomUUID()},
      });
      setDraftStatus("saved");
    }).catch(()=>setDraftStatus("failed"));
  }

  if(error&&!check)return <p role="status" className="border p-3 text-sm">{error}</p>;
  if(!check)return <p role="status" className="text-sm">Loading knowledge check...</p>;
  return <section aria-label="Noncredit knowledge check" className="space-y-4">
    <div>
      <h3 className="font-serif text-xl font-semibold">Knowledge check</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Check your understanding of the course material. This is not a school grade or academic credit.
      </p>
    </div>
    {error&&<p role="alert" className="border p-3 text-sm">{error}</p>}
    <p className="text-xs text-muted-foreground">
      {check.attemptNo>0?`Attempt ${check.attemptNo} of ${check.attemptLimit}`:
        `${check.attemptLimit} attempts available`}
      {check.remainingAttempts>0?` · ${check.remainingAttempts} future attempt(s) available`:
        " · No further attempts available"}.
    </p>
    {check.state==="not_started"&&check.canStart&&check.remainingAttempts>0&&
      <Button onClick={()=>void begin()} disabled={busy}>
        {busy?"Starting...":"Start knowledge check"}
      </Button>}
    {check.state==="not_started"&&!check.canStart&&
      <p className="text-sm" role="status">This knowledge check is not currently open.</p>}
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
          await submitNoncreditKnowledgeCheckAnswers({
            data:{courseAttemptId,attemptId:check.attemptId!,
              requestId:crypto.randomUUID(),
              answers:answers.map(answer=>({
                questionId:answer.questionId,optionIds:answer.optionIds??[],
              })),
            },
          });
          await load();
          onAssessmentCompleted?.();
        }}/>}
    {check.state==="in_progress"&&<p className="text-xs text-muted-foreground" role="status">
      {draftStatus==="saving"?"Saving answers...":
       draftStatus==="saved"?"Your answers are saved and can be resumed on another device.":
       draftStatus==="failed"?"An answer could not be saved. You may retry the selection or submit your check.":
       check.draftAnswers.length>0?"Saved responses restored.":"Answers save as you select them."}
    </p>}
    {check.state==="expired"&&<p role="status" className="border p-3 text-sm">
      This timed knowledge check expired before submission.
    </p>}
    {check.state==="scored"&&<p role="status" className="border p-3 text-sm">
      Your answers were submitted and automatically scored. Your noncredit result is awaiting provider confirmation.
    </p>}
    {check.state==="submitted"&&<p role="status" className="border p-3 text-sm">
      Your knowledge check was submitted. Processing is in progress.
    </p>}
    {check.state==="finalized"&&<div role="status" className="border p-4 text-sm">
      <p className="font-semibold">Knowledge check result confirmed</p>
      <p className="mt-2">
        {check.score?.pointsEarned??0} of {check.score?.pointsPossible??0} points
        {check.score?.outcome==="pass"?" · Knowledge check met the published threshold":
          check.score?.outcome==="fail"?" · Additional learning recommended":""}.
      </p>
      <p className="mt-2 text-muted-foreground">
        A confirmed knowledge-check result is separate from training completion, grades and credit.
      </p>
      {check.canStart&&check.remainingAttempts>0&&<Button className="mt-3" variant="outline"
        disabled={busy} onClick={()=>void begin()}>
        {busy?"Starting...":"Retake knowledge check"}
      </Button>}
    </div>}
    {(check.state==="voided"||check.state==="expired")&&check.canStart&&check.remainingAttempts>0&&
      <Button variant="outline" disabled={busy} onClick={()=>void begin()}>
        {busy?"Starting...":"Start another allowed attempt"}
      </Button>}
    {check.state==="closed"&&<p role="status" className="border p-3 text-sm">
      The knowledge-check submission window is closed. Saved responses remain in your attempt history.
    </p>}
    {check.state==="voided"&&<p role="status" className="border p-3 text-sm">
      This knowledge-check attempt is unavailable.
    </p>}
  </section>;
}
