import {test,expect,request} from "@playwright/test";
import {z} from "zod";
import {authenticateQaActor} from "../helpers/pilot-standard-access";
const id=z.string().uuid(),email=z.string().email().refine(v=>v===v.toLowerCase()&&v.endsWith(".test"));
const raw=process.env.CAN_NEST_INSTITUTIONAL_QA_JSON;
const fixture=raw?z.object({
 attestation:z.literal("reviewed-isolated-institutional-fixtures"),requesterEmail:email,reviewerEmail:email,stewardEmail:email,
 programId:id,foreignProgramId:id,employeePersonId:id,employeeRole:z.enum(["teacher","registrar"]),requesterSiteId:id,institutionId:id,
}).strict().refine(f=>new Set([f.requesterEmail,f.reviewerEmail,f.stewardEmail]).size===3&&f.programId!==f.foreignProgramId).parse(JSON.parse(raw)):null;
const origin="http://localhost:3001",api=origin+"/api/v1/identity";
const evidenceReference="Isolated QA independently verified issuer evidence reference";
const reason="Isolated QA exact Program duty and subsequent revocation";
test("independent issuer approval and institutional staff delegation use ordinary governed API authority",async()=>{
 test.skip(!fixture,"Reviewed isolated institutional fixtures required");
 const f=fixture!;
 const staff=await request.newContext(),reviewer=await request.newContext(),steward=await request.newContext();
 const post=(client:typeof staff,path:string,data:object)=>client.post(api+path,{headers:{Origin:origin},data});
 try{
  const a=await authenticateQaActor({request:staff},f.requesterEmail,undefined,"nest");
  const b=await authenticateQaActor({request:reviewer},f.reviewerEmail,undefined,"nest");
  const c=await authenticateQaActor({request:steward},f.stewardEmail,undefined,"nest");
  expect(["registrar","site_admin"]).toContain(a.role);
  expect(a.grants.find(g=>g.id===a.activeGrantId)?.siteId).toBe(f.requesterSiteId);
  expect(b.role).toBe("can_credential_reviewer");expect(c.role).toBe("can_network_steward");
  expect(b.grants.find(g=>g.id===b.activeGrantId)).toMatchObject({organizationId:f.institutionId,siteId:null});
  expect(c.grants.find(g=>g.id===c.activeGrantId)).toMatchObject({organizationId:f.institutionId,siteId:null});
  expect((await staff.get(api+"/credential-issuer/pending")).status()).toBe(403);
  expect((await steward.get(api+"/credential-issuer/pending")).status()).toBe(403);
  expect((await reviewer.get(api+"/credential-issuer/mine")).status()).toBe(403);
  const initial=await staff.get(api+"/credential-issuer/mine");expect(initial.status()).toBe(200);expect(await initial.json()).toEqual({approval:null});
  const response=await post(staff,"/credential-issuer/requests",{evidenceReference});expect(response.status()).toBe(200);
  const approval=z.object({approvalId:id,requested:z.literal(true)}).parse(await response.json());
  expect((await post(staff,"/credential-issuer/requests",{evidenceReference})).status()).toBe(409);
  const pending=await reviewer.get(api+"/credential-issuer/pending");expect(pending.status()).toBe(200);
  expect(await pending.json()).toEqual(expect.arrayContaining([expect.objectContaining({id:approval.approvalId,grantId:a.activeGrantId})]));
  const decision={approvalId:approval.approvalId,decision:"approve",evidenceReference,expiresAt:new Date(Date.now()+86400000).toISOString()};
  expect((await post(staff,"/credential-issuer/decisions",decision)).status()).toBe(403);
  expect((await post(steward,"/credential-issuer/decisions",decision)).status()).toBe(403);
  expect((await post(reviewer,"/credential-issuer/decisions",{...decision,expiresAt:undefined})).status()).toBe(400);
  const approved=await post(reviewer,"/credential-issuer/decisions",decision);expect(approved.status()).toBe(200);expect(await approved.json()).toEqual({status:"approved"});
  expect((await post(reviewer,"/credential-issuer/decisions",decision)).status()).toBe(403);
  expect(await (await staff.get(api+"/credential-issuer/mine")).json()).toMatchObject({approval:{id:approval.approvalId,status:"approved"}});
  const revoked=await post(reviewer,"/credential-issuer/revocations",{approvalId:approval.approvalId,reason:evidenceReference});expect(revoked.status()).toBe(200);
  expect(await (await staff.get(api+"/credential-issuer/mine")).json()).toMatchObject({approval:{status:"revoked"}});
  // A role delegation is a Program responsibility, not a new account or grant.
  const path="/academic-staff/delegations",grant={programId:f.programId,personId:f.employeePersonId,role:f.employeeRole,reason};
  expect((await staff.get(api+path,{params:{programId:f.programId}})).status()).toBe(403);
  expect((await reviewer.get(api+path,{params:{programId:f.programId}})).status()).toBe(403);
  expect((await steward.get(api+path,{params:{programId:f.foreignProgramId}})).status()).toBe(403);
  const desk=await steward.get(api+path,{params:{programId:f.programId}});expect(desk.status()).toBe(200);
  const before=await desk.json();expect(before.candidates).toEqual(expect.arrayContaining([expect.objectContaining({personId:f.employeePersonId,role:f.employeeRole})]));
  expect(before.current.some((row:{personId:string;role:string})=>row.personId===f.employeePersonId&&row.role===f.employeeRole)).toBe(false);
  expect((await post(staff,path,grant)).status()).toBe(403);
  expect((await post(steward,path,{...grant,programId:f.foreignProgramId})).status()).toBe(403);
  const delegated=await post(steward,path,grant);expect(delegated.status()).toBe(200);
  const assignment=z.object({roleAssignmentId:id,created:z.literal(true)}).parse(await delegated.json());
  const again=await post(steward,path,grant);expect(again.status()).toBe(200);expect(await again.json()).toEqual({...assignment,created:false});
  expect((await post(reviewer,"/academic-staff/revocations",{roleAssignmentId:assignment.roleAssignmentId,reason})).status()).toBe(403);
  expect((await post(steward,"/academic-staff/revocations",{roleAssignmentId:assignment.roleAssignmentId,reason})).status()).toBe(200);
  expect((await (await steward.get(api+path,{params:{programId:f.programId}})).json()).current.some((row:{id:string})=>row.id===assignment.roleAssignmentId)).toBe(false);
 }finally{await Promise.all([staff.dispose(),reviewer.dispose(),steward.dispose()]);}
});
