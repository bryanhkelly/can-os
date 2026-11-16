import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  getNativeCourseActivitySet, recordNativeClassCompletionEvidence,
  submitNativeClassActivity,
} from "@/modules/classes/native-course-activities.functions";

/** A learner-owned Class questionnaire. The server returns no correct keys
 * and never returns identified private feedback. Session-only drafts stay
 * in React memory and retry IDs survive transient errors.
 */
export function NativeCourseActivitiesPanel({classEnrollmentId}:{
  classEnrollmentId:string;
}){
  const client=useQueryClient();
  const [quiz,setQuiz]=useState<Record<string,number>>({});
  const [feedback,setFeedback]=useState<Record<string,{rating:number|null;text:string|null}>>({});
  const [accepted,setAccepted]=useState(false);
  const [busy,setBusy]=useState<"quiz"|"feedback"|"completion"|null>(null);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const ids=useRef<{quiz:string|null;feedback:string|null;completion:string|null}>({
    quiz:null,feedback:null,completion:null,
  });
  const state=useQuery({
    queryKey:["native-course-activities",classEnrollmentId],
    queryFn:()=>getNativeCourseActivitySet({data:{classEnrollmentId}}),
    retry:false,refetchOnReconnect:true,
  });
  async function refresh(){
    await client.invalidateQueries({queryKey:["native-course-activities",classEnrollmentId]});
    await client.invalidateQueries({queryKey:["native-unified-class-progress"]});
  }
  const data=state.data;
  const readyQuiz=data?.available&&data.quizQuestions.every(
    question=>Number.isInteger(quiz[question.key]));
  const readyFeedback=data?.available&&data.feedbackQuestions.every(question=>{
    const answer=feedback[question.key];
    return question.kind==="rating"?!!answer?.rating:!!answer?.text?.trim();
  });
  async function submit(kind:"quiz"|"feedback"){
    if(!data?.available||busy||!data.activitySetId)return;
    if(kind==="quiz"&&!readyQuiz)return;
    if(kind==="feedback"&&(!readyFeedback||!accepted))return;
    const requestId=ids.current[kind]??crypto.randomUUID();
    ids.current[kind]=requestId;
    setBusy(kind);setError("");setNotice("");
    try{
      await submitNativeClassActivity({data:{
        classEnrollmentId,activitySetId:data.activitySetId,requestId,kind,
        quizAnswers:kind==="quiz"?data.quizQuestions.map(question=>({
          key:question.key,choiceIndex:quiz[question.key]!,
        })):undefined,
        feedbackAnswers:kind==="feedback"?data.feedbackQuestions.map(question=>({
          key:question.key,
          rating:question.kind==="rating"?feedback[question.key]!.rating:null,
          text:question.kind==="text"?feedback[question.key]!.text:null,
        })):undefined,
        feedbackConsentAccepted:kind==="feedback"?true:undefined,
      }});
      setNotice(kind==="quiz"?
        "Knowledge check submitted. Results are separate from academic grades and credit.":
        "Feedback saved with your explicit consent. Your personal answers are private.");
      ids.current[kind]=null;
      await refresh();
    }catch{
      setError("Submission could not be confirmed. Your answers remain on this page; retry with the same request identity.");
    }finally{setBusy(null);}
  }
  async function verifyCompletion(){
    if(!data?.available||!data.readiness?.eligible||busy)return;
    const requestId=ids.current.completion??crypto.randomUUID();
    ids.current.completion=requestId;
    setBusy("completion");setError("");setNotice("");
    try{
      await recordNativeClassCompletionEvidence({data:{classEnrollmentId,requestId}});
      ids.current.completion=null;
      setNotice("The published noncredit learning requirements were verified. No academic credit or certificate was issued.");
      await refresh();
    }catch{
      setError("Completion evidence could not be verified. Recheck your requirements and current enrollment.");
    }finally{setBusy(null);}
  }
  if(state.isPending)return <p role="status" className="border border-border p-4 text-sm">
    Checking your Course knowledge checks and feedback…
  </p>;
  if(state.isError)return <p role="alert" className="border border-border p-4 text-sm">
    Learning activities are unavailable for your current enrollment. No response has been changed.
  </p>;
  if(!data?.available)return <section className="border border-border bg-card p-5">
    <h2 className="font-serif text-xl">Knowledge checks and feedback</h2>
    <p className="mt-2 text-sm text-muted-foreground">
      This Course does not yet have a published activity set. Your existing individual
      lesson progress is unaffected.
    </p>
  </section>;
  return <section className="space-y-5" aria-label="Individual Course knowledge checks and feedback">
    <div className="border border-border bg-card p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Published Course activity version {data.versionNo}
      </p>
      <h2 className="mt-2 font-serif text-2xl">{data.title}</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        One version is pinned to your Class participation when you first submit.
        Recorded teacher selection never changes your answers or requirements.
      </p>
    </div>
    <section className="border border-border bg-card p-5" aria-label="Knowledge check">
      <h3 className="font-serif text-xl">Knowledge check</h3>
      <p className="mt-2 text-sm text-muted-foreground">
        {data.quizPassed?
          "Published knowledge threshold met. Your successful attempt is preserved.":
          data.quizSubmitted?
            data.quizAttempts<data.maxQuizAttempts?
              "Attempt "+data.quizAttempts+" did not meet the threshold. You may retry.":
              "Attempt limit reached without meeting the threshold. Ask your facilitator about next steps.":
          "Answer each question. This formative check is not a graded academic assessment."}
        {" · "}{data.quizAttempts} of {data.maxQuizAttempts} allowed attempts used.
      </p>
      {!data.quizPassed&&data.quizAttempts<data.maxQuizAttempts&&<form className="mt-4 space-y-5" aria-busy={busy==="quiz"}
        onSubmit={event=>{event.preventDefault();void submit("quiz");}}>
        {data.quizQuestions.map((question,index)=><fieldset key={question.key}
          className="border-t border-border pt-4">
          <legend className="text-sm font-semibold">{index+1}. {question.prompt}</legend>
          <div className="mt-2 space-y-2">
            {question.choices.map((choice,choiceIndex)=><label key={choiceIndex}
              className="flex min-h-11 items-center gap-2 border border-border p-3 text-sm">
              <input type="radio" name={"native-quiz-"+question.key}
                checked={quiz[question.key]===choiceIndex}
                onChange={()=>setQuiz(current=>({...current,[question.key]:choiceIndex}))}/>
              {choice}
            </label>)}
          </div>
        </fieldset>)}
        <Button type="submit" disabled={!!busy||!readyQuiz}>
          {busy==="quiz"?"Submitting…":
            data.quizAttempts>0?"Retry knowledge check":"Submit knowledge check"}
        </Button>
      </form>}
    </section>
    {data.feedbackQuestions.length>0&&<section className="border border-border bg-card p-5"
      aria-label="Course feedback">
      <h3 className="font-serif text-xl">Course feedback</h3>
      <p className="mt-2 text-sm text-muted-foreground">
        {data.feedbackSubmitted?"Feedback submitted. Your individual answers remain private.":
          "This is a separate identified survey, not a knowledge score or attendance record."}
      </p>
      {!data.feedbackSubmitted&&<form className="mt-4 space-y-5" aria-busy={busy==="feedback"}
        onSubmit={event=>{event.preventDefault();void submit("feedback");}}>
        {data.feedbackQuestions.map((question,index)=><div key={question.key}
          className="border-t border-border pt-4">
          {question.kind==="rating"?<fieldset>
            <legend className="text-sm font-semibold">{index+1}. {question.prompt}</legend>
            <div className="mt-2 flex flex-wrap gap-3">
              {[1,2,3,4,5].map(value=><label key={value}
                className="flex min-h-11 min-w-11 items-center justify-center gap-2 border border-border px-3 text-sm">
                <input type="radio" name={"native-feedback-"+question.key}
                  checked={feedback[question.key]?.rating===value}
                  onChange={()=>setFeedback(current=>({...current,
                    [question.key]:{rating:value,text:null},
                  }))}/>
                {value}
              </label>)}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">1 = low · 5 = high</p>
          </fieldset>:<label className="block text-sm font-semibold">
            {index+1}. {question.prompt}
            <textarea rows={3} maxLength={1000}
              value={feedback[question.key]?.text??""}
              onChange={event=>setFeedback(current=>({...current,
                [question.key]:{rating:null,text:event.target.value},
              }))}
              className="mt-2 w-full border border-border bg-background p-3 text-sm"/>
          </label>}
        </div>)}
        <div className="border border-border bg-muted/20 p-4">
          <h4 className="text-sm font-semibold">Feedback consent</h4>
          <p className="mt-2 whitespace-pre-wrap text-sm">{data.feedbackConsentText}</p>
          <label className="mt-3 flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" checked={accepted}
              onChange={event=>setAccepted(event.target.checked)}/>
            I agree to submit this identified feedback under the stated terms.
          </label>
        </div>
        <Button type="submit" disabled={!!busy||!readyFeedback||!accepted}>
          {busy==="feedback"?"Submitting…":"Submit feedback"}
        </Button>
      </form>}
    </section>}
    <section className="border border-border bg-card p-5" aria-label="Noncredit completion readiness">
      <h3 className="font-serif text-xl">Completion evidence</h3>
      <p className="mt-2 text-sm text-muted-foreground">
        {data.readiness?.completedLessons} of {data.readiness?.totalLessons} published
        lessons marked complete or waived.
        This is a requirements check, not proof of video viewing, formal attendance,
        academic grades or a credential.
      </p>
      <ul className="mt-3 space-y-2 text-sm">
        <li>Knowledge check: {data.quizPassed?"Threshold met":"Not yet met"}</li>
        <li>Feedback: {data.readiness?.feedbackMet?"Requirement met":"Not yet submitted"}</li>
        <li>Required lessons: {data.readiness?.lessonsMet?"Requirement met":"Still outstanding"}</li>
      </ul>
      {data.completionRecorded?<p role="status" className="mt-4 font-semibold">
        Noncredit completion requirements verified and recorded.
      </p>:<Button className="mt-4" disabled={!!busy||!data.readiness?.eligible}
        onClick={()=>void verifyCompletion()}>
        {busy==="completion"?"Verifying…":"Verify completion evidence"}
      </Button>}
    </section>
    {error&&<p role="alert" className="border border-border p-3 text-sm text-destructive">{error}</p>}
    {notice&&<p role="status" aria-live="polite"
      className="border border-border p-3 text-sm">{notice}</p>}
  </section>;
}
