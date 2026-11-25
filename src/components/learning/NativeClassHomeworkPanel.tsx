import { useState } from "react";
import { HistoricalClassWork } from "./HistoricalClassWork";
import { SubmissionRevisionHistory } from "./SubmissionRevisionHistory";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/ui/field";
import { EmptyState, QueryState, StatusBadge, WorkspaceNotice } from "@/components/workspace";
import { getNativeClassHomework, getNativeClassHomeworkHistory, getNativeClassHistoricalWork, submitNativeClassHomework } from
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
      await Promise.all([
        client.invalidateQueries({queryKey:["native-class-homework",classEnrollmentId]}),
        client.invalidateQueries({queryKey:["native-homework-history",classEnrollmentId,assignmentId]}),
      ]);
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
    <QueryState loading={query.isPending&&"Loading your assignments…"}
      error={query.isError&&"Homework is unavailable under your current verified enrollment."}
      onRetry={()=>void query.refetch()} retrying={query.isFetching}
      isEmpty={false}/>
    {query.data?.legacySectionId&&<div className="space-y-2 border border-border p-3">
      <p className="text-sm">Original school assignments and feedback remain in your recovered Section until historical records are reconciled.</p>
      <Button asChild variant="outline" size="sm"><Link to="/student/assignments" search={{section:query.data.legacySectionId}}>View original school assignments</Link></Button>
    </div>}
    {query.data?.legacySectionId&&<HistoricalClassWork key={classEnrollmentId} queryScope={["historical-class-work",classEnrollmentId]} loadPage={beforeId=>getNativeClassHistoricalWork({data:{classEnrollmentId,beforeId}})}/>}
    {query.data?.assignments.length===0&&
      <EmptyState title="No written assignments are available for this Course yet."/>}
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
          <StatusBadge>{item.status.replaceAll("_"," ")}</StatusBadge>
        </div>
        <p className="whitespace-pre-line text-sm">{item.instructions}</p>
        <Field label={<>Your response<span className="sr-only"> for {item.title}</span></>}>
          <Textarea value={current} disabled={submitted||!!submitting}
            rows={7}
            onChange={event=>setDrafts(previous=>({...previous,[item.id]:event.target.value}))}
            placeholder="Type your answer here…"/>
        </Field>
        {item.practiceFeedback&&<section className="space-y-1 border border-border bg-muted/30 p-3" aria-label="Practice feedback">
          <h4 className="text-sm font-semibold">Teacher practice feedback</h4>
          <p className="whitespace-pre-wrap text-sm">{item.practiceFeedback}</p>
          {item.practiceScore!==null&&<p className="text-sm">
            Practice score: {item.practiceScore} / {item.practiceScoreMax??10} (not an official grade)
          </p>}
        </section>}
        {item.submitted&&<SubmissionRevisionHistory key={item.id}
          queryScope={["native-homework-history",classEnrollmentId,item.id]}
          loadPage={beforeRevision=>getNativeClassHomeworkHistory({data:{classEnrollmentId,assignmentId:item.id,beforeRevision}})}/>}
        {!submitted?<Button type="button" disabled={!!submitting||current.trim().length<5}
          loading={submitting===item.id} loadingLabel="Submitting…"
          onClick={()=>void submit(item.id,current.trim())}>
          Submit homework
        </Button>:<p className="text-sm text-muted-foreground">
          {item.status==="graded"?"Reviewed work.":"Submitted for review."}
          {item.submittedAt&&" "+new Date(item.submittedAt).toLocaleString()}
        </p>}
      </article>;
    })}
    {notice&&<WorkspaceNotice tone="success">{notice}</WorkspaceNotice>}
    {error&&<WorkspaceNotice tone="danger">{error}</WorkspaceNotice>}
  </section>;
}

