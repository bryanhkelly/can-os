import { useState } from "react";
import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { validateCourseSurveyAnswers, type SurveyAnswerInput, type SurveyQuestion } from "@/domain/course-survey";

export type LearningQuestion = SurveyQuestion & {
  prompt: string;
  options: readonly {id:string;label:string}[];
};

/**
 * One accessible question-entry component for noncredit surveys and short
 * structured assessments. Scoring remains server-side in the assessment
 * engine. This component never contains correct answers or awards credit.
 */
export function LearningQuestionnaire({title,questions,submitLabel="Submit responses",onSubmit}:{
  title:string;
  questions:readonly LearningQuestion[];
  submitLabel?:string;
  onSubmit:(answers:SurveyAnswerInput[])=>Promise<void>;
}) {
  const [draft,setDraft]=useState<Record<string,SurveyAnswerInput>>({});
  const [pending,setPending]=useState(false);
  const [error,setError]=useState("");
  function update(questionId:string,answer:SurveyAnswerInput|null) {
    setDraft(current=>{
      const next={...current};
      if(answer)next[questionId]=answer;else delete next[questionId];
      return next;
    });
    setError("");
  }
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(pending)return;
    setError("");
    try {
      validateCourseSurveyAnswers(questions,Object.values(draft));
    }catch(cause) {
      setError(cause instanceof Error?cause.message:"Check the answers above.");
      return;
    }
    setPending(true);
    try { await onSubmit(Object.values(draft)); }
    catch { setError("Could not save your responses. Review and try again."); }
    finally {setPending(false);}
  }
  return <form aria-label={title} onSubmit={event=>void submit(event)}
    className="space-y-5 border bg-card p-5">
    <h3 className="font-serif text-xl font-semibold">{title}</h3>
    {questions.map((question,index)=>{
      const current=draft[question.id];
      const selected=current?.optionIds??[];
      return <fieldset key={question.id} disabled={pending} className="space-y-3 border-b pb-5 last:border-0">
        <legend className="font-semibold text-sm">
          {index+1}. {question.prompt}{question.required?" *":""}
        </legend>
        {question.type==="single_choice"||question.type==="multiple_choice"
          ? <div className="space-y-2">
            {question.options.map(option=><label key={option.id}
              className="flex items-start gap-2 text-sm">
              <input type={question.type==="single_choice"?"radio":"checkbox"}
                name={question.id} value={option.id}
                checked={selected.includes(option.id)}
                onChange={()=>{
                  const next=question.type==="single_choice"?[option.id]:
                    selected.includes(option.id)?selected.filter(id=>id!==option.id):[...selected,option.id];
                  update(question.id,next.length?{questionId:question.id,optionIds:next}:null);
                }}/>
              <span>{option.label}</span>
            </label>)}
          </div>
          : question.type==="rating"||question.type==="likert"||question.type==="nps"
            ? question.min!==null&&question.max!==null&&question.max-question.min<=20
              ? <select className="w-full max-w-xs border bg-background p-2 text-sm"
                  aria-label={question.prompt} value={current?.number??""}
                  onChange={event=>update(question.id,event.target.value===""
                    ?null:{questionId:question.id,number:Number(event.target.value)})}>
                <option value="">Select a rating</option>
                {Array.from({length:question.max-question.min+1},(_,i)=>i+question.min!).map(n=>
                  <option key={n} value={n}>{n}</option>)}
              </select>
              : <p role="alert">This rating scale is unavailable.</p>
            : question.type==="text"
              ? <textarea className="w-full min-h-24 border bg-background p-3 text-sm"
                  aria-label={question.prompt} maxLength={4000}
                  value={current?.text??""}
                  onChange={event=>update(question.id,event.target.value.trim()
                    ?{questionId:question.id,text:event.target.value}:null)}/>
              : <p role="alert">This question requires a supported answer form.</p>}
      </fieldset>;
    })}
    {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
    <Button type="submit" disabled={pending||questions.length===0}>
      {pending?"Saving...":submitLabel}
    </Button>
  </form>;
}
