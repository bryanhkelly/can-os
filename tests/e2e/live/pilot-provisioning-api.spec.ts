import { test,expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { authenticateQaActor,qaSession } from "../helpers/pilot-standard-access";

test("standard signup creates independent Sites and people, not learner enrollments",async({browser},info)=>{
  const sql=neon(process.env.TEST_DATABASE_URL!);
  const [identity]=await sql`SELECT current_setting('neon.project_id',true) AS project,current_setting('neon.branch_id',true) AS branch`;
  expect(identity).toEqual({project:"sweet-hall-62441909",branch:"br-solitary-art-arun91gj"});
  const run=randomUUID().slice(0,12);
  const people=new Set<string>(),organizations=new Set<string>(),sites=new Set<string>();
  const contexts=[];
  try{
    for(const index of [1,2]){
      const context=await browser.newContext();contexts.push(context);
      const domain="pilot-"+run+"-"+index+".test";
      const session=await authenticateQaActor(context,"founder@"+domain,
        {kind:"site",firstName:"QA",lastName:"Founder "+index,name:"QA Site "+run+" "+index,
          organizationName:"QA Organization "+run+" "+index,organizationType:"church"});
      const grant=session.grants.find(g=>g.id===session.activeGrantId);
      if(!grant?.organizationId||!grant.siteId||grant.role!=="site_admin")throw Error("Expected verified Site administrator");
      organizations.add(grant.organizationId);sites.add(grant.siteId);people.add(grant.personId);
      const [record]=await sql`SELECT s.organization_id::text AS organization_id,o.type
        FROM public.sites s JOIN public.organizations o ON o.id=s.organization_id WHERE s.id=${grant.siteId}::uuid`;
      expect(record).toEqual({organization_id:grant.organizationId,type:"church"});
      expect((await qaSession(context)).activeGrantId).toBe(grant.id);
      const learner=await browser.newContext();contexts.push(learner);
      const personal=await authenticateQaActor(learner,"learner@"+domain,
        {kind:"person",firstName:"QA",lastName:"Learner "+index});
      const member=personal.grants.find(g=>g.id===personal.activeGrantId);
      if(!member||member.role!=="account_holder")throw Error("Expected ordinary personal account");
      people.add(member.personId);
      const [counts]=await sql`SELECT
        (SELECT count(*)::int FROM public.noncredit_registrations WHERE participant_person_id=${member.personId}::uuid) AS registrations,
        (SELECT count(*)::int FROM public.class_enrollments WHERE learner_person_id=${member.personId}::uuid) AS enrollments`;
      expect(counts).toEqual({registrations:0,enrollments:0});
      const denial=await learner.request.post("http://localhost:5183/access/session",
        {headers:{Origin:"http://localhost:5183"},data:{grantId:grant.id}});
      expect([400,401,403]).toContain(denial.status());
      expect((await qaSession(learner)).activeGrantId).toBe(member.id);
    }
    expect(people.size).toBe(4);expect(organizations.size).toBe(2);expect(sites.size).toBe(2);
    await info.attach("provisioning-counts",{body:JSON.stringify({revision:process.env.CAN_RELEASE_SOURCE_SHA,
      organizations:organizations.size,sites:sites.size,people:people.size,registrations:0,enrollments:0}),
      contentType:"application/json"});
  }finally{await Promise.all(contexts.map(c=>c.close()));}
});
