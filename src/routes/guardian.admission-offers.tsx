import {useEffect,useState} from "react";
import {createFileRoute,useRouter,Link} from "@tanstack/react-router";
import {getGuardianAdmissionOffers} from "@/modules/enrollment/guardian-admission-offers.functions";
import {respondToAdmissionOffer} from "@/modules/enrollment/admissions-offer.functions";
import {safeLoader} from "@/lib/safe-loader";
import {LoaderFailure} from "@/lib/loader-failure";
import {GuardianEnrollmentChecklist} from "@/components/enrollment/GuardianEnrollmentChecklist";

const loadGuardianOffers=(studentPersonId?:string)=>getGuardianAdmissionOffers({data:{studentPersonId}});
export const Route=createFileRoute("/guardian/admission-offers")({
 validateSearch:(search:Record<string,unknown>):{student?:string;offer?:string;application?:string}=>({
  student:typeof search.student==="string"?search.student:undefined,
  offer:typeof search.offer==="string"?search.offer:undefined,
  application:typeof search.application==="string"?search.application:undefined,
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
 const {student,offer,application}=Route.useSearch();
 const [checklist,setChecklist]=useState<string|null>(null);
 const [pending,setBusy]=useState<string|null>(null),[error,setError]=useState("");
 const [interactive,setInteractive]=useState(false);
 useEffect(()=>setInteractive(true),[]);
 const busy=interactive?pending:"hydrating";
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
  {application&&!applications.some(app=>app.applicationId===application)&&<p role="alert" className="rounded-lg border p-4">This enrollment application is unavailable in your current family workspace.</p>}
  {application&&<Link to="/guardian/admission-offers" search={{student}} className="inline-block text-sm underline">View all enrollment applications</Link>}
  {applications.filter(app=>(!application||app.applicationId===application)&&(!offer||app.offers.some(item=>item.id===offer))).map(app=><section className="rounded-xl border p-5" key={app.applicationId}>
    <h2 className="text-xl font-semibold">{app.studentName}</h2><p className="text-sm text-muted-foreground">{app.program}</p>
    {app.waitlisted&&<p role="status" className="mt-2 text-sm">Application waitlisted. Contact admissions about availability and next steps.</p>}
    {(app.applicationStage==="withdrawn"||app.applicationStage==="declined")&&<p role="status" className="mt-2 text-sm">Application {app.applicationStage}. Contact admissions if your plans change.</p>}
    <button type="button" aria-expanded={checklist===app.applicationId||application===app.applicationId}
      className="mt-3 rounded border px-3 py-2 text-sm" onClick={()=>setChecklist(app.applicationId)}>View enrollment checklist</button>
    {(checklist===app.applicationId||application===app.applicationId)&&<GuardianEnrollmentChecklist key={app.applicationId} applicationId={app.applicationId}/>}
    {app.offers.filter(item=>!offer||item.id===offer).map(o=><div className="mt-3 border-t pt-3" key={o.id}>
     <p className="text-sm">Offer status: {o.status}{o.expiresAt?" · Expires "+new Date(o.expiresAt).toLocaleDateString():""}</p>
     <p className="mt-2 text-sm">School year: {o.schoolYearName}</p>
     <p role="status" className="mt-2 text-sm">{o.progress.message}</p>
     {!o.enrollmentActive&&app.blockers.length>0&&<ul aria-label="Enrollment requirements awaiting review" className="mt-2 list-inside list-disc text-sm">
       {app.blockers.map(requirement=><li key={requirement.id}>{requirement.title} · {requirement.status.replaceAll("_"," ")}</li>)}
     </ul>}
     {o.status==="issued"&&(!o.expiresAt||new Date(o.expiresAt).getTime()>Date.now())&&<div className="mt-3 flex gap-3">
       <button disabled={busy!==null||!o.progress.canAccept} className="rounded border px-4 py-2 disabled:opacity-50" onClick={()=>respond(o.id,"accept")}>Accept</button>
       <button disabled={busy!==null} className="rounded border px-4 py-2" onClick={()=>respond(o.id,"decline")}>Decline</button>
     </div>}
     {o.enrollmentActive&&<p className="mt-2 text-sm">{o.sectionCount} assigned classes · <Link to="/guardian" className="underline">View family home →</Link></p>}
    </div>)}{app.offers.length===0&&<p className="mt-3 text-sm">No offers yet.</p>}
  </section>)}
  {applications.length===0&&<p className="rounded-lg border p-4">No enrollment offers are currently available for the children in your authorized programs.</p>}
  <Link to="/guardian" className="text-sm underline">Back to family home →</Link>
 </main>;
}
