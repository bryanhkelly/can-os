import {useState} from "react";
import {getWorkspaceSession} from "@/modules/identity/workspace-session.functions";
import {launchWebsiteHandoffGrant} from "@/domain/launch-website-handoff";

/** Reuse verified membership selection; this never creates an editor grant. */
export function LaunchWebsiteEditorHandoff({siteId,programId,returnGrantId,destination="editor"}:{
 siteId:string;programId:string;returnGrantId?:string;destination?:"editor"|"launch";
}){
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
   if(grant.id!==session.activeGrantId){
    const response=await fetch("/access/session",{method:"POST",credentials:"same-origin",
     headers:{"Content-Type":"application/json"},body:JSON.stringify({grantId:grant.id})});
    if(!response.ok)throw new Error("The verified workspace could not be selected. No website changes were made.");
   }
   // A full navigation clears the previous membership's mounted state/caches.
   window.location.assign(`${destination==="editor"?"/site-website":"/operations/launch"}?${query.toString()}`);
  }catch(cause){setError(cause instanceof Error?cause.message:"The website workspace could not be opened.");setBusy(false);}
 }
 return <span className="inline-block">
  <button type="button" disabled={busy} onClick={()=>void open()} className="rounded border px-3 py-2 text-sm font-semibold disabled:opacity-50">{busy?"Opening verified workspace…":destination==="editor"?"Edit church-owned website content":"Return to school setup"}</button>
  {error&&<span role="alert" className="mt-2 block max-w-xl text-sm font-normal">{error}</span>}
 </span>;
}
