import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useMutationFeedback } from "@/lib/mutation-feedback";
import { acceptInsight, dismissInsight, listInsights,listInsightScopeOptions } from "@/modules/operations/insights.functions";
import {optionalSearchString,siteProgramSelectionSchema} from "@/lib/route-search";
import {SiteProgramFields} from "@/components/workspace/site-program-fields";
import {MutationFeedback} from "@/components/workspace/mutation-feedback";
import {ActionDialog} from "@/components/workspace/action-dialog";
import {QueryState, WorkspaceShell } from "@/components/workspace";
const insightsSearchSchema=siteProgramSelectionSchema.extend({insight:optionalSearchString});

export const Route = createFileRoute("/operations/insights")({
 validateSearch:(search:Record<string,unknown>):{siteId?:string;programId?:string;insight?:string}=>insightsSearchSchema.parse(search),
 component:InsightsPage
});

type Insight = Awaited<ReturnType<typeof listInsights>>["insights"][number];
type StatusFilter = "open" | "acknowledged" | "dismissed";

const tabs: { id: StatusFilter; label: string }[] = [
 { id: "open", label: "Open" },
 { id: "acknowledged", label: "Accepted" },
 { id: "dismissed", label: "Dismissed" },
];

function evidenceLabel(entry: Record<string, unknown>): string {
 if (typeof entry.fact === "string") return entry.fact.replaceAll("_", " ");
 return Object.entries(entry).map(([key, value]) => `${key}: ${String(value)}`).join(" · ");
}

function InsightsPage() {
 const navigate=useNavigate();
 const selection=Route.useSearch();
 const [scopes,setScopes]=useState<Awaited<ReturnType<typeof listInsightScopeOptions>>>([]);
 const sites=[...new Map(scopes.map(s=>[s.siteId,{id:s.siteId,name:s.siteName}])).values()];
 const selectScope=(siteId?:string,programId?:string)=>{
  const qs=new URLSearchParams();
  if(siteId)qs.set("siteId",siteId);
  if(programId)qs.set("programId",programId);
  void navigate({href:"/operations/insights"+(qs.size?"?"+qs.toString():"")});
 };
 const [status, setStatus] = useState<StatusFilter>("open");
 const [insights, setInsights] = useState<Insight[]>([]);
 const [loading, setLoading] = useState(true);
 const [loadError, setLoadError] = useState("");
 const [createdActionId,setCreatedActionId]=useState("");
 const [dismissTarget,setDismissTarget]=useState<Insight|null>(null);
 const [dismissReason,setDismissReason]=useState("");
 const [scopeError,setScopeError]=useState("");

 const load = useCallback(async (filter: StatusFilter, refreshAfterSave = false) => {
  setLoading(true);
  setLoadError("");
  try {
   const result = await listInsights({ data: { status: filter,siteId:selection.siteId,programId:selection.programId,insightId:selection.insight } });
   setInsights(result.insights);
  } catch (cause) {
   setInsights([]);
   if (refreshAfterSave) throw cause;
   setLoadError("Sign in with an authorized staff account to review insights.");
  } finally {
   setLoading(false);
  }
 }, [selection.siteId,selection.programId,selection.insight]);
 const mutation=useMutationFeedback(()=>load(status,true));
 const busy=mutation.pending||mutation.refreshFailed;

 useEffect(()=>{let active=true;void listInsightScopeOptions().then(rows=>{if(active){setScopes(rows);setScopeError("");}}).catch(()=>{if(active)setScopeError("School and program choices could not load. Reopen this page to try again.");});return()=>{active=false};},[]);
 useEffect(() => {
  setCreatedActionId("");
  void load(status);
 }, [status, load]);

 const accept = async (insight: Insight) => {
  setCreatedActionId("");
  await mutation.run(async()=>{
   const result=await acceptInsight({ data: { insightId: insight.id } });
   setCreatedActionId(result.actionId);
   return result;
  },{
   successMessage:`Action created from "${insight.title}".`,
   commandErrorMessage:"Unable to accept insight.",
  });
 };

 const dismiss = async (insight: Insight) => {
  setCreatedActionId("");
  const outcome=await mutation.run(
   ()=>dismissInsight({ data: { insightId: insight.id, reason:dismissReason } }),
   {
    successMessage:`Dismissed "${insight.title}".`,
    commandErrorMessage:"Unable to dismiss insight.",
   },
  );
  if(outcome.status==="saved"||outcome.status==="refresh-failed")setDismissTarget(null);
 };

 return <WorkspaceShell width="standard" eyebrow="Insights" title="Insights">
   <nav aria-label="School review navigation" className="mt-4 flex flex-wrap gap-4 text-sm font-semibold">
    <Link to="/home" search={{siteId:selection.siteId,programId:selection.programId}} className="underline">Back to operations</Link>
    <Link to="/operations/school-years" search={{siteId:selection.siteId,programId:selection.programId}} className="underline">School-year planning</Link>
   </nav>
   <section aria-label="Review process" className="mt-5 rounded-xl border bg-card p-4">
    <h2 className="font-semibold">School-health review</h2>
    <p className="mt-2 text-sm text-muted-foreground">Review the latest recorded signals in your authorized scope. Inspect supporting evidence before creating a follow-up Action; dismiss signals with a documented reason when appropriate. The page does not establish that a monthly review has been performed.</p>
   </section>
   <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
    Signals surfaced from school activity, with the evidence behind each one. Review the evidence chain before accepting an insight as an Action or dismissing it.
   </p>
   <div className="mt-5 flex flex-wrap gap-4 rounded-xl border p-4">
    <SiteProgramFields sites={sites} programs={scopes} siteId={selection.siteId??""} programId={selection.programId??""}
      labelPrefix="Insight" sitePlaceholder="All permitted schools" programPlaceholder="All permitted programs"
      onChange={(site,program)=>selectScope(site||undefined,program||undefined)}/>
   </div>
   {scopeError&&<p role="alert" className="mt-4 text-sm">{scopeError}</p>}
   <div className="mt-4"><MutationFeedback state={mutation} pendingMessage="Saving insight decision..." successAction={createdActionId&&<>
    {" "}<Link to="/actions/$actionId" params={{actionId:createdActionId}} className="font-semibold underline">Open created Action</Link>
   </>}/></div>
   <QueryState error={loadError} onRetry={()=>void load(status)}>
    {selection.insight?<Link to="/operations/insights" search={{siteId:selection.siteId,programId:selection.programId}} className="mt-6 inline-block text-sm underline">All insights</Link>:<div className="mt-6 flex gap-2" role="tablist" aria-label="Insight status filter">
     {tabs.map(tab => <button
      key={tab.id}
      type="button"
      role="tab"
      aria-selected={status === tab.id}
      onClick={() => setStatus(tab.id)}
      className={status === tab.id
       ? "rounded-full border bg-foreground px-4 py-1.5 text-xs font-bold text-background"
       : "rounded-full border px-4 py-1.5 text-xs font-bold text-muted-foreground"}
     >{tab.label}</button>)}
    </div>}
    <QueryState loading={loading?"Loading insights...":undefined} isEmpty={insights.length===0} empty={selection.insight
     ?<p role="alert" className="mt-8 rounded-xl border p-5 text-sm">This insight is unavailable in your current workspace.</p>
     :<p className="mt-8 rounded-xl border p-5 text-sm">No {tabs.find(tab => tab.id === status)?.label.toLowerCase()} insights in your scope.</p>}>
    <div className="mt-6 grid gap-4">
     {insights.map(insight => <article key={insight.id} className="rounded-xl border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
       <div>
        <h2 className="text-lg font-semibold"><Link to="/operations/insights" search={{siteId:selection.siteId,programId:selection.programId,insight:insight.id}} className="hover:underline">{insight.title}</Link></h2>
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
         {insight.type.replaceAll("_", " ")} · {insight.subjectName ?? `${insight.subjectType.replaceAll("_", " ")} ${insight.subjectId.slice(0, 8)}`} · {new Date(insight.createdAt).toLocaleDateString()}
        </p>
       </div>
       <span className="rounded-full border px-3 py-1 text-xs capitalize">{insight.status}</span>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">{insight.summary}</p>
      {insight.evidence.length > 0 && <div className="mt-3">
       <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Evidence</p>
       <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
        {insight.evidence.map((entry, index) => <li key={index}>{evidenceLabel(entry)}</li>)}
       </ul>
      </div>}
      {insight.uncertainty && <p className="mt-3 rounded-lg border border-dashed p-3 text-xs text-muted-foreground">{insight.uncertainty}</p>}
      {insight.recommendedActions.length > 0 && <div className="mt-3">
       <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recommended actions</p>
       <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
        {insight.recommendedActions.map((action, index) => <li key={index}>
         <span className="font-medium">{action.title}</span>
         {action.description && <span className="text-muted-foreground"> — {action.description}</span>}
        </li>)}
       </ul>
      </div>}
      {insight.status === "open" && <div className="mt-4 flex flex-wrap gap-3">
       <button type="button" className="rounded border px-3 py-1 text-xs font-bold disabled:opacity-50" disabled={busy} onClick={() => accept(insight)}>Accept &amp; create Action</button>
       <button type="button" className="rounded border px-3 py-1 text-xs disabled:opacity-50" disabled={busy} onClick={() => {setDismissReason("");setDismissTarget(insight);}}>Dismiss</button>
      </div>}
     </article>)}
    </div>
    </QueryState>
   </QueryState>
   {dismissTarget&&<ActionDialog open title={`Dismiss "${dismissTarget.title}"`} confirmLabel="Dismiss insight"
     description="Explain why this insight is being dismissed (5-500 characters)."
     pending={mutation.pending} confirmDisabled={busy||dismissReason.trim().length<5}
     onClose={()=>setDismissTarget(null)} onConfirm={()=>void dismiss(dismissTarget)}>
     <label className="block text-sm">Dismissal reason
       <textarea required minLength={5} maxLength={500} value={dismissReason}
         onChange={event=>setDismissReason(event.target.value)} className="mt-1 block w-full rounded border p-2"/>
     </label>
     <MutationFeedback state={mutation} pendingMessage="Saving insight decision..."/>
   </ActionDialog>}
 </WorkspaceShell>;
}
