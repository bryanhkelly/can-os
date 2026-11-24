import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { getNativeClassHomework, submitNativeClassHomework } from
  "@/modules/classes/native-class-homework.functions";
import { normalizeClientError } from "@/lib/client-error";

/** Homework lives on the Course Attempt, not on a duplicate Class/Section store. */
export function NativeClassHomeworkPanel({classEnrollmentId}:{classEnrollmentId:string}) {
  const client=useQueryClient();
  const query=useQuery({
    queryKey:["native-class-homework",classEnrollmentId],
    queryFn:()=>getNativeClassHomework({data:{classEnrollmentId}}),
    retry:false,
  });
  const [drafts,setDrafts]=useState<Record<string,string>>({});
  const [submitting,setSubmitting]=useState<string|null>(null);
  const [notice,setNotice]=useState("");
  const [error,setError]=useState("");

  async function submit(assignmentId:string,responseText:string) {
    if(submitting)return;
    setSubmitting(assignmentId);setNotice("");setError("");
    try {
      const receipt=await submitNativeClassHomework({
        data:{classEnrollmentId,assignmentId,responseText},
      });
      setNotice(receipt.alreadySubmitted
        ?"This response was already submitted. No duplicate was created."
        :"Homework submitted. Your work is saved for teacher review.");
      await client.invalidateQueries({queryKey:["native-class-homework",classEnrollmentId]});
    } catch(failure) {
      setError(normalizeClientError(failure,
        "Unable to submit homework. Check your current Class enrollment.").message);
    } finally {setSubmitting(null);}
  }
  return <section aria-label="Class homework" className="space-y-4 border border-border bg-card p-5">
    <div>
      <h2 className="font-serif text-2xl">Homework and written assignments</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Write your response and submit it from this Class. Submitted work is kept
        with your Course Attempt. It does not automatically become a grade or credit.
      </p>
    </div>
    {query.isPending&&<p role="status">Loading your assignments…</p>}
    {query.isError&&<p role="alert">
      Homework is unavailable under your current verified enrollment.
      <Button type="button" variant="outline" className="ml-3" onClick={()=>void query.refetch()}>
        Retry
      </Button>
    </p>}
    {query.data?.legacySectionId&&<div className="space-y-2 border border-border p-3">
      <p className="text-sm">Original school assignments and feedback remain in your recovered Section until historical records are reconciled.</p>
      <Button asChild variant="outline" size="sm"><Link to="/student/assignments" search={{section:query.data.legacySectionId}}>View original school assignments</Link></Button>
    </div>}
    {query.data?.assignments.length===0&&
      <p className="text-sm">No written assignments are available for this Course yet.</p>}
    {query.data?.assignments.map(item=>{
      const submitted=item.status==="submitted"||item.status==="graded";
      const current=drafts[item.id]??item.responseText;
      return <article key={item.id} className="space-y-3 border-t border-border pt-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold">{item.title}</h3>
            {item.dueAt&&<p className="mt-1 text-xs text-muted-foreground">
              Due {new Date(item.dueAt).toLocaleDateString()}
            </p>}
          </div>
          <span className="text-xs font-semibold">{item.status.replaceAll("_"," ")}</span>
        </div>
        <p className="whitespace-pre-line text-sm">{item.instructions}</p>
        <label className="block space-y-2">
          <span className="text-sm font-medium">Your response</span>
          <Textarea value={current} disabled={submitted||!!submitting}
            aria-label={"Response for "+item.title} rows={7}
            onChange={event=>setDrafts(previous=>({...previous,[item.id]:event.target.value}))}
            placeholder="Type your answer here…"/>
        </label>
        {item.practiceFeedback&&<section className="space-y-1 border border-border bg-muted/30 p-3" aria-label="Practice feedback">
          <h4 className="text-sm font-semibold">Teacher practice feedback</h4>
          <p className="whitespace-pre-wrap text-sm">{item.practiceFeedback}</p>
          {item.practiceScore!==null&&<p className="text-sm">
            Practice score: {item.practiceScore} / {item.practiceScoreMax??10} (not an official grade)
          </p>}
        </section>}
        {!submitted?<Button type="button" disabled={!!submitting||current.trim().length<5}
          onClick={()=>void submit(item.id,current.trim())}>
          {submitting===item.id?"Submitting…":"Submit homework"}
        </Button>:<p className="text-sm text-muted-foreground">
          {item.status==="graded"?"Reviewed work.":"Submitted for review."}
          {item.submittedAt&&" "+new Date(item.submittedAt).toLocaleString()}
        </p>}
      </article>;
    })}
    {notice&&<p role="status" className="text-sm">{notice}</p>}
    {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
  </section>;
}
