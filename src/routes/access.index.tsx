import {createFileRoute,Link} from "@tanstack/react-router";
import {useState} from "react";
import {LOCAL_DEMO_ACCOUNTS} from "@/domain/local-demo-access";
export const Route=createFileRoute("/access/")({component:AccessPage});
function AccessPage(){
 const[email,setEmail]=useState("");
 const[code,setCode]=useState("");
 const[status,setStatus]=useState("");
 const[busy,setBusy]=useState(false);
 const isLocalDemoEmail=import.meta.env.DEV&&LOCAL_DEMO_ACCOUNTS.some(account=>account.email===email.trim().toLowerCase());
 async function submit(e:React.FormEvent<HTMLFormElement>){
  e.preventDefault();setBusy(true);setStatus("");
  try{
   if(isLocalDemoEmail){
    const response=await fetch("/access/verify",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email,code})});
    if(response.status===429){setStatus("Sign-in requests are temporarily limited. Please try again shortly.");return;}
    if(response.status===503){setStatus("Sign-in is temporarily unavailable. Please try again shortly.");return;}
    if(!response.ok){setStatus("The access code is invalid or local demo sign-in is disabled.");return;}
    const body=await response.json() as {role?:string};
    const home:Record<string,string>={student:"/student",teacher:"/teacher/missing-work",guardian:"/guardian",registrar:"/admissions",specialist:"/coach",counselor:"/counselor"};
    window.location.replace(home[body.role??""]??"/access");
    return;
   }
   const response=await fetch("/access/request",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email})});
   if(response.status===429){setStatus("Too many sign-in requests right now. Please try again shortly.");return;}
   if(response.status===503){setStatus("Sign-in is temporarily unavailable. Please try again shortly.");return;}
   if(!response.ok){setStatus("Unable to send a link. Please check your email address or try again.");return;}
   setStatus("If this email has a CAN OS account, a one-time access link has been sent.");
  }catch{setStatus("Unable to send a link right now.");}finally{setBusy(false);}
 }
 return <main className="mx-auto max-w-md space-y-6 px-6 py-16">
  <h1 className="font-serif text-4xl">Access CAN OS</h1>
  <p>Enter the email address associated with your invited CAN OS account.</p>
  <form onSubmit={submit} className="space-y-4">
   <label className="block space-y-1"><span>Email</span><input required type="email" autoComplete="email" value={email} onChange={e=>{setEmail(e.target.value);setCode("");}} className="w-full rounded-lg border bg-background p-3"/></label>
   {isLocalDemoEmail&&<label className="block space-y-1"><span>Access code</span><input required type="password" autoComplete="one-time-code" value={code} onChange={e=>setCode(e.target.value)} className="w-full rounded-lg border bg-background p-3"/></label>}
   <button disabled={busy} type="submit" className="rounded-lg bg-foreground px-5 py-3 text-background disabled:opacity-50">{isLocalDemoEmail?"Sign in":"Email me an access link"}</button>
  </form>
  <p role="status">{status}</p>
  <p className="text-sm"><Link to="/church/apply" className="font-semibold underline">Church leader? Request to launch a school →</Link></p>
  <p className="text-sm text-muted-foreground">For demonstrations, use only synthetic accounts and data. Shared changes may be visible to other participants.</p>
 </main>;
}
