import {InvalidAccessCredentialError,logAuthenticationUnavailable} from "@/domain/access-errors";
import {accessLandingPath,accessReturnCookieHeader,safeAccessReturnTo} from "@/domain/access-navigation";
import {AuthorizationError} from "@/domain/command-context";
import {readTrustedSessionDevice} from "./trusted-session-device.server";
import {revokePresentedAccessSession} from "./passwordless-access.server";

/** Shared Web Request handlers: original admission, challenge redemption, device
 * classification and session revocation. No additional identity mechanism. */

export async function handleAccessRequest(request:Request):Promise<Response>{
   if(new URL(request.url).origin!==request.headers.get("origin"))return Response.json({error:"Invalid request origin"},{status:403});
   // Protect the anonymous email-link endpoint regardless of account
   // existence. This is a shared emergency cap, not per-client protection.
   try {
    const gate=await import("@/modules/identity/anonymous-auth-admission.server");
    const denial=gate.anonymousAuthAdmissionResponse(await gate.admitAnonymousAuthRequest("request"));
    if(denial)return denial;
   }catch{
    logAuthenticationUnavailable("admission");
    return Response.json({error:"Authentication temporarily unavailable."},
     {status:503,headers:{"Cache-Control":"no-store","Retry-After":"30"}});
   }
   let payload:unknown;
   try{payload=await request.json();}catch{return Response.json({error:"Invalid request"},{status:400});}
   const email=(payload && typeof payload==="object" && "email" in payload)?(payload as {email:unknown}).email:null;
   if(typeof email!=="string")return Response.json({error:"Invalid request"},{status:400});
   const returnTo=payload&&typeof payload==="object"&&"returnTo" in payload
    ?safeAccessReturnTo(payload.returnTo):undefined;
   try{
    await (await import("@/modules/identity/passwordless-access.server")).requestOneTimeAccess(email,undefined,returnTo);
    return Response.json({accepted:true},{headers:{"Cache-Control":"no-store"}});
   }catch(error){
    if(error instanceof Error && error.message==="Invalid email address")return Response.json({error:"Invalid email"},{status:400});
    logAuthenticationUnavailable("email_request");
    // Do not reveal which addresses have a CAN OS account via delivery/config errors.
    return Response.json({accepted:true},{headers:{"Cache-Control":"no-store"}});
   }
}

export async function handleAccessVerification(request:Request):Promise<Response>{
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
     ?await (await import("@/modules/identity/passwordless-access.server")).redeemLocalDemoAccess(payload.email,payload.code,await readTrustedSessionDevice(request))
     :payload&&"token" in payload&&typeof payload.token==="string"
      ?await (await import("@/modules/identity/passwordless-access.server")).redeemOneTimeAccess(payload.token,await readTrustedSessionDevice(request))
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
     ?(typeof payload.code==="string" && /^[A-Za-z0-9_-]{43}$/.test(payload.code) ? "private_access_code" : "local_demo_code"):"email_link";
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
}

export async function handlePersonalRegistration(request:Request):Promise<Response>{
    if (new URL(request.url).origin !== request.headers.get("origin"))
      return Response.json({ error: "Invalid request origin" }, { status: 403 });
    try {
      const gate = await import("@/modules/identity/anonymous-auth-admission.server");
      const denial = gate.anonymousAuthAdmissionResponse(
        await gate.admitAnonymousAuthRequest("account_signup"));
      if (denial) return denial;
    } catch {
      logAuthenticationUnavailable("admission");
      return Response.json({ error: "Registration temporarily unavailable" },
        { status: 503, headers: { "Cache-Control": "no-store" } });
    }
    let data: unknown;
    try { data = await request.json(); }
    catch { return Response.json({ error: "Invalid request" }, { status: 400 }); }
    try {
      const result = await (await import("@/modules/identity/personal-account-signup.server"))
        .requestPersonalCanAccount(data);
      return Response.json(result, { headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
    } catch (error) {
      if (error && typeof error === "object" && "issues" in error)
        return Response.json({ error: "Check your registration details" }, { status: 400 });
      logAuthenticationUnavailable("personal_registration");
      return Response.json({ accepted: true }, { headers: { "Cache-Control": "no-store" } });
    }
}

export async function handleAccessLogout(request:Request):Promise<Response>{
   if(new URL(request.url).origin!==request.headers.get("origin"))
    return Response.json({error:"Invalid request origin"},{status:403});
   try {
    const cookie=await revokePresentedAccessSession(request);
    return new Response(null,{status:204,headers:{"Set-Cookie":cookie,"Cache-Control":"no-store"}});
   }catch(error){
    if(error instanceof AuthorizationError)return Response.json({error:"Unauthorized"},{status:401,headers:{"Cache-Control":"no-store"}});
    return Response.json({error:"Authentication temporarily unavailable."},{status:503,headers:{"Cache-Control":"no-store","Retry-After":"30"}});
   }
}
