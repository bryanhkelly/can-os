import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import type { SubmissionRevisionPage } from "@/domain/submission-revisions";

/** Keep history retrieval lazy and scoped to the selected assignment. */
export function SubmissionRevisionHistory({queryScope,loadPage}:{queryScope:readonly string[];loadPage:(beforeRevision?:number)=>Promise<SubmissionRevisionPage>}){
  const [open,setOpen]=useState(false);
  const [before,setBefore]=useState<number|undefined>(undefined);
  const query=useQuery({
    queryKey:[...queryScope,before],
    queryFn:()=>loadPage(before),
    enabled:open,retry:false,staleTime:0,
  });
  return <section className="space-y-3 border-t border-border pt-3" aria-label="Submission revision history">
    <Button type="button" variant="outline" size="sm" aria-expanded={open}
      onClick={()=>{setOpen(!open);setBefore(undefined);}}>{open?"Hide submission history":"View submission history"}</Button>
    {open&&<>
      <p className="text-xs text-muted-foreground">Preserved submission states and feedback. A baseline is the first recorded snapshot, not proof of an original submission date.</p>
      {query.isPending&&<p role="status" className="text-sm">Loading history…</p>}
      {query.isError&&<p role="alert" className="text-sm">History unavailable. <Button type="button" variant="outline" size="sm" onClick={()=>void query.refetch()}>Retry</Button></p>}
      {query.data?.items.length===0&&<p className="text-sm text-muted-foreground">No preserved states are available.</p>}
      <ol className="space-y-3">{query.data?.items.map(item=><li key={item.revisionNo} className="space-y-1 border border-border p-3">
        <p className="text-sm font-semibold">Revision {item.revisionNo} · {item.status.replaceAll("_"," ")}{item.source==="baseline"?" · Baseline":""}</p>
        <p className="text-xs text-muted-foreground">Recorded {new Date(item.recordedAt).toLocaleString()}{item.submittedAt?" · Submitted "+new Date(item.submittedAt).toLocaleString():""}</p>
        {item.responseText&&<p className="whitespace-pre-wrap text-sm">{item.responseText}</p>}
        {item.practiceScore!==null&&<p className="text-sm">Practice score: {item.practiceScore}{item.practiceScoreMax!==null?` / ${item.practiceScoreMax}`:""} (not an official grade)</p>}
        {item.practiceFeedback&&<p className="whitespace-pre-wrap text-sm">Practice feedback: {item.practiceFeedback}</p>}
      </li>)}</ol>
      <div className="flex flex-wrap gap-2">
        {before!==undefined&&<Button type="button" variant="outline" size="sm" onClick={()=>setBefore(undefined)}>Newest revisions</Button>}
        {query.data?.nextBefore!=null&&<Button type="button" variant="outline" size="sm" onClick={()=>setBefore(query.data?.nextBefore??undefined)}>Older revisions</Button>}
      </div>
    </>}
  </section>;
}
