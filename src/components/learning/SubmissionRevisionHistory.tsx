import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { DisclosureSection, EmptyState, PageNavigation, QueryState } from "@/components/workspace";
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
  return <DisclosureSection title={open?"Hide submission history":"View submission history"} open={open}
    onOpenChange={next=>{setOpen(next);setBefore(undefined);}} headingLevel="h4">
    {open&&<div className="space-y-3">
      <p className="text-xs text-muted-foreground">Preserved submission states and feedback. A baseline is the first recorded snapshot, not proof of an original submission date.</p>
      <QueryState loading={query.isPending&&"Loading history…"} error={query.isError&&"History unavailable."}
        onRetry={()=>void query.refetch()} retrying={query.isFetching} isEmpty={query.data?.items.length===0}
        empty={<EmptyState title="No preserved states are available."/>}/>
      <ol className="space-y-3">{query.data?.items.map(item=><li key={item.revisionNo} className="space-y-1 border border-border p-3">
        <p className="text-sm font-semibold">Revision {item.revisionNo} · {item.status.replaceAll("_"," ")}{item.source==="baseline"?" · Baseline":""}</p>
        <p className="text-xs text-muted-foreground">Recorded {new Date(item.recordedAt).toLocaleString()}{item.submittedAt?" · Submitted "+new Date(item.submittedAt).toLocaleString():""}</p>
        {item.responseText&&<p className="whitespace-pre-wrap text-sm">{item.responseText}</p>}
        {item.practiceScore!==null&&<p className="text-sm">Practice score: {item.practiceScore}{item.practiceScoreMax!==null?` / ${item.practiceScoreMax}`:""} (not an official grade)</p>}
        {item.practiceFeedback&&<p className="whitespace-pre-wrap text-sm">Practice feedback: {item.practiceFeedback}</p>}
      </li>)}</ol>
      {(before!==undefined||query.data?.nextBefore!=null)&&<PageNavigation label="Submission history pages"
        previous={before!==undefined&&<Button type="button" variant="outline" size="sm" onClick={()=>setBefore(undefined)}>Newest revisions</Button>}
        next={query.data?.nextBefore!=null&&<Button type="button" variant="outline" size="sm" onClick={()=>setBefore(query.data?.nextBefore??undefined)}>Older revisions</Button>}/>}
    </div>}
  </DisclosureSection>;
}
