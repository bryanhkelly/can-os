import {useState} from "react";
import {createFileRoute,Link,useRouter} from "@tanstack/react-router";
import {getSyntheticAdmissionsDashboard} from "@/modules/enrollment/admissions-dashboard.functions";
import {getSyntheticAdmissionOfferOptions,issueSyntheticOfferFromDemo,respondSyntheticOfferFromDemo,activateSyntheticOfferFromDemo} from "@/modules/enrollment/admissions-offer-demo.functions";
import {admissionsPipelineSummary} from "@/domain/admissions-pipeline";
export const Route=createFileRoute("/admissions/")({loader:async()=>({rows:await getSyntheticAdmissionsDashboard(),options:await getSyntheticAdmissionOfferOptions()}),component:Admissions});
function Admissions(){
 const {rows,options}=Route.useLoaderData();const summary=admissionsPipelineSummary(rows);const router=useRouter();
 const [busy,setBusy]=useState<string|null>(null),[error,setError]=useState(""),[notice,setNotice]=useState("");
 async function transact(id:string,fn:()=>Promise<unknown>){
  setBusy(id);setError("");setNotice("");
  try{await fn();await router.invalidate();setNotice("Saved to the synthetic enrollment database.");}
  catch(e){setError(e instanceof Error?e.message:"Admissions transaction failed");}
  finally{setBusy(null);}
 }
 return <main className="mx-auto max-w-6xl px-5 py-10">
 <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">CAN OS · Synthetic admissions</p>
 <h1 className="mt-2 font-serif text-5xl">Admissions command center</h1>
 <p className="mt-3 max-w-3xl text-sm text-muted-foreground">Run the complete synthetic offer sequence: registrar issues, guardian responds, and registrar activates enrollment. Every action uses the existing transactional Neon services.</p>
 {error&&<p role="alert" className="mt-4 rounded-xl border border-red-400 p-3">{error}</p>}
 {notice&&<p role="status" className="mt-4 rounded-xl border p-3">{notice}</p>}
 <div className="mt-6 grid gap-3 sm:grid-cols-3">
 <div className="rounded-xl border p-5"><p className="text-xs">Applications</p><p className="font-serif text-3xl">{summary.total}</p></div>
 <div className="rounded-xl border p-5"><p className="text-xs">Awaiting decision</p><p className="font-serif text-3xl">{summary.awaitingDecision}</p></div>
 <div className="rounded-xl border p-5"><p className="text-xs">Blocking requirements</p><p className="font-serif text-3xl">{summary.missingRequirements}</p></div></div>
 <h2 className="mt-9 font-serif text-2xl">Pipeline</h2><div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-4">{summary.byStage.map(x=><div className="rounded-xl border p-4" key={x.stage}><p className="text-sm capitalize">{x.stage}</p><p className="font-serif text-2xl">{x.count}</p></div>)}</div>
 <h2 className="mt-9 font-serif text-2xl">Synthetic applications</h2>
 <div className="mt-4 space-y-3">{rows.map(x=>{
 const years=options.find(o=>o.applicationId===x.id)?.years??[];
 const latest=x.offers[0];
 return <article key={x.id} className="rounded-xl border p-4">
 <p className="font-semibold">{x.program}</p>
 <p className="mt-1 text-sm capitalize text-muted-foreground">{x.stage} · {x.outstandingRequirements} outstanding blocking requirements</p>
 <div className="mt-3 flex flex-wrap gap-2">{x.offers.map(o=><span key={o.id} className="rounded-lg border px-3 py-1 text-xs">Offer: {o.status}{o.expiresAt?` · Expires ${new Date(o.expiresAt).toLocaleDateString()}`:""}</span>)}{!latest&&<span className="text-xs text-muted-foreground">No offer issued</span>}</div>
 <div className="mt-4 flex flex-wrap gap-2">
 {!latest&&x.outstandingRequirements===0&&["application","eligibility"].includes(x.stage)&&years.map(year=><button key={year.id} disabled={busy!==null} className="rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50" onClick={()=>transact(x.id,()=>issueSyntheticOfferFromDemo({data:{applicationId:x.id,schoolYearId:year.id}}))}>Registrar: Issue offer · {year.name}</button>)}
 {latest?.status==="issued"&&<><button disabled={busy!==null} className="rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50" onClick={()=>transact(x.id,()=>respondSyntheticOfferFromDemo({data:{offerId:latest.id,decision:"accept"}}))}>Guardian: Accept</button><button disabled={busy!==null} className="rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50" onClick={()=>transact(x.id,()=>respondSyntheticOfferFromDemo({data:{offerId:latest.id,decision:"decline"}}))}>Guardian: Decline</button></>}
 {latest?.status==="accepted"&&<button disabled={busy!==null} className="rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50" onClick={()=>transact(x.id,()=>activateSyntheticOfferFromDemo({data:{offerId:latest.id}}))}>Registrar: Activate enrollment</button>}
 </div>
 <Link to="/admissions/families" className="mt-3 inline-block text-xs font-semibold underline">Manage household readiness →</Link>
 </article>})}
 {!rows.length&&<p className="rounded-xl border p-5 text-sm text-muted-foreground">No synthetic applications loaded. Add controlled fixture data to exercise admissions.</p>}</div>
 </main>;
}
