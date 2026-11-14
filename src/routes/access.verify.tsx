import {createFileRoute} from "@tanstack/react-router";
import {createServerOnlyFn} from "@tanstack/react-start";
import {useEffect,useState} from "react";
import {InvalidAccessCredentialError,logAuthenticationUnavailable} from "@/domain/access-errors";
import { accessLandingPath, accessReturnCookieHeader, safeAccessReturnTo } from "@/domain/access-navigation";
import {AuthorizationError} from "@/domain/command-context";
import {classifySessionDevice} from "@/domain/session-device";
import {clearLearnerBrowserState} from "@/domain/session-client";
export const Route=createFileRoute("/access/verify")({
 validateSearch:(search:Record<string,unknown>)=>({returnTo:safeAccessReturnTo(search.returnTo)}),
 server:{handlers:{
  POST:createServerOnlyFn(async({request})=>{
   const nativeForm=request.headers.get("content-type")?.split(";")[0]?.trim()==="application/x-www-form-urlencoded";
   const requestReturnTo=safeAccessReturnTo(new URL(request.url).searchParams.get("returnTo"));
   const formFailure=(error:"invalid"|"unavailable"|"rate_limited",returnTo=requestReturnTo)=>{
    const query=new URLSearchParams({error});
    if(returnTo)query.set("returnTo",returnTo);
    return new Response(null,{status:303,
     headers:{Location:"/access?"+query.toString(),"Cache-Control":"no-store","Referrer-Policy":"no-referrer"}});
   };
   if(new URL(request.url).origin!==request.headers.get("origin"))return Response.json({error:"Invalid request origin"},{status:403});
   // Enforce the shared global admission ceiling before parsing credentials.
   // Do not derive rate keys from untrusted forwarded headers, email or tokens.
   try {
    const gate=await import("@/modules/identity/anonymous-auth-admission.server");
    const denial=gate.anonymousAuthAdmissionResponse(await gate.admitAnonymousAuthRequest("verify"));
    if(denial)return nativeForm?formFailure(denial.status===429?"rate_limited":"unavailable"):denial;
   }catch{
    logAuthenticationUnavailable("admission");
    if(nativeForm)return formFailure("unavailable");
    return Response.json({error:"Authentication temporarily unavailable."},
     {status:503,headers:{"Cache-Control":"no-store","Retry-After":"30"}});
   }
   let value:unknown;
   try{
    if(nativeForm){const form=await request.formData();value={email:form.get("email"),code:form.get("code"),token:form.get("token"),returnTo:form.get("returnTo")};}
    else value=await request.json();
   }catch{return nativeForm?formFailure("invalid"):Response.json({error:"Invalid request"},{status:400});}
   const payload=value&&typeof value==="object"?value:null;
   const returnTo=payload&&"returnTo" in payload?safeAccessReturnTo(payload.returnTo)??requestReturnTo:requestReturnTo;
   try{
    const result=payload&&"email" in payload&&typeof payload.email==="string"&&"code" in payload&&typeof payload.code==="string"
     ?await (await import("@/modules/identity/passwordless-access.server")).redeemLocalDemoAccess(payload.email,payload.code,classifySessionDevice(request))
     :payload&&"token" in payload&&typeof payload.token==="string"
      ?await (await import("@/modules/identity/passwordless-access.server")).redeemOneTimeAccess(payload.token,classifySessionDevice(request))
      :null;
    if(!result)return nativeForm?formFailure("invalid"):Response.json({error:"Invalid request"},{status:400});
    if(nativeForm){
     const landing=accessLandingPath(result.role,"launchSiteId" in result&&typeof result.launchSiteId==="string"?result.launchSiteId:undefined,returnTo,
      "homeSiteId" in result&&typeof result.homeSiteId==="string"?result.homeSiteId:undefined);
     const headers=new Headers({
      Location:landing,
      "Cache-Control":"no-store","Referrer-Policy":"no-referrer",
     });
     headers.append("Set-Cookie",result.setCookie);
     // Arm one-shot return recovery only when the user is actually sent to the saved page.
     headers.append("Set-Cookie",accessReturnCookieHeader(landing===returnTo?returnTo:undefined,new URL(request.url).protocol==="https:"));
     return new Response(null,{status:303,headers});
    }
    return new Response(JSON.stringify({ok:true,role:result.role,...("launchSiteId" in result && result.launchSiteId ? {launchSiteId:result.launchSiteId} : {}),...("homeSiteId" in result && result.homeSiteId ? {homeSiteId:result.homeSiteId} : {})}),{headers:{"Content-Type":"application/json","Set-Cookie":result.setCookie,"Cache-Control":"no-store","Referrer-Policy":"no-referrer"}});
   }catch(error){
    if(!(error instanceof InvalidAccessCredentialError)&&!(error instanceof AuthorizationError)){
     logAuthenticationUnavailable("verification",error);
     if(nativeForm)return formFailure("unavailable",returnTo);
     return Response.json({error:"Authentication temporarily unavailable."},
      {status:503,headers:{"Cache-Control":"no-store","Retry-After":"30"}});
    }
    // The credential was not accepted; no account/person may be inferred from
    // an arbitrary token or demo-code attempt. Record only a bounded anonymous
    // rejection, never email, token, IP or request data.
    const method=payload&&"email" in payload&&"code" in payload
     ?"local_demo_code":"email_link";
    try {
     const {recordRejectedAuthentication}=await import("@/modules/identity/authentication-rejections.server");
     await recordRejectedAuthentication(method);
    }catch{
     logAuthenticationUnavailable("rejection_audit");
    }
    if(nativeForm)return formFailure("invalid",returnTo);
    return Response.json({error:"Invalid or expired access link"},
     {status:401,headers:{"Cache-Control":"no-store"}});
   }
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
 return <main className="mx-auto max-w-lg space-y-5 px-6 py-16">
  <h1 className="font-serif text-3xl">Confirm your CAN OS access</h1>
  <p role="status">{ready&&!token?"The access link is missing. Request a new sign-in link to continue.":"Use the button to complete your sign-in."}</p>
  <form action={verifyAction} method="post" onSubmit={()=>{clearLearnerBrowserState();setWorking(true);}}>
  <input type="hidden" name="token" value={token??""}/>
  <input type="hidden" name="returnTo" value={search.returnTo??""}/>
  <button type="submit" disabled={working||!ready||!token} className="rounded-lg bg-foreground px-5 py-3 text-background disabled:opacity-50">Sign in securely</button>
  </form>
 </main>;
}
