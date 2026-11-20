import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { normalizeClientError } from "@/lib/client-error";
import {
  getNativeValorPracticeCheck, submitNativeValorPracticeCheck,
} from "@/modules/classes/native-valor-practice-check.functions";

/** Private, unscored practice using synthetic Valor draft assessment prompts.
 * Never claims to administer or publish the canonical assessment version.
 */
export function NativeValorDraftPracticePanel({classEnrollmentId}:{classEnrollmentId:string}) {
  const client=useQueryClient();
  const query=useQuery({
    queryKey:["native-valor-practice-check",classEnrollmentId],
    queryFn:()=>getNativeValorPracticeCheck({data:{classEnrollmentId}}),
    retry:false,
  });
  const [answers,setAnswers]=useState<Record<string,string>>({});
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const data=query.data;
  if(query.isPending)return <p role="status" className="text-sm text-muted-foreground">
    Checking for synthetic practice questions…
  </p>;
  if(query.isError)return null; // No disclosure of another Site's draft catalog.
  if(!data?.available || !data.questions.length)return null;
  const complete=data.questions.every(item=>(answers[item.id]??"").trim().length>=3);
  async function submit() {
    if(busy||!data?.available||!complete)return;
    setBusy(true);setError("");setNotice("");
    try {
      await submitNativeValorPracticeCheck({data:{
        classEnrollmentId,
        responses:data.questions.map(item=>({
          questionId:item.id,text:(answers[item.id]??"").trim(),
        })),
      }});
      setNotice("Practice answers saved privately. This is not a graded assessment or official credit.");
      setAnswers({});
      await client.invalidateQueries({queryKey:["native-valor-practice-check",classEnrollmentId]});
    }catch(failure){
      setError(normalizeClientError(failure,"Unable to save this practice attempt.").message);
    }finally{setBusy(false);}
  }
  return <section aria-label="Valor synthetic knowledge-check practice" className="space-y-4 border border-border bg-card p-5">
    <div>
      <h3 className="font-serif text-xl">Practice these knowledge-check questions</h3>
      <p className="mt-2 text-sm text-muted-foreground">
        Valor School synthetic demonstration. These short-answer prompts come from a draft
        assessment. You can practice and save your answers now, but this does not publish
        the assessment, issue a score, or grant academic credit.
      </p>
    </div>
    {data.history.length>0&&<p className="text-sm text-muted-foreground">
      {data.history.length} practice attempt{data.history.length===1?"":"s"} saved.
      You can try again without changing your earlier answers.
    </p>}
    {data.history.length>0&&<div className="space-y-3" aria-label="Your saved knowledge-check practice history">
      {data.history.map((attempt,index)=><details key={attempt.id} className="border border-border p-3">
        <summary className="cursor-pointer text-sm font-medium">
          Practice attempt {data.history.length-index} · {new Date(attempt.recordedAt).toLocaleString()}
        </summary>
        {attempt.responses.map((answer,i)=><div key={i} className="mt-3 space-y-1 text-sm">
          <p className="font-medium">{answer.promptText}</p>
          <p className="whitespace-pre-wrap text-muted-foreground">{answer.response}</p>
        </div>)}
        {attempt.teacherFeedback&&<div className="mt-4 border-t border-border pt-3">
          <p className="text-sm font-semibold">Teacher practice feedback</p>
          <p className="whitespace-pre-wrap text-sm">{attempt.teacherFeedback}</p>
          {attempt.practiceScore!==null&&<p className="mt-1 text-sm">
            Practice score: {attempt.practiceScore} / 10. Not an official grade.
          </p>}
        </div>}
      </details>)}
    </div>}
    <div className="space-y-4">
      {data.questions.map((question,index)=><label className="block space-y-2" key={question.id}>
        <span className="block text-sm font-semibold">{index+1}. {question.prompt}</span>
        <Textarea rows={4} maxLength={4000} disabled={busy}
          value={answers[question.id]??""}
          onChange={event=>setAnswers(previous=>({...previous,[question.id]:event.target.value}))}
          aria-label={"Answer for practice question "+(index+1)}/>
      </label>)}
    </div>
    <Button type="button" disabled={!complete||busy} loading={busy} onClick={()=>void submit()}>
      Save practice answers
    </Button>
    {notice&&<p role="status" className="text-sm">{notice}</p>}
    {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
  </section>;
}
