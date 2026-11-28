import {test,expect,request} from "@playwright/test";
import {z} from "zod";
import {authenticateQaActor} from "../helpers/pilot-standard-access";
const uuid=z.string().uuid(),email=z.string().email().refine(v=>v===v.toLowerCase()&&v.endsWith(".test"));
const raw=process.env.CAN_NEST_STAFF_QA_JSON;
const fixture=raw?z.object({
 attestation:z.literal("fresh-isolated-staff-invitation"),registrarEmail:email,foreignRegistrarEmail:email,
 staffEmail:email,siteId:uuid,foreignSiteId:uuid,organizationId:uuid,foreignOrganizationId:uuid,
}).strict().refine(f=>new Set([f.registrarEmail,f.foreignRegistrarEmail,f.staffEmail]).size===3&&f.siteId!==f.foreignSiteId&&f.organizationId!==f.foreignOrganizationId).parse(JSON.parse(raw)):null;
const origin="http://localhost:3001",api=origin+"/api/v1";
test("staff invitation is scoped, repeat-safe and accepted via ordinary login; revoked bearer never restores",async()=>{
 test.skip(!fixture,"Explicit isolated two-tenant and fresh staff mailbox fixture required");
 const f=fixture!;
 const registrar=await request.newContext(),foreign=await request.newContext(),staff=await request.newContext();
 const post=(client:typeof registrar,path:string,data:object)=>client.post(api+path,{headers:{Origin:origin},data});
 try {
  const a=await authenticateQaActor({request:registrar},f.registrarEmail,undefined,"nest");
  const other=await authenticateQaActor({request:foreign},f.foreignRegistrarEmail,undefined,"nest");
  expect(["registrar","site_admin"]).toContain(a.role);expect(["registrar","site_admin"]).toContain(other.role);
  expect(a.grants.find(g=>g.id===a.activeGrantId)).toMatchObject({siteId:f.siteId,organizationId:f.organizationId});
  expect(other.grants.find(g=>g.id===other.activeGrantId)).toMatchObject({siteId:f.foreignSiteId,organizationId:f.foreignOrganizationId});
  const sites=await registrar.get(api+"/staff/sites");expect(sites.status()).toBe(200);
  expect((await sites.json()).sites.map((s:{id:string})=>s.id)).toEqual([f.siteId]);
  const input={siteId:f.siteId,email:f.staffEmail,firstName:"QA",lastName:"Staff",role:"teacher"};
  expect((await post(foreign,"/staff/invitations",input)).status()).toBe(403);
  expect((await post(registrar,"/staff/invitations",{...input,siteId:f.foreignSiteId})).status()).toBe(403);
  expect((await post(registrar,"/staff/invitations",{...input,role:"platform_owner"})).status()).toBe(400);
  const issued=await post(registrar,"/staff/invitations",input);expect(issued.status()).toBe(200);
  const invitation=z.object({grantId:uuid,accountId:uuid,personId:uuid,created:z.literal(true),pending:z.literal(true)}).parse(await issued.json());
  const retry=await post(registrar,"/staff/invitations",input);expect(retry.status()).toBe(200);
  expect(await retry.json()).toMatchObject({...invitation,created:false});
  expect((await post(registrar,"/staff/grant-state",{grantId:invitation.grantId,active:true})).status()).toBe(403);
  expect((await post(foreign,"/staff/grant-state",{grantId:invitation.grantId,active:true})).status()).toBe(403);
  const session=await authenticateQaActor({request:staff},f.staffEmail,undefined,"nest");
  expect(session.activeGrantId).toBe(invitation.grantId);
  expect(session.grants.find(g=>g.id===session.activeGrantId)).toMatchObject({personId:invitation.personId,role:"teacher",siteId:f.siteId});
  expect((await staff.get(api+"/staff/accounts")).status()).toBe(403);
  const accounts=await registrar.get(api+"/staff/accounts");expect(accounts.status()).toBe(200);
  expect((await accounts.json()).accounts).toEqual(expect.arrayContaining([expect.objectContaining({accountId:invitation.accountId,grants:expect.arrayContaining([expect.objectContaining({grantId:invitation.grantId,active:true})])})]));
  const foreignAccounts=await foreign.get(api+"/staff/accounts");expect(foreignAccounts.status()).toBe(200);
  expect((await foreignAccounts.json()).accounts.some((x:{accountId:string})=>x.accountId===invitation.accountId)).toBe(false);
  const old=await staff.storageState();
  const state={grantId:invitation.grantId,active:false};
  expect((await post(foreign,"/staff/grant-state",state)).status()).toBe(403);
  expect((await post(registrar,"/staff/grant-state",{grantId:a.activeGrantId,active:false})).status()).toBe(403);
  for(let n=0;n<2;n++){
   const revoked=await post(registrar,"/staff/grant-state",state);expect(revoked.status()).toBe(200);expect(await revoked.json()).toEqual(state);
  }
  expect((await staff.get(api+"/me")).status()).toBe(401);
  const restore=await post(registrar,"/staff/grant-state",{...state,active:true});expect(restore.status()).toBe(200);
  const replay=await request.newContext({storageState:old});
  try{expect((await replay.get(api+"/me")).status()).toBe(401);}finally{await replay.dispose();}
 }finally{await Promise.all([registrar.dispose(),foreign.dispose(),staff.dispose()]);}
});
