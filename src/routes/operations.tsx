import {useState} from "react";
import {createFileRoute,Link,useRouter} from "@tanstack/react-router";
import {getReleaseHealth} from "@/modules/operations/release-health.functions";
import {getOperationsPreview,updateSyntheticOperationsAction,triageSyntheticOperationsAction} from "@/modules/operations/operations.functions";
export const Route=createFileRoute("/operations")({loader:async()=>{
 try{
  return {operations:await getOperationsPreview(),health:await getReleaseHealth(),authError:""};
 }catch{
  return {operations:null,health:null,authError:"Sign in with an authorized staff account to view school operations."};
 }
},component:OperationsPage});
function OperationsPage(){
 const {operations:data,health,authError}=Route.useLoaderData();
 const router=useRouter();
 const [busy,setBusy]=useState<string|null>(null);
 const [error,setError]=useState("");
 if(authError||!data||!health)return <main className="mx-auto max-w-6xl px-5 py-10">
  <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">CAN OS · Operations</p>
  <h1 className="mt-2 font-serif text-5xl">Needs You</h1>
  <p role="alert" className="mt-8 rounded-lg border p-4 text-sm">{authError||"Operations data is unavailable."}</p>
 </main>;
 async function moveAction(id:string,status:"in_progress"|"waiting"|"resolved"){
  setBusy(id);setError("");
  try{await updateSyntheticOperationsAction({data:{id,status}});await router.invalidate();}
  catch(e){setError(e instanceof Error?e.message:"Unable to update action");}
  finally{setBusy(null);}
 }

 async function triageAction(id:string,owner:"teacher"|"unassigned",priority:"normal"|"high"|"urgent"){
  setBusy(id);setError("");
  try{await triageSyntheticOperationsAction({data:{id,owner,priority}});await router.invalidate();}
  catch(e){setError(e instanceof Error?e.message:"Unable to triage action");}
  finally{setBusy(null);}
 }
 return <main className="mx-auto max-w-6xl px-5 py-10">
  <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">CAN OS · Synthetic operations preview</p>
  <h1 className="mt-2 font-serif text-5xl">Needs You</h1>
  <p className="mt-3 max-w-2xl text-sm text-muted-foreground">One starting place for school operations. These records are synthetic; no public user is authorized to perform production mutations.</p>
  <p className="mt-4 rounded-xl border p-3 text-xs text-muted-foreground">Release: {health.buildId} · Database compatibility: {health.schemaStatus.replace("_"," ")}. {health.details}</p>
  {error&&<p role="alert" className="mt-4 rounded-lg border border-red-400 p-3">{error}</p>}
  <div className="mt-7 grid gap-3 sm:grid-cols-3">
  {[["Open items",data.summary.total],["Urgent",data.summary.urgent],["Needs response",data.summary.needsResponse]].map(([label,num])=><div key={label} className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-2 font-serif text-3xl">{num}</p></div>)}
  </div>
  <p className="mt-6"><Link to="/sites/" className="inline-flex rounded-lg border px-4 py-2 text-sm font-semibold">Open School/Site Today →</Link></p>
  <div className="mt-8 grid gap-6 lg:grid-cols-[2fr_1fr]"><section><h2 className="font-serif text-3xl">Action queue</h2><div className="mt-4 space-y-3">
  {data.items.map(i=><article className="rounded-xl border bg-card p-4" key={i.kind+i.id}><div className="flex items-center justify-between gap-3"><h3 className="font-semibold">{i.title}</h3><span className="text-xs uppercase text-muted-foreground">{i.priority}</span></div><p className="mt-2 text-sm text-muted-foreground">{i.detail}</p><div className="mt-3 flex flex-wrap gap-3">{i.href!=="/operations"&&<Link to={i.href} className="inline-block text-xs font-bold underline">Open related workflow →</Link>}{i.href==="/operations"&&<>
 <button type="button" className="rounded border px-3 py-1 text-xs disabled:opacity-50" disabled={busy!==null} onClick={()=>moveAction(i.id,"in_progress")}>Start</button><button type="button" className="rounded border px-3 py-1 text-xs disabled:opacity-50" disabled={busy!==null} onClick={()=>triageAction(i.id,"teacher","high")}>Assign teacher + elevate</button><button type="button" className="rounded border px-3 py-1 text-xs disabled:opacity-50" disabled={busy!==null} onClick={()=>triageAction(i.id,"unassigned","normal")}>Return to unassigned</button>
 <button type="button" className="rounded border px-3 py-1 text-xs disabled:opacity-50" disabled={busy!==null} onClick={()=>moveAction(i.id,"waiting")}>Waiting</button>
 <button type="button" className="rounded border px-3 py-1 text-xs disabled:opacity-50" disabled={busy!==null} onClick={()=>moveAction(i.id,"resolved")}>Resolve</button>
 </>}</div></article>)}
  {!data.items.length&&<p className="rounded-xl border p-5 text-sm">No synthetic actions currently require attention.</p>}
  </div></section><aside><h2 className="font-serif text-3xl">Program operations</h2><div className="mt-4 space-y-3 rounded-xl border bg-card p-5 text-sm"><p><Link className="underline" to="/profiles">Personnel and credentials</Link></p><p><Link className="underline" to="/student/support">Student support</Link></p><p><Link className="underline" to="/student/notifications">Student notices</Link></p><p className="text-xs text-muted-foreground">Readiness checklist and configuration templates follow this shared work queue.</p></div></aside></div>
 </main>;
}
