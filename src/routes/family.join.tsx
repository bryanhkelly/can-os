import { createFileRoute } from "@tanstack/react-router";
import { useEffect,useState } from "react";
export const Route=createFileRoute("/family/join")({
 server:{handlers:{POST:async({request})=>{
   if(new URL(request.url).origin!==request.headers.get("origin"))
     return Response.json({error:"Invalid origin"},{status:403,headers:{"Cache-Control":"no-store"}});
   try{
     const {admitAnonymousAuthRequest,anonymousAuthAdmissionResponse}=await import("@/modules/identity/anonymous-auth-admission.server");
     const denial=anonymousAuthAdmissionResponse(await admitAnonymousAuthRequest("verify"));
     if(denial)return denial;
   }catch{
     return Response.json({error:"Verification unavailable"},{status:503,headers:{"Cache-Control":"no-store"}});
   }
   let body:unknown;
   try{body=await request.json();}catch{return Response.json({error:"Invalid request"},{status:400});}
   if(!body || typeof body!=="object" || !("token" in body) ||
     typeof body.token!=="string" || !/^[A-Za-z0-9_-]{40,}$/.test(body.token))
     return Response.json({error:"Invalid verification link"},{status:400});
   try{
     const {redeemPublicFamilyStart}=await import("@/modules/enrollment/public-family-redeem.server");
     const redeemed=await redeemPublicFamilyStart(body.token);
     return Response.json({ok:true,programId:redeemed.programId,requestId:redeemed.requestId},{
       headers:{"Cache-Control":"no-store","Set-Cookie":redeemed.setCookie,
         "Referrer-Policy":"no-referrer"}});
   }catch{
     return Response.json({error:"Link expired or cannot be used. Request a new link from your school."},{
       status:401,headers:{"Cache-Control":"no-store"}});
   }
 }}},
 component:FamilyJoinPage,
});
function FamilyJoinPage(){
 const [token,setToken]=useState<string|null>(null);
 const [ready,setReady]=useState(false);
 const [busy,setBusy]=useState(false);
 const [status,setStatus]=useState("Confirm your email to continue your school application.");
 useEffect(()=>{
   const code=new URLSearchParams(window.location.hash.slice(1)).get("token");
   setToken(code);window.history.replaceState(null,"","/family/join");
   setReady(true);
 },[]);
 async function verify(){
   if(!token)return;
   setBusy(true);setStatus("Verifying your link…");
   try{
     const response=await fetch("/family/join",{method:"POST",
       headers:{"Content-Type":"application/json"},body:JSON.stringify({token})});
     if(!response.ok){
       setStatus(response.status===429?"Too many requests. Try again shortly.":
         "This verification link is unavailable or expired. Request a new link from the school.");
       return;
     }
     setToken(null);
     const result=await response.json() as {programId:string;requestId:string};
     const dest=new URL("/guardian/apply",window.location.origin);
     dest.searchParams.set("programId",result.programId);
     dest.searchParams.set("familyStart",result.requestId);
     window.location.replace(dest.toString());
   }catch{setStatus("Unable to verify your email right now.");}
   finally{setBusy(false);}
 }
 return <main className="mx-auto max-w-lg space-y-5 px-6 py-16">
   <h1 className="font-serif text-3xl">Confirm your school application email</h1>
   <p role="status">{ready&&!token?
     "Verification link missing. Open the email sent after choosing Apply on your school's website.":
     status}</p>
   <p className="text-sm text-muted-foreground">After verification, you can begin
     your student's application. School staff independently verify legal guardian authority
     before child records, consents or offers can be accessed.</p>
   <button disabled={!ready||!token||busy} type="button" onClick={()=>void verify()}
     className="rounded-lg bg-foreground px-5 py-3 font-semibold text-background disabled:opacity-50">
     {busy?"Verifying…":"Verify email and continue"}</button>
 </main>;
}
