import { useState } from "react";
import { gradeSubmission } from "@/modules/learning/gradebook.functions";
import type { RubricCriterion } from "@/modules/student-experience/rubric";
export function RubricGrader({submissionId,criteria,onSaved}:{submissionId:string;criteria:RubricCriterion[];onSaved:()=>Promise<unknown>}) {
 const [points,setPoints]=useState<Record<string,number>>({});
 const [comments,setComments]=useState<Record<string,string>>({});
 const [overall,setOverall]=useState("");
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const earned=criteria.reduce((total,c)=>total+(points[c.id]??0),0);
 const total=criteria.reduce((total,c)=>total+c.maxPoints,0);
 async function post() {
  setBusy(true);setError("");
  try {
   const rubricNotes=criteria.map(criterion=>comments[criterion.id]?.trim()
    ?criterion.label+": "+comments[criterion.id]!.trim():"").filter(Boolean).join("\n");
   await gradeSubmission({data:{
    submissionId,rubricScores:criteria.map(c=>({id:c.id,points:points[c.id]??0})),
    feedbackComment:[overall.trim(),rubricNotes].filter(Boolean).join("\n").slice(0,4000)
   }});
   await onSaved();
  } catch(e) {setError(e instanceof Error?e.message:"Unable to post rubric grade");}
  finally {setBusy(false);}
 }
 return <section className="mt-5 rounded-xl border border-border p-4">
  <h3 className="font-semibold">Score each criterion</h3>
  {criteria.map(c=><div key={c.id} className="mt-4 border-t border-border pt-3">
   <div className="flex items-center justify-between gap-3"><label htmlFor={`rubric-${c.id}`} className="text-sm font-semibold">{c.label}</label><span className="text-xs text-muted-foreground">/ {c.maxPoints} points</span></div>
   {c.description&&<p className="mt-1 text-xs text-muted-foreground">{c.description}</p>}
   <input id={`rubric-${c.id}`} type="number" min={0} max={c.maxPoints} step={0.5} value={points[c.id]??0} onChange={e=>setPoints(p=>({...p,[c.id]:Number(e.target.value)}))} className="mt-2 w-28 rounded-lg border border-border bg-background p-2 text-sm"/>
   <textarea aria-label={`${c.label} feedback`} rows={2} value={comments[c.id]??""} onChange={e=>setComments(p=>({...p,[c.id]:e.target.value}))} placeholder="Criterion-specific feedback" className="mt-2 w-full rounded-lg border border-border bg-background p-2 text-sm"/>
  </div>)}
  <p className="mt-4 text-sm font-semibold">{earned} / {total} points</p>
  <textarea aria-label="Overall rubric feedback" value={overall} onChange={e=>setOverall(e.target.value)} placeholder="Overall feedback" rows={3} className="mt-3 w-full rounded-lg border border-border bg-background p-3 text-sm"/>
  {error&&<p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
  <button type="button" disabled={busy||criteria.some(c=>!Number.isFinite(points[c.id]??0)||(points[c.id]??0)>c.maxPoints||(points[c.id]??0)<0)} onClick={post} className="mt-3 rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:opacity-40">Post rubric grade</button>
 </section>;
}