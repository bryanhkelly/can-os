import { getLiveOperationsCommandCenter } from "@/modules/operations/command-center.functions";
import {useState} from "react";
import {createFileRoute,Link,useRouter} from "@tanstack/react-router";
import {getReleaseHealth} from "@/modules/operations/release-health.functions";
import {getOperationsActions,updateOperationsAction,assignOperationsAction} from "@/modules/operations/action-workspace.functions";
export const Route=createFileRoute("/operations")({loader:async()=>{
 try{
  return {operations:await getOperationsActions(),health:await getReleaseHealth(),commandCenter:await getLiveOperationsCommandCenter().catch(()=>null),authError:""};
 }catch{
  return {operations:null,health:null,commandCenter:null,authError:"Sign in with an authorized staff account to view school operations."};
 }
},component:OperationsPage});
function OperationsPage(){
 const {operations:data,health,commandCenter,authError}=Route.useLoaderData();
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
  try{const resolutionNote=status==="resolved"?window.prompt("Resolution note (required)"):undefined;if(status==="resolved"&&!resolutionNote?.trim()){setBusy(null);return;}await updateOperationsAction({data:{id,status,resolutionNote:resolutionNote?.trim()}});await router.invalidate();}
  catch(e){setError(e instanceof Error?e.message:"Unable to update action");}
  finally{setBusy(null);}
 }

 async function assignAction(id:string,ownerPersonId:string|null,priority:"normal"|"high"|"urgent"){
  setBusy(id);setError("");
  try{await assignOperationsAction({data:{id,ownerPersonId,priority}});await router.invalidate();}
  catch(e){setError(e instanceof Error?e.message:"Unable to assign action");}
  finally{setBusy(null);}
 }

 return <main className="mx-auto max-w-6xl px-5 py-10">
  <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">CAN OS · School operations</p>
  <h1 className="mt-2 font-serif text-5xl">Needs You</h1>
  <p className="mt-3 max-w-2xl text-sm text-muted-foreground">One starting place for authorized school operations across your sites.</p>
  <p className="mt-4 rounded-xl border p-3 text-xs text-muted-foreground">Release: {health.buildId} · Database compatibility: {health.schemaStatus.replace("_"," ")}. {health.details}</p>
  {error&&<p role="alert" className="mt-4 rounded-lg border border-red-400 p-3">{error}</p>}
  {commandCenter&&<section className="mt-7 rounded-xl border bg-card p-5">
    <h2 className="font-serif text-2xl">Live school operations</h2>
    <div className="mt-3 flex flex-wrap gap-4 text-sm">
     <span>{commandCenter.summary.sections} active sections</span>
     <span>{commandCenter.summary.unstaffed} unstaffed</span>
     <span>{commandCenter.summary.underCapacity} capacity gaps</span>
     <span>{commandCenter.summary.waitlisted} waiting students</span>
    </div>
    <div className="mt-4 space-y-2">
     {commandCenter.issues.map(issue=><div key={issue.kind+issue.sectionId} className="rounded border p-3 text-sm">
       <strong>{issue.title}</strong><p className="text-muted-foreground">{issue.description}</p>
       <Link className="mt-2 inline-block underline" to="/operations/launch/$programId"
        params={{programId:issue.programId}}>Review lifecycle →</Link>
     </div>)}
     {!commandCenter.issues.length&&<p className="text-sm">No staffing or capacity exceptions detected.</p>}
    </div>
   </section>}
  <div className="mt-7 grid gap-3 sm:grid-cols-3">
  {[["Open items",data.summary.total],["Urgent",data.summary.urgent],["Needs response",data.summary.needsResponse]].map(([label,num])=><div key={label} className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-2 font-serif text-3xl">{num}</p></div>)}
  </div>
  <p className="mt-6"><Link to="/sites/" className="inline-flex rounded-lg border px-4 py-2 text-sm font-semibold">Open School/Site Today →</Link> <Link to="/operations/school-years" className="inline-flex rounded-lg border px-4 py-2 text-sm font-semibold">Configure school year →</Link> <Link to="/operations/course-policies" className="inline-flex rounded-lg border px-4 py-2 text-sm font-semibold">Course policies →</Link></p>
  <div className="mt-8 grid gap-6 lg:grid-cols-[2fr_1fr]"><section><h2 className="font-serif text-3xl">Action queue</h2><div className="mt-4 space-y-3">
  {data.items.map(i=><article className="rounded-xl border bg-card p-4" key={i.kind+i.id}><div className="flex items-center justify-between gap-3"><h3 className="font-semibold">{i.title}</h3><span className="text-xs uppercase text-muted-foreground">{i.priority}</span></div><p className="mt-2 text-sm text-muted-foreground">{i.detail}</p><div className="mt-3 flex flex-wrap gap-3">{i.href==="/operations"&&<label className="flex items-center gap-2 text-xs">Assigned to
 <select aria-label={"Assign "+i.title} className="rounded border bg-background px-2 py-1" disabled={busy!==null} value={i.ownerPersonId??""} onChange={event=>void assignAction(i.id,event.target.value||null,i.priority==="critical"?"urgent":i.priority==="high"?"high":"normal")}>
 <option value="">Unassigned</option>
 {data.assignees.filter(person=>person.siteId===i.siteId).map(person=><option key={person.id} value={person.id}>{person.firstName} {person.lastName} · {person.role}</option>)}
 </select></label>}{i.href!=="/operations"&&<Link to={i.href} className="inline-block text-xs font-bold underline">Open related workflow →</Link>}{i.href==="/operations"&&<>
 <button type="button" className="rounded border px-3 py-1 text-xs disabled:opacity-50" disabled={busy!==null} onClick={()=>moveAction(i.id,"in_progress")}>Start</button>
 <button type="button" className="rounded border px-3 py-1 text-xs disabled:opacity-50" disabled={busy!==null} onClick={()=>moveAction(i.id,"waiting")}>Waiting</button>
 <button type="button" className="rounded border px-3 py-1 text-xs disabled:opacity-50" disabled={busy!==null} onClick={()=>moveAction(i.id,"resolved")}>Resolve</button>
 </>}</div></article>)}
  {!data.items.length&&<p className="rounded-xl border p-5 text-sm">No actions currently require attention.</p>}
  </div></section><aside><h2 className="font-serif text-3xl">Program operations</h2><div className="mt-4 space-y-3 rounded-xl border bg-card p-5 text-sm"><p><Link className="underline" to="/profiles">Personnel and credentials</Link></p><p><Link className="underline" to="/student/support">Student support</Link></p><p><Link className="underline" to="/student/notifications">Student notices</Link></p><p className="text-xs text-muted-foreground">Readiness checklist and configuration templates follow this shared work queue.</p></div></aside></div>
 </main>;
}
