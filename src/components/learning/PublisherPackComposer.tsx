import { mutationErrorMessage } from "@/lib/mutation-feedback";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/choice";
import { Field, FieldError } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { WorkspaceNotice } from "@/components/workspace";
import {
 createAuthoredPublisherPack, getPublisherPackStudio, publishAuthoredPublisherPack,
 saveAuthoredPublisherPack, startPublisherPackDraft,
} from "@/modules/learning/publisher-pack-authoring.functions";

type Studio=Awaited<ReturnType<typeof getPublisherPackStudio>>;
type Draft=Studio["packs"][number]["releases"][number];

function PackDraftEditor({programId,release,courses,onSaved}:{
 programId:string;release:Draft;courses:Studio["courses"];onSaved:()=>Promise<void>;
}){
 const [selected,setSelected]=useState<string[]>(release.courseVersionIds);
 const [revision,setRevision]=useState(release.revision);
 const [committed,setCommitted]=useState(release.courseVersionIds);
 const [reason,setReason]=useState("");
 const [confirmed,setConfirmed]=useState(false);
 const [attempted,setAttempted]=useState(false);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState(""),[notice,setNotice]=useState("");
 const dirty=JSON.stringify(selected)!==JSON.stringify(committed);
 async function act(command:()=>Promise<unknown>,success:string){
  setBusy(true);setError("");setNotice("");
  try{await command();setNotice(success);await onSaved();}
  catch(e){setError(mutationErrorMessage(e, "Unable to save publisher pack draft."));}
  finally{setBusy(false);}
 }
 return <section className="mt-3 space-y-3  border p-4" aria-label="Publisher pack draft composer">
  <p className="text-sm">Choose the published, publisher-owned course release for each course. A pack release is immutable after publication and does not upgrade existing school adoptions.</p>
  {error&&<WorkspaceNotice tone="danger">{error}</WorkspaceNotice>}
  {notice&&<p role="status" className="text-sm">{notice}</p>}
  <fieldset disabled={busy} className="space-y-2">
   <legend className="text-sm font-semibold">Published courses for this pack</legend>
   {courses.map(course=><Label key={course.courseVersionId} className="flex items-start gap-2  border p-2 text-sm">
    <Checkbox checked={selected.includes(course.courseVersionId)}
     onChange={e=>{
      const versionsOfSameCourse=courses.filter(c=>c.courseId===course.courseId).map(c=>c.courseVersionId);
      setSelected(old=>e.target.checked
       ? [...old.filter(id=>!versionsOfSameCourse.includes(id)),course.courseVersionId]
       : old.filter(id=>id!==course.courseVersionId));
     }}/>
    <span>{course.code}: {course.title} · v{course.version} · {course.subject}</span>
   </Label>)}
   {!courses.length&&<p className="text-sm">Publish at least one publisher-owned course before composing the pack.</p>}
  </fieldset>
  {dirty&&<p className="text-xs">Unsaved composition changes</p>}
  <Button type="button" variant="outline" disabled={busy||!dirty||selected.length<1} 
   onClick={()=>void act(async()=>{
    const result=await saveAuthoredPublisherPack({data:{
     programId,versionId:release.id,expectedRevision:revision,courseVersionIds:selected,
    }});
    setRevision(result.revision);setCommitted([...selected]);setConfirmed(false);
   },"Pack draft saved. Not yet available to adopting schools.")}>Save course selection</Button>
  <form noValidate className="mt-3 space-y-3 border-t pt-3" onSubmit={e=>{
   e.preventDefault();
   setAttempted(true);
   if(dirty||!confirmed||reason.trim().length<10||selected.length<1)return;
   void act(()=>publishAuthoredPublisherPack({data:{
    programId,versionId:release.id,expectedRevision:revision,reason,confirmed:true,
   }}),"Pack release published. Schools may now install or adopt it when entitled.");
  }}>
  {attempted&&!selected.length&&<FieldError>Select at least one published course.</FieldError>}
  <Field label="Publication reason" required
   error={attempted&&reason.trim().length<10?"Enter at least 10 characters explaining this publication.":undefined}>
   <Textarea minLength={10} maxLength={2000} value={reason} onChange={e=>setReason(e.target.value)}/>
  </Field>
  <Field label="I have verified every included publisher course release and understand publication is immutable." required
   error={attempted&&!confirmed?"Confirm that you reviewed the included course releases.":undefined}>
   <Checkbox checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>
  </Field>
  <Button type="submit" variant="outline" disabled={busy||dirty}>Publish pack release</Button>
  </form>
 </section>;
}

export function PublisherPackComposer({studio,onSaved}:{studio:Studio;onSaved:()=>Promise<void>}){
 const [slug,setSlug]=useState(""),[name,setName]=useState(""),[description,setDescription]=useState("");
 const [visibility,setVisibility]=useState<"public"|"private">("private");
 const [licenseCode,setLicenseCode]=useState<"CC0"|"CC-BY-4.0"|"COMMERCIAL">("CC-BY-4.0");
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const requestId=useRef<string|null>(null);
 const nextDraftRequests=useRef(new Map<string,string>());
 async function act(command:()=>Promise<unknown>,success:string){
  setBusy(true);setError("");setNotice("");
  try{await command();setNotice(success);await onSaved();}
  catch(e){setError(mutationErrorMessage(e, "Unable to manage publisher pack."));}
  finally{setBusy(false);}
 }
 return <section className="space-y-4  border p-5" aria-label="Publisher curriculum packs">
  <h2 className="text-xl font-semibold">Publisher Packs</h2>
  <p className="text-sm">Compose immutable packs from your own published courses. Separate license entitlements and school adoption determine which institutions can use them. Commercial licenses require verified agreements before a school can install.</p>
  {error&&<WorkspaceNotice tone="danger">{error}</WorkspaceNotice>}
  {notice&&<p role="status" className="text-sm">{notice}</p>}
  <form className="grid gap-3  border p-4 sm:grid-cols-2" onSubmit={e=>{
   e.preventDefault();requestId.current??=crypto.randomUUID();
   void act(async()=>{
    await createAuthoredPublisherPack({data:{
     programId:studio.programId,requestId:requestId.current!,slug,name,description,visibility,licenseCode,
    }});
    setSlug("");setName("");setDescription("");requestId.current=null;
   },"Publisher pack created. Select the included published course releases below.");
  }}>
   <h3 className="font-semibold sm:col-span-2">Create curriculum pack</h3>
   <Field label="Pack name"><Input required minLength={3} maxLength={160} value={name}
    onChange={e=>{requestId.current=null;setName(e.target.value);}} className="mt-1"/></Field>
   <Field label="URL slug"><Input required minLength={3} maxLength={80} pattern="[a-z0-9-]+"
    value={slug} onChange={e=>{requestId.current=null;setSlug(e.target.value);}}
    className="mt-1"/></Field>
   <Field label="Publisher description"><Textarea required minLength={10} maxLength={2000}
    value={description} onChange={e=>{requestId.current=null;setDescription(e.target.value);}}
    className="mt-1"/></Field>
   <Field label="Visibility"><Select value={visibility} onChange={e=>{requestId.current=null;setVisibility(e.target.value as typeof visibility);}}
    className="mt-1">
    <option value="private">Private</option><option value="public">Public discovery</option>
   </Select></Field>
   <Field label="License type"><Select value={licenseCode} onChange={e=>{requestId.current=null;setLicenseCode(e.target.value as typeof licenseCode);}}
    className="mt-1">
    <option value="CC0">CC0</option><option value="CC-BY-4.0">CC-BY 4.0</option>
    <option value="COMMERCIAL">Commercial (verified agreement required)</option>
   </Select></Field>
   <Button type="submit" disabled={busy} className="justify-self-start">Create pack</Button>
  </form>
  {studio.packs.map(pack=><section key={pack.id} className="space-y-2  border p-4">
   <h3 className="font-semibold">{pack.name}</h3>
   <p className="text-xs">{pack.visibility} · {pack.licenseCode} · {pack.slug}</p>
   <p className="text-sm">{pack.description}</p>
   {!pack.releases.some(r=>r.status==="draft")&&<Button type="button" variant="outline" disabled={busy} onClick={()=>void act(()=>{
     const requestId=nextDraftRequests.current.get(pack.id)??crypto.randomUUID();
     nextDraftRequests.current.set(pack.id,requestId);
     return startPublisherPackDraft({data:{programId:studio.programId,packId:pack.id,requestId}});
    },"A new editable pack version was created; existing school adoptions remain unchanged.")}>Create next pack draft</Button>}
   {pack.releases.map(release=><details key={release.id} open={release.status==="draft"} className="border-t pt-2">
    <summary className="cursor-pointer text-sm">Pack v{release.version} · {release.status} · {release.courseVersionIds.length} courses</summary>
    {release.status==="draft"?<PackDraftEditor key={release.id} programId={studio.programId}
     release={release} courses={studio.courses} onSaved={onSaved}/>:
     <p className="mt-2 text-sm">Published on {release.publishedAt?new Date(release.publishedAt).toLocaleDateString():"unknown date"}. This release is immutable; existing adoptions are pinned.</p>}
   </details>)}
  </section>)}
  {!studio.packs.length&&<p className="text-sm">No publisher packs have been created yet.</p>}
 </section>;
}
