import {useState} from "react";
import {CapacityPoolCard} from "@/components/admissions/CapacityPoolCard";
import {parseSeatCapacity} from "@/components/admissions/seat-capacity";
import {createFileRoute,useRouter,Link} from "@tanstack/react-router";
import {getAdmissionsCapacity,updateAdmissionsCapacity} from "@/modules/enrollment/capacity-preview.functions";
import {listAdmissionsPrograms} from "@/modules/enrollment/admissions-program-directory.functions";
import {safeLoader} from "@/lib/safe-loader";
import {LoaderFailure} from "@/lib/loader-failure";
const loadCapacity=async(selection:{siteId?:string;programId?:string}={})=>({
 rows:await getAdmissionsCapacity({data:selection}),
 programs:await listAdmissionsPrograms()
});
export const Route=createFileRoute("/admissions/capacity")({
 validateSearch:(search:Record<string,unknown>)=>({
  siteId:typeof search.siteId==="string"?search.siteId:undefined,
  programId:typeof search.programId==="string"?search.programId:undefined
 }),
 loaderDeps:({search})=>({siteId:search.siteId,programId:search.programId}),
 loader:({deps})=>safeLoader(()=>loadCapacity(deps),{
  authMessage:"Sign in with an authorized registrar membership to view program capacity."
 })(),
 component:Capacity
});
function Capacity(){
 const outcome=Route.useLoaderData();
 if(!outcome.ok)return <LoaderFailure eyebrow="CAN OS · Admissions" title="Program capacity" outcome={outcome}/>;
 return <CapacityView data={outcome.data}/>;
}
function CapacityView({data}:{data:Awaited<ReturnType<typeof loadCapacity>>}){
 const {rows,programs}=data;
 const selection=Route.useSearch();
 const schools=[...new Map(programs.map(p=>[p.siteId,{id:p.siteId,name:p.siteName}])).values()];
 const choices=programs.filter(p=>!selection.siteId||p.siteId===selection.siteId);
 function filterTo(siteId?:string,programId?:string){
  const query=new URLSearchParams();
  if(siteId)query.set("siteId",siteId);
  if(programId)query.set("programId",programId);
  void router.navigate({href:"/admissions/capacity"+(query.size?"?"+query:"")});
 }
 const router=useRouter();
 const [edits,setEdits]=useState<Record<string,string>>({});
 const [busy,setBusy]=useState<string|null>(null),[error,setError]=useState(""),[notice,setNotice]=useState("");
 async function save(id:string,current:number){
  const raw=edits[id]??String(current);
  const value=parseSeatCapacity(raw);
  if(value===null){
   setError("Enter a whole-number seat capacity between 1 and 100,000.");return;
  }
  setBusy(id);setError("");setNotice("");
  try{await updateAdmissionsCapacity({data:{poolId:id,capacity:value}});await router.invalidate();setNotice("Seat capacity saved.");}
  catch(e){setError(e instanceof Error?e.message:"Unable to save capacity");}
  finally{setBusy(null);}
 }
 return <main className="mx-auto max-w-5xl px-5 py-10">
 <Link to="/admissions" search={{siteId:undefined,programId:undefined}} className="text-xs underline">← Admissions command center</Link>
 <p className="mt-4 text-xs font-bold uppercase tracking-widest text-muted-foreground">CAN OS · Admissions</p>
 <h1 className="mt-2 font-serif text-4xl">Program capacity</h1>
 <p className="mt-3 text-sm text-muted-foreground">Live, school-year seat pools from Neon. Reservations include unexpired issued offers and accepted offers that have not yet activated enrollment. Changes cannot reduce capacity below existing commitments.</p>
 <div className="mt-5 flex flex-wrap gap-4 rounded-xl border p-4">
  <label className="text-sm">School <select aria-label="Capacity school" value={selection.siteId??""}
   onChange={e=>filterTo(e.target.value||undefined)} className="ml-2 rounded border p-2">
    <option value="">All permitted schools</option>
    {schools.map(site=><option key={site.id} value={site.id}>{site.name}</option>)}
   </select></label>
  <label className="text-sm">Program <select aria-label="Capacity program" value={selection.programId??""}
   onChange={e=>filterTo(selection.siteId,e.target.value||undefined)} className="ml-2 rounded border p-2">
    <option value="">All permitted programs</option>
    {choices.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
   </select></label>
 </div>
 {error&&<p role="alert" className="mt-4 rounded-lg border border-red-400 p-3">{error}</p>}
 {notice&&<p role="status" className="mt-4 rounded-lg border p-3">{notice}</p>}
 <div className="mt-6 space-y-3">{rows.map(r=><CapacityPoolCard key={r.id} pool={r}
  value={edits[r.id]??String(r.capacity)} busy={busy!==null}
  onChange={value=>setEdits(previous=>({...previous,[r.id]:value}))}
  onSave={()=>void save(r.id,r.capacity)}/>)}
 {!rows.length&&<p className="rounded-xl border p-5 text-sm text-muted-foreground">No school-year seat pools are configured for the programs in your current authorization scope.</p>}
 </div></main>;
}