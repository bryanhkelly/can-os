import { mutationErrorMessage } from "@/lib/mutation-feedback";
import { Button } from "@/components/ui/button";
import {useState} from "react";
import {getWorkspaceSession} from "@/modules/identity/workspace-session.functions";
import {launchWebsiteHandoffGrant} from "@/domain/launch-website-handoff";
import {useQueryClient} from "@tanstack/react-query";
import {switchVerifiedMembership} from "@/lib/workspace-membership-switch";

/** Reuse verified membership selection; this never creates an editor grant. */
export function LaunchWebsiteEditorHandoff({siteId,programId,returnGrantId,destination="editor"}:{
 siteId:string;programId:string;returnGrantId?:string;destination?:"editor"|"launch";
}){
 const queryClient=useQueryClient();
 const [busy,setBusy]=useState(false),[error,setError]=useState("");
 async function open(){
  if(busy)return;setBusy(true);setError("");
  try{
   const {session,error:sessionError}=await getWorkspaceSession();
   if(sessionError||!session?.authenticated)throw new Error("Sign in to an authorized school workspace before continuing.");
   const grant=launchWebsiteHandoffGrant(session.grants,{activeGrantId:session.activeGrantId,siteId,destination,returnGrantId});
   if(!grant)throw new Error(destination==="editor"
    ?"Your current account has no matching church website editor assignment. Invite your church's editor below, or use Switch workspace to select an independently authorized editor."
    :"The original school setup membership is unavailable. Use Switch workspace to select an authorized school registrar.");
   const query=new URLSearchParams({siteId,programId});
   if(destination==="editor")query.set("returnGrantId",session.activeGrantId);
    await switchVerifiedMembership({grants:session.grants,activeGrantId:session.activeGrantId,
     grantId:grant.id,queryClient,
     redirectTo:`${destination==="editor"?"/launch/website":"/launch/school"}?${query.toString()}`});
  }catch(cause){setError(mutationErrorMessage(cause, "The website workspace could not be opened."));setBusy(false);}
 }
 return <span className="inline-block">
  <Button type="button" variant="outline" disabled={busy} onClick={()=>void open()} className="rounded border px-3 py-2 text-sm font-semibold disabled:opacity-50">{busy?"Opening verified workspace…":destination==="editor"?"Edit church-owned website content":"Return to school setup"}</Button>
  {error&&<span role="alert" className="mt-2 block max-w-xl text-sm font-normal">{error}</span>}
 </span>;
}
