import {createFileRoute,Link} from "@tanstack/react-router";
import {useState} from "react";
import { accessFormErrors, safeAccessReturnTo } from "@/domain/access-navigation";
import {isDemoAccountEmail} from "@/domain/local-demo-access";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { WorkspacePanel, WorkspaceShell } from "@/components/workspace";
import { useHydrated } from "@/lib/use-hydrated";
import {clearLearnerBrowserState} from "@/domain/session-client";
export const Route=createFileRoute("/access/")({
 validateSearch:(search:Record<string,unknown>):{email?:string;error?:keyof typeof accessFormErrors;returnTo?:string}=>({
  email:typeof search.email==="string"?search.email:undefined,
  returnTo:safeAccessReturnTo(search.returnTo),
  error:typeof search.error==="string"&&Object.hasOwn(accessFormErrors,search.error)?search.error as keyof typeof accessFormErrors:undefined,
 }),
 component:AccessPage,
});
function AccessPage(){
 const search=Route.useSearch();
 const[email,setEmail]=useState(search.email??"");
 const[code,setCode]=useState("");
 const[status,setStatus]=useState("");
 const[busy,setBusy]=useState(false);
 const hydrated=useHydrated();
 const isDemoEmail=isDemoAccountEmail(email);
 const verifyAction=search.returnTo
 ?`/access/verify?returnTo=${encodeURIComponent(search.returnTo)}`:"/access/verify";
 async function submit(e:React.FormEvent<HTMLFormElement>){
  if(isDemoEmail){clearLearnerBrowserState();setBusy(true);return;}
  e.preventDefault();setBusy(true);setStatus("");
  try{
   const response=await fetch("/access/request",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email,returnTo:search.returnTo})});
   if(response.status===429){setStatus("Too many sign-in requests right now. Please try again shortly.");return;}
   if(response.status===503){setStatus("Sign-in is temporarily unavailable. Please try again shortly.");return;}
   if(!response.ok){setStatus("Unable to send a link. Please check your email address or try again.");return;}
   setStatus("If this email has a CAN OS account, a one-time access link has been sent.");
  }catch{setStatus("Sign-in is temporarily unavailable. Please try again shortly.");}finally{setBusy(false);}
 }
 return <WorkspaceShell width="reading" eyebrow="CAN OS" title="Access CAN OS"
  subtitle="Sign in with your CAN identity, across schools, learning centers and programs.">
 <WorkspacePanel title="Sign in" className="mx-auto mt-6 max-w-md">
  <form action={verifyAction} method="post" onSubmit={submit} aria-busy={!hydrated||busy} className="space-y-4">
   <input type="hidden" name="returnTo" value={search.returnTo??""}/>
   <fieldset disabled={!hydrated||(!isDemoEmail&&busy)} className="space-y-4">
    <Field label="Email" required><Input name="email" type="email" autoComplete="email" value={email} onChange={e=>{setEmail(e.target.value);setCode("");}}/></Field>
    {isDemoEmail&&<Field label="Access code" required><Input name="code" type="password" autoComplete="one-time-code" value={code} onChange={e=>setCode(e.target.value)}/></Field>}
    <Button disabled={!hydrated||busy} type="submit" className="w-full">{!hydrated?"Preparing sign-in…":busy?isDemoEmail?"Signing in…":"Sending access link…":isDemoEmail?"Sign in":"Email me an access link"}</Button>
   </fieldset>
  </form>
  <p role="status" className="mt-4 text-sm">{status||(search.error?accessFormErrors[search.error]:"")}</p>
  <div className="mt-6 space-y-4 border-t pt-4">
    <p className="text-sm"><Button asChild variant="outline" className="w-full"><Link to="/access/register" search={search.returnTo ? {returnTo:search.returnTo} : {}}>Create a personal CAN account</Link></Button></p>
    <p className="text-sm"><Button asChild variant="outline" className="w-full"><Link to="/schools/new">Create a school</Link></Button></p>
    <p className="text-sm"><Link to="/explore/" className="text-primary underline underline-offset-4">Explore programs and locations</Link></p>
   <p className="text-sm text-muted-foreground">For demonstrations, use only synthetic accounts and data. Shared changes may be visible to other participants.</p>
  </div>
 </WorkspacePanel>
 </WorkspaceShell>;
}
