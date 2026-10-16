import {useState} from "react";
import {createFileRoute,useRouter,Link} from "@tanstack/react-router";
import {getGuardianSyntheticAdmissionOffers} from "@/modules/enrollment/guardian-admission-offers.functions";
import {respondSyntheticOfferFromDemo} from "@/modules/enrollment/admissions-offer-demo.functions";

export const Route=createFileRoute("/guardian/admission-offers")({
 loader:()=>getGuardianSyntheticAdmissionOffers(),
 component:GuardianAdmissionOffers
});
function GuardianAdmissionOffers(){
 const applications=Route.useLoaderData(),router=useRouter();
 const [busy,setBusy]=useState<string|null>(null),[error,setError]=useState("");
 async function respond(offerId:string,decision:"accept"|"decline"){
  setBusy(offerId);setError("");
  try{await respondSyntheticOfferFromDemo({data:{offerId,decision}});await router.invalidate();}
  catch(e){setError(e instanceof Error?e.message:"Unable to respond to offer");}
  finally{setBusy(null);}
 }
 return <main className="mx-auto max-w-4xl space-y-6 px-5 py-10">
  <header><h1 className="font-serif text-4xl">Enrollment offers</h1><p className="mt-2 text-muted-foreground">Review offers for students whose enrollment you are authorized to manage.</p></header>
  {error&&<p role="alert" className="rounded-lg border p-3">{error}</p>}
  {applications.map(app=><section className="rounded-xl border p-5" key={app.applicationId}>
    <h2 className="text-xl font-semibold">{app.studentName}</h2><p className="text-sm text-muted-foreground">{app.program}</p>
    {app.offers.map(o=><div className="mt-3 border-t pt-3" key={o.id}>
     <p className="text-sm">Offer status: {o.status}{o.expiresAt?" · Expires "+new Date(o.expiresAt).toLocaleDateString():""}</p>
     {o.status==="issued"&&(!o.expiresAt||new Date(o.expiresAt).getTime()>Date.now())&&<div className="mt-3 flex gap-3"><button disabled={busy!==null} className="rounded border px-4 py-2" onClick={()=>respond(o.id,"accept")}>Accept</button><button disabled={busy!==null} className="rounded border px-4 py-2" onClick={()=>respond(o.id,"decline")}>Decline</button></div>}
     {o.status==="issued"&&o.expiresAt&&new Date(o.expiresAt).getTime()<=Date.now()&&<p className="mt-2 text-sm" role="status">This offer has expired. Contact admissions for next steps.</p>}
    </div>)}{app.offers.length===0&&<p className="mt-3 text-sm">No offers yet.</p>}
  </section>)}
  {applications.length===0&&<p className="rounded-lg border p-4">No synthetic enrollment offers are currently associated with your guardian session.</p>}
  <Link to="/admissions/families" className="text-sm underline">Household enrollment readiness →</Link>
 </main>;
}
