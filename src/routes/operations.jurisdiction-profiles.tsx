import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import {
 listJurisdictionProfileReviews, saveJurisdictionProfileReview,
 verifyJurisdictionProfileReview, publishJurisdictionProfile,
} from "@/modules/programs/jurisdiction-profile.functions";
import { LoaderFailure } from "@/lib/loader-failure";
import { safeLoader } from "@/lib/safe-loader";
import { ActionDialog, EmptyState, MutationFeedback, WorkspaceShell } from "@/components/workspace";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useMutationFeedback } from "@/lib/mutation-feedback";

export const Route=createFileRoute("/operations/jurisdiction-profiles")({
 loader:()=>safeLoader(()=>listJurisdictionProfileReviews())(),
 component:ReviewPage,
});
function utcInputValue(value:string){
 const date=new Date(value);
 return Number.isNaN(date.getTime())?"":date.toISOString().slice(0,16);
}
function utcIsoValue(value:string){
 return value?new Date(`${value}:00.000Z`).toISOString():"";
}
function ReviewPage(){
 const result=Route.useLoaderData();
 if(!result.ok)return <LoaderFailure title="Jurisdiction profiles" eyebrow="CAN OS · Policy review" outcome={result}/>;
 return <WorkspaceShell eyebrow="CAN OS · Policy review" title="Jurisdiction profiles"
  subtitle="Review state operating models, funding, requirements and official sources before publishing guidance. Publication does not authorize a school to open.">
  <div className="space-y-5">
   {result.data.length===0
    ?<EmptyState title="No jurisdiction profiles are ready for review." description="Profiles will appear here after they have been prepared for editorial review."/>
    :result.data.map(item=><ReviewEditor key={item.id} item={item}/>)}
  </div>
 </WorkspaceShell>;
}
type Item=Awaited<ReturnType<typeof listJurisdictionProfileReviews>>[number];
function ReviewEditor({item}:{item:Item}){
 const router=useRouter();
 const [title,setTitle]=useState(item.title);
 const [summary,setSummary]=useState(item.summary);
 const [profile,setProfile]=useState<Record<string,unknown>>(JSON.parse(item.profile) as Record<string,unknown>);
 const models=Array.isArray(profile.operatingModels)?profile.operatingModels as string[]:[];
 const [sources,setSources]=useState<Array<{title:string;url:string;authority:string;checkedAt:string}>>(
  Array.isArray(JSON.parse(item.evidence))?(JSON.parse(item.evidence) as unknown[]).filter((s):s is {title:string;url:string;authority:string;checkedAt:string}=>Boolean(s&&typeof s==="object"&&"url" in s&&"title" in s&&"authority" in s&&"checkedAt" in s)):[]);
 function editSource(index:number,field:"title"|"url"|"authority"|"checkedAt",value:string){
  setSources(previous=>previous.map((source,i)=>i===index?{...source,[field]:value}:source));
 }
 const [publishDialogOpen,setPublishDialogOpen]=useState(false);
 const [verifyDialogOpen,setVerifyDialogOpen]=useState(false);
 const [verificationNote,setVerificationNote]=useState("");
 const mutation=useMutationFeedback(()=>router.invalidate());
 const busy=mutation.pending||mutation.refreshFailed;
 const editable=item.canEdit&&(item.status==="draft"||item.status==="in_review");
 const dirty=title!==item.title||summary!==item.summary||
  JSON.stringify(profile)!==item.profile||JSON.stringify(sources)!==item.evidence;
 function saveReview(){
  const parsedProfile={...profile,summary};
  return saveJurisdictionProfileReview({data:{id:item.id,title,summary,profile:parsedProfile,evidence:sources}});
 }
 async function save(){
  await mutation.run(saveReview,{
   successMessage:"Review saved. This content is not published.",
   commandErrorMessage:"Unable to save jurisdiction profile review.",
   refreshErrorMessage:"The review was saved, but the profile could not be refreshed. Retry refresh before continuing.",
  });
 }
 async function publish(){
  const published=await mutation.run(()=>publishJurisdictionProfile({data:{id:item.id}}),{
   successMessage:"Published the independently verified profile. State guidance is now available during launch.",
   commandErrorMessage:"Unable to publish the jurisdiction profile.",
   refreshErrorMessage:"The profile was published, but current review status could not be loaded. Retry refresh before continuing.",
  });
  if(published.status!=="duplicate")setPublishDialogOpen(false);
 }
 async function verify(){
  const verified=await mutation.run(
   ()=>verifyJurisdictionProfileReview({data:{id:item.id,note:verificationNote}}),
   {
    successMessage:"Independent verification recorded for the current profile evidence.",
    commandErrorMessage:"Unable to verify the jurisdiction profile.",
    refreshErrorMessage:"Verification was recorded, but the profile could not be refreshed. Retry refresh before continuing.",
   },
  );
  if(verified.status!=="duplicate")setVerifyDialogOpen(false);
 }
 return <details className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm">
  <summary className="cursor-pointer font-serif text-lg font-semibold">{item.name} · {item.revision} · {item.status} · {item.verificationStatus}</summary>
  <div className="mt-4 space-y-3">
   <Field label="Title"><Input value={title} disabled={!editable||busy} onChange={e=>setTitle(e.target.value)}/></Field>
   <Field label="Summary"><Textarea rows={3} value={summary} disabled={!editable||busy} onChange={e=>setSummary(e.target.value)}/></Field>
   <section className="space-y-3 rounded-xl border border-border/70 bg-card p-4">
    <div className="flex items-center justify-between"><h3 className="font-semibold">Operating models</h3>{editable&&<Button type="button" variant="outline" size="sm" disabled={busy} onClick={()=>setProfile(v=>({...v,operatingModels:[...models,""]}))}>Add model</Button>}</div>
    {models.length===0&&<p className="text-sm text-muted-foreground">Add applicable models after researching state rules.</p>}
    {models.map((model,i)=><div key={i} className="flex items-end gap-2"><Field label={`Operating model ${i+1}`} className="flex-1"><Input disabled={!editable||busy} value={model} onChange={e=>setProfile(v=>({...v,operatingModels:models.map((x,j)=>i===j?e.target.value:x)}))}/></Field>{editable&&<Button type="button" variant="ghost" size="sm" disabled={busy} onClick={()=>setProfile(v=>({...v,operatingModels:models.filter((_,j)=>i!==j)}))}>Remove</Button>}</div>)}
   </section>
   <section className="space-y-3 rounded-xl border border-border/70 bg-card p-4">
    <div className="flex items-center justify-between"><h3 className="font-semibold">Funding programs</h3>{editable&&<Button type="button" variant="outline" size="sm" disabled={busy} onClick={()=>setProfile(v=>({...v,fundingPrograms:[...(Array.isArray(v.fundingPrograms)?v.fundingPrograms:[]),{id:crypto.randomUUID(),name:"",summary:"",eligibilityStatus:"unknown",evidenceIds:[]}]}))}>Add funding program</Button>}</div>
    {(Array.isArray(profile.fundingPrograms)?profile.fundingPrograms:[]).map((entry:unknown,i:number)=>{
     const program=entry as {id:string;name:string;summary:string;eligibilityStatus:string;evidenceIds:string[]};
     const update=(patch:Partial<typeof program>)=>setProfile(v=>({...v,fundingPrograms:(v.fundingPrograms as typeof program[]).map((p,j)=>i===j?{...p,...patch}:p)}));
     return <div key={program.id} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2">
      <Field label="Program name"><Input disabled={!editable||busy} value={program.name} onChange={e=>update({name:e.target.value})}/></Field>
      <Field label="Eligibility status"><Select disabled={!editable||busy} value={program.eligibilityStatus} onChange={e=>update({eligibilityStatus:e.target.value})}>{["unknown","under_review","conditional","verified"].map(s=><option key={s} value={s}>{s.replaceAll("_"," ")}</option>)}</Select></Field>
      <Field label="Program summary" className="sm:col-span-2"><Textarea disabled={!editable||busy} value={program.summary} onChange={e=>update({summary:e.target.value})}/></Field>
      <Field label="Supporting official source" className="sm:col-span-2"><Select disabled={!editable||busy} value={program.evidenceIds?.[0]??""} onChange={e=>update({evidenceIds:e.target.value?[e.target.value]:[]})}><option value="">Not linked yet</option>{sources.map(source=><option key={source.url} value={source.url}>{source.title||source.url}</option>)}</Select></Field>
      {editable&&<Button type="button" variant="ghost" size="sm" disabled={busy} className="justify-self-start" onClick={()=>setProfile(v=>({...v,fundingPrograms:(v.fundingPrograms as typeof program[]).filter((_,j)=>i!==j)}))}>Remove program</Button>}
     </div>;
    })}
   </section>
   <section className="space-y-3 rounded-xl border border-border/70 bg-card p-4">
    <div className="flex items-center justify-between"><h3 className="font-semibold">Requirements & responsibilities</h3>{editable&&<Button type="button" variant="outline" size="sm" disabled={busy} onClick={()=>setProfile(v=>({...v,requirements:[...(Array.isArray(v.requirements)?v.requirements:[]),{id:crypto.randomUUID(),title:"",description:"",responsibleParty:"church",phase:"before_opening",evidenceIds:[]}]}))}>Add requirement</Button>}</div>
    {(Array.isArray(profile.requirements)?profile.requirements:[]).map((entry:unknown,i:number)=>{
     const requirement=entry as {id:string;title:string;description:string;responsibleParty:string;phase:string;evidenceIds:string[]};
     const update=(patch:Partial<typeof requirement>)=>setProfile(v=>({...v,requirements:(v.requirements as typeof requirement[]).map((r,j)=>i===j?{...r,...patch}:r)}));
     return <div key={requirement.id} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2">
      <Field label="Requirement" className="sm:col-span-2"><Input disabled={!editable||busy} value={requirement.title} onChange={e=>update({title:e.target.value})}/></Field>
      <Field label="Responsible party"><Select disabled={!editable||busy} value={requirement.responsibleParty} onChange={e=>update({responsibleParty:e.target.value})}>{["can","church","family"].map(s=><option key={s} value={s}>{s.toUpperCase()}</option>)}</Select></Field>
      <Field label="When needed"><Select disabled={!editable||busy} value={requirement.phase} onChange={e=>update({phase:e.target.value})}>{["before_opening","before_enrollment","follow_up"].map(s=><option key={s} value={s}>{s.replaceAll("_"," ")}</option>)}</Select></Field>
      <Field label="Description" className="sm:col-span-2"><Textarea disabled={!editable||busy} value={requirement.description} onChange={e=>update({description:e.target.value})}/></Field>
      <Field label="Supporting source" className="sm:col-span-2"><Select disabled={!editable||busy} value={requirement.evidenceIds[0]??""} onChange={e=>update({evidenceIds:e.target.value?[e.target.value]:[]})}><option value="">Not linked yet</option>{sources.map(source=><option key={source.url} value={source.url}>{source.title||source.url}</option>)}</Select></Field>
      {editable&&<Button type="button" variant="ghost" size="sm" disabled={busy} className="justify-self-start" onClick={()=>setProfile(v=>({...v,requirements:(v.requirements as typeof requirement[]).filter((_,j)=>i!==j)}))}>Remove requirement</Button>}
     </div>;
    })}
   </section>
   <section className="space-y-3" aria-label="Evidence sources">
    <div className="flex items-center justify-between"><h3 className="text-sm font-semibold">Official source evidence</h3>
     {editable&&<Button type="button" variant="outline" size="sm" disabled={busy} onClick={()=>setSources(previous=>[...previous,{title:"",url:"",authority:"",checkedAt:new Date().toISOString()}])}>Add source</Button>}</div>
    {sources.length===0&&<p className="text-sm text-muted-foreground">No sources yet. Add an official reference before publishing.</p>}
    {sources.map((source,i)=><div key={i} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-2">
     {(["title","url","authority","checkedAt"] as const).map(field=><Field key={field} label={field==="checkedAt"?"Checked at (UTC)":field}>
      <Input type={field==="url"?"url":field==="checkedAt"?"datetime-local":"text"}
       value={field==="checkedAt"?utcInputValue(source.checkedAt):source[field]}
       disabled={!editable||busy}
       onChange={e=>editSource(i,field,field==="checkedAt"?utcIsoValue(e.target.value):e.target.value)}
       placeholder={field==="url"?"https://...":undefined}/>
     </Field>)}
     {editable&&<Button type="button" variant="ghost" size="sm" disabled={busy} className="justify-self-start" onClick={()=>setSources(previous=>previous.filter((_,index)=>index!==i))}>Remove source</Button>}
    </div>)}
   </section>
   {item.verificationStatus==="verified"&&item.verifiedByPersonId&&<section className="rounded-xl border border-border/70 bg-card p-4">
    <h3 className="font-semibold">Independent verification</h3>
    <p className="text-sm text-muted-foreground">Reviewer {item.verifiedByPersonId} · {item.reviewedAt?new Date(item.reviewedAt).toISOString():"time unavailable"}</p>
    <p className="mt-2 text-sm">{(JSON.parse(item.verificationEvidence) as {note?:string}).note}</p>
   </section>}
   <div className="flex flex-wrap items-center gap-3">
    <Button type="button" variant="outline" disabled={!editable||busy} onClick={()=>void save()}>{mutation.pending?"Saving…":"Save review"}</Button>
    {item.canVerify&&item.status==="in_review"&&item.verificationStatus!=="verified"&&
     <Button type="button" disabled={busy} onClick={()=>setVerifyDialogOpen(true)}>Record independent verification</Button>}
    {item.canPublish&&item.status==="in_review"&&item.verificationStatus==="verified"&&
     <Button type="button" disabled={busy||dirty} onClick={()=>setPublishDialogOpen(true)}>Publish verified profile</Button>}
   </div>
   <MutationFeedback state={mutation} pendingMessage="Saving jurisdiction profile review."/>
  </div>
  <ActionDialog open={verifyDialogOpen} title="Verify jurisdiction profile?"
   description="Confirm that you independently reviewed every current official source listed on this profile. Your identity, note, and the reviewed source snapshot will be recorded."
   confirmLabel="Record verification" pending={mutation.pending} confirmDisabled={mutation.refreshFailed||verificationNote.trim().length<25}
   onConfirm={()=>void verify()} onClose={()=>setVerifyDialogOpen(false)}>
   <Field label="Independent review note"><Textarea rows={4} value={verificationNote} onChange={event=>setVerificationNote(event.target.value)} placeholder="Describe what you verified in the official sources."/></Field>
  </ActionDialog>
  <ActionDialog open={publishDialogOpen} title="Publish jurisdiction profile?"
   description="Publish the current profile only after a separate reviewer has verified its evidence. Published guidance does not authorize a school to open."
   confirmLabel="Publish profile" pending={mutation.pending} confirmDisabled={mutation.refreshFailed}
   onConfirm={()=>void publish()} onClose={()=>setPublishDialogOpen(false)}/>
 </details>;
}
