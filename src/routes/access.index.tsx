import {createFileRoute,Link} from "@tanstack/react-router";
import {useState} from "react";
import { accessFormErrors } from "@/domain/access-navigation";
import {LOCAL_DEMO_ACCOUNTS} from "@/domain/local-demo-access";
export const Route=createFileRoute("/access/")({
 validateSearch:(search:Record<string,unknown>):{error?:keyof typeof accessFormErrors}=>({error:typeof search.error==="string"&&Object.hasOwn(accessFormErrors,search.error)?search.error as keyof typeof accessFormErrors:undefined}),
 component:AccessPage,
});
function AccessPage(){
 const search=Route.useSearch();
 const[email,setEmail]=useState("");
 const[code,setCode]=useState("");
 const[status,setStatus]=useState("");
 const[busy,setBusy]=useState(false);
 const isDemoEmail=LOCAL_DEMO_ACCOUNTS.some(account=>account.email===email.trim().toLowerCase());
 async function submit(e:React.FormEvent<HTMLFormElement>){
  if(isDemoEmail){setBusy(true);return;}
  e.preventDefault();setBusy(true);setStatus("");
  try{
   const response=await fetch("/access/request",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email})});
   if(response.status===429){setStatus("Too many sign-in requests right now. Please try again shortly.");return;}
   if(response.status===503){setStatus("Sign-in is temporarily unavailable. Please try again shortly.");return;}
   if(!response.ok){setStatus("Unable to send a link. Please check your email address or try again.");return;}
   setStatus("If this email has a CAN OS account, a one-time access link has been sent.");
  }catch{setStatus("Sign-in is temporarily unavailable. Please try again shortly.");}finally{setBusy(false);}
 }
 return <main className="mx-auto max-w-md space-y-6 px-6 py-16">
  <h1 className="font-serif text-4xl">Access CAN OS</h1>
  <p>Enter the email address associated with your invited CAN OS account.</p>
  <form action="/access/verify" method="post" onSubmit={submit} className="space-y-4">
   <label className="block space-y-1"><span>Email</span><input name="email" required type="email" autoComplete="email" value={email} onChange={e=>{setEmail(e.target.value);setCode("");}} className="w-full rounded-lg border bg-background p-3"/></label>
   {isDemoEmail&&<label className="block space-y-1"><span>Demo access code (000000)</span><input name="code" required type="password" autoComplete="one-time-code" value={code} onChange={e=>setCode(e.target.value)} className="w-full rounded-lg border bg-background p-3"/></label>}
   <button disabled={busy} type="submit" className="rounded-lg bg-foreground px-5 py-3 text-background disabled:opacity-50">{isDemoEmail?"Sign in":"Email me an access link"}</button>
  </form>
  <p role="status">{status||(search.error?accessFormErrors[search.error]:"")}</p>
  <p className="text-sm"><Link to="/church/apply" className="font-semibold underline">Church leader? Request to launch a school →</Link></p>
  <p className="text-sm text-muted-foreground">For demonstrations, use only synthetic accounts and data. Shared changes may be visible to other participants.</p>
 </main>;
}
