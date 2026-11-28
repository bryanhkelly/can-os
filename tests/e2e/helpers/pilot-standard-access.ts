import { expect, type BrowserContext } from "@playwright/test";
import { readdir, readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";

const origins={legacy:"http://localhost:5183",nest:"http://localhost:3001"} as const;
type Transport=keyof typeof origins;
function accessPaths(transport:Transport){
 const origin=origins[transport],prefix=transport==="nest"?"/api/v1":"";
 return {origin,request:prefix+"/access/request",verify:prefix+"/access/verify",
   session:prefix+"/access/session",register:prefix+"/access/register",
   site:transport==="nest"?prefix+"/access/site-signups":"/site/new"};
}
const messageSchema=z.object({to:z.string(),accessUrl:z.string().url()});
const emailSchema=z.string().email().refine(v=>v===v.toLowerCase()&&v.endsWith(".test"));
const sessionSchema=z.object({
  authenticated:z.literal(true),activeGrantId:z.string().uuid(),role:z.string(),
  grants:z.array(z.object({id:z.string().uuid(),personId:z.string().uuid(),
    role:z.string(),organizationId:z.string().uuid().nullable(),siteId:z.string().uuid().nullable()})),
  ownerDelegation:z.never().optional(),
});
export type QaSession=z.infer<typeof sessionSchema>;

function guard(email:string){
  emailSchema.parse(email);
  if(process.env.APP_ENV!=="test"||process.env.NODE_ENV!=="test"||
    process.env.CAN_PILOT_QA_BRANCH_ID!=="br-solitary-art-arun91gj"||
    !process.env.CAN_ACCESS_MAIL_OUTBOX_DIR||process.env.RESEND_API_KEY||
    process.env.CAN_ACCESS_PUBLIC_ORIGIN!=="https://app.can-os.test")
    throw Error("Isolated local QA mail is required");
}

async function tokenFor(email:string):Promise<string>{
  guard(email);
  const directory=process.env.CAN_ACCESS_MAIL_OUTBOX_DIR!;
  const deadline=Date.now()+20000;
  while(Date.now()<deadline){
    for(const file of await readdir(directory)){
      if(!file.endsWith(".json"))continue;
      const path=join(directory,file);
      let parsed;
      try{parsed=messageSchema.safeParse(JSON.parse(await readFile(path,"utf8")));}catch{continue;}
      if(!parsed.success||parsed.data.to!==email)continue;
      const link=new URL(parsed.data.accessUrl);
      const token=new URLSearchParams(link.hash.slice(1)).get("token");
      if(link.origin!=="https://app.can-os.test"||link.pathname!=="/access/verify"||
        !token||!/^[A-Za-z0-9_-]{40,128}$/.test(token))throw Error("Unexpected local QA access message");
      await unlink(path);
      return token;
    }
    await delay(150);
  }
  throw Error("QA one-time access message was not delivered");
}

export async function qaSession(context:Pick<BrowserContext,"request">,transport:Transport="legacy"):Promise<QaSession>{
  const paths=accessPaths(transport);
  const response=await context.request.get(paths.origin+paths.session);
  if(!response.ok())throw Error("Standard session lookup failed: "+response.status());
  // Never attach or print response bodies, cookies or access links.
  return sessionSchema.parse(await response.json());
}

export async function authenticateQaActor(context:Pick<BrowserContext,"request">,email:string,signup?:
  {kind:"person";firstName:string;lastName:string}|
  {kind:"site";firstName:string;lastName:string;name:string;organizationName:string;organizationType:"church"|"other_partner"|"denomination"|"consortium"},transport:Transport="legacy"){
  guard(email);
  const paths=accessPaths(transport),origin=paths.origin;
  const path=signup?.kind==="person"?paths.register:signup?.kind==="site"?paths.site:paths.request;
  const payload=signup?.kind==="person"?{email,firstName:signup.firstName,lastName:signup.lastName,adultConfirmed:true}:
    signup?.kind==="site"?{email,firstName:signup.firstName,lastName:signup.lastName,
      name:signup.name,organizationName:signup.organizationName,organizationType:signup.organizationType,
      organizationDomain:email.split("@")[1]}:{email};
  const request=await context.request.post(origin+path,{headers:{Origin:origin},data:payload});
  if(!request.ok())throw Error("Standard access request failed: "+request.status());
  expect((await context.request.get(origin+paths.session)).status()).toBe(401);
  const token=await tokenFor(email);
  const verified=await context.request.post(origin+paths.verify,{headers:{Origin:origin},data:{token}});
  if(!verified.ok())throw Error("One-time access verification failed: "+verified.status());
  const session=await qaSession(context,transport);
  if(signup||transport==="nest"){
    const replay=await context.request.post(origin+paths.verify,{headers:{Origin:origin},data:{token}});
    expect(replay.status()).toBe(401);
  }
  return session;
}
