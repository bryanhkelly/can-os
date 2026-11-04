import { createFileRoute, Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { createPrivateUploadTask, photoUploadPolicy } from "@/platform/storage/private-upload";
import { mutationErrorMessage } from "@/lib/mutation-feedback";
import { z } from "zod";
import { getPersonProfile, beginProfilePhotoUpload, finishProfilePhotoUpload } from "@/modules/profiles/person-profile.functions";
import { ProfilePhoto } from "@/components/profiles/ProfilePhoto";
import { Qualifications } from "@/components/profiles/Qualifications";
import { TeacherProfessionalProfile } from "@/components/profiles/TeacherProfessionalProfile";
import { StudentProfileSetup } from "@/components/profiles/StudentProfileSetup";
import { WorkspaceShell, WorkspacePanel } from "@/components/workspace";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";

export const loadProfileHome = (person?: string) => safeLoader(
  () => getPersonProfile({data:{personId:person}}),
  {authMessage:"Sign in to view your profile or a person connected to your schoolwork."},
)();

export const Route=createFileRoute("/profiles")({
  validateSearch:(search:Record<string,unknown>)=>z.object({person:z.string().uuid().optional()}).parse(search),
  loaderDeps:({search})=>({person:search.person}),
  loader:({deps})=>loadProfileHome(deps.person),
  component:ProfilePage,
});
function ProfilePage(){
  return <ProfileHome outcome={Route.useLoaderData()}/>;
}
export function ProfileHome({outcome}:{outcome:Awaited<ReturnType<typeof loadProfileHome>>}){
  if(!outcome.ok)return <LoaderFailure title="Person profile" outcome={outcome}/>;
  return <PersonProfile key={outcome.data.personId} profile={outcome.data}/>;
}
export function PersonProfile({profile}:{profile:Awaited<ReturnType<typeof getPersonProfile>>}){
  const [file,setFile]=useState<File|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
  const [revision,setRevision]=useState(0);
  const pending = useRef<{file: File; task: {run: () => Promise<unknown>}} | null>(null);
  const saving = useRef(false);
  async function save(){
    if(!file||saving.current)return;
    saving.current=true;
    setBusy(true);setError("");setNotice("");
    try{
      const data={fileName:file.name,mimeType:file.type,size:file.size};
      if(pending.current?.file!==file)pending.current={file,task:createPrivateUploadTask({
        file,policy:photoUploadPolicy,
        begin:()=>beginProfilePhotoUpload({data}),
        finish:upload=>finishProfilePhotoUpload({data:{...data,key:upload.key}}),
      })};
      await pending.current.task.run();
      pending.current=null;
      setRevision(value=>value+1);setFile(null);setNotice("Profile photo saved.");
    }catch(cause){setError(mutationErrorMessage(cause,"Unable to save profile photo. Retry to finish an uploaded photo without uploading again."));}
    finally{saving.current=false;setBusy(false);}
  }
  return <WorkspaceShell eyebrow="People" title={profile.name} subtitle={profile.kind} width="standard"
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
    {profile.isSelf&&profile.viewerRole==="student"&&<StudentProfileSetup/>}
    <WorkspacePanel title={profile.kind==="Teacher"?"Teaching assignments":"School connections"} className="mt-5">
      <ul className="space-y-3">{profile.sections.map(section=><li key={section.id} className="text-sm">
        {["teacher","student"].includes(profile.viewerRole)?<Link to="/classes" search={{section:section.id}} className="underline">{section.title}</Link>:<span>{section.title}</span>}
      </li>)}</ul>
      {!profile.sections.length&&<p className="text-sm text-muted-foreground">No active class relationships are recorded in this membership.</p>}
    </WorkspacePanel>
    {profile.isSelf&&profile.viewerRole==="teacher"&&<TeacherProfessionalProfile/>}
    {profile.isSelf&&["teacher","room_facilitator","site_leader","site_staff"].includes(profile.viewerRole)&&<Qualifications/>}
  </WorkspaceShell>;
}
