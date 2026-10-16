import {createFileRoute} from "@tanstack/react-router";
import {useEffect,useState} from "react";
import {redeemOneTimeAccess} from "@/modules/identity/passwordless-access.server";
export const Route=createFileRoute("/access/verify")({
 server:{handlers:{
  POST:async({request})=>{
   if(new URL(request.url).origin!==request.headers.get("origin"))return Response.json({error:"Invalid request origin"},{status:403});
   let value:unknown;
   try{value=await request.json();}catch{return Response.json({error:"Invalid request"},{status:400});}
   const token=value&&typeof value==="object"&&"token" in value?(value as {token:unknown}).token:null;
   if(typeof token!=="string")return Response.json({error:"Invalid request"},{status:400});
   try{
    const result=await redeemOneTimeAccess(token);
    return new Response(JSON.stringify({ok:true,role:result.role}),{headers:{"Content-Type":"application/json","Set-Cookie":result.setCookie,"Cache-Control":"no-store","Referrer-Policy":"no-referrer"}});
   }catch{return Response.json({error:"Invalid or expired access link"},{status:401});}
  },
 }},
 component:VerifyAccess,
});
function VerifyAccess(){
 const [status,setStatus]=useState("Use the button to complete your sign-in.");
 const [working,setWorking]=useState(false);
 const [token,setToken]=useState<string|null>(null);
 useEffect(()=>{const value=new URLSearchParams(window.location.search).get("token");setToken(value);if(value)window.history.replaceState(null,"","/access/verify");},[]);
 async function verify(){
  setWorking(true);
  try{
   if(!token){setStatus("Access link is missing.");return;}
   const res=await fetch("/access/verify",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token})});
   if(!res.ok){setStatus("This access link is invalid or expired.");return;}
   const body=await res.json() as {role?:string};
   const home:Record<string,string>={student:"/student",teacher:"/teacher/missing-work",guardian:"/admissions/families",registrar:"/admissions",specialist:"/student/support"};
   window.location.replace(home[body.role??""]??"/access");
  }catch{setStatus("Unable to complete sign-in.");}finally{setWorking(false);}
 }
 return <main className="mx-auto max-w-lg space-y-5 px-6 py-16">
  <h1 className="font-serif text-3xl">Confirm your CAN OS access</h1>
  <p role="status">{status}</p>
  <button disabled={working} onClick={verify} className="rounded-lg bg-foreground px-5 py-3 text-background disabled:opacity-50">Sign in securely</button>
 </main>;
}
