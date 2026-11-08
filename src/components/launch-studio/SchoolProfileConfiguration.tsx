import { useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { useWorkspaceMutation } from "@/hooks/useWorkspaceMutation";
import { mutationErrorMessage } from "@/lib/mutation-feedback";
import { Button } from "@/components/ui/button";
import { LaunchSiteIdentityEditor } from "@/components/operations/LaunchSiteIdentityEditor";
import { LaunchSiteAddressEditor } from "@/components/operations/LaunchSiteAddressEditor";
import { LaunchSiteContactEditor } from "@/components/operations/LaunchSiteContactEditor";
import { updateLaunchSiteIdentity, updateLaunchSiteAddress, updateLaunchSiteContact } from "@/modules/programs/site-configuration.functions";
import type { SchoolHubOptions } from "./SchoolLaunchHub";
/** Same revision-checked Site editors and commands used during Launch. */
export function SchoolProfileConfiguration({site}:{site:SchoolHubOptions["sites"][number]}) {
 const router=useRouter();const [notice,setNotice]=useState("");
 const mutation=useWorkspaceMutation({mutationFn:(operation:()=>Promise<unknown>)=>operation(),invalidateRouter:()=>router.invalidate()});
 const busy=mutation.isSubmitting||Boolean(mutation.refreshError);
 async function save(operation:()=>Promise<unknown>){
  setNotice("");
  const result=await mutation.submit(operation).catch(error=>{
   throw new Error(mutationErrorMessage(error,"Unable to save school configuration. Refresh the record before retrying."));
  });
  if(result.status==="ignored")return;
  if(result.refreshError)throw new Error("The change was saved, but fresh records could not load. Retry refresh before saving again.");
  setNotice("School configuration saved. Publication and independent review requirements remain separate.");
 }
 return <section className="mt-6 space-y-5" aria-label="School profile configuration">
  <LaunchSiteIdentityEditor key={`identity:${site.updatedAt}`} initial={{name:site.name,timezone:site.timezone,slug:site.slug}} revision={site.updatedAt} busy={busy} save={(identity,expectedRevision,changeReason)=>save(()=>updateLaunchSiteIdentity({data:{siteId:site.id,...identity,expectedRevision,changeReason}}))}/>
  <LaunchSiteAddressEditor key={`address:${site.updatedAt}`} initial={site.address} revision={site.updatedAt} busy={busy} published={site.websiteDraft?.status==="published"} save={(address,expectedRevision,changeReason)=>save(()=>updateLaunchSiteAddress({data:{siteId:site.id,expectedRevision,changeReason,address:{...address,street2:address.street2||undefined,county:address.county||undefined}}}))}/>
  <LaunchSiteContactEditor key={`contact:${site.updatedAt}`} initial={site.contactDraft} revision={site.updatedAt} busy={busy} save={(contact,expectedRevision)=>save(()=>updateLaunchSiteContact({data:{siteId:site.id,contact,expectedRevision}}))}/>
  {notice&&<p role="status" className="border bg-card p-4 text-sm">{notice}</p>}
  {mutation.refreshError&&<Button variant="outline" disabled={mutation.isSubmitting} onClick={()=>void mutation.retryRefresh()}>Retry saved configuration refresh</Button>}
 </section>;
}
