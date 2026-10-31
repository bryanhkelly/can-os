import {createFileRoute} from "@tanstack/react-router";
import {useEffect,useState} from "react";
export const Route=createFileRoute("/access/verify")({
 server:{handlers:{
  POST:async({request})=>{
   if(new URL(request.url).origin!==request.headers.get("origin"))return Response.json({error:"Invalid request origin"},{status:403});
   // Enforce the shared global admission ceiling before parsing credentials.
   // Do not derive rate keys from untrusted forwarded headers, email or tokens.
   try {
    const gate=await import("@/modules/identity/anonymous-auth-admission.server");
    const denial=gate.anonymousAuthAdmissionResponse(await gate.admitAnonymousAuthRequest("verify"));
    if(denial)return denial;
   }catch{
    return Response.json({error:"Authentication temporarily unavailable."},
     {status:503,headers:{"Cache-Control":"no-store","Retry-After":"30"}});
   }
   let value:unknown;
   try{value=await request.json();}catch{return Response.json({error:"Invalid request"},{status:400});}
   const payload=value&&typeof value==="object"?value:null;
   try{
    const {redeemLocalDemoAccess,redeemOneTimeAccess}=await import("@/modules/identity/passwordless-access.server");
    const result=payload&&"email" in payload&&typeof payload.email==="string"&&"code" in payload&&typeof payload.code==="string"
     ?await redeemLocalDemoAccess(payload.email,payload.code)
     :payload&&"token" in payload&&typeof payload.token==="string"
      ?await redeemOneTimeAccess(payload.token)
      :null;
    if(!result)return Response.json({error:"Invalid request"},{status:400});
    return new Response(JSON.stringify({ok:true,role:result.role,...("launchSiteId" in result && result.launchSiteId ? {launchSiteId:result.launchSiteId} : {})}),{headers:{"Content-Type":"application/json","Set-Cookie":result.setCookie,"Cache-Control":"no-store","Referrer-Policy":"no-referrer"}});
   }catch{
    // The credential was not accepted; no account/person may be inferred from
    // an arbitrary token or demo-code attempt. Record only a bounded anonymous
    // rejection, never email, token, IP or request data.
    const method=payload&&"email" in payload&&"code" in payload
     ?"local_demo_code":"email_link";
    try {
     const {recordRejectedAuthentication}=await import("@/modules/identity/authentication-rejections.server");
     await recordRejectedAuthentication(method);
    }catch{
     // A failure to emit audit evidence never changes the generic denial.
    }
    return Response.json({error:"Invalid or expired access link"},
     {status:401,headers:{"Cache-Control":"no-store"}});
   }
  },
 }},
 component:VerifyAccess,
});
function VerifyAccess(){
 const [status,setStatus]=useState("Use the button to complete your sign-in.");
 const [working,setWorking]=useState(false);
 const [token,setToken]=useState<string|null>(null);
 const [ready,setReady]=useState(false);
 useEffect(()=>{const fragment=new URLSearchParams(window.location.hash.slice(1)).get("token");const legacy=new URLSearchParams(window.location.search).get("token");const value=fragment??legacy;setToken(value);if(value)window.history.replaceState(null,"","/access/verify");setReady(true);},[]);
 async function verify(){
  setWorking(true);
  try{
   if(!token){setStatus("Access link is missing.");return;}
   const res=await fetch("/access/verify",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token})});
   if(res.status===429){setStatus("Sign-in requests are temporarily limited. Please try again shortly.");return;}
   if(res.status===503){setStatus("Sign-in is temporarily unavailable. Please try again shortly.");return;}
   if(!res.ok){setStatus("This access link is invalid or expired.");return;}
   setToken(null);
   const body=await res.json() as {role?:string;launchSiteId?:string};
   const home:Record<string,string>={student:"/student",teacher:"/teacher/missing-work",guardian:"/guardian/academics",registrar:"/admissions",specialist:"/coach",counselor:"/counselor"};
   window.location.replace(body.role==="registrar" && body.launchSiteId
    ? "/operations/launch?siteId="+encodeURIComponent(body.launchSiteId)
    : home[body.role??""]??"/access");
  }catch{setStatus("Unable to complete sign-in.");}finally{setWorking(false);}
 }
 return <main className="mx-auto max-w-lg space-y-5 px-6 py-16">
  <h1 className="font-serif text-3xl">Confirm your CAN OS access</h1>
  <p role="status">{status}</p>
  <button disabled={working||!ready||!token} onClick={verify} className="rounded-lg bg-foreground px-5 py-3 text-background disabled:opacity-50">Sign in securely</button>
 </main>;
}
