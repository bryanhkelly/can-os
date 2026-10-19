import {useState} from "react";
import {createFileRoute,useRouter,Link} from "@tanstack/react-router";
import {getGuardianAdmissionOffers} from "@/modules/enrollment/guardian-admission-offers.functions";
import {respondToAdmissionOffer} from "@/modules/enrollment/admissions-offer.functions";
import {safeLoader} from "@/lib/safe-loader";
import {LoaderFailure} from "@/lib/loader-failure";

const loadGuardianOffers=(studentPersonId?:string)=>getGuardianAdmissionOffers({data:{studentPersonId}});
export const Route=createFileRoute("/guardian/admission-offers")({
 validateSearch:(search:Record<string,unknown>):{student?:string;offer?:string}=>({
  student:typeof search.student==="string"?search.student:undefined,
  offer:typeof search.offer==="string"?search.offer:undefined,
 }),
 loaderDeps:({search})=>({student:search.student}),
 loader:({deps})=>safeLoader(()=>loadGuardianOffers(deps.student),{
  authMessage:"Sign in with an authorized guardian account to view enrollment offers.",
 })(),
 component:GuardianAdmissionOffers
});
function GuardianAdmissionOffers(){
 const outcome=Route.useLoaderData();
 if(!outcome.ok)return <LoaderFailure title="Enrollment offers" outcome={outcome}/>;
 return <GuardianAdmissionOffersView applications={outcome.data}/>;
}
function GuardianAdmissionOffersView({applications}:{applications:Awaited<ReturnType<typeof loadGuardianOffers>>}){
 const router=useRouter();
 const {student,offer}=Route.useSearch();
 const [busy,setBusy]=useState<string|null>(null),[error,setError]=useState("");
 async function respond(offerId:string,decision:"accept"|"decline"){
  setBusy(offerId);setError("");
  try{await respondToAdmissionOffer({data:{offerId,decision}});await router.invalidate();}
  catch(e){setError(e instanceof Error?e.message:"Unable to respond to offer");}
  finally{setBusy(null);}
 }
 return <main className="mx-auto max-w-4xl space-y-6 px-5 py-10">
  <header><h1 className="font-serif text-4xl">Enrollment offers</h1><p className="mt-2 text-muted-foreground">Review offers for students whose enrollment you are authorized to manage.</p>{student&&<Link to="/guardian/admission-offers" className="mt-2 inline-block text-xs font-semibold underline">View offers for all children →</Link>}</header>
  {error&&<p role="alert" className="rounded-lg border p-3">{error}</p>}
  {offer&&<Link to="/guardian/admission-offers" search={{student}} className="inline-block text-sm underline">View all offers for this child</Link>}
  {offer&&!applications.some(app=>app.offers.some(item=>item.id===offer))&&<p role="alert" className="rounded-lg border p-4">This offer is unavailable in your current family workspace.</p>}
  {applications.filter(app=>!offer||app.offers.some(item=>item.id===offer)).map(app=><section className="rounded-xl border p-5" key={app.applicationId}>
    <h2 className="text-xl font-semibold">{app.studentName}</h2><p className="text-sm text-muted-foreground">{app.program}</p>
    {app.offers.filter(item=>!offer||item.id===offer).map(o=><div className="mt-3 border-t pt-3" key={o.id}>
     <p className="text-sm">Offer status: {o.status}{o.expiresAt?" · Expires "+new Date(o.expiresAt).toLocaleDateString():""}</p>
     {o.status==="issued"&&(!o.expiresAt||new Date(o.expiresAt).getTime()>Date.now())&&<div className="mt-3 flex gap-3"><button disabled={busy!==null} className="rounded border px-4 py-2" onClick={()=>respond(o.id,"accept")}>Accept</button><button disabled={busy!==null} className="rounded border px-4 py-2" onClick={()=>respond(o.id,"decline")}>Decline</button></div>}
     {o.status==="issued"&&o.expiresAt&&new Date(o.expiresAt).getTime()<=Date.now()&&<p className="mt-2 text-sm" role="status">This offer has expired. Contact admissions for next steps.</p>}
    </div>)}{app.offers.length===0&&<p className="mt-3 text-sm">No offers yet.</p>}
  </section>)}
  {applications.length===0&&<p className="rounded-lg border p-4">No enrollment offers are currently available for the children in your authorized programs.</p>}
  <Link to="/guardian" className="text-sm underline">Back to family home →</Link>
 </main>;
}
