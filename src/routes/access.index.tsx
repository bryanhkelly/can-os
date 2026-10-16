import {createFileRoute} from "@tanstack/react-router";
import {useState} from "react";
export const Route=createFileRoute("/access/")({component:AccessPage});
function AccessPage(){
 const[email,setEmail]=useState("");
 const[status,setStatus]=useState("");
 const[busy,setBusy]=useState(false);
 async function submit(e:React.FormEvent<HTMLFormElement>){
  e.preventDefault();setBusy(true);setStatus("");
  try{
   const response=await fetch("/access/request",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email})});
   if(!response.ok){setStatus("Unable to send a link. Please check your email address or try again.");return;}
   setStatus("If this email has a CAN OS account, a one-time access link has been sent.");
  }catch{setStatus("Unable to send a link right now.");}finally{setBusy(false);}
 }
 return <main className="mx-auto max-w-md space-y-6 px-6 py-16">
  <h1 className="font-serif text-4xl">Access CAN OS</h1>
  <p>Enter the email address associated with your invited CAN OS account.</p>
  <form onSubmit={submit} className="space-y-4">
   <label className="block space-y-1"><span>Email</span><input required type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} className="w-full rounded-lg border bg-background p-3"/></label>
   <button disabled={busy} type="submit" className="rounded-lg bg-foreground px-5 py-3 text-background disabled:opacity-50">Email me an access link</button>
  </form>
  <p role="status">{status}</p>
  <p className="text-sm text-muted-foreground">For demonstrations, use only synthetic accounts and data. Shared changes may be visible to other participants.</p>
 </main>;
}
