import {useState} from "react";
import {createFileRoute,useRouter,Link} from "@tanstack/react-router";
import {getSyntheticFamilyReadiness,setSyntheticFamilyRequirement,addSyntheticRequirementReviewNote,reviewSyntheticRequirementDocument} from "@/modules/enrollment/family-readiness.functions";
export const Route=createFileRoute("/admissions/families")({loader:()=>getSyntheticFamilyReadiness(),component:Families});
function Families(){
 const apps=Route.useLoaderData();
 const router=useRouter();
 const [busy,setBusy]=useState<string|null>(null),[error,setError]=useState(""),[notes,setNotes]=useState<Record<string,string>>({});
 const families=[...new Set(apps.map(a=>a.householdId))];
 async function update(applicationId:string,requirementId:string,complete:boolean){
  setBusy(requirementId);setError("");
  try{await setSyntheticFamilyRequirement({data:{applicationId,requirementId,complete}});await router.invalidate();}
  catch(e){setError(e instanceof Error?e.message:"Requirement update failed");}
  finally{setBusy(null);}
 }
 async function addNote(applicationId:string,requirementId:string){
  setBusy(requirementId);setError("");
  try{await addSyntheticRequirementReviewNote({data:{applicationId,requirementId,note:notes[requirementId]??""}});setNotes(previous=>({...previous,[requirementId]:""}));await router.invalidate();}
  catch(e){setError(e instanceof Error?e.message:"Review note failed");}
  finally{setBusy(null);}
 }
 async function review(applicationId:string,requirementId:string,status:"requested"|"received"|"accepted"|"rejected"){
  setBusy(requirementId);setError("");
  try{await reviewSyntheticRequirementDocument({data:{applicationId,requirementId,status,reason:notes[requirementId]??""}});await router.invalidate();}
  catch(e){setError(e instanceof Error?e.message:"Document review failed");}
  finally{setBusy(null);}
 }
 return <main className="mx-auto max-w-5xl px-5 py-10">
  <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">CAN OS · Synthetic family cases</p>
  <h1 className="mt-2 font-serif text-4xl">Family enrollment readiness</h1>
  <p className="mt-3 text-sm text-muted-foreground">Complete or reopen synthetic enrollment requirements. Changes persist to Neon and update journey readiness for the admissions workflow.</p>
  {error&&<p role="alert" className="mt-4 rounded-xl border border-red-400 p-3">{error}</p>}
  <div className="mt-6 rounded-xl border p-5"><p className="text-sm">Households represented</p><p className="font-serif text-3xl">{families.length}</p></div>
  <div className="mt-6 space-y-4">{families.map((id,i)=><section key={id} className="rounded-xl border p-5">
   <h2 className="font-serif text-xl">Synthetic household {i+1}</h2>
   <div className="mt-3 space-y-3">{apps.filter(a=>a.householdId===id).map(a=><article key={a.id} className="rounded-lg border p-3">
    <p className="font-semibold">{a.program} · {a.stage}</p>
    <p className="mt-2 text-sm">Next step: <strong>{a.activeSchoolYears.length?"Enrollment active — prepare for school":a.offers.some(o=>o.status==="accepted")?"Registrar activation pending":a.offers.some(o=>o.status==="issued")?"Guardian response pending":a.readiness.blockers?"Complete blocking requirements":"Ready for an admissions offer"}</strong></p>
    <div className="mt-3 flex flex-wrap gap-2">{a.offers.map(o=><span key={o.schoolYearId+":"+o.status} className="rounded-md border px-2 py-1 text-xs">Offer: {o.status}{o.respondedAt?" · Responded "+new Date(o.respondedAt).toLocaleDateString():""}</span>)}</div>
    <p className="mt-2 text-sm">Journey: <strong>{a.journeyStatus?.replaceAll("_"," ")??"Not started"}</strong> · Program enrollment: <strong>{a.activeSchoolYears.length?"Active":"Not active"}</strong></p>
    {a.activeSchoolYears.length>0&&<p className="mt-1 text-xs text-muted-foreground">Active school-year records: {a.activeSchoolYears.length}</p>}
    <p className="mt-1 text-sm text-muted-foreground">{a.readiness.completed} of {a.readiness.total} requirements complete · {a.readiness.blockers} blocking</p>
    <Link to="/admissions" className="mt-2 inline-block text-xs font-semibold underline">Review offers and enrollment →</Link>
    {a.activeSchoolYears.length>0&&<p className="mt-2 text-xs text-muted-foreground">The admissions checklist is now a historical record. Active enrollment requirements are managed separately.</p>}
    <div className="mt-3 space-y-3">{a.requirements.map(r=><div key={r.id} className="rounded-lg border p-3"><label className="flex items-center gap-3 text-sm">
      <input type="checkbox" checked={r.status==="complete"} disabled={busy!==null||["active","complete","cancelled"].includes(a.journeyStatus??"")} onChange={e=>update(a.id,r.id,e.target.checked)}/>
      <span>{r.title}{r.blocking?" · Required":""}</span>
      <span className="text-xs text-muted-foreground">({r.status.replaceAll("_"," ")})</span>
    </label><div className="mt-2 space-y-1">{r.evidence.filter(e=>e.kind==="registrar_note"&&typeof e.text==="string").map((e,i)=><p key={i} className="text-xs text-muted-foreground">Review note: {String(e.text)}</p>)}</div><div className="mt-2 space-y-1">{r.evidence.filter(e=>e.kind==="document_review").map((e,i)=><p key={i} className="text-xs text-muted-foreground">Document review: {e.status}{e.text?" · "+e.text:""}{e.reviewedAt?" · "+new Date(e.reviewedAt).toLocaleDateString():""}</p>)}</div>
    <div className="mt-2 flex flex-wrap gap-2">{(["requested","received","accepted","rejected"] as const).map(status=><button key={status} type="button" className="rounded border px-2 py-1 text-xs capitalize disabled:opacity-50" disabled={busy!==null||["active","complete","cancelled"].includes(a.journeyStatus??"")} onClick={()=>review(a.id,r.id,status)}>{status}</button>)}</div>
    <div className="mt-2 flex gap-2"><input className="min-w-0 flex-1 rounded border bg-background px-2 py-1 text-sm" value={notes[r.id]??""} maxLength={500} placeholder="Review note / rejection reason (no file uploaded)" onChange={e=>setNotes(previous=>({...previous,[r.id]:e.target.value}))}/><button type="button" className="rounded border px-3 py-1 text-xs disabled:opacity-50" disabled={busy!==null||(notes[r.id]??"").trim().length<5} onClick={()=>addNote(a.id,r.id)}>Save note</button></div></div>)}</div>
    {!a.requirements.length&&<p className="mt-2 text-sm text-muted-foreground">No requirements configured for this application.</p>}
   </article>)}</div>
  </section>)}
  {!families.length&&<p className="rounded-xl border p-5 text-sm text-muted-foreground">No synthetic family cases are loaded.</p>}
  </div>
 </main>;
}
