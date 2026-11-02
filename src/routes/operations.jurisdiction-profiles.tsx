import { useRouter } from "@tanstack/react-router";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { listJurisdictionProfileReviews,saveJurisdictionProfileReview,publishJurisdictionProfile } from "@/modules/programs/jurisdiction-profile.functions";
import { LoaderFailure } from "@/lib/loader-failure";
import { safeLoader } from "@/lib/safe-loader";
import { WorkspaceShell } from "@/components/workspace";

export const Route=createFileRoute("/operations/jurisdiction-profiles")({
 loader:()=>safeLoader(()=>listJurisdictionProfileReviews())(),
 component:ReviewPage,
});
function ReviewPage(){
 const result=Route.useLoaderData();
 if(!result.ok)return <LoaderFailure title="Jurisdiction profiles" eyebrow="CAN OS · Policy review" outcome={result}/>;
 return <WorkspaceShell>
  <div className="space-y-5">
   <header><h1 className="text-2xl font-bold">Jurisdiction profiles</h1>
    <p className="text-sm text-muted-foreground">Editorial review workspace. Unverified drafts are not displayed as authoritative guidance to churches. Saving does not publish or authorize a school.</p></header>
   {result.data.length===0?<p>No jurisdiction profiles have been prepared.</p>:result.data.map(item=><ReviewEditor key={item.id} item={item}/>)}
  </div>
 </WorkspaceShell>;
}
type Item=Awaited<ReturnType<typeof listJurisdictionProfileReviews>>[number];
function ReviewEditor({item}:{item:Item}){
 const router=useRouter();
 const [title,setTitle]=useState(item.title);
 const [summary,setSummary]=useState(item.summary);
 const [profile,setProfile]=useState(JSON.stringify(item.profile,null,2));
 const [evidence,setEvidence]=useState(JSON.stringify(item.evidence,null,2));
 const [message,setMessage]=useState("");
 const [saving,setSaving]=useState(false);
 const editable=item.status==="draft"||item.status==="in_review";
 async function save(){
  setSaving(true);setMessage("");
  try{
   const parsedProfile=JSON.parse(profile);
   const parsedEvidence=JSON.parse(evidence);
   if(!parsedProfile||Array.isArray(parsedProfile)||typeof parsedProfile!=="object")throw Error("Profile must be a JSON object");
   if(!Array.isArray(parsedEvidence))throw Error("Evidence must be a JSON array");
   await saveJurisdictionProfileReview({data:{id:item.id,title,summary,profile:parsedProfile,evidence:parsedEvidence}});
   setMessage("Review saved. This content is not published.");
   await router.invalidate();
  }catch(error){setMessage(error instanceof Error?error.message:"Unable to save review");}
  finally{setSaving(false);}
 }
 async function publish(){
  if(!window.confirm("Publish this state profile as verified guidance? Confirm all sources and requirements have been reviewed."))return;
  setSaving(true);setMessage("");
  try{await publishJurisdictionProfile({data:{id:item.id}});setMessage("Published. The state guidance is now available during launch.");await router.invalidate();}
  catch(error){setMessage(error instanceof Error?error.message:"Unable to publish");}
  finally{setSaving(false);}
 }
 return <details className="rounded-xl border bg-card p-4">
  <summary className="cursor-pointer font-semibold">{item.name} · {item.revision} · {item.status} · {item.verificationStatus}</summary>
  <div className="mt-4 space-y-3">
   <label className="block text-sm">Title<input className="mt-1 w-full rounded border bg-background p-2" value={title} disabled={!editable} onChange={e=>setTitle(e.target.value)}/></label>
   <label className="block text-sm">Summary<textarea className="mt-1 w-full rounded border bg-background p-2" rows={3} value={summary} disabled={!editable} onChange={e=>setSummary(e.target.value)}/></label>
   <label className="block text-sm">Structured profile (JSON)<textarea className="mt-1 w-full rounded border bg-background p-2 font-mono text-xs" rows={14} value={profile} disabled={!editable} onChange={e=>setProfile(e.target.value)}/></label>
   <label className="block text-sm">Evidence sources (JSON array; HTTPS, authority, checkedAt required)<textarea className="mt-1 w-full rounded border bg-background p-2 font-mono text-xs" rows={6} value={evidence} disabled={!editable} onChange={e=>setEvidence(e.target.value)}/></label>
   <div className="flex items-center gap-3"><button type="button" disabled={!editable||saving} onClick={save} className="rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-50">{saving?"Saving…":"Save review"}</button>{item.status==="in_review"&&<button type="button" disabled={saving} onClick={publish} className="rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-50">Publish reviewed profile</button>}<p role="status" className="text-sm">{message}</p></div>
  </div>
 </details>;
}
