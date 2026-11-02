import { useRouter } from "@tanstack/react-router";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { listJurisdictionProfileReviews,saveJurisdictionProfileReview,publishJurisdictionProfile } from "@/modules/programs/jurisdiction-profile.functions";
import { LoaderFailure } from "@/lib/loader-failure";
import { safeLoader } from "@/lib/safe-loader";
import { WorkflowIntro } from "@/components/workspace/workflow-intro";
import { WorkspaceShell } from "@/components/workspace";

export const Route=createFileRoute("/operations/jurisdiction-profiles")({
 loader:()=>safeLoader(()=>listJurisdictionProfileReviews())(),
 component:ReviewPage,
});
function ReviewPage(){
 const result=Route.useLoaderData();
 if(!result.ok)return <LoaderFailure title="Jurisdiction profiles" eyebrow="CAN OS · Policy review" outcome={result}/>;
 return <WorkspaceShell title="Jurisdiction profiles">
  <div className="space-y-5">
   <WorkflowIntro eyebrow="CAN OS · Policy review" title="Jurisdiction profiles" description="Review state operating models, funding, requirements and official sources before publishing guidance. Publication does not authorize a school to open." />
   {result.data.length===0?<p>No jurisdiction profiles have been prepared.</p>:result.data.map(item=><ReviewEditor key={item.id} item={item}/>)}
  </div>
 </WorkspaceShell>;
}
type Item=Awaited<ReturnType<typeof listJurisdictionProfileReviews>>[number];
function ReviewEditor({item}:{item:Item}){
 const router=useRouter();
 const [title,setTitle]=useState(item.title);
 const [summary,setSummary]=useState(item.summary);
 const [profile,setProfile]=useState<Record<string,unknown>>(item.profile && typeof item.profile==="object"&&!Array.isArray(item.profile)?item.profile as Record<string,unknown>:{});
 const models=Array.isArray(profile.operatingModels)?profile.operatingModels as string[]:[];
 const [sources,setSources]=useState<Array<{title:string;url:string;authority:string;checkedAt:string}>>(
  Array.isArray(item.evidence)?item.evidence.filter((s):s is {title:string;url:string;authority:string;checkedAt:string}=>Boolean(s&&typeof s==="object"&&"url" in s&&"title" in s&&"authority" in s&&"checkedAt" in s)):[]);
 function editSource(index:number,field:"title"|"url"|"authority"|"checkedAt",value:string){
  setSources(previous=>previous.map((source,i)=>i===index?{...source,[field]:value}:source));
 }
 const [message,setMessage]=useState("");
 const [saving,setSaving]=useState(false);
 const editable=item.status==="draft"||item.status==="in_review";
 async function save(){
  setSaving(true);setMessage("");
  try{
   const parsedProfile={...profile,summary};
   const parsedEvidence=sources;
   if(!parsedProfile||Array.isArray(parsedProfile)||typeof parsedProfile!=="object")throw Error("Profile must be a JSON object");

   await saveJurisdictionProfileReview({data:{id:item.id,title,summary,profile:parsedProfile,evidence:parsedEvidence}});
   setMessage("Review saved. This content is not published.");
   await router.invalidate();
  }catch(error){setMessage(error instanceof Error?error.message:"Unable to save review");}
  finally{setSaving(false);}
 }
 async function publish(){
  if(!window.confirm("Publish this state profile as verified guidance? Confirm all sources and requirements have been reviewed."))return;
  setSaving(true);setMessage("");
  try{await saveJurisdictionProfileReview({data:{id:item.id,title,summary,profile:{...profile,summary},evidence:sources}});await publishJurisdictionProfile({data:{id:item.id}});setMessage("Saved and published. The state guidance is now available during launch.");await router.invalidate();}
  catch(error){setMessage(error instanceof Error?error.message:"Unable to publish");}
  finally{setSaving(false);}
 }
 return <details className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm">
  <summary className="cursor-pointer font-serif text-lg font-semibold">{item.name} · {item.revision} · {item.status} · {item.verificationStatus}</summary>
  <div className="mt-4 space-y-3">
   <label className="block text-sm">Title<input className="mt-1 w-full rounded border bg-background p-2" value={title} disabled={!editable} onChange={e=>setTitle(e.target.value)}/></label>
   <label className="block text-sm">Summary<textarea className="mt-1 w-full rounded border bg-background p-2" rows={3} value={summary} disabled={!editable} onChange={e=>setSummary(e.target.value)}/></label>
   <section className="space-y-3 rounded-xl border border-border/70 bg-card p-4">
    <div className="flex items-center justify-between"><h3 className="font-semibold">Operating models</h3>{editable&&<button type="button" className="rounded-lg border px-3 py-2 text-sm" onClick={()=>setProfile(v=>({...v,operatingModels:[...models,""]}))}>Add model</button>}</div>
    {models.length===0&&<p className="text-sm text-muted-foreground">Add applicable models after researching state rules.</p>}
    {models.map((model,i)=><div key={i} className="flex gap-2"><input aria-label={`Operating model ${i+1}`} className="w-full rounded-lg border bg-background p-2 text-sm" disabled={!editable} value={model} onChange={e=>setProfile(v=>({...v,operatingModels:models.map((x,j)=>i===j?e.target.value:x)}))}/>{editable&&<button type="button" className="text-sm underline" onClick={()=>setProfile(v=>({...v,operatingModels:models.filter((_,j)=>i!==j)}))}>Remove</button>}</div>)}
   </section>
   <section className="space-y-3 rounded-xl border border-border/70 bg-card p-4">
    <div className="flex items-center justify-between"><h3 className="font-semibold">Funding programs</h3>{editable&&<button type="button" className="rounded-lg border px-3 py-2 text-sm" onClick={()=>setProfile(v=>({...v,fundingPrograms:[...(Array.isArray(v.fundingPrograms)?v.fundingPrograms:[]),{id:crypto.randomUUID(),name:"",summary:"",eligibilityStatus:"unknown",evidenceIds:[]}]}))}>Add funding program</button>}</div>
    {(Array.isArray(profile.fundingPrograms)?profile.fundingPrograms:[]).map((entry:unknown,i:number)=>{
     const program=entry as {id:string;name:string;summary:string;eligibilityStatus:string;evidenceIds:string[]};
     const update=(patch:Partial<typeof program>)=>setProfile(v=>({...v,fundingPrograms:(v.fundingPrograms as typeof program[]).map((p,j)=>i===j?{...p,...patch}:p)}));
     return <div key={program.id} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2">
      <label className="text-sm">Program name<input className="mt-1 w-full rounded-lg border bg-background p-2" disabled={!editable} value={program.name} onChange={e=>update({name:e.target.value})}/></label>
      <label className="text-sm">Eligibility status<select className="mt-1 w-full rounded-lg border bg-background p-2" disabled={!editable} value={program.eligibilityStatus} onChange={e=>update({eligibilityStatus:e.target.value})}>{["unknown","under_review","conditional","verified"].map(s=><option key={s} value={s}>{s.replaceAll("_"," ")}</option>)}</select></label>
      <label className="text-sm sm:col-span-2">Program summary<textarea className="mt-1 w-full rounded-lg border bg-background p-2" disabled={!editable} value={program.summary} onChange={e=>update({summary:e.target.value})}/></label>
      {editable&&<button type="button" className="text-left text-sm underline" onClick={()=>setProfile(v=>({...v,fundingPrograms:(v.fundingPrograms as typeof program[]).filter((_,j)=>i!==j)}))}>Remove program</button>}
     </div>;
    })}
   </section>
   <section className="space-y-3 rounded-xl border border-border/70 bg-card p-4">
    <div className="flex items-center justify-between"><h3 className="font-semibold">Requirements & responsibilities</h3>{editable&&<button type="button" className="rounded-lg border px-3 py-2 text-sm" onClick={()=>setProfile(v=>({...v,requirements:[...(Array.isArray(v.requirements)?v.requirements:[]),{id:crypto.randomUUID(),title:"",description:"",responsibleParty:"church",phase:"before_opening",evidenceIds:[]}]}))}>Add requirement</button>}</div>
    {(Array.isArray(profile.requirements)?profile.requirements:[]).map((entry:unknown,i:number)=>{
     const requirement=entry as {id:string;title:string;description:string;responsibleParty:string;phase:string;evidenceIds:string[]};
     const update=(patch:Partial<typeof requirement>)=>setProfile(v=>({...v,requirements:(v.requirements as typeof requirement[]).map((r,j)=>i===j?{...r,...patch}:r)}));
     return <div key={requirement.id} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2">
      <label className="text-sm sm:col-span-2">Requirement<input className="mt-1 w-full rounded-lg border bg-background p-2" disabled={!editable} value={requirement.title} onChange={e=>update({title:e.target.value})}/></label>
      <label className="text-sm">Responsible party<select className="mt-1 w-full rounded-lg border bg-background p-2" disabled={!editable} value={requirement.responsibleParty} onChange={e=>update({responsibleParty:e.target.value})}>{["can","church","family"].map(s=><option key={s} value={s}>{s.toUpperCase()}</option>)}</select></label>
      <label className="text-sm">When needed<select className="mt-1 w-full rounded-lg border bg-background p-2" disabled={!editable} value={requirement.phase} onChange={e=>update({phase:e.target.value})}>{["before_opening","before_enrollment","follow_up"].map(s=><option key={s} value={s}>{s.replaceAll("_"," ")}</option>)}</select></label>
      <label className="text-sm sm:col-span-2">Description<textarea className="mt-1 w-full rounded-lg border bg-background p-2" disabled={!editable} value={requirement.description} onChange={e=>update({description:e.target.value})}/></label>
      <label className="text-sm sm:col-span-2">Supporting source<select className="mt-1 w-full rounded-lg border bg-background p-2" disabled={!editable} value={requirement.evidenceIds[0]??""} onChange={e=>update({evidenceIds:e.target.value?[e.target.value]:[]})}><option value="">Not linked yet</option>{sources.map(source=><option key={source.url} value={source.url}>{source.title||source.url}</option>)}</select></label>
      {editable&&<button type="button" className="text-left text-sm underline" onClick={()=>setProfile(v=>({...v,requirements:(v.requirements as typeof requirement[]).filter((_,j)=>i!==j)}))}>Remove requirement</button>}
     </div>;
    })}
   </section>
   <section className="space-y-3" aria-label="Evidence sources">
    <div className="flex items-center justify-between"><h3 className="text-sm font-semibold">Official source evidence</h3>
     {editable&&<button type="button" className="rounded border px-3 py-1 text-sm" onClick={()=>setSources(previous=>[...previous,{title:"",url:"",authority:"",checkedAt:new Date().toISOString()}])}>Add source</button>}</div>
    {sources.length===0&&<p className="text-sm text-muted-foreground">No sources yet. Add an official reference before publishing.</p>}
    {sources.map((source,i)=><div key={i} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-2">
     {(["title","url","authority","checkedAt"] as const).map(field=><label key={field} className="text-xs capitalize">{field==="checkedAt"?"Checked at (ISO date/time)":field}
      <input className="mt-1 w-full rounded border bg-background p-2 text-sm" value={source[field]} disabled={!editable} onChange={e=>editSource(i,field,e.target.value)} placeholder={field==="url"?"https://...":undefined}/></label>)}
     {editable&&<button type="button" className="text-left text-xs underline" onClick={()=>setSources(previous=>previous.filter((_,index)=>index!==i))}>Remove source</button>}
    </div>)}
   </section>
   <div className="flex items-center gap-3"><button type="button" disabled={!editable||saving} onClick={save} className="rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-50">{saving?"Saving…":"Save review"}</button>{item.status==="in_review"&&<button type="button" disabled={saving} onClick={publish} className="rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-50">Publish reviewed profile</button>}<p role="status" className="text-sm">{message}</p></div>
  </div>
 </details>;
}
