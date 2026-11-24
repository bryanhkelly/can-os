import {useState} from "react";
import {useQuery} from "@tanstack/react-query";
import {Button} from "@/components/ui/button";
import {DisclosureSection,EmptyState,PageNavigation,QueryState,WorkspaceNotice,StatusBadge} from "@/components/workspace";
import type {HistoricalAcademicPage} from "@/domain/historical-academic-evidence";
export function HistoricalClassWork({queryScope,loadPage}:{queryScope:readonly string[];loadPage:(beforeId?:string)=>Promise<HistoricalAcademicPage>}){
 const [open,setOpen]=useState(false),[before,setBefore]=useState<string|undefined>();
 const query=useQuery({queryKey:[...queryScope,before],queryFn:()=>loadPage(before),enabled:open,retry:false,staleTime:0});
 return <DisclosureSection title={open?"Hide historical school work":"View historical school work"} open={open}
   onOpenChange={next=>{setOpen(next);setBefore(undefined);}}>
  {open&&<div className="space-y-3">
   <WorkspaceNotice>Read-only preserved school records. These are not new assignments, current grade decisions or awards of credit.</WorkspaceNotice>
   <QueryState loading={query.isPending&&"Loading historical records…"} error={query.isError&&"Historical records could not be verified."}
    onRetry={()=>void query.refetch()} retrying={query.isFetching} isEmpty={query.data?.items.length===0}
    empty={<EmptyState title="No currently verified historical records in this view."/>}/>
   {query.data?.items.map(item=><article key={item.id} className="space-y-2 border border-border p-3">
    <div className="flex flex-wrap items-start justify-between gap-2"><h3 className="font-semibold">{item.title}</h3><StatusBadge tone="neutral">{item.status}</StatusBadge></div>
    {item.learnerName&&<p className="text-xs text-muted-foreground">{item.learnerName}</p>}
    {item.attempt!==null&&<p className="text-xs text-muted-foreground">Original attempt {item.attempt}{item.submittedAt?" · "+new Date(item.submittedAt).toLocaleString():" · Submission date not recorded"}</p>}
    {item.response&&<p className="text-sm whitespace-pre-wrap">{item.response}</p>}
    {item.feedback&&<p className="text-sm whitespace-pre-wrap">Historical feedback: {item.feedback}</p>}
    {item.score!==null&&<p className="text-sm">Original score: {item.score}{item.maximum!==null?" / "+item.maximum:""}</p>}
    {item.kind==="section_grade"&&<p className="text-sm">Original letter grade: {item.letterGrade??"Not recorded"}{item.finalizedAt?" · "+new Date(item.finalizedAt).toLocaleDateString():""}</p>}
   </article>)}
   {(before!==undefined||query.data?.nextBefore)&&<PageNavigation label="Historical records pages"
    previous={before!==undefined&&<Button type="button" variant="outline" size="sm" onClick={()=>setBefore(undefined)}>First page</Button>}
    next={query.data?.nextBefore&&<Button type="button" variant="outline" size="sm" onClick={()=>setBefore(query.data?.nextBefore??undefined)}>More records</Button>}/>}
  </div>}
 </DisclosureSection>;
}
