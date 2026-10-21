import {createFileRoute} from "@tanstack/react-router";
import {getCommandContext} from "@/modules/identity/command-context.server";
import {revokeAccessSession} from "@/modules/identity/passwordless-access.server";
export const Route=createFileRoute("/access/logout")({
 server:{handlers:{
  POST:async({request})=>{
   if(new URL(request.url).origin!==request.headers.get("origin"))
    return Response.json({error:"Invalid request origin"},{status:403});
   try {
    const {sessionId,accountId,sessionAccountId}=await getCommandContext(request);
    const cookie=await revokeAccessSession(sessionId,sessionAccountId??accountId);
    return new Response(null,{status:204,headers:{"Set-Cookie":cookie,"Cache-Control":"no-store"}});
   }catch{return Response.json({error:"Unauthorized"},{status:401});}
  },
 }},
});
