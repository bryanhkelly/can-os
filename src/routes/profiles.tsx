import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { getPersonProfile, beginProfilePhotoUpload, finishProfilePhotoUpload } from "@/modules/profiles/person-profile.functions";
import { ProfilePhoto } from "@/components/profiles/ProfilePhoto";
import { Qualifications } from "@/components/profiles/Qualifications";
import { WorkspaceShell, WorkspacePanel } from "@/components/workspace";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";
import { photoMimeTypes, PrivateUploadCompletion, validateUploadFile, type PrivateUpload } from "@/platform/storage/private-upload";
import { normalizeClientError } from "@/lib/client-error";

export const Route=createFileRoute("/profiles")({
  validateSearch:(search:Record<string,unknown>)=>z.object({person:z.string().uuid().optional()}).parse(search),
  loaderDeps:({search})=>({person:search.person}),
  loader:({deps})=>safeLoader(()=>getPersonProfile({data:{personId:deps.person}}),
    {authMessage:"Sign in to view your profile or a person connected to your schoolwork."})(),
  component:ProfilePage,
});
function ProfilePage(){
  const outcome=Route.useLoaderData();
  if(!outcome.ok)return <LoaderFailure title="Person profile" outcome={outcome}/>;
  return <PersonProfile key={outcome.data.personId} profile={outcome.data}/>;
}
export function PersonProfile({profile}:{profile:Awaited<ReturnType<typeof getPersonProfile>>}){
  const [file,setFile]=useState<File|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
  const [revision,setRevision]=useState(0);
  const completion=useRef(new PrivateUploadCompletion<PrivateUpload>());
  const uploadAbort=useRef<AbortController|null>(null);
  useEffect(()=>()=>uploadAbort.current?.abort(),[]);
  async function save(){
    if(!file)return;
    const controller=new AbortController();uploadAbort.current=controller;
    setBusy(true);setError("");setNotice("");
    try{
      validateUploadFile(file,file.type,photoMimeTypes,2*1024*1024);
      const data={fileName:file.name,mimeType:file.type,size:file.size};
      await completion.current.run(file,
        ()=>beginProfilePhotoUpload({data}),
        upload=>finishProfilePhotoUpload({data:{...data,key:upload.objectKey}}),
        controller.signal);
      setRevision(value=>value+1);setFile(null);setNotice("Profile photo saved.");
    }catch(cause){setError(normalizeClientError(cause,{fallback:"Unable to save profile photo."}).message);}
    finally{if(uploadAbort.current===controller)uploadAbort.current=null;setBusy(false);}
  }
  return <WorkspaceShell eyebrow="CAN OS · People" title={profile.name} subtitle={profile.kind} width="standard"
    actions={<ProfilePhoto personId={profile.personId} name={profile.name} revision={revision}/>}>
    <WorkspacePanel title="Profile" description="Your permanent person identity, with relationships verified by the current membership.">
      <p className="text-sm">Only school-connected profile information is shown. Private contact, clinical and credential evidence are not part of this view.</p>
      {profile.isSelf&&<form className="mt-5 grid gap-3" onSubmit={event=>{event.preventDefault();void save();}}>
        <label className="text-sm">Profile picture (JPEG or PNG, up to 2 MB)<input aria-label="Profile picture" type="file" accept="image/jpeg,image/png"
          disabled={busy} onChange={event=>setFile(event.target.files?.[0]??null)} className="mt-2 block w-full rounded-lg border p-3"/></label>
        <p className="text-xs text-muted-foreground">Your photo is visible to authorized school connections, not a public directory.</p>
        <button disabled={busy||!file} className="justify-self-start rounded-lg border px-4 py-2 text-sm disabled:opacity-50">{busy?"Saving...":"Save profile picture"}</button>
      </form>}
      {error&&<p role="alert" className="mt-4 text-sm">{error}</p>}{notice&&<p role="status" className="mt-4 text-sm">{notice}</p>}
    </WorkspacePanel>
    <WorkspacePanel title={profile.kind==="Teacher"?"Teaching assignments":"School connections"} className="mt-5">
      <ul className="space-y-3">{profile.sections.map(section=><li key={section.id} className="text-sm">
        {["teacher","student"].includes(profile.viewerRole)?<Link to="/classes" search={{section:section.id}} className="underline">{section.title}</Link>:<span>{section.title}</span>}
      </li>)}</ul>
      {!profile.sections.length&&<p className="text-sm text-muted-foreground">No active class relationships are recorded in this membership.</p>}
    </WorkspacePanel>
    {profile.isSelf&&profile.viewerRole==="teacher"&&<Qualifications/>}
  </WorkspaceShell>;
}
