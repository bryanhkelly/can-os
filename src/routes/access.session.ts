import {createFileRoute} from "@tanstack/react-router";
import {and,eq,inArray} from "drizzle-orm";
import {db} from "@/db/client";
import {accountPersonGrants,people,sites,programs} from "@/db/schema";
import {getCommandContext} from "@/modules/identity/command-context.server";
import {selectAccessGrant} from "@/modules/identity/passwordless-access.server";
import {AuthorizationError} from "@/domain/command-context";
import {assertGrantSelection} from "@/domain/access-context";

/** The browser may ask to change memberships, but cannot declare a person or role. */
export const Route=createFileRoute("/access/session")({
 server:{handlers:{
  GET:async({request})=>{
   try{
    const context=await getCommandContext(request);
    const grants=await db.select({
     id:accountPersonGrants.id,personId:accountPersonGrants.personId,role:accountPersonGrants.role,
     firstName:people.legalFirstName,lastName:people.legalLastName,
     organizationId:accountPersonGrants.organizationId,siteId:accountPersonGrants.siteId,
    }).from(accountPersonGrants).innerJoin(people,eq(people.id,accountPersonGrants.personId))
     .where(and(eq(accountPersonGrants.accountId,context.accountId),eq(accountPersonGrants.active,true)));
    // Resolve display choices strictly inside the verified active grant scope.
    const siteIds=context.scope.siteIds??[];
    const programIds=context.scope.programIds??[];
    const [siteChoices,programChoices]=await Promise.all([
     siteIds.length?db.select({id:sites.id,name:sites.name,organizationId:sites.organizationId}).from(sites).where(inArray(sites.id,siteIds)):Promise.resolve([]),
     programIds.length?db.select({id:programs.id,name:programs.name,siteId:programs.siteId}).from(programs).where(inArray(programs.id,programIds)):Promise.resolve([]),
    ]);
    return Response.json({authenticated:true,sites:siteChoices,programs:programChoices,activeGrantId:context.grantId,role:context.role,grants,activeContext:{organizationIds:context.scope.organizationIds??[],siteIds:context.scope.siteIds??[],programIds:context.scope.programIds??[]}},
     {headers:{"Cache-Control":"no-store"}});
   }catch{return Response.json({authenticated:false},{status:401,headers:{"Cache-Control":"no-store"}});}
  },
  POST:async({request})=>{
   if(new URL(request.url).origin!==request.headers.get("origin"))
    return Response.json({error:"Invalid request origin"},{status:403});
   try{
    const context=await getCommandContext(request);
    const body:unknown=await request.json();
    const grantId=body&&typeof body==="object"&&"grantId" in body?(body as {grantId:unknown}).grantId:null;
    if(typeof grantId!=="string")return Response.json({error:"Invalid membership"},{status:400});
    const grants=await db.select({
     id:accountPersonGrants.id,accountId:accountPersonGrants.accountId,personId:accountPersonGrants.personId,
     role:accountPersonGrants.role,organizationId:accountPersonGrants.organizationId,
     siteId:accountPersonGrants.siteId,active:accountPersonGrants.active,
    }).from(accountPersonGrants).where(eq(accountPersonGrants.accountId,context.accountId));
    assertGrantSelection(context.accountId,grantId,grants);
    await selectAccessGrant(context.sessionId,context.accountId,grantId);
    return Response.json({ok:true},{headers:{"Cache-Control":"no-store"}});
   }catch(error){
    return Response.json({error:error instanceof AuthorizationError?"Unauthorized":"Unable to switch membership"},
     {status:error instanceof AuthorizationError?401:400});
   }
  },
 }},
});
