import {createFileRoute} from "@tanstack/react-router";
import {requestOneTimeAccess} from "@/modules/identity/passwordless-access.server";
export const Route=createFileRoute("/access/request")({
 server:{handlers:{
  POST:async({request})=>{
   if(new URL(request.url).origin!==request.headers.get("origin"))return Response.json({error:"Invalid request origin"},{status:403});
   let payload:unknown;
   try{payload=await request.json();}catch{return Response.json({error:"Invalid request"},{status:400});}
   const email=(payload && typeof payload==="object" && "email" in payload)?(payload as {email:unknown}).email:null;
   if(typeof email!=="string")return Response.json({error:"Invalid request"},{status:400});
   try{
    await requestOneTimeAccess(email);
    return Response.json({accepted:true});
   }catch(error){
    if(error instanceof Error && error.message==="Invalid email address")return Response.json({error:"Invalid email"},{status:400});
    return Response.json({error:"Unable to process request"},{status:503});
   }
  },
 }},
});
