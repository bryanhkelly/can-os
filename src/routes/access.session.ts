import {createFileRoute} from "@tanstack/react-router";
import {readWorkspaceSession} from "@/modules/identity/workspace-session.server";
import {getCommandContext} from "@/modules/identity/command-context.server";
import {selectAccessGrant,recordMeaningfulSessionActivity} from "@/modules/identity/passwordless-access.server";
import {AuthorizationError} from "@/domain/command-context";

/** The browser may ask to change memberships, but cannot declare a person or role. */
export const Route=createFileRoute("/access/session")({
 server:{handlers:{
  GET:async({request})=>{
   try{
    const session=await readWorkspaceSession(request);
    return Response.json(session,{status:session.authenticated?200:401,headers:{"Cache-Control":"no-store"}});
   }catch(error){
    console.error("Unable to load workspace session",error);
    return Response.json({error:"Unable to load your workspace session."},{status:500,headers:{"Cache-Control":"no-store"}});
   }
  },
  POST:async({request})=>{
   if(new URL(request.url).origin!==request.headers.get("origin"))
    return Response.json({error:"Invalid request origin"},{status:403});
   try{
    const context=await getCommandContext(request);
    const body:unknown=await request.json();
    // Explicit interactive activity is not a grant switch and must not be
    // inferred from this route's periodic GET requests.
    if(body && typeof body==="object" && "kind" in body &&
      (body as {kind:unknown}).kind==="activity" &&
      Object.keys(body).length===1){
      await recordMeaningfulSessionActivity(
       context.sessionId,context.sessionAccountId??context.accountId,
      );
      return new Response(null,{status:204,headers:{"Cache-Control":"no-store"}});
    }
    const grantId=body&&typeof body==="object"&&"grantId" in body?(body as {grantId:unknown}).grantId:null;
    if(typeof grantId!=="string")return Response.json({error:"Invalid membership"},{status:400});
    await selectAccessGrant(context.sessionId,context.sessionAccountId??context.accountId,grantId);
    return Response.json({ok:true},{headers:{"Cache-Control":"no-store"}});
   }catch(error){
    return Response.json({error:error instanceof AuthorizationError?"Unauthorized":"Unable to switch membership"},
     {status:error instanceof AuthorizationError?401:400});
   }
  },
 }},
});
