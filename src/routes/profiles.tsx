import { createFileRoute, Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { createPrivateUploadTask, photoUploadPolicy } from "@/platform/storage/private-upload";
import { mutationErrorMessage } from "@/lib/mutation-feedback";
import { z } from "zod";
import { getPersonProfile, beginProfilePhotoUpload, finishProfilePhotoUpload } from "@/modules/profiles/person-profile.functions";
import { ProfilePhoto } from "@/components/profiles/ProfilePhoto";
import { Qualifications } from "@/components/profiles/Qualifications";
import { WorkspaceShell, WorkspacePanel } from "@/components/workspace";
import { ProfileIdentity, ProfileRecordLayout, profileTabClass } from "@/components/profiles/ProfileRecordLayout";
import { Button } from "@/components/ui/button";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";

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
  return <WorkspaceShell title={profile.name} width="wide" contentHeader>
    <ProfileRecordLayout
      identity={<ProfileIdentity name={profile.name} subtitle={profile.kind}
        portrait={<ProfilePhoto personId={profile.personId} name={profile.name} revision={revision}/>}
        badges={<span className="border border-border bg-muted/40 px-3 py-1 text-xs font-semibold">{profile.isSelf?"Your profile":"School-connected profile"}</span>}/>}
      metrics={[{id:"classes",label:profile.kind==="Teacher"?"Teaching sections":"School connections",value:profile.sections.length,detail:"Visible in the current verified membership"}]}
      navigation={<>
        <a href="#person-profile" className={profileTabClass(true)}>About</a>
        <a href="#profile-connections" className={profileTabClass(false)}>Connections</a>
        {profile.isSelf&&["teacher","room_facilitator","site_leader","site_staff"].includes(profile.viewerRole)&&
          <a href="#profile-qualifications" className={profileTabClass(false)}>Qualifications</a>}
      </>}
      rail={<>
        <WorkspacePanel title="Profile context">
          <p className="text-xs leading-5 text-muted-foreground">These relationships are checked against your current verified membership. Profile pictures are private to authorized school connections.</p>
          <p className="mt-3 text-xs text-muted-foreground">Contact details, clinical information and protected credentials are deliberately excluded from this page.</p>
        </WorkspacePanel>
      </>}
    >
    <div className="space-y-5">
    <div id="person-profile"><WorkspacePanel title="Profile" description="Your permanent person identity, with relationships verified by the current membership.">
      <p className="text-sm">Only school-connected profile information is shown. Private contact, clinical and credential evidence are not part of this view.</p>
      {profile.isSelf&&<form className="mt-5 grid gap-3" onSubmit={event=>{event.preventDefault();void save();}}>
        <label className="text-sm">Profile picture (JPEG or PNG, up to 2 MB)<input aria-label="Profile picture" type="file" accept="image/jpeg,image/png"
          disabled={busy} onChange={event=>setFile(event.target.files?.[0]??null)} className="mt-2 block w-full rounded-lg border p-3"/></label>
        <p className="text-xs text-muted-foreground">Your photo is visible to authorized school connections, not a public directory.</p>
        <Button type="submit" disabled={busy||!file} className="justify-self-start">{busy?"Saving...":"Save profile picture"}</Button>
      </form>}
      {error&&<p role="alert" className="mt-4 text-sm">{error}</p>}{notice&&<p role="status" className="mt-4 text-sm">{notice}</p>}
    </WorkspacePanel></div>
    <div id="profile-connections"><WorkspacePanel title={profile.kind==="Teacher"?"Teaching assignments":"School connections"}>
      <ul className="space-y-3">{profile.sections.map(section=><li key={section.id} className="text-sm">
        {["teacher","student"].includes(profile.viewerRole)?<Link to="/classes" search={{section:section.id}} className="underline">{section.title}</Link>:<span>{section.title}</span>}
      </li>)}</ul>
      {!profile.sections.length&&<p className="text-sm text-muted-foreground">No active class relationships are recorded in this membership.</p>}
    </WorkspacePanel></div>
    {profile.isSelf&&["teacher","room_facilitator","site_leader","site_staff"].includes(profile.viewerRole)&&<div id="profile-qualifications"><Qualifications/></div>}
    </div>
    </ProfileRecordLayout>
  </WorkspaceShell>;
}
