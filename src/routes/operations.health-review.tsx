import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { WorkspaceShell } from "@/components/workspace";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";
import {
 listGuardianHealthReviews, reviewGuardianHealthUpdate,
} from "@/modules/health/guardian-health-updates.functions";

export const Route=createFileRoute("/operations/health-review")({
 validateSearch:(search:Record<string,unknown>):{action?:string}=>({
  action:typeof search.action==="string"?search.action:undefined,
 }),
 loader:safeLoader(()=>listGuardianHealthReviews(),{
  authMessage:"Sign in as an authorized institutional registrar to review confidential family health updates.",
 }),
 component:HealthReviewPage,
});

type Item=Awaited<ReturnType<typeof listGuardianHealthReviews>>[number];

function HealthReviewPage(){
 const outcome=Route.useLoaderData();
 const {action}=Route.useSearch();
 if(!outcome.ok)return <LoaderFailure eyebrow="CAN OS · Medical review"
  title="Family emergency information" outcome={outcome}/>;
 return <HealthReviewList items={outcome.data} action={action}/>;
}

function HealthReviewList({items,action}:{items:Item[];action?:string}){
 const router=useRouter();
 const [notes,setNotes]=useState<Record<string,string>>({});
 const [busy,setBusy]=useState(""),[error,setError]=useState(""),[notice,setNotice]=useState("");
 async function decide(item:Item,approve:boolean){
  const note=notes[item.id]?.trim()??"";
  if(note.length<10){setError("Enter a review explanation of at least 10 characters.");return;}
  if(approve&&!window.confirm("Confirm you independently verified the emergency contact and medical instructions against school requirements? Approval replaces the current school medical summaries."))return;
  setBusy(item.id);setError("");setNotice("");
  try{
   const result=await reviewGuardianHealthUpdate({data:{
    actionId:item.id,approve,reviewNote:note,
   }});
   setNotice(result.saved
     ?approve?"Verified family health record updated.":"Proposed family health update declined; approved medical record unchanged."
     :"This request was already reviewed.");
   try{await router.invalidate();}
   catch{setError("School review was saved, but the queue could not refresh. Reopen this page rather than submitting it twice.");}
  }catch(e){setError(e instanceof Error?e.message:"Unable to complete confidential school health review");}
  finally{setBusy("");}
 }
 const visible=items.filter(item=>!action||item.id===action);
 return <WorkspaceShell eyebrow="CAN OS · Restricted school review" title="Family emergency and health updates"
  subtitle="Independently review changes proposed by verified guardians. Only approval updates the school medical record; proposed information must never be treated as cleared emergency instructions."
  actions={<Link to="/operations" search={{siteId:undefined,programId:undefined,action:undefined}}
   className="rounded border px-3 py-2 text-sm">School operations</Link>}>
  {notice&&<p role="status" className="mt-5 rounded border p-4 text-sm">{notice}</p>}
  {error&&<p role="alert" className="mt-5 rounded border p-4 text-sm">{error}</p>}
  {action&&<Link to="/operations/health-review" className="mt-4 inline-block text-sm underline">View entire confidential review queue</Link>}
  {action&&!visible.length&&<p role="status" className="mt-5 rounded border p-4 text-sm">This requested medical update is not available for review in your current school scope.</p>}
  {!items.length&&<p className="mt-5 rounded border p-4 text-sm">No pending family medical updates in your authorized schools.</p>}
  <div className="mt-6 space-y-5">
   {visible.map(item=><article key={item.id} className="rounded-xl border bg-card p-5">
    <h2 className="text-lg font-semibold">{item.studentName}</h2>
    <p className="mt-1 text-xs text-muted-foreground">Submitted {new Date(item.requestedAt).toLocaleString()} · Confidential medical review</p>
    <p className="mt-3 text-sm text-muted-foreground">
     Compare the existing school-approved record with the family's proposal before deciding.
     Approval replaces every listed field, including a proposed blank value.
    </p>
    <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
     <div className="rounded-lg border p-3">
      <dt className="font-semibold">Allergy instructions</dt>
      <dd className="mt-2 whitespace-pre-wrap"><span className="block text-xs font-semibold text-muted-foreground">Current approved</span>{item.currentAllergySummary||"None recorded"}</dd>
      <dd className="mt-2 whitespace-pre-wrap"><span className="block text-xs font-semibold text-muted-foreground">Family proposal</span>{item.allergySummary||"Clear existing instructions"}</dd>
     </div>
     <div className="rounded-lg border p-3">
      <dt className="font-semibold">Emergency instructions</dt>
      <dd className="mt-2 whitespace-pre-wrap"><span className="block text-xs font-semibold text-muted-foreground">Current approved</span>{item.currentEmergencySummary||"None recorded"}</dd>
      <dd className="mt-2 whitespace-pre-wrap"><span className="block text-xs font-semibold text-muted-foreground">Family proposal</span>{item.emergencySummary||"Clear existing instructions"}</dd>
     </div>
     <div className="rounded-lg border p-3">
      <dt className="font-semibold">Accommodations</dt>
      <dd className="mt-2 whitespace-pre-wrap"><span className="block text-xs font-semibold text-muted-foreground">Current approved</span>{item.currentAccommodationSummary||"None recorded"}</dd>
      <dd className="mt-2 whitespace-pre-wrap"><span className="block text-xs font-semibold text-muted-foreground">Family proposal</span>{item.accommodationSummary||"Clear existing accommodations"}</dd>
     </div>
     <div className="rounded-lg border p-3">
      <dt className="font-semibold">Emergency contact</dt>
      <dd className="mt-2"><span className="block text-xs font-semibold text-muted-foreground">Current approved</span>
       {item.currentEmergencyContact?.phone
        ? `${item.currentEmergencyContact.name} · ${item.currentEmergencyContact.phone} · ${item.currentEmergencyContact.relationship}`
        : "None recorded"}
      </dd>
      <dd className="mt-2"><span className="block text-xs font-semibold text-muted-foreground">Family proposal</span>
       {item.emergencyContactName||"No name"} · {item.emergencyContactPhone||"No phone"} · {item.emergencyContactRelationship||"Relationship unspecified"}
      </dd>
     </div>
    </dl>
    <label className="mt-5 block text-sm font-semibold">School verification and decision note
     <textarea required minLength={10} maxLength={1500} rows={3}
      className="mt-2 block w-full rounded border bg-background p-3"
      placeholder="Describe school verification or why further information is required; do not paste clinical details."
      value={notes[item.id]??""} onChange={e=>setNotes(current=>({...current,[item.id]:e.target.value}))}/>
    </label>
    <div className="mt-3 flex flex-wrap gap-3">
     <button type="button" disabled={!!busy||(notes[item.id]??"").trim().length<10}
      onClick={()=>void decide(item,true)} className="rounded bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">Approve verified information</button>
     <button type="button" disabled={!!busy||(notes[item.id]??"").trim().length<10}
      onClick={()=>void decide(item,false)} className="rounded border px-4 py-2 text-sm font-semibold disabled:opacity-50">Decline and ask family to clarify</button>
    </div>
   </article>)}
  </div>
 </WorkspaceShell>;
}
