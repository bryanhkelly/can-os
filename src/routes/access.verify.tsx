import {createFileRoute,Link} from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { WorkspaceNotice, WorkspacePanel, WorkspaceShell } from "@/components/workspace";
import {createServerOnlyFn} from "@tanstack/react-start";
import {useEffect,useState} from "react";
import {safeAccessReturnTo} from "@/domain/access-navigation";
import {clearLearnerBrowserState} from "@/domain/session-client";
export const Route=createFileRoute("/access/verify")({
 validateSearch:(search:Record<string,unknown>)=>({returnTo:safeAccessReturnTo(search.returnTo)}),
 server:{handlers:{
  POST:createServerOnlyFn(async({request})=>{
   const {handleAccessVerification}=await import("@/modules/identity/access-http.server");
   return handleAccessVerification(request);
  }),
 }},
 component:VerifyAccess,
});
function VerifyAccess(){
 const search=Route.useSearch();
 const [working,setWorking]=useState(false);
 const [token,setToken]=useState<string|null>(null);
 const [ready,setReady]=useState(false);
 const verifyAction=search.returnTo
  ?`/access/verify?returnTo=${encodeURIComponent(search.returnTo)}`:"/access/verify";
 useEffect(()=>{
  const fragment=new URLSearchParams(window.location.hash.slice(1)).get("token");
  const legacy=new URLSearchParams(window.location.search).get("token");
  const value=fragment??legacy;
  if(value){
   setToken(value);
   window.history.replaceState(null,"","/access/verify");
  }
  setReady(true);
 },[]);
 return <WorkspaceShell width="reading" eyebrow="Access" title="Confirm your CAN OS access"
   subtitle="Complete the secure sign-in using your one-time access link.">
   <WorkspacePanel title="Verify your access" className="mt-6">
     <div className="space-y-5">
       {ready&&!token?<WorkspaceNotice tone="attention">The access link is missing. Request a new sign-in link to continue.</WorkspaceNotice>:
         <p role="status" className="text-sm text-muted-foreground">{ready?"Use the button to complete your sign-in.":"Preparing secure sign-in…"}</p>}
       <form action={verifyAction} method="post" aria-busy={working} onSubmit={event=>{if(working||!ready||!token){event.preventDefault();return;}clearLearnerBrowserState();setWorking(true);}}
         className="space-y-4">
         <input type="hidden" name="token" value={token??""}/>
         <input type="hidden" name="returnTo" value={search.returnTo??""}/>
         <Button type="submit" disabled={working||!ready||!token}
           loading={working} loadingLabel="Signing in securely…">Sign in securely</Button>
       </form>
       {ready&&!token&&<Button asChild variant="outline"><Link to="/access" search={{returnTo:search.returnTo}}>Request a new sign-in link</Link></Button>}
     </div>
   </WorkspacePanel>
 </WorkspaceShell>;
}
