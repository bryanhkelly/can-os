import {test,expect,request} from "@playwright/test";
import {z} from "zod";
import {authenticateQaActor,qaSession} from "../helpers/pilot-standard-access";
const email=z.string().email().refine(v=>v===v.toLowerCase()&&v.endsWith(".test"));
const raw=process.env.CAN_NEST_SIGNUP_QA_JSON;
const fixture=raw?z.object({
 attestation:z.literal("fresh-synthetic-signups"),
 personEmail:email,siteEmail:email,organizationName:z.string().min(2).max(160),siteName:z.string().min(2).max(160),
}).strict().refine(v=>v.personEmail!==v.siteEmail&&v.personEmail.split("@")[1]!==v.siteEmail.split("@")[1]).parse(JSON.parse(raw)):null;
const origin="http://localhost:3001",api=origin+"/api/v1";
test("anonymous access routes reject cross-origin and malformed credentials",async()=>{
 const http=await request.newContext();
 try{
   for(const path of ["request","register","verify","site-signups"]){
     expect((await http.post(api+"/access/"+path,{headers:{Origin:"https://foreign.example"},data:{}})).status()).toBe(403);
     expect((await http.post(api+"/access/"+path,{headers:{Origin:origin},data:{}})).status()).toBe(400);
   }
   expect((await http.get(api+"/access/session")).status()).toBe(401);
   expect((await http.get(api+"/access/session",{headers:{cookie:"__Host-can_os_session=invalid"}})).status()).toBe(401);
 }finally{await http.dispose();}
});
test("verified personal and institutional signup through NestJS only",async()=>{
 test.skip(!fixture,"Reviewed fresh isolated signup fixture required");
 const f=fixture!;
 const personal=await request.newContext(),site=await request.newContext();
 try{
   const p=await authenticateQaActor({request:personal},f.personEmail,{kind:"person",firstName:"QA",lastName:"Learner"},"nest");
   expect(p.role).toBe("account_holder");
   const pg=p.grants.find(g=>g.id===p.activeGrantId)!;
   expect(pg).toMatchObject({organizationId:null,siteId:null});
   const s=await authenticateQaActor({request:site},f.siteEmail,{kind:"site",firstName:"QA",lastName:"Founder",name:f.siteName,organizationName:f.organizationName,organizationType:"church"},"nest");
   expect(s.role).toBe("site_admin");
   const sg=s.grants.find(g=>g.id===s.activeGrantId)!;
   expect(sg.organizationId).not.toBeNull();expect(sg.siteId).not.toBeNull();expect(sg.personId).not.toBe(pg.personId);
   expect((await personal.post(api+"/me/session/membership",{headers:{Origin:origin},data:{grantId:sg.id}})).status()).toBe(403);
   expect((await qaSession({request:personal},"nest")).activeGrantId).toBe(pg.id);
   for(const client of [personal,site]){
     expect((await client.post(api+"/access/logout",{headers:{Origin:origin},data:{}})).status()).toBe(204);
     expect((await client.get(api+"/access/session")).status()).toBe(401);
   }
 }finally{await Promise.all([personal.dispose(),site.dispose()]);}
});
