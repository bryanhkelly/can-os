import {useState} from "react";
import {createFileRoute,useRouter} from "@tanstack/react-router";
import {getSyntheticFamilyReadiness,setSyntheticFamilyRequirement} from "@/modules/enrollment/family-readiness.functions";
export const Route=createFileRoute("/admissions/families")({loader:()=>getSyntheticFamilyReadiness(),component:Families});
function Families(){
 const apps=Route.useLoaderData();
 const router=useRouter();
 const [busy,setBusy]=useState<string|null>(null),[error,setError]=useState("");
 const families=[...new Set(apps.map(a=>a.householdId))];
 async function update(applicationId:string,requirementId:string,complete:boolean){
  setBusy(requirementId);setError("");
  try{await setSyntheticFamilyRequirement({data:{applicationId,requirementId,complete}});await router.invalidate();}
  catch(e){setError(e instanceof Error?e.message:"Requirement update failed");}
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
    <p className="mt-1 text-sm text-muted-foreground">{a.readiness.completed} of {a.readiness.total} requirements complete · {a.readiness.blockers} blocking</p>
    <div className="mt-3 space-y-2">{a.requirements.map(r=><label key={r.id} className="flex items-center gap-3 text-sm">
      <input type="checkbox" checked={r.status==="complete"} disabled={busy!==null} onChange={e=>update(a.id,r.id,e.target.checked)}/>
      <span>{r.title}{r.blocking?" · Required":""}</span>
      <span className="text-xs text-muted-foreground">({r.status.replaceAll("_"," ")})</span>
    </label>)}</div>
    {!a.requirements.length&&<p className="mt-2 text-sm text-muted-foreground">No requirements configured for this application.</p>}
   </article>)}</div>
  </section>)}
  {!families.length&&<p className="rounded-xl border p-5 text-sm text-muted-foreground">No synthetic family cases are loaded.</p>}
  </div>
 </main>;
}
