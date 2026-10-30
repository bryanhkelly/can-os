import {createFileRoute} from "@tanstack/react-router";
export const Route=createFileRoute("/access/request")({
 server:{handlers:{
  POST:async({request})=>{
   if(new URL(request.url).origin!==request.headers.get("origin"))return Response.json({error:"Invalid request origin"},{status:403});
   // Protect the anonymous email-link endpoint regardless of account
   // existence. This is a shared emergency cap, not per-client protection.
   try {
    const gate=await import("@/modules/identity/anonymous-auth-admission.server");
    const denial=gate.anonymousAuthAdmissionResponse(await gate.admitAnonymousAuthRequest("request"));
    if(denial)return denial;
   }catch{
    return Response.json({error:"Authentication temporarily unavailable."},
     {status:503,headers:{"Cache-Control":"no-store","Retry-After":"30"}});
   }
   let payload:unknown;
   try{payload=await request.json();}catch{return Response.json({error:"Invalid request"},{status:400});}
   const email=(payload && typeof payload==="object" && "email" in payload)?(payload as {email:unknown}).email:null;
   if(typeof email!=="string")return Response.json({error:"Invalid request"},{status:400});
   try{
    const {requestOneTimeAccess}=await import("@/modules/identity/passwordless-access.server");
    await requestOneTimeAccess(email);
    return Response.json({accepted:true},{headers:{"Cache-Control":"no-store"}});
   }catch(error){
    if(error instanceof Error && error.message==="Invalid email address")return Response.json({error:"Invalid email"},{status:400});
    // Do not reveal which addresses have a CAN OS account via delivery/config errors.
    return Response.json({accepted:true},{headers:{"Cache-Control":"no-store"}});
   }
  },
 }},
});
