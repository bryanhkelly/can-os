import {test,expect,request} from "@playwright/test";
import {z} from "zod";
import {authenticateQaPlatformOwner} from "../helpers/pilot-standard-access";
const uuid=z.string().uuid();
const raw=process.env.CAN_NEST_OWNER_QA_JSON;
const fixture=raw?z.object({attestation:z.literal("reviewed-isolated-owner-fixtures"),targetGrantId:uuid,targetPersonId:uuid,targetSiteId:uuid,targetOrganizationId:uuid,protectedGrantId:uuid,targetSearch:z.string().min(2).max(100)}).strict().refine(f=>f.targetGrantId!==f.protectedGrantId).parse(JSON.parse(raw)):null;
const origin="http://localhost:3001",api=origin+"/api/v1";
test("original owner can manage delegation but cannot inherit protected roles",async()=>{
 test.skip(!fixture||!process.env.CAN_NEST_OWNER_QA_EMAIL,"Explicit reviewed isolated owner and target fixtures required");
 const f=fixture!;
 const client=await request.newContext();
 const post=(path:string,data:object)=>client.post(api+path,{headers:{Origin:origin},data});
 const begin=(mode:"view"|"act",grantId=f.targetGrantId)=>post("/owner/delegation",{grantId,mode,reason:"Reviewed isolated QA support scenario"});
 const end=()=>post("/owner/delegation/return",{confirm:true});
 try{
  const owner=await authenticateQaPlatformOwner({request:client});
  const me=await client.get(api+"/me");expect(me.status()).toBe(200);
  const original=await me.json();expect(original.grantId).toBe(owner.activeGrantId);
  const targets=await client.get(api+"/owner/delegation-targets",{params:{search:f.targetSearch}});
  expect(targets.status()).toBe(200);
  expect((await targets.json()).targets).toEqual(expect.arrayContaining([expect.objectContaining({grantId:f.targetGrantId,personId:f.targetPersonId,siteId:f.targetSiteId,organizationId:f.targetOrganizationId,role:"site_admin",canAct:true})]));
  expect((await begin("act",f.protectedGrantId)).status()).toBe(403);
  const concurrent=await Promise.all([begin("view"),begin("view")]);
  expect(concurrent.map(r=>r.status()).sort()).toEqual([200,403]);
  const status=await client.get(api+"/owner/delegation");
  expect(status.status()).toBe(200);expect(await status.json()).toMatchObject({active:true,mode:"view"});
  const projected=await client.get(api+"/me");
  expect(projected.status()).toBe(200);
  expect(await projected.json()).toMatchObject({personId:f.targetPersonId,grantId:f.targetGrantId,role:"site_admin",siteIds:[f.targetSiteId],organizationIds:[f.targetOrganizationId]});
  expect((await post("/me/session/activity",{})).status()).toBe(403);
  expect((await client.get(api+"/owner/delegation-targets",{params:{search:f.targetSearch}})).status()).toBe(403);
  expect((await end()).status()).toBe(200);
  expect((await end()).status()).toBe(200);
  expect(await (await client.get(api+"/me")).json()).toMatchObject(original);
  expect((await begin("act")).status()).toBe(200);
  expect((await post("/me/session/membership",{grantId:owner.activeGrantId})).status()).toBe(403);
  expect((await end()).status()).toBe(200);
  expect((await begin("view")).status()).toBe(200);
  const beforeLogout=await client.storageState();
  expect((await post("/access/logout",{})).status()).toBe(204);
  expect((await client.get(api+"/me")).status()).toBe(401);
  const replay=await request.newContext({storageState:beforeLogout});
  try{expect((await replay.get(api+"/me")).status()).toBe(401);}finally{await replay.dispose();}
 }finally{
  await client.dispose();
 }
});
