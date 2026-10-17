import {useState} from "react";
import {createFileRoute,useRouter,Link} from "@tanstack/react-router";
import {getAdmissionsCapacity,updateAdmissionsCapacity} from "@/modules/enrollment/capacity-preview.functions";
import {safeLoader} from "@/lib/safe-loader";
import {LoaderFailure} from "@/lib/loader-failure";
const loadCapacity=()=>getAdmissionsCapacity();
export const Route=createFileRoute("/admissions/capacity")({loader:safeLoader(loadCapacity,{authMessage:"Sign in with an authorized staff account to view program capacity."}),component:Capacity});
function Capacity(){
 const outcome=Route.useLoaderData();
 if(!outcome.ok)return <LoaderFailure eyebrow="CAN OS · Admissions" title="Program capacity" outcome={outcome}/>;
 return <CapacityView rows={outcome.data}/>;
}
function CapacityView({rows}:{rows:Awaited<ReturnType<typeof loadCapacity>>}){
 const router=useRouter();
 const [edits,setEdits]=useState<Record<string,string>>({});
 const [busy,setBusy]=useState<string|null>(null),[error,setError]=useState(""),[notice,setNotice]=useState("");
 async function save(id:string,current:number){
  const value=Number(edits[id]??current);
  setBusy(id);setError("");setNotice("");
  try{await updateAdmissionsCapacity({data:{poolId:id,capacity:value}});await router.invalidate();setNotice("Seat capacity saved.");}
  catch(e){setError(e instanceof Error?e.message:"Unable to save capacity");}
  finally{setBusy(null);}
 }
 return <main className="mx-auto max-w-5xl px-5 py-10">
 <Link to="/admissions" className="text-xs underline">← Admissions command center</Link>
 <p className="mt-4 text-xs font-bold uppercase tracking-widest text-muted-foreground">CAN OS · Admissions</p>
 <h1 className="mt-2 font-serif text-4xl">Program capacity</h1>
 <p className="mt-3 text-sm text-muted-foreground">Live, school-year seat pools from Neon. Reservations include unexpired issued offers and accepted offers that have not yet activated enrollment. Changes cannot reduce capacity below existing commitments.</p>
 {error&&<p role="alert" className="mt-4 rounded-lg border border-red-400 p-3">{error}</p>}
 {notice&&<p role="status" className="mt-4 rounded-lg border p-3">{notice}</p>}
 <div className="mt-6 space-y-3">{rows.map(r=><article key={r.id} className="rounded-xl border p-5">
  <h2 className="font-serif text-xl">{r.name} · {r.yearName}</h2>
  <p className="mt-2 text-sm">Active enrollments: <strong>{r.enrolled}</strong> · Held offers: <strong>{r.offered}</strong> · Remaining: <strong>{r.remaining}</strong></p>
  <p className="mt-1 text-sm">Configured seats: {r.capacity} · <strong className="capitalize">{r.status}</strong></p>
  <div className="mt-4 flex flex-wrap items-end gap-2">
   <label className="text-xs">Adjust capacity<input aria-label={`Seat capacity for ${r.name} ${r.yearName}`} className="mt-1 block w-32 rounded-lg border bg-background p-2 text-sm" type="number" min={1} max={100000} step={1} value={edits[r.id]??String(r.capacity)} onChange={e=>setEdits(s=>({...s,[r.id]:e.target.value}))}/></label>
   <button className="rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-50" disabled={busy!==null} onClick={()=>save(r.id,r.capacity)}>Save capacity</button>
  </div>
 </article>)}
 {!rows.length&&<p className="rounded-xl border p-5 text-sm text-muted-foreground">No school-year seat pools are configured for the programs in your current authorization scope.</p>}
 </div></main>;
}