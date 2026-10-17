import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { acceptInsight, dismissInsight, listInsights,listInsightScopeOptions } from "@/modules/operations/insights.functions";

export const Route = createFileRoute("/operations/insights")({
 validateSearch:(search:Record<string,unknown>)=>({
  siteId:typeof search.siteId==="string"?search.siteId:undefined,
  programId:typeof search.programId==="string"?search.programId:undefined,
 }),
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
 const selection=Route.useSearch();
 const [scopes,setScopes]=useState<Awaited<ReturnType<typeof listInsightScopeOptions>>>([]);
 const sites=[...new Map(scopes.map(s=>[s.siteId,{id:s.siteId,name:s.siteName}])).values()];
 const programOptions=scopes.filter(s=>!selection.siteId||s.siteId===selection.siteId);
 const selectScope=(siteId?:string,programId?:string)=>{
  const qs=new URLSearchParams();
  if(siteId)qs.set("siteId",siteId);
  if(programId)qs.set("programId",programId);
  window.location.assign("/operations/insights"+(qs.size?"?"+qs.toString():""));
 };
 const [status, setStatus] = useState<StatusFilter>("open");
 const [insights, setInsights] = useState<Insight[]>([]);
 const [loading, setLoading] = useState(true);
 const [busy, setBusy] = useState("");
 const [error, setError] = useState("");
 const [notice, setNotice] = useState("");

 const load = useCallback(async (filter: StatusFilter) => {
  setLoading(true);
  setError("");
  try {
   const result = await listInsights({ data: { status: filter,siteId:selection.siteId,programId:selection.programId } });
   setInsights(result.insights);
  } catch {
   setInsights([]);
   setError("Sign in with an authorized staff account to review insights.");
  } finally {
   setLoading(false);
  }
 }, [selection.siteId,selection.programId]);

 useEffect(()=>{let active=true;void listInsightScopeOptions().then(rows=>{if(active)setScopes(rows)}).catch(()=>{});return()=>{active=false};},[]);
 useEffect(() => {
  void load(status);
 }, [status, load]);

 const accept = async (insight: Insight) => {
  setBusy(insight.id);
  setNotice("");
  try {
   await acceptInsight({ data: { insightId: insight.id } });
   setNotice(`Action created from "${insight.title}".`);
   await load(status);
  } catch (cause) {
   setNotice(cause instanceof Error ? cause.message : "Unable to accept insight");
  } finally {
   setBusy("");
  }
 };

 const dismiss = async (insight: Insight) => {
  const reason = window.prompt("Why is this insight being dismissed? (5-500 characters)");
  if (reason === null) return;
  setBusy(insight.id);
  setNotice("");
  try {
   await dismissInsight({ data: { insightId: insight.id, reason } });
   setNotice(`Dismissed "${insight.title}".`);
   await load(status);
  } catch (cause) {
   setNotice(cause instanceof Error ? cause.message : "Unable to dismiss insight");
  } finally {
   setBusy("");
  }
 };

 return <main className="min-h-screen bg-background px-6 py-10 text-foreground">
  <div className="mx-auto max-w-5xl">
   <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">CAN OS · Insights</p>
   <h1 className="mt-2 font-serif text-4xl">Insights</h1>
   <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
    Signals surfaced from school activity, with the evidence behind each one. Review the evidence chain before accepting an insight as an Action or dismissing it.
   </p>
   <div className="mt-5 flex flex-wrap gap-4 rounded-xl border p-4">
    <label className="text-sm">School
     <select aria-label="Insight school" className="ml-2 rounded border bg-background p-2"
      value={selection.siteId??""} onChange={e=>selectScope(e.target.value||undefined)}>
      <option value="">All permitted schools</option>
      {sites.map(site=><option key={site.id} value={site.id}>{site.name}</option>)}
     </select>
    </label>
    <label className="text-sm">Program
     <select aria-label="Insight program" className="ml-2 rounded border bg-background p-2"
      value={selection.programId??""} onChange={e=>selectScope(selection.siteId,e.target.value||undefined)}>
      <option value="">All permitted programs</option>
      {programOptions.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
     </select>
    </label>
   </div>
   {notice && <p role="status" className="mt-4 rounded-lg border p-3 text-sm">{notice}</p>}
   {error && <p role="alert" className="mt-8 rounded-lg border p-4 text-sm">{error}</p>}
   {!error && <>
    <div className="mt-6 flex gap-2" role="tablist" aria-label="Insight status filter">
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
    </div>
    {loading && <p role="status" className="mt-8 text-sm">Loading insights…</p>}
    {!loading && insights.length === 0 && <p className="mt-8 rounded-xl border p-5 text-sm">No {tabs.find(tab => tab.id === status)?.label.toLowerCase()} insights in your scope.</p>}
    {!loading && insights.length > 0 && <div className="mt-6 grid gap-4">
     {insights.map(insight => <article key={insight.id} className="rounded-xl border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
       <div>
        <h2 className="text-lg font-semibold">{insight.title}</h2>
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
       <button type="button" className="rounded border px-3 py-1 text-xs font-bold disabled:opacity-50" disabled={busy !== ""} onClick={() => accept(insight)}>Accept &amp; create Action</button>
       <button type="button" className="rounded border px-3 py-1 text-xs disabled:opacity-50" disabled={busy !== ""} onClick={() => dismiss(insight)}>Dismiss</button>
      </div>}
     </article>)}
    </div>}
   </>}
  </div>
 </main>;
}
