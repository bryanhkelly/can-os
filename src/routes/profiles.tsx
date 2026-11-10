import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { getPersonProfile, getProfilePhoto, beginProfilePhotoUpload, finishProfilePhotoUpload, removeProfilePhoto } from "@/modules/profiles/person-profile.functions";
import { createPrivateUploadTask, photoUploadPolicy } from "@/platform/storage/private-upload";
import { ProfilePhoto } from "@/components/profiles/ProfilePhoto";
import { ProfilePhotoEditor } from "@/components/profiles/ProfilePhotoEditor";
import { Qualifications } from "@/components/profiles/Qualifications";
import { TeacherProfessionalProfile } from "@/components/profiles/TeacherProfessionalProfile";
import { StudentProfileSetup } from "@/components/profiles/StudentProfileSetup";
import { PageFrame, RecordHeader, RecordLayout, WorkspacePanel, SectionTab } from "@/components/workspace";
import { Button } from "@/components/ui/button";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";
import { plural } from "@/lib/format";

export const loadProfileHome = (person?: string) => safeLoader(
  () => getPersonProfile({data:{personId:person}}),
  {authMessage:"Sign in to view your profile or a person connected to your schoolwork."},
)();

function createPhotoUploadTask(file: File) {
  const data = { fileName: file.name, mimeType: file.type, size: file.size };
  return createPrivateUploadTask({ file, policy: photoUploadPolicy,
    begin: () => beginProfilePhotoUpload({ data }),
    finish: upload => finishProfilePhotoUpload({ data: { ...data, key: upload.key } }),
  });
}

export const Route=createFileRoute("/profiles")({
  validateSearch:(search:Record<string,unknown>)=>z.object({person:z.string().uuid().optional(), tab:z.enum(["overview","connections","edit","background","qualifications"]).optional()}).parse(search),
  loaderDeps:({search})=>({person:search.person}),
  loader:({deps})=>loadProfileHome(deps.person),
  component:ProfilePage,
});
function ProfilePage(){
  return <ProfileHome outcome={Route.useLoaderData()} tab={Route.useSearch().tab}/>;
}
type ProfileTab = "overview" | "connections" | "edit" | "background" | "qualifications";
export function ProfileHome({outcome, tab}:{outcome:Awaited<ReturnType<typeof loadProfileHome>>; tab?:ProfileTab}){
  if(!outcome.ok)return <LoaderFailure title="Person profile" outcome={outcome}/>;
  return <PersonProfile key={outcome.data.personId} profile={outcome.data} tab={tab}/>;
}
export function PersonProfile({profile, tab: requestedTab = "overview"}:{profile:Awaited<ReturnType<typeof getPersonProfile>>; tab?:ProfileTab}){
  const [revision,setRevision]=useState(0);
  const sections: { value: ProfileTab; label: string }[] = [
    { value: "overview", label: "Overview" }, { value: "connections", label: "Connections" },
    ...(profile.modules.photo ? [{ value: "edit" as const, label: "Edit profile" }] : []),
    ...(profile.modules.professional ? [{ value: "background" as const, label: "Professional background" }] : []),
    ...(profile.modules.qualifications
      ? [{ value: "qualifications" as const, label: "Qualification evidence" }] : []),
  ];
  const tab = sections.some(section => section.value === requestedTab) ? requestedTab : "overview";
  const connectionTitle = profile.kind === "Teacher" ? "Teaching assignments" : "School connections";
  return <PageFrame width="wide"><RecordLayout header={<RecordHeader eyebrow="People" title={profile.name} subtitle={profile.kind} focusOnMount
    leading={<ProfilePhoto personId={profile.personId} name={profile.name} revision={revision} readPhoto={getProfilePhoto}/>}
    actions={profile.modules.photo && tab !== "edit" && <Button asChild variant="outline"><Link to="/profiles" search={{person:profile.personId,tab:"edit"}}>Edit profile</Link></Button>}/ >}
    navigation={sections.map(section => <SectionTab key={section.value} current={tab === section.value}
      link={{to:"/profiles",search:{person:profile.personId,tab:section.value}}}>{section.label}</SectionTab>)} main={<>
    {tab === "edit" && profile.modules.photo && <WorkspacePanel title="Profile picture">
      <ProfilePhotoEditor personId={profile.personId} name={profile.name} revision={revision} changed={() => setRevision(value => value + 1)}
        createUploadTask={createPhotoUploadTask} deletePhoto={() => removeProfilePhoto()} readPhoto={getProfilePhoto}/>
    </WorkspacePanel>}
    {tab === "edit" && profile.modules.personal && <StudentProfileSetup/>}
    {(tab === "overview" || tab === "connections") && <WorkspacePanel title={connectionTitle}
      actions={tab === "overview" && profile.sections.length > 0 && <Link to="/profiles" search={{person:profile.personId,tab:"connections"}} className="text-sm text-primary underline underline-offset-4">View all {plural(profile.sections.length, "connection")}</Link>}>
      <ul className="divide-y">{(tab === "overview" ? profile.sections.slice(0,3) : profile.sections).map(section=><li key={section.id} className="py-4 text-sm first:pt-0 last:pb-0">
        {["teacher","student"].includes(profile.viewerRole)?<Link to="/classes" search={{section:section.id}} className="underline">{section.title}</Link>:<span>{section.title}</span>}
      </li>)}</ul>
      {!profile.sections.length&&<p className="text-sm text-muted-foreground">No active class relationships are recorded in this membership.</p>}
    </WorkspacePanel>}
    {tab === "background" && profile.modules.professional && <TeacherProfessionalProfile/>}
    {tab === "qualifications" && profile.modules.qualifications && <Qualifications/>}
  </>}/></PageFrame>;
}
